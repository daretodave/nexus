// What the GUI reads from (and the little it writes to) the adopter repo.
// Reads: git, plan/**, .claude/commands, the repo's claims and progress
// scripts. Writes: only `.owner` (untracked, excluded) and GUI prefs kept
// inside .git, never a tracked file. Plan changes go through a session.
import fs from 'node:fs';
import path from 'node:path';
import { run, json } from './sh.mjs';
import { isOwner as effectiveOwner } from './local.mjs';
import { nextSpec } from './explode.mjs';
import { placeOf } from './place.mjs';

export const CHUNK_ID = /^[0-9]{1,3}(?:\.[0-9a-z]+)?$/;

export async function gitPath(repo, name) {
  const r = await run('git', ['rev-parse', '--git-path', name], { cwd: repo });
  return r.ok ? path.resolve(repo, r.stdout.trim()) : null;
}

export async function repoInfo(repo) {
  const [top, branch, remote, head] = await Promise.all([
    run('git', ['rev-parse', '--show-toplevel'], { cwd: repo }),
    run('git', ['branch', '--show-current'], { cwd: repo }),
    run('git', ['remote', 'get-url', 'origin'], { cwd: repo }),
    run('git', ['log', '-1', '--oneline'], { cwd: repo }),
  ]);
  // Where the folder stands (place.mjs): none | nested | refused | local | other | github, from these same calls.
  const where = placeOf({ folder: repo, top: top.ok ? top.stdout.trim() : null, origin: remote.ok ? remote.stdout.trim() : null });
  return {
    repo,
    isGit: top.ok,
    place: where.place,
    ...(where.top ? { top: where.top } : {}),
    name: path.basename(top.ok ? top.stdout.trim() : repo),
    branch: branch.stdout.trim() || null,
    remote: remote.ok ? remote.stdout.trim() : null,
    lastCommit: head.ok ? head.stdout.trim() : null,
    owner: isOwner(repo),
    adopted: isAdopted(repo),
    kit: kitLock(repo),
    nextSpec: nextSpecOf(repo),
  };
}

/** The spec a new plot would write ({ n, prefix: 'plan/48-', fresh }); fresh means the repo has no spec at all yet. */
export function nextSpecOf(repo) {
  const { n, width, signals } = nextSpec(repo);
  return { n, prefix: `plan/${String(n).padStart(width, '0')}-`, fresh: !Object.keys(signals).length };
}

/** The kit version plan/nexus.lock pins ({ version, ref }), or null with no readable lock. Names only. */
export function kitLock(repo) {
  let text;
  try { text = fs.readFileSync(path.join(repo, 'plan', 'nexus.lock'), 'utf8'); } catch { return null; }
  const field = (k) => {
    const line = text.split(/\r?\n/).find((l) => l.startsWith(`${k}:`));
    const v = line ? line.slice(k.length + 1).replace(/#.*$/, '').trim().replace(/^['"]|['"]$/g, '') : '';
    return v || null;
  };
  const version = field('version');
  const ref = field('ref');
  return version || ref ? { version, ref } : null;
}

/** Effective owner mode (server/local.mjs): `.owner` at the primary root, not switched off in .nexus/local.json. */
export function isOwner(repo) {
  return effectiveOwner(repo);
}

/** A repo has adopted nexus when it carries the rule book and the plan. */
export function isAdopted(repo) {
  const agents = path.join(repo, 'agents.md');
  return fs.existsSync(agents) && fs.existsSync(path.join(repo, 'plan')) && fs.existsSync(path.join(repo, '.claude', 'commands'));
}

/**
 * Is nexus in this repo, enough for /plot to run: adopted (as Detect reads it) or pinned by plan/nexus.lock. POST
 * /api/plot refuses a repo where it is not (spec 52, A1); the Plot step asks the same of GET /api/state's info.
 */
export function nexusIn(repo) {
  return isAdopted(repo) || !!kitLock(repo);
}

/** Owner mode on: write `.owner` and keep it out of git via info/exclude. */
export async function setOwner(repo, on) {
  const file = path.join(repo, '.owner');
  if (!on) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return false;
  }
  fs.writeFileSync(file, 'owner: push to main and settle (set from the nexus GUI)\n');
  const exclude = await gitPath(repo, 'info/exclude');
  if (exclude) {
    const cur = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8') : '';
    if (!/^\/?\.owner$/m.test(cur)) {
      fs.mkdirSync(path.dirname(exclude), { recursive: true });
      fs.appendFileSync(exclude, `${cur && !cur.endsWith('\n') ? '\n' : ''}.owner\n`);
    }
  }
  return true;
}

// Run mode lives in .nexus/local.json (server/local.mjs, /api/local), not here: a run mode an older GUI kept in
// these prefs (agents, workflows) moves there once at server start, and forgetPrefs drops it.
// AI one-liners for undescribed chunks (server/summaries.mjs) are on until Settings turns them off.
// model / effort: '' is Claude Code's default (spec 54); lastModel: what the default resolved to on the last session.
const DEFAULT_PREFS = { permissionMode: 'default', onboarded: false, aiSummaries: true, model: '', effort: '', lastModel: '' };

export async function readPrefs(repo) {
  const file = await gitPath(repo, 'nexus-gui.json');
  const saved = file && fs.existsSync(file) ? json(fs.readFileSync(file, 'utf8')) : null;
  return { ...DEFAULT_PREFS, ...(saved || {}) };
}

export async function writePrefs(repo, patch) {
  const next = { ...(await readPrefs(repo)) };
  for (const k of Object.keys(DEFAULT_PREFS)) if (k in patch && typeof patch[k] === typeof DEFAULT_PREFS[k]) next[k] = patch[k];
  const file = await gitPath(repo, 'nexus-gui.json');
  if (file) fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

/** Drop keys from the saved prefs (a setting that moved elsewhere). Returns the prefs as read after. */
export async function forgetPrefs(repo, keys) {
  const file = await gitPath(repo, 'nexus-gui.json');
  const saved = file && fs.existsSync(file) ? json(fs.readFileSync(file, 'utf8')) : null;
  if (saved && keys.some((k) => k in saved)) {
    for (const k of keys) delete saved[k];
    fs.writeFileSync(file, `${JSON.stringify(saved, null, 2)}\n`);
  }
  return readPrefs(repo);
}

const BUILTIN = [
  { name: 'explode', hint: 'dump messy thoughts; runs /messy' },
];

/** Slash commands the session will know: the repo's .claude/commands plus GUI aliases. */
export function listCommands(repo) {
  const dir = path.join(repo, '.claude', 'commands');
  const out = [];
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      const desc = /^description:\s*(.+)$/m.exec(text);
      out.push({ name: f.slice(0, -3), hint: desc ? desc[1].trim().replace(/^["']|["']$/g, '') : '' });
    }
  }
  for (const b of BUILTIN) if (!out.some((c) => c.name === b.name)) out.push(b);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** First existing script among candidates, relative to the repo. */
export function findScript(repo, names) {
  for (const n of names) if (fs.existsSync(path.join(repo, n))) return n;
  return null;
}

// One list of where a kit script may live: scripts/, then scripts/dev/, scripts/plan/ and scripts/git/ (a repo that
// keeps its own scripts at scripts/ moves the kit's under a folder). `home`, a kit script's own folder in the kit
// (order.mjs and settle.mjs live in scripts/plan/), is looked at first. Every kit script lookup goes through it.
export const KIT_DIRS = Object.freeze(['scripts', 'scripts/dev', 'scripts/plan', 'scripts/git']);

/** Where kit script `name` may live, in the order looked at: ['scripts/<name>', 'scripts/dev/<name>', ...]. */
export function kitScripts(name, { home = null } = {}) {
  const dirs = home ? [home, ...KIT_DIRS.filter((d) => d !== home)] : KIT_DIRS;
  return dirs.map((d) => `${d}/${name}`);
}

/** The first of kitScripts(name) the repo has, relative to it, or null. */
export const findKitScript = (repo, name, opts) => findScript(repo, kitScripts(name, opts));

export const CLAIMS_SCRIPTS = kitScripts('claims.mjs');
export const PROGRESS_SCRIPTS = kitScripts('progress.mjs');
export const ANNOUNCE_SCRIPTS = kitScripts('announce.mjs');

// The claims list and its writes: server/claims.mjs (the repo's claims CLI as the acting session).

export async function progress(repo, spec) {
  const script = findScript(repo, PROGRESS_SCRIPTS);
  if (!script) return { available: false, text: '' };
  const args = [script];
  if (spec && /^[0-9]{1,3}$/.test(spec)) args.push(spec);
  const r = await run('node', args, { cwd: repo, timeout: 30000 });
  return { available: true, text: (r.stdout || r.stderr).replace(/\x1b\[[0-9;]*m/g, '') };
}

// --- durable questions -------------------------------------------------------
// Questions that wait in files (spec 47, A7): `[needs-user-call]` rows anywhere
// in plan/, and list items under an "Open questions" heading in a spec file
// (plan/NN-*.md, plan/specs/NN-*.md; concepts/plan-shape.md). An item is read
// whole (its wrapped and indented lines join it); a settled one is skipped.
// Each: { id, file, line, text (markdown kept), source: 'plan'|'needs-user-call', spec?: { n, title } }.

export function durableQuestions(repo) {
  const root = path.join(repo, 'plan');
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const file of walk(root)) {
    if (!file.endsWith('.md')) continue;
    const rel = path.relative(repo, file).split(path.sep).join('/');
    if (rel.startsWith('plan/messy/')) continue;
    out.push(...questionsIn(fs.readFileSync(file, 'utf8'), rel));
  }
  return out;
}

/** A spec file's number, from its path (plan/47-x.md, plan/specs/07-y.md), or null. */
export function specNumber(rel) {
  const m = /^plan\/(?:specs\/)?(\d{1,3})-[^/]+\.md$/.exec(rel || '');
  return m ? m[1] : null;
}

/** An item that is not a question any more: settled, struck, checked, or "None". */
export function settledItem(body) {
  const t = String(body || '').trim();
  if (/^\[x\]/i.test(t) || t.startsWith('~~')) return true;
  const bare = t.replace(/[*_]/g, '').trimStart();
  return /^(settled|decided|answered|resolved|done)\b/i.test(bare) || /^\(none/i.test(bare) || /^none\./i.test(bare) || /^(none|n\/a)\.?$/i.test(bare);
}

const ITEM = /^(\s*)(?:[-*+]|\d{1,9}[.)])\s+(?:\[ \]\s+)?(.*\S)\s*$/;
const FLAG = /(^|[^`])\[needs-user(?:-call)?\]/i;

export function questionsIn(text, rel) {
  const out = [];
  const lines = String(text || '').split(/\r?\n/);
  const n = specNumber(rel);
  const h1 = lines.find((l) => /^#\s+\S/.test(l));
  const spec = n ? { n, title: h1 ? h1.replace(/^#\s+/, '').replace(/^(?:spec\s+)?\d+(?:\s*[-:.\u2014\u2013\u00b7|]+)?\s+/i, '').trim() : '' } : null;
  let inOpen = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const start = i + 1;
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { inOpen = !!spec && /\bopen questions?\b/i.test(h[2]); continue; }
    const item = ITEM.exec(line);
    // a row (list item or table row) carrying the flag, not a mention of it in prose or code
    const flagged = /^\s*(?:[-*+]|\d+\.|\|)\s/.test(line) && FLAG.test(line);
    if (!flagged && !(inOpen && item)) continue;
    let body = item ? item[2] : line.trim();
    if (item) {
      // the item whole: following lines that are indented past its marker, or wrap it (not a new item, heading or blank)
      const indent = item[1].length;
      let j = i + 1;
      for (; j < lines.length; j += 1) {
        const next = lines[j];
        if (!next.trim() || /^#{1,6}\s/.test(next) || /^\s*```/.test(next)) break;
        const nextIndent = /^\s*/.exec(next)[0].length;
        const isItem = ITEM.test(next);
        if (isItem && nextIndent <= indent) break;
        if (!isItem && nextIndent <= indent && /^\s*\|/.test(next)) break;
        body += isItem ? `\n${next.slice(indent)}` : ` ${next.trim()}`;
      }
      i = j - 1;
    }
    body = body.replace(/\[needs-user(?:-call)?\]\s*/i, '').trim();
    if (!body || settledItem(body)) continue;
    out.push({ id: `${rel}:${start}`, file: rel, line: start, text: body.slice(0, 2000), source: flagged ? 'needs-user-call' : 'plan', ...(spec ? { spec } : {}) });
  }
  return out;
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

/**
 * The prompt that carries plan answers. To the session that asked (`resume`, spec 53): one message with every answer,
 * applied where each question lives, then that session continues where it left off (and lands as its own run would).
 * Otherwise (a new session, the home session): through /oversight, landing per owner mode.
 */
export function answersPrompt(answers, owner, { resume = false } = {}) {
  const lines = answers.map((a) => `- ${a.file}:${a.line} -- "${a.text.replace(/\s+/g, ' ').slice(0, 200)}"\n  answer: ${a.answer.replace(/\s+/g, ' ')}`);
  if (resume) {
    const n = answers.length;
    return [
      `Your open questions are answered (${n} ${n === 1 ? 'answer' : 'answers'}, from the nexus GUI). Do not ask again; the person already answered.`,
      'Apply these answers where each question lives (resolve the open question or the [needs-user-call] row), then continue where you left off.',
      '',
      ...lines,
    ].join('\n');
  }
  const landing = owner
    ? 'This checkout is in owner mode: gate, commit, and push to main.'
    : 'This checkout is in contributor mode: gate, commit on a new branch next/oversight-<date>, push it, and open a pull request with gh. Never push main.';
  return [
    '/oversight apply these answers from the nexus GUI. Do not ask again; the person already answered.',
    'For each row: record the answer where the question lives (resolve the [needs-user-call] row or the open question), and act on it as /oversight would.',
    landing,
    '',
    ...lines,
  ].join('\n');
}
