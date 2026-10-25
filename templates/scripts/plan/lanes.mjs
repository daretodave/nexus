// scripts/plan/lanes.mjs: project lanes, the extension point a project's own loop steps live in.
//
// The kit owns skills/march.md and skills/iterate.md and re-syncs them; a project's own steps (a weekly snapshot, a
// content queue, an extra audit dimension) live in skills/march.lanes.md and skills/iterate.lanes.md, which the kit
// never overwrites. Each file holds one block per lane:
//
//   ## lane: <name>
//   - hook: pre | queue | dimensions
//   - when: <prose> | script <path>      (exit 0 = run; absent: always)
//   - run: <skill or command>
//   - return: continue | end-tick        (absent: continue)
//
// march.md reads march.lanes.md at two hooks: `pre` (after Step 0's sync and veto sweep, before triage) and `queue`
// (after 3a's ready chunk, before the next queue step). iterate.md reads iterate.lanes.md at `dimensions`: each lane
// there is one more audit dimension, lettered back from Y (Y, X, W, …) in file order so it never meets a stock letter.
// A `pre` lane yields to the Asap lane (and to support rows, once a caller passes `--support ready`): it runs only
// when neither has a ready item. `Lanes off: <name>, <name>` in plan/bearings.md disables lanes by name. No file, or
// one whose only lane is inside an HTML comment or a code fence, is stock dispatch.
//
// One lane is stock: `refill`, at the `queue` hook ahead of the file's own lanes, runs the generators listed under
// `## Generators` in plan/bearings.md, else the improvement dial's (scripts/plan/refill.mjs, scripts/plan/improve.mjs).
// With none it is not there at all; `Lanes off:
// refill` turns it off, and a project lane named `refill` replaces it.
//
//   node scripts/plan/lanes.mjs march pre [--asap ready|none] [--support ready|none] [--json]
//   node scripts/plan/lanes.mjs march queue [--json]
//   node scripts/plan/lanes.mjs iterate dimensions [--json]
//   node scripts/plan/lanes.mjs check                          # lint both lanes files (exit 1 on a problem)
//   node scripts/plan/lanes.mjs sync <kit skills dir> [--add] [--write]
//
// A hook prints one line per lane, `run|judge|skip <name> · …`, then `stock` (nothing to run) or `N lanes at <hook>`.
// `judge` is a prose `when`: the agent reads it and decides. Without `--asap`, `pre` reads the plan for an Asap pick
// (scripts/plan/order.mjs's simulation, no claims, no network). `sync` re-syncs the kit's skills over skills/:
// files already here are replaced, a lanes file that exists is never touched (one that is missing is created from
// the kit's), and a kit skill this repo lacks is listed, copied only with `--add`. Without `--write` it writes
// nothing. Exit 0, 1 on a lint problem, 64 on bad usage.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { effectiveGenerators } from './refill.mjs';

export const HOOKS = Object.freeze({ march: ['pre', 'queue'], iterate: ['dimensions'] });
export const FILES = Object.freeze({ march: 'skills/march.lanes.md', iterate: 'skills/iterate.lanes.md' });
export const RETURNS = Object.freeze(['continue', 'end-tick']);
const NAME = /^[a-z0-9][a-z0-9-]*$/;
const LETTERS = 'YXWVUTSRQPON';

/** The text with HTML comments and fenced code blanked line for line, so a commented example lane is no lane. */
export function live(text) {
  const out = [];
  let comment = false;
  let fence = false;
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    let line = raw;
    if (!comment && /^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      out.push('');
      continue;
    }
    if (fence) {
      out.push('');
      continue;
    }
    let kept = '';
    while (line.length) {
      if (comment) {
        const end = line.indexOf('-->');
        if (end < 0) {
          line = '';
          break;
        }
        comment = false;
        line = line.slice(end + 3);
      } else {
        const start = line.indexOf('<!--');
        if (start < 0) {
          kept += line;
          break;
        }
        kept += line.slice(0, start);
        comment = true;
        line = line.slice(start + 4);
      }
    }
    out.push(kept);
  }
  return out;
}

/**
 * A lanes file's blocks: { lanes: [{ name, hook, when, run, return, line }], problems: [] }. `kind` (march |
 * iterate) checks each hook belongs to the file; `file` names the problems.
 */
export function parseLanes(text = '', kind = null, file = kind ? FILES[kind] : 'lanes file') {
  const lanes = [];
  const problems = [];
  let cur = null;
  live(text).forEach((line, i) => {
    const head = /^##\s+lane:\s*(.*?)\s*$/.exec(line);
    if (head) {
      cur = { name: head[1], hook: null, when: 'always', run: null, return: 'continue', line: i + 1 };
      lanes.push(cur);
      return;
    }
    if (/^#{1,6}\s/.test(line)) {
      cur = null;
      return;
    }
    const field = cur && /^\s*[-*]\s+(hook|when|run|return)\s*:\s*(.*?)\s*$/.exec(line);
    if (field) cur[field[1]] = field[2];
  });
  const seen = new Set();
  for (const l of lanes) {
    const at = `${file}:${l.line}: lane ${l.name || '(unnamed)'}`;
    if (!NAME.test(l.name)) problems.push(`${at}: a lane name is lowercase words joined by hyphens`);
    if (seen.has(l.name)) problems.push(`${at}: a second lane by this name`);
    seen.add(l.name);
    const hooks = kind ? HOOKS[kind] : [...HOOKS.march, ...HOOKS.iterate];
    if (!l.hook) problems.push(`${at}: no hook (${hooks.join(' | ')})`);
    else if (!hooks.includes(l.hook)) problems.push(`${at}: hook ${l.hook} is not one of ${hooks.join(' | ')}`);
    if (!l.run) problems.push(`${at}: no run (the skill or command the lane runs)`);
    if (!RETURNS.includes(l.return)) problems.push(`${at}: return ${l.return} is not one of ${RETURNS.join(' | ')}`);
    if (/^script\s*$/.test(l.when)) problems.push(`${at}: when: script names no path`);
  }
  return { lanes, problems };
}

/** The lane names `Lanes off:` disables in plan/bearings.md text (`- **Lanes off:** a, b`, `Lanes off: none`). */
export function lanesOff(bearings = '') {
  const m = /^[ \t]*(?:[-*][ \t]+)?[*`]*Lanes off[*`]*[ \t]*:[*`]*[ \t]*(.*)$/im.exec(bearings);
  if (!m) return new Set();
  const names = m[1].replace(/[*`]/g, '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return new Set(names.filter((n) => n !== 'none' && n !== '(none)'));
}

/** A `when: script <path>` lane's path, or null for prose (or always). */
export function whenScript(when = '') {
  const m = /^script\s+(\S+)/.exec(when.trim());
  return m ? m[1] : null;
}

/**
 * What each lane at `hook` does this tick: [{ ...lane, action: 'run' | 'judge' | 'skip', why, letter? }], in file
 * order. A lane off by name skips; a `pre` lane skips while the Asap lane (or a support row) has a ready item; a
 * script `when` runs it through `check(path)` (exit code); prose is the agent's to judge. Lanes at other hooks are
 * left out. A `dimensions` lane carries its letter (Y, X, W, … by file order, off ones included, so letters hold).
 */
export function select(lanes, { hook, off = new Set(), asapReady = false, supportReady = false, check = () => 0 } = {}) {
  const dims = lanes.filter((l) => l.hook === 'dimensions');
  const out = [];
  for (const l of lanes.filter((x) => x.hook === hook)) {
    const r = { ...l };
    if (hook === 'dimensions') r.letter = LETTERS[dims.indexOf(l)] ?? `Y${dims.indexOf(l)}`;
    if (off.has(l.name)) Object.assign(r, { action: 'skip', why: 'off (Lanes off in plan/bearings.md)' });
    else if (hook === 'pre' && asapReady) Object.assign(r, { action: 'skip', why: 'yields to the Asap lane' });
    else if (hook === 'pre' && supportReady) Object.assign(r, { action: 'skip', why: 'yields to a ready support row' });
    else if (whenScript(l.when)) {
      const code = check(whenScript(l.when));
      Object.assign(r, code === 0 ? { action: 'run', why: `when: ${l.when} (exit 0)` } : { action: 'skip', why: `when: ${l.when} (exit ${code})` });
    } else if (!l.when || l.when === 'always') Object.assign(r, { action: 'run', why: 'always' });
    else Object.assign(r, { action: 'judge', why: `when: ${l.when}` });
    out.push(r);
  }
  return out;
}

/**
 * The stock refill lane for the generators refill runs (`bearings`' `## Generators` list, else the improvement
 * dial's; `root` finds the repo's own generators for bold), or null when there are none.
 */
export function stockRefill(bearings = '', { root = null } = {}) {
  const g = effectiveGenerators(bearings, { root });
  const n = g.generators.length;
  if (!n) return null;
  const where = g.from === 'dial' ? 'from the Improve dial' : 'in plan/bearings.md';
  return { name: 'refill', hook: 'queue', when: 'always', run: 'node scripts/plan/refill.mjs --write', return: 'continue', line: 0, stock: `${n} generator${n === 1 ? '' : 's'} ${where}` };
}

/** A hook's lanes with the stock ones added: at `queue`, refill first, unless the file has its own `refill`. */
export function withStock(lanes, { kind, hook, bearings = '', root = null }) {
  if (kind !== 'march' || hook !== 'queue' || lanes.some((l) => l.name === 'refill')) return lanes;
  const refill = stockRefill(bearings, { root });
  return refill ? [refill, ...lanes] : lanes;
}

/** Run a `when` script from the repo root: node for .mjs/.js/.cjs, else the file itself. Its exit code (127: none). */
export function runWhen(root) {
  return (rel) => {
    const abs = path.resolve(root, rel);
    if (!fs.existsSync(abs)) return 127;
    const opts = { cwd: root, stdio: 'ignore', timeout: 60000, shell: false };
    // No shell, so a path with a space stays one argument. Windows runs .cmd/.bat only through cmd.exe: /s strips the
    // outer pair of quotes and the inner pair keeps the path whole.
    const res = /\.(mjs|cjs|js)$/i.test(abs) ? spawnSync(process.execPath, [abs], opts)
      : process.platform === 'win32' && /\.(cmd|bat)$/i.test(abs)
        ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${abs}""`], { ...opts, windowsVerbatimArguments: true })
        : spawnSync(abs, [], opts);
    return typeof res.status === 'number' ? res.status : 1;
  };
}

/** Whether the plan's first pick comes from the Asap lane (order.mjs's simulation: no claims, no vault, no network). */
export async function asapReady(root) {
  const readme = readSafe(path.join(root, 'plan', 'README.md'));
  if (!readme) return false;
  const [{ lanes, simulate }, { SPEC_FILE, parseSpec }] = await Promise.all([import('./order.mjs'), import('../plan-check.mjs')]);
  if (!lanes(readme).asap.length) return false;
  const dir = path.join(root, 'plan');
  const specs = fs.readdirSync(dir).filter((n) => SPEC_FILE.test(n)).map((n) => parseSpec(n, readSafe(path.join(dir, n))));
  return simulate({ readme, specs }).next[0]?.lane === 'asap';
}

function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) return walk(abs, base);
    return e.name.endsWith('.md') ? [path.relative(base, abs).split(path.sep).join('/')] : [];
  });
}

/**
 * Re-sync the kit's skills (`from`, e.g. ../nexus/templates/skills) over this repo's (`to`). Returns { replaced,
 * same, kept, created, absent, added }: a lanes file here is kept whatever the kit's says; a missing one is created;
 * a kit skill this repo lacks is `absent`, copied (`added`) only with `add`. Writes only with `write`.
 */
export function sync(from, to, { write = false, add = false } = {}) {
  const out = { replaced: [], same: [], kept: [], created: [], absent: [], added: [] };
  for (const rel of walk(from)) {
    const src = path.join(from, rel);
    const dst = path.join(to, rel);
    const here = fs.existsSync(dst);
    let bucket;
    if (rel.endsWith('.lanes.md')) bucket = here ? 'kept' : 'created';
    else if (!here) bucket = add ? 'added' : 'absent';
    else bucket = fs.readFileSync(src, 'utf8') === fs.readFileSync(dst, 'utf8') ? 'same' : 'replaced';
    out[bucket].push(rel);
    if (write && ['replaced', 'created', 'added'].includes(bucket)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
  }
  return out;
}

function readSafe(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

export const USAGE = 'usage: lanes.mjs march pre|queue [--asap ready|none] [--support ready|none] [--json] | iterate dimensions [--json] | check | sync <kit skills dir> [--add] [--write]';

export async function main(argv, { root = process.cwd(), log = console.log, check = runWhen(root), asap = asapReady } = {}) {
  const at = (flag) => {
    const i = argv.indexOf(flag);
    return i < 0 ? undefined : argv[i + 1];
  };
  const [cmd, hook] = argv;
  if (cmd === 'check') {
    const problems = Object.entries(FILES).flatMap(([kind, rel]) => parseLanes(readSafe(path.join(root, rel)), kind, rel).problems);
    for (const p of problems) log(p);
    log(problems.length ? `${problems.length} lanes problem(s)` : 'clean');
    return problems.length ? 1 : 0;
  }
  if (cmd === 'sync') {
    if (!hook || hook.startsWith('--')) return (console.error(USAGE), 64);
    const from = path.resolve(root, hook);
    if (!fs.existsSync(from)) return (console.error(`no kit skills at ${hook}`), 64);
    const write = argv.includes('--write');
    const r = sync(from, path.join(root, 'skills'), { write, add: argv.includes('--add') });
    const verb = write ? '' : ' (dry run)';
    for (const f of r.replaced) log(`replace ${f}${verb}`);
    for (const f of r.created) log(`create ${f}${verb}`);
    for (const f of r.added) log(`add ${f}${verb}`);
    for (const f of r.kept) log(`keep ${f} (a lanes file: the project's own)`);
    for (const f of r.absent) log(`absent ${f} (not in this repo; --add copies it)`);
    log(`${r.replaced.length} replaced, ${r.same.length} same, ${r.kept.length} lanes kept, ${r.created.length + r.added.length} new${verb}`);
    return 0;
  }
  if (!HOOKS[cmd] || !HOOKS[cmd].includes(hook)) return (console.error(USAGE), 64);
  const flag = (f) => {
    const v = at(f);
    if (v === undefined) return undefined;
    return v === 'ready' ? true : v === 'none' ? false : null;
  };
  const [asapFlag, supportFlag] = [flag('--asap'), flag('--support')];
  if (asapFlag === null || supportFlag === null) return (console.error(USAGE), 64);
  const { lanes, problems } = parseLanes(readSafe(path.join(root, FILES[cmd])), cmd);
  for (const p of problems) log(`problem ${p}`);
  const bearings = readSafe(path.join(root, 'plan', 'bearings.md'));
  const asapIsReady = hook === 'pre' && lanes.some((l) => l.hook === 'pre') ? (asapFlag ?? (await asap(root))) : false;
  const picked = select(
    withStock(lanes.filter((l) => !problems.some((p) => p.includes(`lane ${l.name}:`))), { kind: cmd, hook, bearings, root }),
    { hook, off: lanesOff(bearings), asapReady: asapIsReady, supportReady: supportFlag ?? false, check },
  );
  if (argv.includes('--json')) {
    log(JSON.stringify(picked, null, 2));
    return 0;
  }
  for (const l of picked) {
    const letter = l.letter ? ` · letter ${l.letter}` : '';
    if (l.action === 'skip') log(`skip ${l.name} · ${l.why}`);
    else log(`${l.action} ${l.name}${letter}${l.stock ? ` · stock: ${l.stock}` : ''} · ${l.action === 'judge' ? `${l.why} · ` : ''}run: ${l.run} · return: ${l.return}`);
  }
  const active = picked.filter((l) => l.action !== 'skip').length;
  log(active ? `${active} lane${active === 1 ? '' : 's'} at ${hook}` : 'stock');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (e) => {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    },
  );
}
