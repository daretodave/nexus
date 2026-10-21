// What the GUI reads from (and the little it writes to) the adopter repo.
// Reads: git, plan/**, .claude/commands, the repo's claims and progress
// scripts. Writes: only `.owner` (untracked, excluded) and GUI prefs kept
// inside .git, never a tracked file. Plan changes go through a session.
import fs from 'node:fs';
import path from 'node:path';
import { run, json } from './sh.mjs';

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
  return {
    repo,
    isGit: top.ok,
    name: path.basename(top.ok ? top.stdout.trim() : repo),
    branch: branch.stdout.trim() || null,
    remote: remote.ok ? remote.stdout.trim() : null,
    lastCommit: head.ok ? head.stdout.trim() : null,
    owner: isOwner(repo),
    adopted: isAdopted(repo),
  };
}

export function isOwner(repo) {
  return fs.existsSync(path.join(repo, '.owner'));
}

/** A repo has adopted nexus when it carries the rule book and the plan. */
export function isAdopted(repo) {
  const agents = path.join(repo, 'agents.md');
  return fs.existsSync(agents) && fs.existsSync(path.join(repo, 'plan')) && fs.existsSync(path.join(repo, '.claude', 'commands'));
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
const DEFAULT_PREFS = { permissionMode: 'default', onboarded: false, aiSummaries: true };

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

export const CLAIMS_SCRIPTS = ['scripts/claims.mjs', 'scripts/dev/claims.mjs', 'scripts/plan/claims.mjs', 'scripts/git/claims.mjs'];
export const PROGRESS_SCRIPTS = ['scripts/progress.mjs', 'scripts/dev/progress.mjs', 'scripts/plan/progress.mjs'];

export async function claims(repo) {
  const script = findScript(repo, CLAIMS_SCRIPTS);
  if (!script) return { available: false, rows: [], note: 'No claims module in this repo yet.' };
  const r = await run('node', [script, 'list', '--json'], { cwd: repo, timeout: 30000 });
  const rows = json(r.stdout);
  if (!r.ok || !Array.isArray(rows)) return { available: true, rows: [], error: (r.stderr || r.stdout).trim().slice(0, 400) };
  return { available: true, rows, script };
}

export async function releaseClaim(repo, id) {
  if (!CHUNK_ID.test(id)) return { ok: false, error: 'bad chunk id' };
  if (!isOwner(repo)) return { ok: false, error: 'Releasing a claim needs owner mode.' };
  const script = findScript(repo, CLAIMS_SCRIPTS);
  if (!script) return { ok: false, error: 'no claims module' };
  const r = await run('node', [script, 'release', id, '--force'], { cwd: repo, timeout: 60000 });
  return { ok: r.ok, out: (r.stdout + r.stderr).trim() };
}

export async function progress(repo, spec) {
  const script = findScript(repo, PROGRESS_SCRIPTS);
  if (!script) return { available: false, text: '' };
  const args = [script];
  if (spec && /^[0-9]{1,3}$/.test(spec)) args.push(spec);
  const r = await run('node', args, { cwd: repo, timeout: 30000 });
  return { available: true, text: (r.stdout || r.stderr).replace(/\x1b\[[0-9;]*m/g, '') };
}

// --- durable questions -------------------------------------------------------
// Questions that wait in files: `[needs-user-call]` rows anywhere in plan/,
// and list items under an "Open questions" heading in a spec.

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

export function questionsIn(text, rel) {
  const out = [];
  const lines = text.split(/\r?\n/);
  let inOpen = false;
  lines.forEach((line, i) => {
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { inOpen = /\bopen questions?\b/i.test(h[2]); return; }
    const item = /^\s*[-*]\s+(?:\[ \]\s+)?(.*\S)\s*$/.exec(line);
    // a row (list item or table row) carrying the flag, not a mention of it in prose or code
    const flagged = /^\s*(?:[-*]|\d+\.|\|)\s/.test(line) && /(^|[^`])\[needs-user(?:-call)?\]/i.test(line);
    if (flagged || (inOpen && item)) {
      const body = (item ? item[1] : line).replace(/\[needs-user(?:-call)?\]\s*/i, '').trim();
      if (body && !/^\[x\]/i.test(body) && !/^(none|n\/a)\.?$/i.test(body)) out.push({ id: `${rel}:${i + 1}`, file: rel, line: i + 1, text: body.slice(0, 600), source: flagged ? 'needs-user-call' : 'open-question' });
    }
  });
  return out;
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** The prompt that applies durable answers through /oversight and lands per owner mode. */
export function answersPrompt(answers, owner) {
  const lines = answers.map((a) => `- ${a.file}:${a.line} -- "${a.text.replace(/\s+/g, ' ').slice(0, 200)}"\n  answer: ${a.answer.replace(/\s+/g, ' ')}`);
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
