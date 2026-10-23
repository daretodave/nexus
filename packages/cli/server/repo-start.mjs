// A folder that is not a repo yet (onboarding Detect, Cloud setup step 0): read where it stands, and make it a repo
// one step per click, under the person's own identity. Every step is its own POST, needs `confirm: true` (only a
// button sets it), looks at the state first (a step already done answers `already: true` and writes nothing), and
// runs one at a time.
//
//   GET  /api/repo/start[?fresh=1][&owner=O&name=N&visibility=private|public]   the read only (cached 30 s)
//   POST /api/repo/init      { confirm, identity?: 'gh' }    git init -b main, a .gitignore that keeps .env and .nexus/ out
//   POST /api/repo/identity  { confirm }                     repo-level user.name/email from the gh account
//   POST /api/repo/commit    { confirm, leaveOut?: [path] }  the first commit
//   POST /api/repo/remote    { confirm, owner, name, visibility }   gh repo create O/N --private --source . --remote origin
//   POST /api/repo/push      { confirm }                     git push -u origin <branch>
//
// Never here, on purpose: `git config --global`, `gh auth setup-git`, installing git or gh. Those change the machine
// for every repo, so they stay copyable guidance (`guide`).
//
// git runs without a shell (execFile: spaces in names and messages are fine), with GIT_TERMINAL_PROMPT=0 and
// GCM_INTERACTIVE=never so a credential helper never holds the server on a prompt. gh runs through sh.mjs's run()
// (its Windows path refuses anything outside SAFE_ARG, so every gh argument here is validated to that set first).
// Both are seams ({ run, git }), so tests inject fakes.
import fs from 'node:fs';
import path from 'node:path';
import { run as shRun, json, SAFE_ARG } from './sh.mjs';
import { gitRun, placeOf } from './place.mjs';

export { gitRun };

export const BRANCH = 'main';
export const BIG_MB = 100; // GitHub refuses a file over 100 MB
export const WARN_MB = 50; // and warns over 50 MB
const WALK_CAP = 20000;
const STATUS_CAP = 50000;
const CACHE_MS = 30000;

export const OWNER_RE = /^[A-Za-z0-9-]{1,39}$/;
export const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;

/** The .gitignore a folder with none gets. */
export const GITIGNORE = [
  '# Started by nexus. Keep secrets and this machine\'s nexus files out of git.',
  '.env',
  '.env.*',
  '!.env.example',
  '.nexus/',
  '.owner',
  'node_modules/',
  '.DS_Store',
  'Thumbs.db',
  '*.log',
  '',
].join('\n');

/** What an existing .gitignore must carry, each with a path that shows whether it is already ignored. */
const REQUIRED = [
  ['.env', '.env'],
  ['.env.*', '.env.local'],
  ['!.env.example', null],
  ['.nexus/', '.nexus/server.json'],
  ['.owner', '.owner'],
];

/** Files that look private: left out of the first commit unless the person unticks them. */
const PRIVATE = [
  [/(^|\/)\.env$/, 'an env file'],
  [/(^|\/)\.env\.(?!example$)[^/]+$/, 'an env file'],
  [/\.(pem|key|p12|pfx)$/i, 'a key or certificate'],
  [/(^|\/)id_(rsa|ed25519|ecdsa)$/, 'an ssh key'],
  [/(^|\/)credentials(\.json)?$/i, 'credentials'],
  [/(^|\/)\.(npmrc|pypirc)$/, 'can hold a registry token'],
  [/(^|\/)secrets?\.(json|ya?ml|toml)$/i, 'named for secrets'],
];

/** Why a path looks private, or null. */
export function privateWhy(rel) {
  const p = String(rel || '').replace(/\\/g, '/');
  for (const [re, why] of PRIVATE) if (re.test(p)) return why;
  return null;
}

/** The folder's name made safe for a GitHub repo name. */
export function slugOf(name) {
  const s = String(name || '').trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9._-]/g, '').replace(/^[.]+/, '').slice(0, 100);
  return s && s !== '.' && s !== '..' ? s : 'my-project';
}

const NO_PROMPT = { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };
const tail = (s, n = 400) => String(s || '').trim().slice(-n);

// ---- guidance: exact commands, built here per platform, never put together by the page ---------------------------

const q = (s) => `"${String(s).replace(/"/g, '')}"`;

/** The commands for each reason, per platform. ctx: { platform, folder, top, owner, name, ghName, slug, url }. */
export function guideFor(why, ctx = {}) {
  const win = ctx.platform === 'win32';
  const mac = ctx.platform === 'darwin';
  const owner = ctx.owner || 'you';
  const name = ctx.name || ctx.slug || 'my-project';
  const https = `https://github.com/${owner}/${name}.git`;
  switch (why) {
    case 'git-missing': return [win ? 'winget install --id Git.Git -e' : mac ? 'xcode-select --install' : 'sudo apt install git'];
    case 'no-identity': return [`git config --global user.name ${q(ctx.ghName || 'Your Name')}`, 'git config --global user.email "you@example.com"'];
    case 'gh-missing': return [...(win ? ['winget install --id GitHub.cli -e'] : mac ? ['brew install gh'] : []), 'gh auth login'];
    case 'gh-signed-out': return ['gh auth login'];
    case 'nested': return [`npx @usenexus/cli --repo ${q(ctx.top || '..')}`];
    case 'refused': return win ? [`mkdir ${ctx.slug || 'my-project'}; cd ${ctx.slug || 'my-project'}; npx @usenexus/cli`] : [`mkdir ${ctx.slug || 'my-project'} && cd ${ctx.slug || 'my-project'} && npx @usenexus/cli`];
    case 'other-remote': return [];
    case 'exists': return [`git remote add origin ${https}`, `git push -u origin ${ctx.branch || BRANCH}`];
    case 'push-auth': return ['gh auth setup-git'];
    case 'push-ssh': return ['gh config set git_protocol https', `git remote set-url origin ${https}`];
    case 'push-rejected': return [`git pull --rebase origin ${ctx.branch || BRANCH}`, `git push -u origin ${ctx.branch || BRANCH}`];
    case 'dubious': return [`git config --global --add safe.directory ${q(ctx.folder || '.')}`];
    case 'workflow-scope': return ['gh auth refresh -s workflow'];
    default: return [];
  }
}

/** "Do it in a terminal instead": the whole sequence for this folder. */
export function manualFor(ctx = {}) {
  const win = ctx.platform === 'win32';
  const owner = ctx.owner || 'you';
  const name = ctx.name || ctx.slug || 'my-project';
  return [
    `git init -b ${BRANCH}`,
    win
      ? 'Add-Content .gitignore ".env", ".env.*", "!.env.example", ".nexus/", "node_modules/"'
      : 'printf ".env\\n.env.*\\n!.env.example\\n.nexus/\\nnode_modules/\\n" >> .gitignore',
    'git add -A',
    'git commit -m "first commit"',
    `gh repo create ${owner}/${name} --${ctx.visibility === 'public' ? 'public' : 'private'} --source . --remote origin --push`,
  ];
}

// ---- reads ---------------------------------------------------------------------------------------------------------

/** gh auth status's "Token scopes: 'repo', 'workflow'" line, as a list. */
export function parseScopes(text) {
  const m = /Token scopes:\s*(.*)/i.exec(String(text || ''));
  if (!m) return [];
  return m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter((s) => s && s !== 'none');
}

async function ghProbe(cwd, run) {
  const out = { installed: true, signedIn: false, login: null, name: null, id: null, orgs: [], scopes: [], protocol: 'https' };
  const auth = await run('gh', ['auth', 'status'], { cwd, timeout: 15000 });
  if (auth.missing) return { ...out, installed: false };
  const text = `${auth.stdout || ''}\n${auth.stderr || ''}`;
  out.scopes = parseScopes(text);
  if (!auth.ok) return out;
  out.signedIn = true;
  const [user, orgs, proto] = await Promise.all([
    run('gh', ['api', 'user'], { cwd, timeout: 15000 }),
    run('gh', ['api', 'user/orgs'], { cwd, timeout: 15000 }),
    run('gh', ['config', 'get', 'git_protocol'], { cwd, timeout: 10000 }),
  ]);
  const u = user.ok ? json(user.stdout) || {} : {};
  out.login = typeof u.login === 'string' ? u.login : (/account\s+(\S+)/.exec(text)?.[1] || null);
  out.name = typeof u.name === 'string' && u.name.trim() ? u.name.trim() : null;
  out.id = Number.isFinite(u.id) ? u.id : null;
  const o = orgs.ok ? json(orgs.stdout) : null;
  out.orgs = Array.isArray(o) ? o.map((x) => x?.login).filter((l) => typeof l === 'string' && OWNER_RE.test(l)) : [];
  if (proto.ok && /ssh/i.test(proto.stdout)) out.protocol = 'ssh';
  return out;
}

async function identityOf(folder, git) {
  const [n, e] = await Promise.all([
    git(folder, ['config', '--show-origin', '--get', 'user.name']),
    git(folder, ['config', '--show-origin', '--get', 'user.email']),
  ]);
  const val = (r) => (r.ok ? r.out.split('\t').slice(1).join('\t').trim() : '');
  const from = (r) => (r.ok ? (/[\\/]\.git[\\/]config\b|^file:\.git\/config/i.test(r.out.split('\t')[0]) ? 'local' : 'global') : null);
  const name = val(n);
  const email = val(e);
  return name && email ? { user: { name, email }, from: from(n) === 'local' || from(e) === 'local' ? 'local' : 'global' } : { user: null, from: null };
}

/** Count files before init, without git: skips .git, node_modules and .nexus, stops at WALK_CAP. */
export function countFiles(dir, cap = WALK_CAP) {
  let n = 0;
  const stack = [dir];
  while (stack.length && n < cap) {
    const d = stack.pop();
    let list;
    try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of list) {
      if (e.isDirectory()) { if (!['.git', 'node_modules', '.nexus'].includes(e.name)) stack.push(path.join(d, e.name)); } else n += 1;
      if (n >= cap) break;
    }
  }
  return { files: n, capped: n >= cap };
}

/** What a first commit would take: { files, ignoredTop, flagged, large }, from git status (after init). */
async function commitPreview(folder, git) {
  const st = await git(folder, ['status', '--porcelain=v1', '-uall', '-z'], { timeout: 60000 });
  const paths = [];
  if (st.ok) {
    for (const e of st.out.split('\0')) {
      if (!e || e.length < 4) continue;
      paths.push(e.slice(3));
      if (paths.length >= STATUS_CAP) break;
    }
  }
  const flagged = [];
  const large = [];
  for (const p of paths) {
    const why = privateWhy(p);
    if (why) flagged.push({ path: p, why });
    try {
      const size = fs.statSync(path.join(folder, p)).size;
      const mb = size / (1024 * 1024);
      if (mb > WARN_MB) large.push({ path: p, mb: Math.round(mb), blocks: mb > BIG_MB });
    } catch { /* gone since the status */ }
  }
  const tops = ['node_modules', '.env', '.nexus'].filter((t) => fs.existsSync(path.join(folder, t)));
  const ig = tops.length ? await git(folder, ['check-ignore', '--', ...tops]) : { out: '' };
  const ignored = new Set(String(ig.out || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
  const ignoredTop = tops.filter((t) => ignored.has(t)).map((t) => (t === '.env' ? t : `${t}/`));
  return { files: paths.length, capped: paths.length >= STATUS_CAP, ignoredTop, flagged, large };
}

async function gitignoreState(folder, git, isRepo) {
  const file = path.join(folder, '.gitignore');
  const exists = fs.existsSync(file);
  if (!exists) return { exists, missing: REQUIRED.map(([l]) => l) };
  const text = fs.readFileSync(file, 'utf8');
  const lines = new Set(text.split(/\r?\n/).map((l) => l.trim()));
  const missing = [];
  for (const [line, probe] of REQUIRED) {
    if (lines.has(line)) continue;
    if (probe && isRepo && (await git(folder, ['check-ignore', '-q', '--no-index', probe])).ok) continue;
    if (!probe && !missing.includes('.env.*')) continue; // the negation only rides along with .env.*
    missing.push(line);
  }
  return { exists, missing };
}

/**
 * GET /api/repo/start: where the folder stands and what comes next. No writes. opts: { run, git, home, platform,
 * owner, name, visibility, env }.
 */
export async function probe(folder, { run = shRun, git = gitRun, home, platform = process.platform, env, owner: wantOwner, name: wantName, visibility = 'private' } = {}) {
  const ver = await git(folder, ['--version']);
  const gitInfo = { installed: !ver.missing && ver.ok, version: ver.ok ? (/(\d+\.\d+(?:\.\d+)?)/.exec(ver.out)?.[1] || null) : null, user: null, from: null };
  const base = path.basename(path.resolve(folder));
  const slug = slugOf(base);
  const ctxBase = { platform, folder, slug };
  if (!gitInfo.installed) {
    return { place: 'none', next: 'blocked', why: 'git-missing', platform, folder: { path: folder, name: base, slug }, git: gitInfo, gh: null, repo: null, guide: { 'git-missing': guideFor('git-missing', ctxBase) }, manual: [] };
  }
  const top = await git(folder, ['rev-parse', '--show-toplevel']);
  const dubious = !top.ok && /dubious ownership/i.test(top.err);
  const origin = top.ok ? await git(folder, ['remote', 'get-url', 'origin']) : { ok: false };
  const where = placeOf({ folder, top: top.ok ? top.out.trim() : null, origin: origin.ok ? origin.out.trim() : null, home, platform, env });
  const [ident, gh] = await Promise.all([identityOf(folder, git), ghProbe(folder, run)]);
  Object.assign(gitInfo, ident);
  const isRepo = top.ok && where.place !== 'nested';
  const remote = where.remote || null;
  const [branchR, countR] = isRepo ? await Promise.all([git(folder, ['branch', '--show-current']), git(folder, ['rev-list', '--count', 'HEAD'])]) : [{ ok: false }, { ok: false }];
  const branch = branchR.ok && branchR.out.trim() ? branchR.out.trim() : (isRepo ? BRANCH : null);
  const commits = countR.ok ? Number(countR.out.trim()) || 0 : 0;
  const head = commits ? (await git(folder, ['rev-parse', '--short', 'HEAD'])).out.trim() : null;
  let pushed = null;
  let place = where.place;
  if (place === 'github') {
    const ls = await git(folder, ['ls-remote', '--heads', 'origin'], { timeout: 20000, env: NO_PROMPT });
    pushed = ls.ok ? !!ls.out.trim() : null;
    if (pushed === false) place = 'unpushed';
  }
  const owner = wantOwner && OWNER_RE.test(wantOwner) ? wantOwner : (remote?.owner || gh.login || null);
  const name = wantName && NAME_RE.test(wantName) && wantName !== '.' && wantName !== '..' ? wantName : (remote?.name || slug);
  const vis = visibility === 'public' ? 'public' : 'private';
  const ctx = { ...ctxBase, top: where.top, owner, name, ghName: gh.name || gh.login, branch: branch || BRANCH, visibility: vis };

  let next;
  let why;
  if (dubious) { next = 'blocked'; why = 'dubious'; place = 'none'; }
  else if (place === 'nested') { next = 'blocked'; why = 'nested'; }
  else if (place === 'refused') { next = 'blocked'; why = 'refused'; }
  else if (place === 'other') { next = 'blocked'; why = 'other-remote'; }
  else if (place === 'none') next = 'init';
  else if (!commits) { next = 'commit'; if (!gitInfo.user) why = 'no-identity'; }
  else if (place === 'local') { next = 'remote'; if (!gh.installed) why = 'gh-missing'; else if (!gh.signedIn) why = 'gh-signed-out'; }
  else if (place === 'unpushed') next = 'push';
  else next = 'done';
  // No git identity matters before the first commit even when init is next: say it early.
  if (!why && !gitInfo.user && (next === 'init' || next === 'commit')) why = 'no-identity';

  const out = {
    place,
    next,
    ...(why ? { why } : {}),
    platform,
    folder: { path: folder, name: base, slug, ...(where.top ? { top: where.top } : {}), ...(where.refusedAs ? { refusedAs: where.refusedAs } : {}) },
    git: gitInfo,
    gh,
    repo: { branch, commits, head, remote, pushed },
    gitignore: await gitignoreState(folder, git, isRepo),
    plan: {
      init: ['git', 'init', '-b', BRANCH],
      remote: ['gh', 'repo', 'create', `${owner || '<owner>'}/${name}`, `--${vis}`, '--source', '.', '--remote', 'origin'],
      push: ['git', 'push', '-u', 'origin', branch || BRANCH],
    },
    guide: {},
    manual: manualFor(ctx),
  };
  for (const w of ['git-missing', 'no-identity', 'gh-missing', 'gh-signed-out', 'nested', 'refused', 'dubious', 'other-remote']) {
    if (w === why || (w === 'no-identity' && !gitInfo.user) || (w === 'gh-missing' && !gh.installed) || (w === 'gh-signed-out' && gh.installed && !gh.signedIn)) out.guide[w] = guideFor(w, ctx);
  }
  if (gh.signedIn && !gh.scopes.includes('workflow') && gh.scopes.length) out.guide['workflow-scope'] = guideFor('workflow-scope', ctx);
  if (place === 'none' && !dubious) {
    const c = countFiles(folder);
    out.preview = { files: c.files, capped: c.capped, ignoredTop: [], flagged: [], large: [] };
  } else if (isRepo && !commits) {
    out.preview = await commitPreview(folder, git);
  }
  if (wantOwner && wantName && gh.signedIn && OWNER_RE.test(owner || '') && NAME_RE.test(name)) {
    out.nameFree = await nameFree(folder, run, owner, name);
    if (out.nameFree === false) out.guide.exists = guideFor('exists', ctx);
  }
  return out;
}

/** Is github.com/O/N free? true | false (taken) | null (gh could not say). */
async function nameFree(cwd, run, owner, name) {
  const r = await run('gh', ['api', `repos/${owner}/${name}`], { cwd, timeout: 15000 });
  if (r.ok) return false;
  return /404|Not Found/i.test(`${r.stdout}\n${r.stderr}`) ? true : null;
}

// ---- writes --------------------------------------------------------------------------------------------------------

const fail = (status, error, extra = {}) => ({ status, error, ...extra });

/** Write the starting .gitignore, or append only the lines an existing one is missing. */
async function ensureGitignore(folder, git) {
  const file = path.join(folder, '.gitignore');
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, GITIGNORE);
    return { wrote: true, lines: GITIGNORE.trim().split('\n').filter((l) => l && !l.startsWith('#')).length };
  }
  const st = await gitignoreState(folder, git, true);
  if (!st.missing.length) return { kept: true, lines: 0 };
  const cur = fs.readFileSync(file, 'utf8');
  const add = `${cur && !cur.endsWith('\n') ? '\n' : ''}# Added by nexus: keep secrets and this machine's nexus files out of git.\n${st.missing.join('\n')}\n`;
  fs.appendFileSync(file, add);
  return { appended: true, lines: st.missing.length, added: st.missing };
}

async function ghIdentity(folder, gh, git) {
  const name = gh.name || gh.login;
  const email = gh.id && gh.login ? `${gh.id}+${gh.login}@users.noreply.github.com` : `${gh.login}@users.noreply.github.com`;
  const a = await git(folder, ['config', 'user.name', name]);
  const b = await git(folder, ['config', 'user.email', email]);
  if (!a.ok || !b.ok) return null;
  return { name, email, scope: 'repo' };
}

export async function initRepo(folder, body = {}, deps = {}) {
  const { run = shRun, git = gitRun } = deps;
  const p = await probe(folder, deps);
  if (p.why === 'git-missing') return fail(409, 'git is not installed, and nexus needs it.', { why: 'git-missing', guide: p.guide['git-missing'] });
  if (p.why === 'dubious') return fail(409, refusal(p), { why: p.why, guide: p.guide[p.why] || [] });
  if (p.place !== 'none') {
    if (['local', 'github', 'unpushed', 'other'].includes(p.place)) return { status: 200, already: true, branch: p.repo?.branch || BRANCH, start: p };
    return fail(409, refusal(p), { why: p.why, guide: p.guide[p.why] || [] });
  }
  if (fs.existsSync(path.join(folder, '.git'))) return fail(409, 'This folder has a .git that git cannot read. nexus leaves it alone.');
  let r = await git(folder, ['init', '-q', '-b', BRANCH]);
  if (!r.ok && /unknown switch|unknown option|usage:/i.test(r.err)) {
    r = await git(folder, ['init', '-q']);
    if (r.ok) await git(folder, ['symbolic-ref', 'HEAD', `refs/heads/${BRANCH}`]);
  }
  if (!r.ok) return fail(502, `git init did not work: ${tail(r.err, 300)}`);
  const gitignore = await ensureGitignore(folder, git);
  let identity = null;
  if (body.identity === 'gh' && !p.git.user && p.gh?.signedIn && p.gh.login) identity = await ghIdentity(folder, p.gh, git);
  const start = await probe(folder, { ...deps, run });
  return { status: 200, ok: true, branch: BRANCH, gitignore, ...(identity ? { identity } : {}), start };
}

function refusal(p) {
  switch (p.why) {
    case 'nested': return `This folder is inside the repo at ${p.folder?.top}. nexus works at a repo's root, so it will not start another repo here.`;
    case 'refused': return p.folder?.refusedAs === 'home' ? 'This is your home folder. Make a folder for the project and start nexus there.' : p.folder?.refusedAs === 'root' ? 'This is the root of a drive. Make a folder for the project and start nexus there.' : 'This is a system folder. Make a folder for the project and start nexus there.';
    case 'dubious': return 'git refuses this folder: it belongs to another user.';
    case 'other-remote': return `origin is on ${p.repo?.remote?.host || 'another host'}.`;
    default: return 'Not a step for this folder now.';
  }
}

export async function setIdentity(folder, deps = {}) {
  const { git = gitRun } = deps;
  const p = await probe(folder, deps);
  if (p.place === 'none' || p.place === 'nested' || p.place === 'refused') return fail(409, 'Start the repo first: the name and email go in its own config.');
  if (p.git.user) return { status: 200, already: true, identity: { ...p.git.user, scope: p.git.from === 'local' ? 'repo' : 'global' }, start: p };
  if (!p.gh?.signedIn || !p.gh.login) return fail(409, 'gh is not signed in, so there is no GitHub name to use.', { why: 'gh-signed-out', guide: guideFor('gh-signed-out', p) });
  const identity = await ghIdentity(folder, p.gh, git);
  if (!identity) return fail(502, 'git did not take the name and email.');
  return { status: 200, ok: true, identity, start: await probe(folder, deps) };
}

export async function firstCommit(folder, body = {}, deps = {}) {
  const { git = gitRun } = deps;
  const p = await probe(folder, deps);
  if (p.place === 'none' || p.place === 'nested' || p.place === 'refused') return fail(409, 'This folder is not a repo at this root yet: start the repo first.');
  if (p.repo?.commits) return { status: 200, already: true, head: p.repo.head, start: p };
  if (!p.git.user) return fail(409, 'git does not know who you are yet, so it cannot sign the commit.', { why: 'no-identity', guide: p.guide['no-identity'] || guideFor('no-identity', p) });
  const st = p.preview || { flagged: [], large: [] };
  const flaggedPaths = new Set(st.flagged.map((f) => f.path));
  const leaveOut = Array.isArray(body.leaveOut) ? body.leaveOut.map(String) : st.flagged.map((f) => f.path);
  const bad = leaveOut.filter((x) => !flaggedPaths.has(x));
  if (bad.length) return fail(400, `leaveOut takes only the files nexus flagged: ${bad.slice(0, 3).join(', ')}`);
  const blocks = (st.large || []).filter((f) => f.blocks && !leaveOut.includes(f.path));
  if (blocks.length) return fail(409, `GitHub refuses files over ${BIG_MB} MB: ${blocks.map((f) => `${f.path} (${f.mb} MB)`).join(', ')}. Move them out or ignore them, then check again.`, { why: 'large', large: blocks });
  if (leaveOut.length) {
    const file = path.join(folder, '.gitignore');
    const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const lines = leaveOut.map((x) => `/${x.replace(/\\/g, '/').replace(/^\/+/, '')}`);
    fs.appendFileSync(file, `${cur && !cur.endsWith('\n') ? '\n' : ''}# Left out of the first commit (they look private).\n${lines.join('\n')}\n`);
  }
  const add = await git(folder, ['add', '-A'], { timeout: 120000 });
  if (!add.ok) return fail(502, `git add did not work: ${tail(add.err, 300)}`);
  const c = await git(folder, ['commit', '-q', '-m', 'first commit'], { timeout: 120000, env: NO_PROMPT });
  if (!c.ok) return fail(502, `git commit did not work: ${tail(c.err, 300)}`);
  const head = (await git(folder, ['rev-parse', '--short', 'HEAD'])).out.trim();
  const files = Number((await git(folder, ['ls-files', '-z'])).out.split('\0').filter(Boolean).length) || 0;
  return { status: 200, ok: true, head, files, leftOut: leaveOut, start: await probe(folder, deps) };
}

/** The gh args for "Put it on GitHub", validated so every one passes SAFE_ARG. null when any is off. */
export function remoteArgs({ owner, name, visibility }) {
  if (!OWNER_RE.test(String(owner || '')) || !NAME_RE.test(String(name || '')) || name === '.' || name === '..') return null;
  if (visibility !== 'private' && visibility !== 'public') return null;
  const args = ['repo', 'create', `${owner}/${name}`, `--${visibility}`, '--source', '.', '--remote', 'origin'];
  return args.every((a) => SAFE_ARG.test(a)) ? args : null;
}

export async function createRemote(folder, body = {}, deps = {}) {
  const { run = shRun, git = gitRun } = deps;
  const visibility = body.visibility === 'public' ? 'public' : body.visibility === 'private' || body.visibility == null ? 'private' : null;
  const args = remoteArgs({ owner: body.owner, name: body.name, visibility });
  if (!args) return fail(400, 'owner, name and visibility (private or public) are needed, in GitHub\'s own characters.');
  const p = await probe(folder, deps);
  if (!p.repo?.commits) return fail(409, 'Make the first commit before putting it on GitHub.');
  if (!p.gh?.installed) return fail(409, 'Putting it on GitHub needs gh, the GitHub CLI.', { why: 'gh-missing', guide: guideFor('gh-missing', p) });
  if (!p.gh.signedIn) return fail(409, 'gh is not signed in.', { why: 'gh-signed-out', guide: guideFor('gh-signed-out', p) });
  if (![p.gh.login, ...p.gh.orgs].includes(body.owner)) return fail(400, `${body.owner} is not you or one of your organisations on GitHub.`);
  const remote = p.repo.remote;
  if (remote) {
    if (remote.web && remote.owner?.toLowerCase() === body.owner.toLowerCase() && remote.name?.toLowerCase() === String(body.name).toLowerCase()) return { status: 200, already: true, web: remote.web, start: p };
    return fail(409, `origin already points at ${remote.web || remote.host || 'another place'}. nexus will not change it.`);
  }
  const free = await nameFree(folder, run, body.owner, body.name);
  const web = `https://github.com/${body.owner}/${body.name}`;
  if (free === false) return fail(409, `github.com/${body.owner}/${body.name} already exists.`, { exists: true, web, why: 'exists', guide: guideFor('exists', { ...p, owner: body.owner, name: body.name, branch: p.repo.branch }) });
  const r = await run('gh', args, { cwd: folder, timeout: 60000 });
  if (!r.ok) return fail(502, `gh did not create it: ${tail(r.stderr || r.stdout, 300) || 'no reason given'}`);
  const origin = await git(folder, ['remote', 'get-url', 'origin']);
  return { status: 200, ok: true, web, remote: origin.ok ? origin.out.trim() : null, out: tail(r.stdout || r.stderr, 300), start: await probe(folder, deps) };
}

/** A failed push's stderr as a reason: { why, error, guide }. */
export function classifyPush(stderr, ctx = {}) {
  const e = String(stderr || '');
  if (/Permission denied \(publickey\)|Host key verification failed/i.test(e)) return { why: 'push-ssh', error: 'gh set origin to an ssh address and git could not use a key.', guide: guideFor('push-ssh', ctx) };
  if (/Authentication failed|could not read Username|terminal prompts disabled|\b403\b|denied to/i.test(e)) return { why: 'push-auth', error: 'GitHub did not take the push: git has no GitHub sign-in on this machine.', guide: guideFor('push-auth', ctx) };
  if (/\[rejected\]|non-fast-forward|fetch first/i.test(e)) return { why: 'push-rejected', error: `origin/${ctx.branch || BRANCH} has commits this folder does not; pull first.`, guide: guideFor('push-rejected', ctx) };
  return { why: 'push-failed', error: `The push did not work: ${tail(e, 300) || 'no reason given'}`, guide: [] };
}

export async function pushMain(folder, deps = {}) {
  const { git = gitRun } = deps;
  const p = await probe(folder, deps);
  if (!p.repo?.remote) return fail(409, 'There is no origin to push to yet.');
  if (!p.repo.commits) return fail(409, 'Make the first commit before pushing.');
  const branch = p.repo.branch || BRANCH;
  const ls = await git(folder, ['ls-remote', '--heads', 'origin', branch], { timeout: 30000, env: NO_PROMPT });
  const head = (await git(folder, ['rev-parse', 'HEAD'])).out.trim();
  if (ls.ok && head && ls.out.split(/\s+/)[0] === head) return { status: 200, already: true, web: p.repo.remote.web, start: p };
  const r = await git(folder, ['push', '-u', 'origin', branch], { timeout: 120000, env: NO_PROMPT });
  if (!r.ok) {
    const c = classifyPush(r.err, { ...p, owner: p.repo.remote.owner, name: p.repo.remote.name, branch });
    return fail(409, c.error, { why: c.why, guide: c.guide });
  }
  return { status: 200, ok: true, web: p.repo.remote.web, branch, start: await probe(folder, deps) };
}

// ---- the routes: one lock, a cache, confirm required ---------------------------------------------------------------

/**
 * The repo-start routes for server.mjs. `onChange(kind)` runs after a write that changed the repo (the server
 * persists its prefs once there is a .git, and drops its gh caches).
 */
export function createRepoStart({ repo, run = shRun, git = gitRun, home, platform, onChange = () => {} } = {}) {
  let cache = { at: 0, key: '', p: null };
  let busy = false;
  const deps = { run, git, home, platform };

  async function read(url) {
    const owner = url.searchParams.get('owner') || undefined;
    const name = url.searchParams.get('name') || undefined;
    const visibility = url.searchParams.get('visibility') || undefined;
    const key = `${owner || ''}/${name || ''}/${visibility || ''}`;
    if (url.searchParams.get('fresh') === '1' || !cache.p || cache.key !== key || Date.now() - cache.at > CACHE_MS) {
      const p = probe(repo, { ...deps, owner, name, visibility });
      cache = { at: Date.now(), key, p };
      p.catch(() => { cache.p = null; });
    }
    return cache.p;
  }

  const WRITES = {
    init: (b) => initRepo(repo, b, deps),
    identity: () => setIdentity(repo, deps),
    commit: (b) => firstCommit(repo, b, deps),
    remote: (b) => createRemote(repo, b, deps),
    push: () => pushMain(repo, deps),
  };

  /** -> { status, ...answer } for a /api/repo/* route, or null when the route is not one. */
  async function handle(method, pathname, url, readBody) {
    if (method === 'GET' && pathname === '/api/repo/start') {
      try { return { ...(await read(url)), status: 200 }; } catch (e) { return { status: 500, error: String(e.message || e) }; }
    }
    const m = /^\/api\/repo\/(init|identity|commit|remote|push)$/.exec(pathname);
    if (method !== 'POST' || !m) return null;
    const b = await readBody();
    if (b.confirm !== true) return { status: 400, error: 'confirm: true is required' };
    if (busy) return { status: 409, error: 'already working on it' };
    busy = true;
    try {
      const r = await WRITES[m[1]](b);
      cache.p = null;
      if (r.status === 200 && !r.already) await onChange(m[1]);
      return r;
    } catch (e) {
      return { status: 500, error: String(e.message || e) };
    } finally {
      busy = false;
    }
  }

  return { handle, read, probe: () => probe(repo, deps), forget: () => { cache.p = null; } };
}


