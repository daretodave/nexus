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
//   Promote             owner | aged | autonomous     (absent: the `Improve:` dial's, scripts/plan/improve.mjs;
//                                                      owner with no dial line, the conservative upgrade default)
//   promote_after_days  a candidate this old is eligible (21)
//   promote_floor       ... when its score is at least this (6.0)
//   promote_per_week    auto-promotions dated in the last 7 days, vetoed ones included, cap the next (1)
//   veto_days           the window the Held line holds the spec for (3)
//   pending_cap         Pending rows above this are cut, the lowest-scoring 60+ days old first, 5 a pass (15)
//
// A Pending candidate (plan/CANDIDATES.md, `### [ ] [score X] <title>`) is eligible when its score is at least the
// floor and it is `promote_after_days` old (its `- proposed:` date) or re-evidenced twice (dates in its prose, plus
// independent `- re-evidence:` lines). The pick is the highest score, ties to the oldest. Auto-promotions are counted from `- promoted: <date>, auto` lines anywhere in the
// file (a vetoed row keeps its line, so a veto never frees a slot for an immediate retry).
//
// Pending stays live. `reevidence` records a signal that reinforces a Pending row on the row itself, under
// `- re-evidence:` (one `  - <date> · <letter> <ref> · independent, +0.5 · <note>` line each). A signal is independent
// when its letter (the expand skill's signal sources: A-F in the kit, A-H in the template) or its issue or commit ref
// is new to the row (letters: its re-evidence lines and any `signal <X>`; refs: anywhere in the row). Each independent
// one adds +0.5 to the score, capped at +2 over the
// `- filed score:` the first re-evidence records, and counts toward the twice-re-evidenced trigger above. `cap`, after
// the pass's promotion: when Pending exceeds `pending_cap`, the lowest-scoring rows proposed 60+ days ago (ties: the
// oldest) move to `## Rejected` as `stale: below cap cut <date>`, at most 5 a pass; `cuts` lists them for the digest.
//
//   node scripts/plan/promote.mjs pick [--today YYYY-MM-DD] [--json]          # the candidate this pass promotes
//   node scripts/plan/promote.mjs hold <NN> <issue> [--today YYYY-MM-DD]       # write the spec's Held line
//   node scripts/plan/promote.mjs sweep [--today YYYY-MM-DD] [--issues <file>] [--write] [--json]
//   node scripts/plan/promote.mjs reevidence "<title words>" <letter> [#<issue>|<sha>] [--note <text>] [--today D] [--write]
//   node scripts/plan/promote.mjs cap [--today YYYY-MM-DD] [--write] [--json]  # the stale cut over pending_cap
//   node scripts/plan/promote.mjs cuts [--since YYYY-MM-DD]                   # the cap cuts, for the digest
//
// `pick` prints `pick …`, `ask …` (an eligible candidate a contributor's checkout cannot promote: one needs-user ask)
// or `none: <why>`. `sweep` prints one `veto|release|wait <NN> #<issue>` line per auto-promoted Held line; with
// `--write` it makes the veto and release plan edits (the skill then closes a released issue with gh). Issue states
// come from `gh issue view` (read only), or from `--issues <file>` (`{"123": "CLOSED"}`) in tests and dry runs; a
// state gh cannot read is a `wait`. `reevidence` and `cap` print what they would write, and write it with `--write`.
// Exit 0; 1 when `reevidence` matches no Pending row or more than one; 64 on bad usage.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseAutoHeld } from '../plan-check.mjs';
import { isOwner } from '../owner.mjs';
import { loadConfig } from './config.mjs';
import { knobOf } from './improve.mjs';

export const KNOBS = Object.freeze({ promote: 'owner', afterDays: 21, floor: 6.0, perWeek: 1, vetoDays: 3, pendingCap: 15 });
const KEYS = { Promote: 'promote', promote_after_days: 'afterDays', promote_floor: 'floor', promote_per_week: 'perWeek', veto_days: 'vetoDays', pending_cap: 'pendingCap' };
/** Re-evidence: +0.5 a signal, at most +2 over the filed score. A cap cut: rows this old, at most this many a pass. */
export const BUMP = 0.5;
export const BUMP_CAP = 2;
export const STALE_DAYS = 60;
export const CUT_PER_PASS = 5;
const DATE = /\d{4}-\d{2}-\d{2}/g;
const DAY = 86400000;

export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/**
 * The promotion knobs from plan/bearings.md text, over the defaults. `Promote` comes through the improvement dial
 * (scripts/plan/improve.mjs: a `Promote:` line, else the `Improve:` dial, else owner); the numbers are settings, read
 * here. `- **promote_floor:** 6`, `promote_floor: 6` alike.
 */
export function knobs(bearings = '') {
  const out = { ...KNOBS, promote: knobOf(bearings, 'Promote', { vars: {} }).value };
  for (const [key, name] of Object.entries(KEYS)) {
    if (name === 'promote') continue;
    const m = new RegExp(`^[ \\t]*(?:[-*][ \\t]+)?[*\`]*${key}[*\`]*[ \\t]*:[*\`]*[ \\t]*[*\`]*([^\\s*\`]+)`, 'm').exec(bearings);
    if (m && Number.isFinite(parseFloat(m[1]))) out[name] = parseFloat(m[1]);
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
    // ... plus each independent entry the reevidence command wrote under `- re-evidence:`.
    const logged = (field(body, 're-evidence').match(/ · independent\b/g) ?? []).length;
    pending.push({ title: m[2].trim(), score: Number(m[1]), proposed, reEvidence: reEvidence.length + logged });
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

/** Cut the row headed at `at` out of `lines` (with one trailing blank) and return its lines. */
function takeRow(lines, at) {
  const end = rowEnd(lines, at);
  const row = lines.slice(at, end);
  lines.splice(at, end - at + (lines[end] !== undefined && !lines[end].trim() ? 1 : 0));
  return row;
}

/** Put `row` at the end of `## Rejected` (made when missing); the template's placeholder goes once a real row lands. */
function toRejected(lines, row) {
  let [start, stop] = section(lines, 'Rejected');
  if (start < 0) {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    lines.push('', '## Rejected', '');
    [start, stop] = section(lines, 'Rejected');
  }
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
}

/** Move the candidate promoted to `spec` (or under `issue`) from wherever it sits to `## Rejected`, marked vetoed. */
export function rejectCandidate(text, spec, issue, date) {
  const lines = text.split('\n');
  const n = String(Number(spec));
  const at = lines.findIndex((l, i) => /^### \[promoted /.test(l) && (new RegExp(`→ spec 0*${n}\\]`).test(l)
    || lines.slice(i + 1, rowEnd(lines, i)).some((b) => new RegExp(`veto #${issue}\\b`).test(b))));
  if (at < 0) return { text, moved: false };
  const row = takeRow(lines, at);
  row[0] = row[0].replace(/^### \[promoted [^\]]*\]/, `### [vetoed ${date} (#${issue})]`);
  toRejected(lines, row);
  return { text: lines.join('\n'), moved: true };
}

const PENDING_HEAD = /^### \[ \] \[score (\d+(?:\.\d+)?)\] (.+)$/;

/** The Pending heading indices whose title holds `words` (case-insensitive); an exact title wins outright. */
function findPending(lines, words) {
  const [start, end] = section(lines, 'Pending');
  const want = words.trim().toLowerCase();
  const hits = [];
  for (let i = start + 1; start >= 0 && want && i < end; i++) {
    const m = PENDING_HEAD.exec(lines[i]);
    if (!m) continue;
    if (m[2].trim().toLowerCase() === want) return [i];
    if (m[2].toLowerCase().includes(want)) hits.push(i);
  }
  return hits;
}

const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1);
/** A re-evidence ref: an issue (`#123`) or a commit sha (7-40 hex). */
export const REF = /^(#\d+|[0-9a-f]{7,40})$/i;

/**
 * Is a signal independent of what the row already cites? A new signal letter is, and so is a new issue or commit ref.
 * The row's letters are its re-evidence lines' and any `signal <X>` in its text; a ref is old when the row mentions it
 * anywhere (a commit by its first 7 characters).
 */
export function independent(body, letter, ref = null) {
  const letters = new Set([
    ...[...body.matchAll(/^\s+- \d{4}-\d{2}-\d{2} · ([A-H])\b/gm)].map((m) => m[1]),
    ...[...body.matchAll(/\bsignal ([A-H])\b/g)].map((m) => m[1]),
  ]);
  if (!letters.has(letter)) return true;
  if (!ref) return false;
  if (ref.startsWith('#')) return !new RegExp(`#${ref.slice(1)}\\b`).test(body);
  return !body.toLowerCase().includes(ref.slice(0, 7).toLowerCase());
}

/**
 * Record one re-evidence on the Pending row whose title holds `words`: { text, title, from, to, independent }, or
 * { error } when no row or more than one matches. The first one records `- filed score:`; an independent one adds BUMP
 * to the score, never past filed + BUMP_CAP, and counts toward the twice-re-evidenced promotion trigger.
 */
export function reevidence(text, words, letter, ref = null, { date = today(), note = '' } = {}) {
  const lines = text.split('\n');
  const hits = findPending(lines, words);
  if (hits.length !== 1) return { error: hits.length ? `${hits.length} Pending rows match "${words}"; give more of the title` : `no Pending row matches "${words}"` };
  const at = hits[0];
  const end = rowEnd(lines, at);
  const body = lines.slice(at + 1, end);
  const [, scoreText, title] = PENDING_HEAD.exec(lines[at]);
  const from = Number(scoreText);
  const filedText = field(body, 'filed score');
  const filed = filedText ? Number((/\d+(?:\.\d+)?/.exec(filedText) ?? [from])[0]) : from;
  const ind = independent(body.join('\n'), letter, ref);
  const to = ind ? Math.min(from + BUMP, Math.max(from, filed + BUMP_CAP)) : from;
  const how = !ind ? 'same source, +0' : to > from ? `independent, +${fmt(to - from)}` : `independent, capped at +${BUMP_CAP}`;
  const tail = note ? ` · ${note.replace(/·/g, '-').replace(/\s+/g, ' ').trim()}` : '';
  const entry = `  - ${date} · ${letter}${ref ? ` ${ref}` : ''} · ${how}${tail}`;
  // Bottom-up, so the indices above each edit hold: the entry, the filed score, then the heading.
  const reAt = body.findIndex((l) => l.startsWith('- re-evidence:'));
  if (reAt < 0) lines.splice(end, 0, '- re-evidence:', entry);
  else {
    let last = at + 1 + reAt;
    while (last + 1 < end && !/^- /.test(lines[last + 1])) last++;
    lines.splice(last + 1, 0, entry);
  }
  if (!filedText) {
    const pAt = body.findIndex((l) => l.startsWith('- proposed:'));
    let put = at + 1;
    if (pAt >= 0) {
      put = at + 2 + pAt;
      while (put < end && !/^- /.test(lines[put])) put++;
    }
    lines.splice(put, 0, `- filed score: ${scoreText}`);
  }
  if (to > from) lines[at] = `### [ ] [score ${fmt(to)}] ${title}`;
  return { text: lines.join('\n'), title: title.trim(), from, to, independent: ind };
}

/** The rows a cap cut takes: with Pending over `pendingCap`, the lowest scores proposed STALE_DAYS+ ago, ties the oldest. */
export function capCut({ pending }, k, date = today()) {
  const over = Math.max(0, pending.length - k.pendingCap);
  const cut = pending
    .filter((c) => c.proposed && daysBetween(c.proposed, date) >= STALE_DAYS)
    .map((c) => ({ ...c, age: daysBetween(c.proposed, date) }))
    .sort((a, b) => a.score - b.score || a.proposed.localeCompare(b.proposed))
    .slice(0, Math.min(over, CUT_PER_PASS));
  return { count: pending.length, over, cut };
}

/** Move the Pending rows with these exact titles to `## Rejected`, each with the reason `stale: below cap cut <date>`. */
export function cutStale(text, titles, date = today()) {
  const lines = text.split('\n');
  for (const title of titles) {
    const [at] = findPending(lines, title).filter((i) => PENDING_HEAD.exec(lines[i])[2].trim() === title);
    if (at === undefined) continue;
    const row = takeRow(lines, at);
    row[0] = row[0].replace(/^### \[ \]/, `### [rejected ${date}]`);
    row.splice(1, 0, `- reason: stale: below cap cut ${date}`);
    toRejected(lines, row);
  }
  return lines.join('\n');
}

/** Every cap cut under `## Rejected` dated `since` or later: { date, score, title }. */
export function cuts(text, since = '0000-00-00') {
  const lines = text.split(/\r?\n/);
  const [start, end] = section(lines, 'Rejected');
  const out = [];
  for (let i = start + 1; start >= 0 && i < end; i++) {
    const m = /^### \[rejected [^\]]*\] \[score (\d+(?:\.\d+)?)\] (.+)$/.exec(lines[i]);
    const r = m && /^- reason: stale: below cap cut (\d{4}-\d{2}-\d{2})/.exec(lines[i + 1] ?? '');
    if (r && r[1] >= since) out.push({ date: r[1], score: Number(m[1]), title: m[2].trim() });
  }
  return out;
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

const USAGE = 'usage: promote.mjs pick [--today D] [--json] | hold <NN> <issue> [--today D] | sweep [--today D] [--issues <file>] [--write] [--json]'
  + ' | reevidence "<title words>" <letter A-H> [#<issue>|<sha>] [--note <text>] [--today D] [--write] | cap [--today D] [--write] [--json] | cuts [--since D]';

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
  const candFile = path.join(root, 'plan', 'CANDIDATES.md');
  const write = argv.includes('--write');
  if (cmd === 'reevidence') {
    const valued = new Set(['--today', '--note']);
    const pos = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && !valued.has(all[i - 1]));
    const [words, letter, ref = null] = pos;
    if (!words || !/^[A-H]$/.test(letter ?? '') || (ref && !REF.test(ref)) || pos.length > 3) return (console.error(USAGE), 64);
    const r = reevidence(readSafe(candFile), words, letter, ref, { date, note: at('--note') ?? '' });
    if (r.error) return (console.error(`reevidence: ${r.error}`), 1);
    if (write) fs.writeFileSync(candFile, r.text);
    const how = r.independent ? (r.to > r.from ? `score ${fmt(r.from)} → ${fmt(r.to)}` : `score ${fmt(r.from)}, capped`) : 'same source, score unchanged';
    log(`${write ? 're-evidenced' : 'would re-evidence'} ${r.title} · ${letter}${ref ? ` ${ref}` : ''} · ${r.independent ? 'independent' : 'not independent'} · ${how}`);
    return 0;
  }
  if (cmd === 'cap') {
    const text = readSafe(candFile);
    const r = capCut(parseCandidates(text), k, date);
    if (write && r.cut.length) fs.writeFileSync(candFile, cutStale(text, r.cut.map((c) => c.title), date));
    if (argv.includes('--json')) log(JSON.stringify({ cap: k.pendingCap, ...r }, null, 2));
    else {
      for (const c of r.cut) log(`cut [score ${c.score}] ${c.title} · proposed ${c.proposed} (${c.age}d) · stale: below cap cut ${date}`);
      if (!r.over) log(`clean: ${r.count} Pending (cap ${k.pendingCap})`);
      else log(`${r.count} Pending, cap ${k.pendingCap}: ${r.cut.length} of ${r.over} over ${write ? 'cut' : 'due'}${r.cut.length < r.over ? ` (only rows ${STALE_DAYS}+ days old, ${CUT_PER_PASS} a pass)` : ''}`);
    }
    return 0;
  }
  if (cmd === 'cuts') {
    const since = at('--since') ?? '0000-00-00';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) return (console.error(USAGE), 64);
    const list = cuts(readSafe(candFile), since);
    for (const c of list) log(`cut ${c.date} [score ${c.score}] ${c.title}`);
    if (!list.length) log('none');
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
