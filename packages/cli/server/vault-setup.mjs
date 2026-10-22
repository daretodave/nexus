// "Set up the vault" (spec 47, A2): a repo with no secrets scripts gets them from the CLI's own copy, landed the way
// the repo lands work (agents.md rule 1). Owner: one commit, `feat: add the nexus secrets vault`, pushed to main, and
// this checkout fast-forwarded when it sits on main. Contributor: the same commit on a branch, pushed, and a pull
// request opened. Either way the commit is made in a temporary worktree off origin/main, so the person's own tree,
// index and branch are never touched; the worktree is removed only after every git child has exited. Every git call
// runs without the variables a parent git leaks (cloud.mjs gitEnv), and the worktree add, the commit and the pushes
// run the repo's hooks through cloud.mjs safeHooks' wrappers, so an old hook's gate never sees our GIT_DIR.
//
// The files: the import closure of scripts/secrets.mjs in the kit's templates/scripts (the vault, the sinks, the scan,
// the audit, the manifest's shape, owner.mjs, ledger.mjs, plan-check.mjs and what it needs). `npm run build` copies
// them into kit/secrets/ (scripts/bundle-kit.mjs) so a published CLI carries them; inside the nexus repo the
// templates are read directly. A file the repo already has is kept as it is. No value is read or written here: the
// .gitignore gains `.env` when it does not ignore it yet, so the first `set` can never be committed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gitEnv, safeHooks } from './cloud.mjs';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BUNDLED = path.join(PKG, 'kit', 'secrets');
const TEMPLATES = path.resolve(PKG, '..', '..', 'templates', 'scripts');
export const SUBJECT = 'feat: add the nexus secrets vault';
export const BRANCH = 'nexus/secrets-vault';
export const DOCS = 'https://github.com/daretodave/nexus/blob/main/customization/secrets.md';
const COMMIT_MS = 15 * 60 * 1000; // the repo's pre-commit hook may run its whole gate
const NET_MS = 3 * 60 * 1000;

/** The scripts directory the vault's files come from: the bundled copy, else the kit's templates; null when neither. */
export function vaultSource({ bundled = BUNDLED, templates = TEMPLATES } = {}) {
  for (const d of [bundled, templates]) if (fs.existsSync(path.join(d, 'secrets.mjs')) && fs.existsSync(path.join(d, 'secrets-vault.mjs'))) return d;
  return null;
}

/** The files scripts/secrets.mjs needs, relative to the scripts dir (posix), itself first: its relative imports, walked. */
export function vaultFiles(dir, entry = 'secrets.mjs') {
  const seen = [];
  const queue = [entry];
  while (queue.length) {
    const f = queue.shift();
    if (seen.includes(f)) continue;
    const abs = path.join(dir, f);
    if (!fs.existsSync(abs)) continue;
    seen.push(f);
    for (const m of fs.readFileSync(abs, 'utf8').matchAll(/(?:\bfrom|\bimport\s*\()\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])));
    }
  }
  return seen;
}

/** git in `cwd` with a clean environment; resolves once the child has exited: { ok, code, out, err }. */
export function gitIn(cwd, args, { timeout = 60000 } = {}) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, env: gitEnv(), timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (e, stdout, stderr) => {
      resolve({ ok: !e, code: e ? (typeof e.code === 'number' ? e.code : -1) : 0, out: String(stdout || '').trim(), err: String(stderr || (e && e.message) || '').trim() });
    });
  });
}

/** The default pull request opener: gh in the temporary worktree, no shell. -> { ok, out, err } */
export function ghPr(cwd, args) {
  return new Promise((resolve) => {
    execFile('gh', args, { cwd, env: gitEnv(), timeout: NET_MS, windowsHide: true }, (e, stdout, stderr) => {
      resolve({ ok: !e, out: String(stdout || '').trim(), err: String(stderr || (e && e.message) || '').trim() });
    });
  });
}

const tail = (r) => (r.err || r.out || '').split('\n').filter(Boolean).slice(-6).join('\n');

const PR_BODY = [
  'Adds the nexus secrets vault: the scripts behind `node scripts/secrets.mjs` and the GUI\'s Vault.',
  '',
  'Values live in the untracked `.env` (and the keychain, when it is on); `nexus.secrets.json` names them, never a value.',
  `How it works: ${DOCS}`,
].join('\n');

/**
 * Land the vault's scripts per owner mode.
 * @param {object} o
 * @param {string} o.repo          the served checkout (any worktree of the repo)
 * @param {boolean} o.owner        effective owner mode
 * @param {string} [o.source]      the scripts dir to copy from (default: vaultSource())
 * @param {function} [o.gh]        (cwd, args) -> { ok, out, err } (tests: a fake; never the real gh)
 * @returns {Promise<{ status, ok?, error?, landed?, already?, pr?, branch?, here?, files?, note? }>}
 */
export async function setupVault({ repo, owner, source = vaultSource(), gh = ghPr } = {}) {
  if (!source) return { status: 500, error: 'this copy of nexus carries no vault scripts to set up from' };
  const files = vaultFiles(source);
  if (!files.includes('secrets-vault.mjs')) return { status: 500, error: 'this copy of nexus carries an incomplete vault' };
  const remote = await gitIn(repo, ['remote', 'get-url', 'origin']);
  if (!remote.ok) return { status: 409, error: 'this repo has no origin remote to land the vault on' };
  const fetched = await gitIn(repo, ['fetch', '-q', 'origin', 'main'], { timeout: NET_MS });
  if (!fetched.ok) return { status: 409, error: `could not fetch origin main:\n${tail(fetched)}` };
  const ffHere = async () => {
    const br = await gitIn(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (!br.ok || br.out !== 'main') return false;
    return (await gitIn(repo, ['merge', '--ff-only', '-q', 'origin/main'])).ok;
  };
  const onMain = (await gitIn(repo, ['cat-file', '-e', 'origin/main:scripts/secrets-vault.mjs'])).ok;
  if (onMain) {
    const here = owner ? await ffHere() : false;
    return { status: 200, ok: true, already: true, landed: 'main', here, note: here ? 'The vault was on main already; this checkout has it now.' : 'The vault is on main already: pull main into this checkout.' };
  }
  if (!owner && (await gitIn(repo, ['ls-remote', '--exit-code', '--heads', 'origin', BRANCH], { timeout: NET_MS })).ok) {
    return { status: 200, ok: true, already: true, landed: 'branch', branch: BRANCH, note: `${BRANCH} is on origin already: its pull request waits for the owner.` };
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-vault-'));
  const wt = path.join(tmp, 'wt');
  let added = false;
  const hooks = await safeHooks(repo);
  const hp = hooks.args;
  try {
    const add = await gitIn(repo, [...hp, 'worktree', 'add', '-q', '--detach', wt, 'origin/main'], { timeout: NET_MS });
    if (!add.ok) return { status: 409, error: `could not make a worktree off origin/main:\n${tail(add)}` };
    added = true;
    const copied = [];
    for (const f of files) {
      const to = path.join(wt, 'scripts', ...f.split('/'));
      if (fs.existsSync(to)) continue; // the repo's own copy stays
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(source, ...f.split('/')), to);
      copied.push(`scripts/${f}`);
    }
    const paths = [...copied];
    // The vault's local ring is .env at the checkout root: ignored before anything can be set in it.
    const ignores = [];
    if ((await gitIn(wt, ['check-ignore', '-q', '.env'])).code === 1) ignores.push('.env');
    if ((await gitIn(wt, ['check-ignore', '-q', '.nexus/secrets-audit.jsonl'])).code === 1) ignores.push('.nexus/secrets-audit.jsonl', '.nexus/secrets-local.json');
    if (ignores.length) {
      const gi = path.join(wt, '.gitignore');
      const had = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
      fs.writeFileSync(gi, `${had}${had && !had.endsWith('\n') ? '\n' : ''}# The nexus secrets vault: values and their record stay on this machine\n${ignores.join('\n')}\n`);
      paths.push('.gitignore');
    }
    const staged = await gitIn(wt, ['add', '--', ...paths]);
    if (!staged.ok) return { status: 500, error: `git add failed:\n${tail(staged)}` };
    const body = `The secrets scripts (${copied.length} files) from @usenexus/cli, so the vault, \`node scripts/secrets.mjs\` and the GUI's Vault work here.${ignores.length ? ` .gitignore now ignores ${ignores.join(', ')}.` : ''} Names only; no value is in this commit.`;
    const commit = await gitIn(wt, [...hp, 'commit', '-q', '-m', SUBJECT, '-m', body], { timeout: COMMIT_MS });
    if (!commit.ok) return { status: 409, error: `the commit did not go through (the repo's commit hook may have refused it):\n${tail(commit)}` };
    if (owner) {
      const pushed = await gitIn(wt, [...hp, 'push', '-q', 'origin', 'HEAD:refs/heads/main'], { timeout: NET_MS });
      if (!pushed.ok) return { status: 409, error: `the push to main was refused (pull main and try again):\n${tail(pushed)}` };
      const here = await ffHere();
      return { status: 200, ok: true, landed: 'main', here, files: paths, note: here ? 'The vault is on main and in this checkout.' : 'The vault is on main: pull main into this checkout to use it here.' };
    }
    const pushed = await gitIn(wt, [...hp, 'push', '-q', 'origin', `HEAD:refs/heads/${BRANCH}`], { timeout: NET_MS });
    if (!pushed.ok) return { status: 409, error: `the push of ${BRANCH} was refused:\n${tail(pushed)}` };
    const pr = await gh(wt, ['pr', 'create', '--head', BRANCH, '--base', 'main', '--title', SUBJECT, '--body', PR_BODY]);
    const url = pr.ok ? ((/https?:\/\/\S+/.exec(pr.out) || [])[0] || null) : null;
    return { status: 200, ok: true, landed: 'branch', branch: BRANCH, pr: url, files: paths, note: pr.ok ? 'A pull request adds the vault; it lands when the owner merges it.' : `${BRANCH} is pushed; open its pull request on GitHub (gh said: ${tail(pr) || 'nothing'}).` };
  } finally {
    // Every git child above has exited (each call is awaited) before the worktree goes.
    if (added) await gitIn(repo, ['worktree', 'remove', '--force', wt]);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* a leftover temp folder is harmless */ }
    if (added) await gitIn(repo, ['worktree', 'prune']);
    hooks.cleanup();
  }
}
