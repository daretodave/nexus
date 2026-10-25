// scripts/plan/promote.mjs: aged promotion behind a Held veto window (the silt valve).
//
// A candidate nobody promotes still ages into the plan, but never straight into a build: /expand promotes the best
// aged candidate as an unchunked spec, holds it in the roadmap's **Held** lane for `veto_days`, and opens a veto
// issue. /march Step 0 sweeps those Held lines every tick: a closed issue is a veto (the spec, its roadmap row and its
// Held line go, the candidate moves to `## Rejected`), an open one past its window is released (the Held line goes and
// /next builds the spec as usual). The skills write the spec and talk to GitHub; this script does the arithmetic and
// the mechanical plan edits, so both are the same every tick.
//
// The knobs live in plan/bearings.md (under `## Plan expansion posture`), one `Key: value` line each:
//
//   Promote             owner | aged | autonomous     (absent: owner, the conservative default for an upgrade)
//   promote_after_days  a candidate this old is eligible (21)
//   promote_floor       ... when its score is at least this (6.0)
//   promote_per_week    auto-promotions dated in the last 7 days, vetoed ones included, cap the next (1)
//   veto_days           the window the Held line holds the spec for (3)
//
// A Pending candidate (plan/CANDIDATES.md, `### [ ] [score X] <title>`) is eligible when its score is at least the
// floor and it is `promote_after_days` old (its `- proposed:` date) or carries two re-evidence dates. The pick is the
// highest score, ties to the oldest. Auto-promotions are counted from `- promoted: <date>, auto` lines anywhere in the
// file (a vetoed row keeps its line, so a veto never frees a slot for an immediate retry).
//
//   node scripts/plan/promote.mjs pick [--today YYYY-MM-DD] [--json]          # the candidate this pass promotes
//   node scripts/plan/promote.mjs hold <NN> <issue> [--today YYYY-MM-DD]       # write the spec's Held line
//   node scripts/plan/promote.mjs sweep [--today YYYY-MM-DD] [--issues <file>] [--write] [--json]
//
// `pick` prints `pick …`, `ask …` (an eligible candidate a contributor's checkout cannot promote: one needs-user ask)
// or `none: <why>`. `sweep` prints one `veto|release|wait <NN> #<issue>` line per auto-promoted Held line; with
// `--write` it makes the veto and release plan edits (the skill then closes a released issue with gh). Issue states
// come from `gh issue view` (read only), or from `--issues <file>` (`{"123": "CLOSED"}`) in tests and dry runs; a
// state gh cannot read is a `wait`. Exit 0, or 64 on bad usage.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseAutoHeld } from '../plan-check.mjs';
import { isOwner } from '../owner.mjs';
import { loadConfig } from './config.mjs';

export const KNOBS = Object.freeze({ promote: 'owner', afterDays: 21, floor: 6.0, perWeek: 1, vetoDays: 3 });
const KEYS = { Promote: 'promote', promote_after_days: 'afterDays', promote_floor: 'floor', promote_per_week: 'perWeek', veto_days: 'vetoDays' };
const DATE = /\d{4}-\d{2}-\d{2}/g;
const DAY = 86400000;

export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/** The promotion knobs from plan/bearings.md text, over the defaults. `- **Promote:** aged`, `Promote: aged` alike. */
export function knobs(bearings = '') {
  const out = { ...KNOBS };
  for (const [key, name] of Object.entries(KEYS)) {
    const m = new RegExp(`^[ \\t]*(?:[-*][ \\t]+)?[*\`]*${key}[*\`]*[ \\t]*:[*\`]*[ \\t]*[*\`]*([^\\s*\`]+)`, 'm').exec(bearings);
    if (!m) continue;
    if (name === 'promote') out.promote = ['owner', 'aged', 'autonomous'].includes(m[1].toLowerCase()) ? m[1].toLowerCase() : 'owner';
    else if (Number.isFinite(parseFloat(m[1]))) out[name] = parseFloat(m[1]);
  }
  return out;
}

/** A `## <name>` section's lines, [start, end) indices; start -1 when absent. */
function section(lines, name) {
  const start = lines.findIndex((l) => new RegExp(`^## ${name}\\s*$`).test(l));
  if (start < 0) return [-1, -1];
  const next = lines.findIndex((l, i) => i > start && /^## /.test(l));
  return [start, next < 0 ? lines.length : next];
}

/** One `### ` row's lines from its heading: up to the next `### ` or `## `, trailing blanks dropped. */
function rowEnd(lines, at) {
  let end = lines.findIndex((l, i) => i > at && /^#{2,3} /.test(l));
  if (end < 0) end = lines.length;
  while (end > at + 1 && !lines[end - 1].trim()) end--;
  return end;
}

/** A row field's text (`- proposed: …`, wrapped continuation lines included). */
function field(body, name) {
  const at = body.findIndex((l) => l.startsWith(`- ${name}:`));
  if (at < 0) return '';
  const out = [body[at]];
  for (let i = at + 1; i < body.length && !/^- /.test(body[i]); i++) out.push(body[i]);
  return out.join(' ');
}

/** plan/CANDIDATES.md: the Pending rows (title, score, proposed, re-evidence dates) and every auto-promotion date. */
export function parseCandidates(text = '') {
  const lines = text.split(/\r?\n/);
  const [start, end] = section(lines, 'Pending');
  const pending = [];
  for (let i = start + 1; start >= 0 && i < end; i++) {
    const m = /^### \[ \] \[score (\d+(?:\.\d+)?)\] (.+)$/.exec(lines[i]);
    if (!m) continue;
    const body = lines.slice(i + 1, rowEnd(lines, i));
    const proposedText = field(body, 'proposed');
    const proposed = (proposedText.match(DATE) ?? [])[0] ?? null;
    // Re-evidence: every date after the first "re-evidenced" in the proposed field, plus the `last re-evidenced` one.
    const reText = [proposedText.split(/re-evidenced/).slice(1).join(' '), field(body, 'last re-evidenced')].join(' ');
    const reEvidence = [...new Set(reText.match(DATE) ?? [])].filter((d) => d !== proposed);
    pending.push({ title: m[2].trim(), score: Number(m[1]), proposed, reEvidence: reEvidence.length });
  }
  const auto = [...text.matchAll(/^- promoted: (\d{4}-\d{2}-\d{2}), auto\b/gm)].map((m) => m[1]);
  return { pending, auto };
}

/**
 * The candidate an `aged` pass promotes. Returns { pick, ask, reason }: `pick` for an owner under `aged` or
 * `autonomous`, `ask` when only a contributor's checkout stands in the way, else both null with the reason.
 */
export function pick({ pending, auto }, k, { date = today(), owner = true } = {}) {
  const none = (reason) => ({ pick: null, ask: null, reason });
  if (k.promote === 'owner') return none('Promote: owner (only /oversight promotes)');
  const recent = auto.filter((d) => daysBetween(d, date) >= 0 && daysBetween(d, date) < 7).length;
  const eligible = pending
    .filter((c) => c.proposed && c.score >= k.floor)
    .map((c) => ({ ...c, age: daysBetween(c.proposed, date) }))
    .filter((c) => c.age >= k.afterDays || c.reEvidence >= 2)
    .sort((a, b) => b.score - a.score || a.proposed.localeCompare(b.proposed));
  if (!eligible.length) return none(`no Pending candidate scores ${k.floor}+ and is ${k.afterDays}d old or re-evidenced twice`);
  if (!owner) return { pick: null, ask: eligible[0], reason: 'a contributor checkout files one needs-user ask instead' };
  if (recent >= k.perWeek) return none(`${recent} auto-promotion${recent === 1 ? '' : 's'} in the last 7 days (cap ${k.perWeek})`);
  return { pick: eligible[0], ask: null, reason: `${eligible.length} eligible` };
}

/** The Held line an auto-promotion writes (the contract in concepts/plan-shape.md). */
export function heldLine(spec, issue, until, vetoDays) {
  return `- ${spec} · auto-promoted, veto until ${until} (#${issue}) · max_age: ${vetoDays}d · fallback: release`;
}

/** The Held lane's [heading, end) indices in the roadmap's lines. */
function heldLane(lines, prefix) {
  const head = lines.findIndex((l) => l.startsWith(prefix));
  if (head < 0) return [-1, -1];
  const end = lines.findIndex((l, i) => i > head && /^(##|\*\*)/.test(l));
  return [head, end < 0 ? lines.length : end];
}

/** The roadmap with a Held line added (replacing `- (none)`). */
export function addHeld(readme, line, prefix = '**Held') {
  const lines = readme.split('\n');
  const [head, end] = heldLane(lines, prefix);
  if (head < 0) throw new Error(`plan/README.md has no ${prefix}** lane`);
  const items = [];
  for (let i = head + 1; i < end; i++) if (/^\s*- /.test(lines[i])) items.push(i);
  const none = items.find((i) => /^\s*- \(none/.test(lines[i]));
  if (none !== undefined) lines[none] = line;
  else if (items.length) lines.splice(items[items.length - 1] + 1, 0, line);
  else {
    let blank = lines.findIndex((l, i) => i > head && i < end && !l.trim());
    if (blank < 0) { lines.splice(head + 1, 0, ''); blank = head + 1; }
    lines.splice(blank + 1, 0, line, ...(lines[blank + 1]?.trim() ? [''] : []));
  }
  return lines.join('\n');
}

/** The roadmap without the Held line at `index`; an emptied lane reads `- (none)`. */
function dropHeld(lines, index, prefix) {
  lines.splice(index, 1);
  const [head, end] = heldLane(lines, prefix);
  const any = lines.slice(head + 1, end).some((l) => /^\s*- /.test(l));
  if (!any) lines.splice(index, 0, '- (none)');
  return lines;
}

/** Every auto-promoted Held line: { spec, until, issue, index }. */
export function autoHeld(readme, prefix = '**Held') {
  const lines = readme.split('\n');
  const [head, end] = heldLane(lines, prefix);
  const out = [];
  for (let i = head + 1; head >= 0 && i < end; i++) {
    const a = parseAutoHeld(lines[i]);
    if (a) out.push({ ...a, index: i });
  }
  return out;
}

/** What the sweep does with one Held line: a closed issue vetoes, an open one past its window releases. */
export function decide(entry, state, date = today()) {
  if (state === 'CLOSED') return 'veto';
  if (state !== 'OPEN') return 'wait';
  return date > entry.until ? 'release' : 'wait';
}

/** Move the candidate promoted to `spec` (or under `issue`) from wherever it sits to `## Rejected`, marked vetoed. */
export function rejectCandidate(text, spec, issue, date) {
  const lines = text.split('\n');
  const n = String(Number(spec));
  const at = lines.findIndex((l, i) => /^### \[promoted /.test(l) && (new RegExp(`→ spec 0*${n}\\]`).test(l)
    || lines.slice(i + 1, rowEnd(lines, i)).some((b) => new RegExp(`veto #${issue}\\b`).test(b))));
  if (at < 0) return { text, moved: false };
  const end = rowEnd(lines, at);
  const row = lines.slice(at, end);
  row[0] = row[0].replace(/^### \[promoted [^\]]*\]/, `### [vetoed ${date} (#${issue})]`);
  lines.splice(at, end - at + (lines[end] !== undefined && !lines[end].trim() ? 1 : 0));
  let [start, stop] = section(lines, 'Rejected');
  if (start < 0) {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    lines.push('', '## Rejected', '');
    [start, stop] = section(lines, 'Rejected');
  }
  // The template's placeholder paragraph goes once a real row lands.
  const ph = lines.findIndex((l, i) => i > start && i < stop && /^\(empty/.test(l));
  if (ph >= 0) {
    let e = ph;
    while (e < stop && lines[e].trim()) e++;
    lines.splice(ph, e - ph);
    [start, stop] = section(lines, 'Rejected');
  }
  let put = stop;
  while (put > start + 1 && !lines[put - 1].trim()) put--;
  lines.splice(put, 0, '', ...row, ...(lines[put]?.trim() ? [''] : []));
  return { text: lines.join('\n'), moved: true };
}

const readSafe = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : '');

/** Apply one veto or release to the plan files under `root` (the edits only; gh stays with the skill). */
export function apply(root, entry, action, date = today(), cfg = loadConfig(root)) {
  const plan = path.join(root, 'plan');
  const readmeFile = path.join(plan, 'README.md');
  let lines = readSafe(readmeFile).split('\n');
  const index = lines.findIndex((l) => {
    const a = parseAutoHeld(l);
    return a && a.spec === entry.spec && a.issue === entry.issue;
  });
  if (index < 0) return [];
  lines = dropHeld(lines, index, cfg.lanes.held);
  const done = [`plan/README.md: Held line for ${entry.spec} removed`];
  if (action === 'veto') {
    const file = fs.readdirSync(plan).find((f) => f.startsWith(`${entry.spec}-`) && f.endsWith('.md'));
    let title = `spec ${entry.spec}`;
    if (file) {
      const head = /^#\s+\d+\s*[—·:-]\s*(.+)$/m.exec(readSafe(path.join(plan, file)));
      if (head) title = head[1].trim();
      fs.rmSync(path.join(plan, file));
      lines = lines.filter((l) => !(l.startsWith('|') && l.includes(`](${file})`)));
      done.push(`plan/${file}: deleted, with its roadmap row`);
    }
    const candFile = path.join(plan, 'CANDIDATES.md');
    const r = rejectCandidate(readSafe(candFile), entry.spec, entry.issue, date);
    if (r.moved) {
      fs.writeFileSync(candFile, r.text);
      done.push('plan/CANDIDATES.md: candidate moved to Rejected');
    }
    const archFile = path.join(plan, 'ARCHIVE.md');
    const arch = readSafe(archFile).replace(/\n*$/, '\n');
    fs.writeFileSync(archFile, `${arch}- ${date} · ${entry.spec} · spec vetoed: ${title} (#${entry.issue}) · plan only\n`);
    done.push('plan/ARCHIVE.md: spec vetoed line');
  }
  fs.writeFileSync(readmeFile, lines.join('\n'));
  return done;
}

/** An issue's state through gh (read only); null when gh cannot say. */
function ghState(issue) {
  try {
    return execFileSync('gh', ['issue', 'view', String(issue), '--json', 'state', '-q', '.state'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

const USAGE = 'usage: promote.mjs pick [--today D] [--json] | hold <NN> <issue> [--today D] | sweep [--today D] [--issues <file>] [--write] [--json]';

export function main(argv, { root = process.cwd(), owner = () => isOwner(root), state = ghState, log = console.log } = {}) {
  const at = (flag) => {
    const i = argv.indexOf(flag);
    return i < 0 ? undefined : argv[i + 1];
  };
  const date = at('--today') ?? today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return (console.error(USAGE), 64);
  const k = knobs(readSafe(path.join(root, 'plan', 'bearings.md')));
  const cfg = loadConfig(root);
  const cmd = argv[0];
  if (cmd === 'pick') {
    const r = pick(parseCandidates(readSafe(path.join(root, 'plan', 'CANDIDATES.md'))), k, { date, owner: owner() });
    if (argv.includes('--json')) log(JSON.stringify({ knobs: k, ...r }, null, 2));
    else {
      const c = r.pick ?? r.ask;
      log(c ? `${r.pick ? 'pick' : 'ask'} [score ${c.score}] ${c.title} · proposed ${c.proposed} (${c.age}d) · re-evidenced ${c.reEvidence}` : `none: ${r.reason}`);
    }
    return 0;
  }
  if (cmd === 'hold') {
    const [spec, issue] = [argv[1], argv[2]];
    if (!/^\d+$/.test(spec ?? '') || !/^\d+$/.test(issue ?? '')) return (console.error(USAGE), 64);
    const file = path.join(root, 'plan', 'README.md');
    const line = heldLine(spec.padStart(2, '0'), issue, addDays(date, k.vetoDays), k.vetoDays);
    fs.writeFileSync(file, addHeld(readSafe(file), line, cfg.lanes.held));
    log(line);
    return 0;
  }
  if (cmd === 'sweep') {
    const file = at('--issues');
    const given = file ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    const entries = autoHeld(readSafe(path.join(root, 'plan', 'README.md')), cfg.lanes.held);
    const out = entries.map((e) => {
      const s = given ? given[String(e.issue)] ?? null : state(e.issue);
      return { ...e, state: s, action: decide(e, s ? String(s).toUpperCase() : null, date) };
    });
    const write = argv.includes('--write');
    for (const e of out) e.done = write && e.action !== 'wait' ? apply(root, e, e.action, date, cfg) : [];
    if (argv.includes('--json')) log(JSON.stringify(out.map(({ index, ...e }) => e), null, 2));
    else {
      for (const e of out) log(`${e.action} ${e.spec} #${e.issue}${e.action === 'wait' ? ` until ${e.until}${e.state ? '' : ' (issue state unknown)'}` : ''}`);
      log(out.length ? `${out.filter((e) => e.action !== 'wait').length} of ${out.length} auto-promoted Held lines ${write ? 'applied' : 'due'}` : 'clean');
    }
    return 0;
  }
  console.error(USAGE);
  return 64;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}
