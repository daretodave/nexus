// scripts/plan/refill.mjs: the refill lane, which turns time and repo state into queue rows when no chunk is ready.
//
// A generator is a script under scripts/generators/<name>.mjs that files rows into plan/AUDIT.md (or
// plan/CANDIDATES.md). /march's stock `refill` lane sits at the `queue` hook (scripts/plan/lanes.mjs): when 3a finds no
// ready chunk, it runs this script before /expand, and this script runs every generator listed under `## Generators`
// in plan/bearings.md, one line each:
//
//   - <name> · <cadence> · target <n> · cap <n>/wk
//
// cadence   tick | daily | weekly | <n>d: the days since the generator last filed before it runs again
// target    the generator runs while fewer than n of its rows are Pending (the queue fills until the target holds)
// cap       at most n rows a week (its rows stamped in the last 7 days, Pending or Done)
//
// No section, or no list line in it, and the improvement dial lists them (`Improve:`, scripts/plan/improve.mjs:
// steady the kit's three generic generators, bold every scripts/generators/<name>.mjs too); with no dial line either,
// refill is a no-op (the adopter default). Every row a generator files carries
// `- generator: <name> · filed <date>`; this script counts those stamps for the target, the cap and the cadence, so
// the state is the queue files themselves and a fresh cloud checkout reads it the same as a local loop.
//
// The generator contract (concepts/generators.md):
//
//   node scripts/generators/<name>.mjs [--write] [--limit <n>] [--today YYYY-MM-DD]
//
// Without --write it writes nothing. It is idempotent: it dedups against plan/AUDIT.md and plan/CANDIDATES.md, so a
// second run files nothing new. Its last line is `filed N` or `clean`, and it exits 0. A non-zero exit means it
// broke, never that it found work: this script logs it and runs the next generator.
//
//   node scripts/plan/refill.mjs [--write] [--today YYYY-MM-DD] [--json]
//
// Prints one line per listed generator (`filed|clean|skip|broke <name> · …`), then `N generator(s) broke: …` when
// any did, then `filed N` or `clean`. Without --write the generators run dry. Exit 0 (a broken generator never stops
// the tick), 64 on bad usage.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { generatorsSection, knobOf, projectGenerators } from './improve.mjs';

const DAY = 86400000;
const NAME = /^[a-z0-9][a-z0-9-]*$/;
export const QUEUE_FILES = Object.freeze(['plan/AUDIT.md', 'plan/CANDIDATES.md']);
export const LAST_LINE = /^(?:filed (\d+)|clean)\b/;

export const today = () => new Date().toISOString().slice(0, 10);
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/** A cadence in days: tick 0, daily 1, weekly 7, `<n>d` n; null when it reads as none of them. */
export function cadenceDays(text = '') {
  const t = text.trim().toLowerCase();
  if (t === 'tick') return 0;
  if (t === 'daily') return 1;
  if (t === 'weekly') return 7;
  const m = /^(\d+)d$/.exec(t);
  return m ? Number(m[1]) : null;
}

/** Text with HTML comments blanked, so a commented example line is no generator. */
const uncomment = (text) => text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ''));

/**
 * The `## Generators` section of plan/bearings.md: { generators: [{ name, cadence, days, target, cap }], problems }.
 * A line that is a list item but not the contract shape is a problem (and no generator); `- (none)` is nothing.
 */
export function parseGenerators(bearings = '') {
  const lines = uncomment(bearings.replace(/\r\n/g, '\n')).split('\n');
  const start = lines.findIndex((l) => /^##\s+Generators\s*$/.test(l));
  const generators = [];
  const problems = [];
  if (start < 0) return { generators, problems };
  for (let i = start + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
    const line = lines[i].trim();
    if (!/^[-*]\s/.test(line) || /^[-*]\s+\(?none\)?\s*$/i.test(line)) continue;
    const parts = line.replace(/^[-*]\s+/, '').split('·').map((s) => s.trim().replace(/`/g, ''));
    const [name, cadence, target, cap] = parts;
    const t = /^target\s+(\d+)$/.exec(target ?? '');
    const c = /^cap\s+(\d+)\s*\/\s*wk$/.exec(cap ?? '');
    const days = cadenceDays(cadence);
    const why = parts.length !== 4 ? 'four fields joined by ·'
      : !NAME.test(name) ? 'a name of lowercase words joined by hyphens'
        : days === null ? 'a cadence of tick, daily, weekly or <n>d'
          : !t || Number(t[1]) < 1 ? 'target <n>, at least 1'
            : !c || Number(c[1]) < 1 ? 'cap <n>/wk, at least 1' : null;
    if (why) problems.push(`plan/bearings.md:${i + 1}: \`${line}\` needs ${why} (- <name> · <cadence> · target <n> · cap <n>/wk)`);
    else if (generators.some((g) => g.name === name)) problems.push(`plan/bearings.md:${i + 1}: ${name} is listed twice`);
    else generators.push({ name, cadence, days, target: Number(t[1]), cap: Number(c[1]) });
  }
  return { generators, problems };
}

/**
 * The generators refill runs: the `## Generators` list when the section holds a list line (`- (none)` included), else
 * the improvement dial's (`Improve:`, scripts/plan/improve.mjs: steady the kit's generic three, bold those plus every
 * other scripts/generators/<name>.mjs under `root`; off, gentle and no dial line none). { generators, problems,
 * from: bearings | dial }.
 */
export function effectiveGenerators(bearings = '', { root = null } = {}) {
  const text = String(bearings ?? '');
  if (generatorsSection(text) !== null) return { ...parseGenerators(text), from: 'bearings' };
  const k = knobOf(text, 'Generators', { vars: {}, project: root ? projectGenerators(root) : [] });
  return { ...parseGenerators(['## Generators', '', ...k.list.map((l) => `- ${l}`)].join('\n')), from: 'dial' };
}

/** The `- generator: <name> · filed <date>` line every generated row carries. */
export const stampLine = (name, date) => `- generator: ${name} · filed ${date}`;

/** Every generator stamp in a queue file's text: [{ name, date, pending }], `pending` when its row sits under `## Pending`. */
export function stamps(text = '') {
  const out = [];
  let section = '';
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) section = h[1];
    const m = /^\s*-\s+generator:\s*([a-z0-9-]+)\s*·\s*filed\s+(\d{4}-\d{2}-\d{2})/.exec(line);
    if (m) out.push({ name: m[1], date: m[2], pending: /^Pending\b/i.test(section) });
  }
  return out;
}

/**
 * Whether a generator runs this refill, and how many rows it may file: { action: 'run' | 'skip', why, limit }.
 * `all` is every stamp in the queue files.
 */
export function plan(gen, all, date = today()) {
  const mine = all.filter((s) => s.name === gen.name);
  const open = mine.filter((s) => s.pending).length;
  const week = mine.filter((s) => daysBetween(s.date, date) >= 0 && daysBetween(s.date, date) < 7).length;
  const last = mine.map((s) => s.date).sort().pop();
  if (open >= gen.target) return { action: 'skip', why: `target held (${open}/${gen.target} Pending)`, limit: 0 };
  if (week >= gen.cap) return { action: 'skip', why: `cap reached (${week}/${gen.cap} this week)`, limit: 0 };
  if (last && daysBetween(last, date) < gen.days) return { action: 'skip', why: `cadence ${gen.cadence} (last filed ${last})`, limit: 0 };
  const limit = Math.min(gen.target - open, gen.cap - week);
  return { action: 'run', why: `${open}/${gen.target} Pending, ${week}/${gen.cap} this week`, limit };
}

const readSafe = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : '');

/** The queue files' rows only (each file from its first `## ` heading on), joined: what a generator dedups against. */
export function queueText(root) {
  return QUEUE_FILES.map((rel) => {
    const text = readSafe(path.join(root, rel));
    const at = text.search(/^## /m);
    return at < 0 ? '' : text.slice(at);
  }).join('\n');
}

/**
 * The text of a queue file with `rows` (each an array of lines) appended to its `## Pending` section. A file without
 * one gains it (the template's `(empty …)` placeholder goes); an empty file starts with `title`.
 */
export function appendRows(text, rows, title = '# Audit') {
  if (!rows.length) return text;
  let lines = text.replace(/\r\n/g, '\n').split('\n');
  if (!text.trim()) lines = [title, ''];
  let start = lines.findIndex((l) => /^##\s+Pending\s*$/.test(l));
  if (start < 0) {
    const ph = lines.findIndex((l) => /^\(empty\b/.test(l));
    if (ph >= 0) {
      let e = ph;
      while (e < lines.length && lines[e].trim()) e++;
      lines.splice(ph, e - ph, '## Pending');
      start = ph;
    } else {
      const first = lines.findIndex((l) => /^## /.test(l));
      const at = first < 0 ? lines.length : first;
      lines.splice(at, 0, ...(at > 0 && lines[at - 1].trim() ? [''] : []), '## Pending', '');
      start = lines.findIndex((l) => /^##\s+Pending\s*$/.test(l));
    }
  }
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  let put = end;
  while (put > start + 1 && !lines[put - 1].trim()) put--;
  const block = rows.flatMap((r) => ['', ...r]);
  lines.splice(put, 0, ...block, ...(put < lines.length && lines[put].trim() ? [''] : []));
  let out = lines.join('\n');
  if (!out.endsWith('\n')) out += '\n';
  return out;
}

/** Run one generator from the repo root: { code, out, err }. 127 when its script is missing. */
export function spawnGenerator(root) {
  return (name, args) => {
    const file = path.join(root, 'scripts', 'generators', `${name}.mjs`);
    if (!fs.existsSync(file)) return { code: 127, out: '', err: `no scripts/generators/${name}.mjs` };
    const r = spawnSync(process.execPath, [file, ...args], { cwd: root, encoding: 'utf8', timeout: 300000, shell: false });
    return { code: typeof r.status === 'number' ? r.status : 1, out: r.stdout ?? '', err: r.stderr || (r.error ? String(r.error.message) : '') };
  };
}

const lastLine = (text) => text.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean).pop() ?? '';

/** Run every listed generator: [{ name, action: 'filed' | 'clean' | 'skip' | 'broke', why, filed }]. */
export function refill(root, { write = false, date = today(), spawn = spawnGenerator(root), given = null } = {}) {
  const { generators, problems } = given ?? effectiveGenerators(readSafe(path.join(root, 'plan', 'bearings.md')), { root });
  const results = [];
  for (const gen of generators) {
    // Re-read the stamps each time: a generator that just filed changes what the next one sees.
    const all = QUEUE_FILES.flatMap((rel) => stamps(readSafe(path.join(root, rel))));
    const p = plan(gen, all, date);
    if (p.action === 'skip') {
      results.push({ name: gen.name, action: 'skip', why: p.why, filed: 0 });
      continue;
    }
    const args = [...(write ? ['--write'] : []), '--limit', String(p.limit), '--today', date];
    let r;
    try {
      r = spawn(gen.name, args);
    } catch (e) {
      r = { code: 1, out: '', err: e instanceof Error ? e.message : String(e) };
    }
    const last = lastLine(r.out);
    const m = LAST_LINE.exec(last);
    if (r.code !== 0 || !m) {
      const why = r.code !== 0 ? `exit ${r.code}${r.err.trim() ? `: ${lastLine(r.err).slice(0, 160)}` : ''}` : `last line "${last.slice(0, 80)}" is neither filed N nor clean`;
      results.push({ name: gen.name, action: 'broke', why, filed: 0 });
      continue;
    }
    const filed = m[1] ? Number(m[1]) : 0;
    results.push({ name: gen.name, action: filed ? 'filed' : 'clean', why: `${last}${write || /\(dry run\)/.test(last) ? '' : ' (dry run)'}`, filed });
  }
  return { results, problems };
}

export const USAGE = 'usage: refill.mjs [--write] [--today YYYY-MM-DD] [--json]';

export function main(argv, { root = process.cwd(), log = console.log, spawn = spawnGenerator(root) } = {}) {
  const known = new Set(['--write', '--json', '--today']);
  const i = argv.indexOf('--today');
  const date = i < 0 ? today() : argv[i + 1];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || argv.some((a, j) => a.startsWith('--') ? !known.has(a) : argv[j - 1] !== '--today')) {
    console.error(USAGE);
    return 64;
  }
  const write = argv.includes('--write');
  const { results, problems } = refill(root, { write, date, spawn });
  if (argv.includes('--json')) {
    log(JSON.stringify({ write, problems, results }, null, 2));
    return 0;
  }
  for (const p of problems) log(`problem ${p}`);
  for (const r of results) log(`${r.action} ${r.name} · ${r.why}`);
  const broke = results.filter((r) => r.action === 'broke');
  if (broke.length) log(`${broke.length} generator${broke.length === 1 ? '' : 's'} broke: ${broke.map((r) => r.name).join(', ')}`);
  const filed = results.reduce((n, r) => n + r.filed, 0);
  log(filed ? `filed ${filed}${write ? '' : ' (dry run)'}` : 'clean');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}
