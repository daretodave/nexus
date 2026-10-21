// POST /api/plan/reorder (spec 40 A12): the board's grip moves one chunk within its spec. A plan file is never written
// here: in both modes the move lands as one pending file, `plan/pending/reorder-<spec>-<stamp>.md`, whose `## Edit`
// takes the chunk's block out (its line, wrapped lines and sub-bullets) and puts it back after the open chunk it now
// follows (or before the spec's first open chunk). Settle (the repo's scripts/plan/settle.mjs) applies it on main;
// until then order.mjs and plan-check read it through the settled view, and so does the board (plan.mjs).
//
// Each edit's old text is one whole chunk block, so it is found exactly once while that chunk is listed. A chunk a
// pending file already closes is never moved and never an anchor: its close may settle first and take its line.
// Moves are relative ("B after A"), so reorders applied in settle's order (date, then name) give what the board
// showed; the stamp in the name keeps that order, and keeps two branches' files apart.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SETTLE_SCRIPT = 'scripts/plan/settle.mjs';
const PENDING = 'plan/pending';
/** A listed (open) chunk line: `- [ ] **07.3** …`. */
const CHUNK = /^- \[ \] \*\*(\d{2,}\.\w+)\*\*/;
/** Any chunk line, `- [x]` too: a block's start. */
const ANY = /^- \[[ xX]\] \*\*(\d{2,}\.\w+)\*\*/;
const ID = /^\d{2,}\.\w+$/;
const specOf = (id) => String(id).split('.')[0];
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

/**
 * The chunk blocks under a spec's `## Chunks`: [{ id, open, start, end, text }] in file order (line indexes, end
 * exclusive). A block is a chunk line plus every line indented under it (wrapped lines and sub-bullets).
 */
export function chunkBlocks(spec) {
  const lines = String(spec).replace(/\r\n/g, '\n').split('\n');
  const h = lines.findIndex((l) => /^## Chunks\b/.test(l));
  if (h < 0) return [];
  const out = [];
  for (let i = h + 1; i < lines.length && !/^## /.test(lines[i]); i++) {
    const m = ANY.exec(lines[i]);
    if (!m) continue;
    let j = i + 1;
    while (j < lines.length && /^ {2,}\S/.test(lines[j])) j++;
    out.push({ id: m[1], open: CHUNK.test(lines[i]), start: i, end: j, text: lines.slice(i, j).join('\n') });
    i = j - 1;
  }
  return out;
}

/** The chunk ids a spec lists, in order. */
export const listedIds = (spec) => chunkBlocks(spec).map((b) => b.id);

/** Exact edits, applied in turn (settle's own rule: each old text found exactly once; an empty new takes whole lines). */
export function applyExact(text, edits) {
  let t = text;
  for (const e of edits) {
    const at = t.indexOf(e.old);
    if (at < 0 || t.indexOf(e.old, at + 1) >= 0) throw bad(`the old text is ${at < 0 ? 'not there' : 'there more than once'}`, 409);
    const end = at + e.old.length;
    const whole = e.new === '' && (at === 0 || t[at - 1] === '\n') && t[end] === '\n';
    t = t.slice(0, at) + e.new + t.slice(whole ? end + 1 : end);
  }
  return t;
}

/**
 * The move as exact edits on the spec's text. `id` moves to just after open chunk `after` (null: before the first open
 * chunk). `closed` holds the ids a pending close already closes. Pure; throws (status 400) on a move it refuses.
 * @returns {{ edits: { old: string, new: string }[], before: string[], order: string[] }} open ids before and after
 */
export function reorderEdits(spec, { id, after = null }, closed = new Set()) {
  id = String(id ?? '');
  after = after == null || after === '' ? null : String(after);
  if (!ID.test(id)) throw bad('bad chunk id');
  if (after !== null && (!ID.test(after) || specOf(after) !== specOf(id))) throw bad(`${after} is not a chunk of spec ${specOf(id)}: a reorder stays within its spec`);
  if (after === id) throw bad('a chunk cannot follow itself');
  const text = String(spec).replace(/\r\n/g, '\n');
  const blocks = chunkBlocks(text);
  const isOpen = (b) => b.open && !closed.has(b.id);
  const b = blocks.find((x) => x.id === id);
  if (!b) throw bad(`${id} is not listed in its spec`, 404);
  if (!isOpen(b)) throw bad(`${id} is closed: a closed chunk never moves`);
  const open = blocks.filter(isOpen);
  const before = open.map((x) => x.id);
  let a = null;
  if (after !== null) {
    a = open.find((x) => x.id === after);
    if (!a) throw bad(blocks.some((x) => x.id === after) ? `${after} is closed: a closed chunk is never an anchor` : `${after} is not listed in its spec`);
  }
  const order = before.filter((x) => x !== id);
  order.splice(a ? order.indexOf(a.id) + 1 : 0, 0, id);
  if (order.join() === before.join()) throw bad(`${id} is already there: nothing moves`);
  const anchor = a || open.find((x) => x.id !== id);
  const edits = [
    { old: b.text, new: '' },
    a ? { old: a.text, new: `${a.text}\n${b.text}` } : { old: anchor.text, new: `${b.text}\n${anchor.text}` },
  ];
  // The edits must give exactly the order asked for, on the text as it stands.
  const got = chunkBlocks(applyExact(text, edits)).filter(isOpen).map((x) => x.id);
  if (got.join() !== order.join()) throw bad(`the edit would list ${got.join(', ')}, not ${order.join(', ')}`, 500);
  return { edits, before, order };
}

/** The pending file's text: front matter (date only) and one `## Edit` with its old/new pairs. */
export function pendingText(file, edits, date) {
  const pairs = edits.map((e) => ['~~~ old', e.old, '~~~', '~~~ new', ...(e.new === '' ? [] : [e.new]), '~~~'].join('\n'));
  return ['---', `date: ${date}`, '---', `## Edit ${file}`, pairs.join('\n'), ''].join('\n');
}

const pad = (n) => String(n).padStart(2, '0');
/** Local date and a sortable stamp: { date: '2026-10-21', stamp: '20261021-153012' }. */
export function clock(now = new Date()) {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return { date, stamp: `${date.replaceAll('-', '')}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}` };
}

/** `reorder-<spec>-<stamp>.md`, with -2, -3 … when that name is taken. */
export function pendingName(spec, stamp, taken = new Set()) {
  let name = `reorder-${spec}-${stamp}.md`;
  for (let k = 2; taken.has(name); k++) name = `reorder-${spec}-${stamp}-${k}.md`;
  return name;
}

/** The spec file for a spec number, as the plan folder spells it (`plan/40-gui.md`), or null. */
export function specFile(repo, spec) {
  const dir = path.join(repo, 'plan');
  if (!fs.existsSync(dir)) return null;
  const n = Number(spec);
  const hit = fs.readdirSync(dir).find((f) => {
    const m = /^(\d{2,})-[a-z0-9][a-z0-9-]*\.md$/.exec(f);
    return m && Number(m[1]) === n;
  });
  return hit ? `plan/${hit}` : null;
}

/**
 * The plan as it reads once settled, through the repo's own scripts/plan/settled.mjs and pending.mjs (never a copy
 * of their rules): { read(rel), closed: Set }. A repo without them reads its files as they stand, with no closes.
 */
export async function settledPlan(repo) {
  const raw = (rel) => {
    const f = path.join(repo, rel);
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : null;
  };
  const mod = async (rel) => {
    const f = path.join(repo, rel);
    return fs.existsSync(f) ? import(pathToFileURL(f).href) : null;
  };
  let read = raw;
  let closed = new Set();
  try {
    const s = await mod('scripts/plan/settled.mjs');
    if (s?.settledView) read = s.settledView(repo).read;
  } catch { /* read the files as they stand */ }
  try {
    const p = await mod('scripts/plan/pending.mjs');
    if (p?.pendingCloses && p?.pendingFiles) closed = p.pendingCloses(p.pendingFiles(repo));
  } catch { /* no pending closes known */ }
  return { read, closed };
}

/**
 * Write the reorder's pending file. body: { id, after }. owner: whether owner mode is on (GET /api/local effective);
 * it only changes the note: the pending file is the same in both modes.
 */
export async function writeReorder(repo, body = {}, { owner = false, now = new Date(), plan } = {}) {
  if (!fs.existsSync(path.join(repo, SETTLE_SCRIPT))) {
    throw bad(`This repo has no ${SETTLE_SCRIPT}, so a reorder has no pending file to land in. Move the chunk line in its spec by hand.`, 409);
  }
  const id = String(body.id ?? '');
  if (!ID.test(id)) throw bad('bad chunk id');
  const spec = specOf(id);
  const file = specFile(repo, spec);
  if (!file) throw bad(`no spec file for spec ${spec}`, 404);
  const { read, closed } = plan || (await settledPlan(repo));
  const text = read(file);
  if (text == null) throw bad(`no spec file for spec ${spec}`, 404);
  const r = reorderEdits(text, { id, after: body.after ?? null }, closed);
  const { date, stamp } = clock(now);
  const dir = path.join(repo, PENDING);
  fs.mkdirSync(dir, { recursive: true });
  const name = pendingName(spec, stamp, new Set(fs.readdirSync(dir)));
  const out = `${PENDING}/${name}`;
  fs.writeFileSync(path.join(repo, out), pendingText(file, r.edits, date), { flag: 'wx' });
  const after = body.after ? String(body.after) : null;
  return {
    ok: true, id, after, spec, file: out, order: r.order, mode: owner ? 'owner' : 'contributor',
    note: owner
      ? `${id} now follows ${after || 'nothing (first)'} in the plan's order. ${out} waits for settle (npm run settle, or /next's orient).`
      : `${id} now follows ${after || 'nothing (first)'} in the plan's order. ${out} rides your next pull request; the owner's settle applies it.`,
  };
}
