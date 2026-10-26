// Settings' improvement dial (spec 59, A4): the `Improve:` line of plan/bearings.md, under `## Plan expansion
// posture` (off | gentle | steady | bold; no line reads gentle). GET /api/improve reads it, with the overrides the
// repo's own resolver (scripts/plan/improve.mjs, never a copy of its table) finds beside it; POST /api/improve
// { value } changes it.
//
// A plan file is never written in the checkout the GUI runs from. The change is one pending file,
// `plan/pending/improve-<stamp>.md`, whose `## Edit plan/bearings.md` swaps the line's value (or adds the line under the
// section heading, or the section at the end), landed the way a board reorder lands (reorder.mjs landPending): owner,
// committed, settled and pushed to the default branch from a temporary worktree; contributor, a branch and a pull
// request. The repo variables (NEXUS_SUPPORT, NEXUS_CADENCE) are never written here: an unset one already takes the
// dial in the cloud (improve.mjs --cloud), and a set one is an override the owner keeps on purpose.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { findKitScript } from './repo.mjs';
import { runClean } from './cloud.mjs';
import { clock, landPending, pendingText, settledPlan } from './reorder.mjs';

export const POSITIONS = Object.freeze(['off', 'gentle', 'steady', 'bold']);
export const DEFAULT_POSITION = 'gentle';
export const BEARINGS = 'plan/bearings.md';
export const SECTION = '## Plan expansion posture';
const PENDING = 'plan/pending';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

/** Comments and fenced code blanked, line for line: an example is no setting (improve.mjs plain()). */
function plain(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ''))
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, (m) => m.replace(/[^\n]/g, ''));
}

/** An `Improve: <word>` setting line (bullet, bold, backticks and a trailing note allowed); prose like `off | gentle` is not one. */
const LINE = /^[ \t]*(?:[-*][ \t]+)?[*`]*Improve[*`]*[ \t]*:[*`]*[ \t]*[*`]*([A-Za-z][\w-]*)[*`]*[ \t]*(?:$|#|\(|—|--)/;

/**
 * The dial in bearings text: { value, source: bearings | default, index, line, word }. index is the setting line's
 * line number (-1: none), word the value it spells. As the resolver reads it: the first line whose value is a position
 * wins; only when none is, the first line that is no position (read gentle) is the one a choice swaps.
 */
export function dialIn(text = '') {
  const t = String(text ?? '').replace(/\r\n/g, '\n');
  const lines = plain(t).split('\n');
  const raw = t.split('\n');
  let first = null;
  for (let i = 0; i < lines.length; i++) {
    const m = LINE.exec(lines[i]);
    if (!m) continue;
    const word = m[1].toLowerCase();
    if (POSITIONS.includes(word)) return { value: word, source: 'bearings', index: i, line: raw[i], word: m[1] };
    first ??= { value: DEFAULT_POSITION, source: 'default', index: i, line: raw[i], word: m[1] };
  }
  return first ?? { value: DEFAULT_POSITION, source: 'default', index: -1, line: null, word: null };
}

/** The smallest run of whole lines ending at line `end` (inclusive) that the text holds exactly once. */
function uniqueTail(lines, end, text) {
  for (let s = end; s >= 0; s--) {
    const snip = lines.slice(s, end + 1).join('\n');
    const at = text.indexOf(snip);
    if (snip.trim() && at >= 0 && text.indexOf(snip, at + 1) < 0) return snip;
  }
  return null;
}

/** The smallest run of whole lines starting at line `start` that the text holds exactly once. */
function uniqueFrom(lines, start, text) {
  for (let e = start; e < lines.length; e++) {
    const snip = lines.slice(start, e + 1).join('\n');
    const at = text.indexOf(snip);
    if (at >= 0 && text.indexOf(snip, at + 1) < 0) return snip;
  }
  return null;
}

/**
 * The exact edits that set the dial to `value` in bearings text: the setting line's value swapped in place; with no
 * line, `- Improve: <value>` under the `## Plan expansion posture` heading; with no section, the section at the end.
 * Pure; throws (400) on a value that is no position or a dial already there. { edits, from, how: swap | line | section }.
 */
export function improveEdits(text, value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (!POSITIONS.includes(v)) throw bad(`Improve: ${value} is not a dial position (${POSITIONS.join(', ')})`);
  const t = String(text ?? '').replace(/\r\n/g, '\n');
  const d = dialIn(t);
  if (d.source === 'bearings' && d.value === v) throw bad(`Improve: ${v} is already there: nothing changes`);
  const lines = t.split('\n');
  if (d.index >= 0) {
    const old = uniqueFrom(lines, d.index, t);
    if (!old) throw bad('the Improve: line could not be quoted exactly once', 500);
    const at = d.line.indexOf(d.word, d.line.indexOf(':'));
    const line = `${d.line.slice(0, at)}${v}${d.line.slice(at + d.word.length)}`;
    return { edits: [{ old, new: `${line}${old.slice(d.line.length)}` }], from: d.word.toLowerCase(), how: 'swap' };
  }
  const head = lines.findIndex((l) => l.trim() === SECTION);
  if (head >= 0) {
    const old = uniqueFrom(lines, head, t);
    if (!old) throw bad(`the ${SECTION} heading could not be quoted exactly once`, 500);
    const rest = old.slice(lines[head].length);
    return { edits: [{ old, new: `${lines[head]}\n\n- Improve: ${v}${rest}` }], from: null, how: 'line' };
  }
  let end = lines.length - 1;
  while (end >= 0 && !lines[end].trim()) end--;
  if (end < 0) throw bad(`${BEARINGS} is empty: write its sections first`, 409);
  const old = uniqueTail(lines, end, t);
  if (!old) throw bad(`the end of ${BEARINGS} could not be quoted exactly once`, 500);
  return { edits: [{ old, new: `${old}\n\n${SECTION}\n\n- Improve: ${v}` }], from: null, how: 'section' };
}

/** `improve-<stamp>.md`, with -2, -3 … when that name is taken. */
export function improveName(stamp, taken = new Set()) {
  let name = `improve-${stamp}.md`;
  for (let k = 2; taken.has(name); k++) name = `improve-${stamp}-${k}.md`;
  return name;
}

/**
 * Write the dial's pending file into `root` (the landing's temporary worktree), bearings read through root's settled
 * view. body: { value }. Returns { value, from, how, file }.
 */
export async function writeImprove(root, body = {}, { now = new Date(), plan } = {}) {
  const { read } = plan || (await settledPlan(root));
  const text = read(BEARINGS);
  if (text == null) throw bad(`this repo has no ${BEARINGS}: the dial lives there`, 404);
  const r = improveEdits(text, body.value);
  const { date, stamp } = clock(now);
  const dir = path.join(root, PENDING);
  fs.mkdirSync(dir, { recursive: true });
  const out = `${PENDING}/${improveName(stamp, new Set(fs.readdirSync(dir)))}`;
  fs.writeFileSync(path.join(root, out), pendingText(BEARINGS, r.edits, date), { flag: 'wx' });
  return { value: String(body.value).trim().toLowerCase(), from: r.from, how: r.how, file: out };
}

/** Land the dial (POST /api/improve): as landReorder, through landPending. */
export function landImprove(repo, body = {}, opts = {}) {
  return landPending(repo, {
    kind: 'improve',
    async write(tmp, { now }) {
      const w = await writeImprove(tmp, body, { now });
      const what = `Improve: ${w.value}${w.from ? ` (was ${w.from})` : ''}`;
      return {
        file: w.file,
        what,
        subject: `plan: improve ${w.value}`,
        base: { value: w.value, from: w.from },
        prBody: `${what}, from the nexus GUI's Settings. One pending file (${w.file}); the owner's settle applies it to ${BEARINGS}.`,
        prNote: 'The loop reads it once it merges and the owner settles.',
        done: (branch, settleNote) => `Set on ${branch}: ${what}.${settleNote} The next tick reads it; pull to see it in this checkout.`,
      };
    },
  }, opts);
}

/** The repo's own resolver (scripts/plan/improve.mjs), or null. */
async function resolver(repo) {
  const rel = findKitScript(repo, 'improve.mjs', { home: 'scripts/plan' });
  if (!rel) return null;
  try {
    const mod = await import(pathToFileURL(path.join(repo, rel)).href);
    return typeof mod.resolve === 'function' ? mod : null;
  } catch {
    return null;
  }
}

/** What origin's default branch holds at plan/bearings.md, read locally (no fetch): { branch, text } or null. */
async function onOrigin(repo, run) {
  const head = await run('git', ['rev-parse', '--abbrev-ref', 'origin/HEAD'], { cwd: repo });
  const ref = head.ok ? head.out.trim() : '';
  if (!/^origin\/\S+$/.test(ref)) return null;
  const show = await run('git', ['show', `${ref}:${BEARINGS}`], { cwd: repo });
  return show.ok ? { branch: ref.slice('origin/'.length), text: show.out } : null;
}

/**
 * GET /api/improve: { value, source, positions, file, overrides: [{ knob, value }], warnings, resolver, here?,
 * branch? }. The dial is what origin's default branch holds (what the loop runs on) when this checkout knows it,
 * else the checkout's settled plan; `here` is the checkout's own value when the two differ (not pulled yet).
 * Overrides come from the repo's resolver; a repo without it lists none and says so (resolver false).
 */
export async function improveView(repo, { run = runClean } = {}) {
  const { read } = await settledPlan(repo);
  const local = read(BEARINGS);
  const main = await onOrigin(repo, run).catch(() => null);
  const text = main?.text ?? local;
  if (text == null) return { value: DEFAULT_POSITION, source: 'none', positions: POSITIONS, file: BEARINGS, overrides: [], warnings: [], resolver: false };
  const d = dialIn(text);
  const mod = await resolver(repo);
  let overrides = [];
  let warnings = [];
  if (mod) {
    try {
      const project = typeof mod.projectGenerators === 'function' ? mod.projectGenerators(repo) : [];
      const r = mod.resolve(text.replace(/\r\n/g, '\n'), { vars: {}, project });
      overrides = r.knobs.filter((k) => k.source === 'override').map((k) => ({ knob: k.knob, value: k.knob === 'Generators' && k.list?.length > 1 ? `${k.list.length} listed` : k.value }));
      warnings = r.warnings;
    } catch { /* the resolver could not read it: no overrides known */ }
  }
  const here = local != null && main ? dialIn(local) : null;
  return {
    value: d.value, source: d.source, positions: POSITIONS, file: BEARINGS, overrides, warnings, resolver: !!mod,
    ...(main ? { branch: main.branch } : {}),
    ...(here && here.value !== d.value ? { here: here.value } : {}),
  };
}
