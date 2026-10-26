// POST /api/plan/reorder (spec 40 A12, 47 A11): the board's grip moves one chunk within its spec. A plan file is never
// written here: in both modes the move is one pending file, `plan/pending/reorder-<spec>-<stamp>.md`, whose `## Edit`
// takes the chunk's block out (its line, wrapped lines and sub-bullets) and puts it back after the open chunk it now
// follows (or before the spec's first open chunk). It is written and landed in a temporary worktree of origin's default
// branch, never the checkout the GUI runs from (landReorder, below): the owner's commit is settled and pushed, a
// contributor's opens a pull request. Until settle applies it, order.mjs and plan-check read it through the settled
// view, and so does the board (plan.mjs).
//
// Each edit's old text is one whole chunk block, so it is found exactly once while that chunk is listed. A chunk a
// pending file already closes is never moved and never an anchor: its close may settle first and take its line.
// Moves are relative ("B after A"), so reorders applied in settle's order (date, adds before closes, then name) give what the board
// showed; the stamp in the name keeps that order, and keeps two branches' files apart.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { findKitScript } from './repo.mjs';
import { defaultBranch, runClean, safeHooks } from './cloud.mjs';

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
 * The plan as it reads once settled, through the repo's own settled.mjs and pending.mjs (scripts/plan/) (never a copy
 * of their rules): { read(rel), closed: Set }. A repo without them reads its files as they stand, with no closes.
 */
export async function settledPlan(repo) {
  const raw = (rel) => {
    const f = path.join(repo, rel);
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : null;
  };
  const mod = async (name) => {
    const rel = findKitScript(repo, name, { home: 'scripts/plan' });
    return rel ? import(pathToFileURL(path.join(repo, rel)).href) : null;
  };
  let read = raw;
  let closed = new Set();
  try {
    const s = await mod('settled.mjs');
    if (s?.settledView) read = s.settledView(repo).read;
  } catch { /* read the files as they stand */ }
  try {
    const p = await mod('pending.mjs');
    if (p?.pendingCloses && p?.pendingFiles) closed = p.pendingCloses(p.pendingFiles(repo));
  } catch { /* no pending closes known */ }
  return { read, closed };
}

/**
 * Write the reorder's pending file into `root` (the landing's temporary worktree, never the person's checkout), the
 * move read through root's settled view. body: { id, after }. Returns { id, after, spec, file, order }.
 */
export async function writeReorder(root, body = {}, { now = new Date(), plan } = {}) {
  const id = String(body.id ?? '');
  if (!ID.test(id)) throw bad('bad chunk id');
  const spec = specOf(id);
  const file = specFile(root, spec);
  if (!file) throw bad(`no spec file for spec ${spec}`, 404);
  const { read, closed } = plan || (await settledPlan(root));
  const text = read(file);
  if (text == null) throw bad(`no spec file for spec ${spec}`, 404);
  const r = reorderEdits(text, { id, after: body.after ?? null }, closed);
  const { date, stamp } = clock(now);
  const dir = path.join(root, PENDING);
  fs.mkdirSync(dir, { recursive: true });
  const name = pendingName(spec, stamp, new Set(fs.readdirSync(dir)));
  const out = `${PENDING}/${name}`;
  fs.writeFileSync(path.join(root, out), pendingText(file, r.edits, date), { flag: 'wx' });
  return { id, after: body.after ? String(body.after) : null, spec, file: out, order: r.order, stamp };
}

// --- landing -----------------------------------------------------------------------------------------------------
// A reorder lands the way /next lands a close (skills/next/land.md): in a temporary worktree of origin/<default>, so
// the person's checkout (its HEAD, its edits, its untracked files) is never touched. Owner: commit the pending file,
// settle it in (the repo's settle --no-commit, then the commit it printed), push HEAD:<default>. Contributor: a branch
// nexus/reorder-<stamp>, pushed, and a pull request. Every child (git, settle, gh) runs through cloud.mjs's runClean,
// without the GIT_* variables a hook or a parent git may have set, and git runs the repo's hooks through cloud.mjs's
// safeHooks wrappers, which unset them again: git sets an absolute GIT_DIR for a hook in a linked worktree, and a gate
// that runs `git init` under it would write the person's repo.

/** A git command line as settle prints it (`git commit -q -m "plan: settle 07" -- plan/x.md`), split into its args. */
export function splitArgs(line) {
  const out = [];
  const re = /"((?:[^"\\]|\\.)*)"|(\S+)/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2]);
  return out;
}

/** The last lines of a child's output: what a refusal says. */
const tailOf = (r, n = 12) => `${r.out || ''}\n${r.err || ''}`.trim().split(/\r?\n/).slice(-n).join('\n');

export const COMMIT_TIMEOUT = 30 * 60 * 1000; // a pre-commit hook may run the repo's whole gate
const PUSH_TIMEOUT = 10 * 60 * 1000;

/**
 * Land one pending file the GUI wrote (a reorder, the improvement dial): `write(tmp, { now })` writes it into the
 * temporary worktree and answers { file, subject, what, base, prBody, prNote, done(branch, settleNote) }: `base` holds
 * the fields every answer carries, `done` the owner's note. `kind` names the branch (`nexus/<kind>-<stamp>`) and the
 * temp folder; `nothing` says what did not happen on a refusal (`nothing moved`), `again` what to do after a push
 * another landing beat (`move it again`). Returns, owner { ...base, landed: 'main', commit, settled, note },
 * contributor { ...base, landed: 'pr', branch, base, pr, url, note }; throws as landReorder does.
 */
export async function landPending(repo, { kind, write, nothing = 'nothing changed', again = 'try again' }, { owner = false, now = new Date(), run = runClean, gh = null } = {}) {
  const origin = await run('git', ['remote', 'get-url', 'origin'], { cwd: repo });
  if (!origin.ok) throw bad(`this repo has no origin remote: a plan change lands on origin, so ${nothing}`, 409);
  const branch = await defaultBranch(repo);
  const fetched = await run('git', ['fetch', '-q', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`], { cwd: repo, timeout: PUSH_TIMEOUT });
  if (!fetched.ok) throw bad(`git fetch origin ${branch} failed, ${nothing}:\n${tailOf(fetched)}`, 502);

  const { stamp } = clock(now);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `nexus-${kind}-`));
  const tmp = path.join(work, 'wt');
  const prBranch = owner ? null : `nexus/${kind}-${stamp}`;
  // The repo's hooks run through the wrappers from the first git that can fire one (worktree add: post-checkout).
  const hooks = await safeHooks(repo);
  const add = await run('git', [...hooks.args, 'worktree', 'add', '-q', ...(owner ? ['--detach'] : ['--no-track', '-b', prBranch]), tmp, `origin/${branch}`], { cwd: repo, timeout: COMMIT_TIMEOUT });
  if (!add.ok) {
    hooks.cleanup();
    await run('git', ['worktree', 'prune'], { cwd: repo });
    if (prBranch) await run('git', ['branch', '-D', '-q', prBranch], { cwd: repo });
    fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    throw bad(`could not open a worktree of origin/${branch}, ${nothing}:\n${tailOf(add)}`, 502);
  }
  try {
    const w = await write(tmp, { now });
    const git = (args, o = {}) => run('git', [...hooks.args, ...args], { cwd: tmp, ...o });
    const refused = (r, what) => (r.timedOut
      ? bad(`${what} ran past ${Math.round(COMMIT_TIMEOUT / 60000)} minutes (your repo's checks), so ${nothing}`, 504)
      : bad(`${what} was refused (a hook said no), ${nothing}:\n${tailOf(r)}`, 409));
    const base = { ok: true, ...w.base, file: w.file, mode: owner ? 'owner' : 'contributor', branch };

    const staged = await git(['add', '--', w.file]);
    if (!staged.ok) throw bad(`git add failed, ${nothing}:\n${tailOf(staged)}`, 502);
    const c = await git(['commit', '-q', '-m', w.subject], { timeout: COMMIT_TIMEOUT });
    if (!c.ok) throw refused(c, 'the commit');

    if (!owner) {
      const p = await git(['push', '-q', '-u', 'origin', prBranch], { timeout: PUSH_TIMEOUT });
      if (!p.ok) throw bad(`git push ${prBranch} was refused, ${nothing}:\n${tailOf(p)}`, 409);
      const ghRun = gh || ((args, o) => run('gh', args, o));
      const pr = await ghRun(['pr', 'create', '--base', branch, '--head', prBranch, '--title', w.subject, '--body', w.prBody], { cwd: tmp, timeout: PUSH_TIMEOUT });
      if (!pr.ok) throw bad(`${prBranch} is pushed, but gh pr create failed (open the pull request by hand):\n${tailOf(pr)}`, 502);
      const url = (/(https?:\/\/\S+\/pull\/(\d+))/.exec(pr.out || '') || [])[1] || null;
      const n = url ? Number(/\/pull\/(\d+)/.exec(url)[1]) : null;
      return { ...base, landed: 'pr', branch: prBranch, base: branch, pr: n, url, note: `Opened PR${n ? ` #${n}` : ''}: ${w.what}. ${w.prNote}` };
    }

    // Owner: settle folds the pending file in, the way /next's orient does.
    let settled = false;
    let settleNote = '';
    const settle = findKitScript(tmp, 'settle.mjs', { home: 'scripts/plan' });
    if (settle) {
      const s = await run(process.execPath, [settle, '--no-commit'], { cwd: tmp, timeout: PUSH_TIMEOUT });
      const how = /then: git (.+)$/m.exec(s.out || '');
      if (s.ok && how) {
        const sc = await git(splitArgs(how[1]), { timeout: COMMIT_TIMEOUT });
        if (!sc.ok) throw refused(sc, "settle's commit");
        settled = true;
      } else {
        await git(['reset', '-q', '--hard', 'HEAD']);
        settleNote = ` Settle could not fold it in here (${tailOf(s, 3).replace(/\s+/g, ' ')}): the pending file waits on ${branch} for the next settle.`;
      }
    } else {
      settleNote = ` This repo has no settle script: the pending file waits on ${branch} for a settle to fold it in.`;
    }
    const p = await git(['push', '-q', 'origin', `HEAD:refs/heads/${branch}`], { timeout: PUSH_TIMEOUT });
    if (!p.ok) throw bad(`the push to ${branch} was refused (another landing got there first?), ${nothing}: ${again}.\n${tailOf(p)}`, 409);
    await run('git', ['fetch', '-q', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`], { cwd: repo });
    const head = await git(['rev-parse', '--short', 'HEAD']);
    return { ...base, landed: 'main', commit: head.out.trim(), settled, note: w.done(branch, settleNote) };
  } finally {
    // Every child above was awaited to its exit (runClean answers on close, after killing a tree that ran over).
    hooks.cleanup();
    await run('git', ['worktree', 'remove', '--force', tmp], { cwd: repo });
    if (prBranch) await run('git', ['branch', '-D', '-q', prBranch], { cwd: repo });
    fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await run('git', ['worktree', 'prune'], { cwd: repo });
  }
}

/**
 * Land a reorder (POST /api/plan/reorder). body: { id, after }. owner: effective owner mode. `run` is every child
 * (git, node, gh) with runClean's signature and answer ({ ok, code, out, err, timedOut }); tests wrap it. `gh` runs gh
 * (args, opts) the same way. Returns what landed:
 *   owner        { landed: 'main', commit, settled, ... }   (settled false: the pending file waits for the next settle)
 *   contributor  { landed: 'pr', branch, pr, url, ... }
 * Throws { status, message }: 400/404 a refused move, 409 a hook's refusal or a rejected push (nothing landed), 504 a
 * hook that ran over, 502 git or gh failing.
 */
export function landReorder(repo, body = {}, opts = {}) {
  return landPending(repo, {
    kind: 'reorder',
    nothing: 'nothing moved',
    again: 'move it again',
    async write(tmp, { now }) {
      const w = await writeReorder(tmp, body, { now });
      const what = `${w.id} ${w.after ? `after ${w.after}` : `to the top of spec ${w.spec}`}`;
      return {
        file: w.file,
        what,
        subject: `plan: reorder ${what}`,
        base: { id: w.id, after: w.after, spec: w.spec, order: w.order },
        prBody: `${what}, from the nexus GUI's board. One pending file (${w.file}); the owner's settle applies it.`,
        prNote: 'The order changes once it merges and the owner settles.',
        done: (branch, settleNote) => `Reordered on ${branch}: ${what}.${settleNote} Pull to see it in this checkout.`,
      };
    },
  }, opts);
}
