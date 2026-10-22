#!/usr/bin/env node
// scripts/claims.mjs: who builds what. The `claims` branch on origin is an orphan branch holding one file,
// claims.json, that maps a chunk id to "<who>|<ip>|<host>|<ISO time>|s:<session>[~<star>][|pr:<n>][|held:<login>][|b:<base>]"
// (the rules: scripts/claims-codec.mjs). Anyone with push access writes it at any time, with no checks (a pre-push hook
// skips this ref; a branch ruleset refuses only a force push or a deletion): a claim is a compare-and-swap, a commit
// built on the tip just fetched and pushed without force, so two machines racing for one chunk can't both win. Nothing
// is checked out: the commit is built with plumbing (hash-object, mktree, commit-tree), so any checkout or worktree can
// claim. A lost race fetches again and redoes the change on the new tip, up to 8 tries. An unreadable claims.json
// throws: it is never read as empty, since the next write would wipe everyone's claims.
//
// The owner's checkout (scripts/owner.mjs: an untracked `.owner`, owner mode on) claims as `privileged_agent_session`,
// may claim many chunks at once and lands on main; every other checkout is a contributor's: it claims under its git
// user.name, one chunk per call (or a heads-down package with --package, all or nothing), and lands through a PR.
//
// A claim belongs to the session that made it (--session, else NEXUS_SESSION, else CLAUDE_CODE_SESSION_ID): two loops
// of one person, the owner's included, never share a chunk, and one loop's renew or release never touches another's.
// A session that keeps a ledger (scripts/ledger.mjs, .nexus/sessions/ at the primary checkout) tags its claims with its
// star name, `s:<session>~<star>`; a session is matched by its id alone, so a claim made before the star still counts.
// A claim with a PR also belongs to its author on that machine, so a later session can carry the PR's review. The
// owner takes over any claim with --force (a crashed loop's). A crash never releases a claim: it stays until its TTL.
//
// A claim lives 24 h from its time; `renew` restarts the clock. A claim carrying a PR never times out: it ends when
// `prune` finds the PR merged or closed. A contributor never takes over a privileged claim, stale or not. A spec being
// chunked (`06`) and its chunks (`06.3`) exclude each other across claimants. A claim built on a branch other than
// main (`--base <branch>`) carries `b:<branch>`, so the audit reads that branch's plan for it. The owner can `assign`
// chunks to a person (`held:<their GitHub login>`): a hold never goes stale, is that person's in any session or
// machine, and only they or the owner's --force take it off.
//
//   node scripts/claims.mjs whoami | list | claim <id…> [--force] [--base <b>] [--package] | renew [<id…>]
//                           | pr <id> <number> | release <id…> [--force] | prune | free <id> | audit [--release]
//                           | assign <id…> --to <git name> --login <github login> [--base <b>] [--force]
//   every command takes --session <id> (a full Claude Code session id is cut to its first 8, as claims store it), and
//   --json (one JSON value on stdout, for the GUI and other tools)
//
// Environment: NEXUS_SESSION (this session's claims id), NEXUS_CONTRIBUTOR=1 (run as a contributor), NEXUS_GH_LOGIN
// (this machine's GitHub login; else asked of gh), NEXUS_CLAIMS_REMOTE (default origin), NEXUS_MAIN_BRANCH (default
// main), NEXUS_CLAIMS_BOARD (a workflow file to dispatch after any write, e.g. claims-board.yml; off when unset),
// NEXUS_NO_HOOK_CHECK=1 (claim in a Claude Code session that loaded no hooks: whoami and claim refuse one otherwise).
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pendingArchiveLines, pendingAtRef } from './plan/pending.mjs';
import { isOwner, primaryRoot } from './owner.mjs';
import { BRANCH, CHUNK_ID as ID, FILE, PRIVILEGED, STAR, TTL_MS, claimInto, decide, format, idsProblem, mine, parse, pushRefusal, readMap, releaseFrom, renewIn, serialize, state } from './claims-codec.mjs';

export { BRANCH, FILE, PRIVILEGED, TTL_MS, decide, format, mine, parse, state };
export const TRIES = 8;
const README = `# claims

Who is building which chunk of plan/. Written only by \`node scripts/claims.mjs\`, never by hand. Each entry:
\`"<chunk>": "<who>|<ip>|<host>|<ISO time>|s:<session>[~<star>][|pr:<n>][|held:<login>][|b:<base>]"\`. A claim lives 24 h unless
renewed; one with a PR lives until the PR is merged or closed; one \`held:\` for a person (the owner's \`assign\`) lives
until they or the owner release it. \`b:\` names the branch it builds on, when not main. \`privileged_agent_session\` is
the owner's. \`~<star>\` after a session is its star name (vega, sirius, ...), when the session keeps a ledger.
`;

function git(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });
}

const remoteOf = (env = process.env) => env.NEXUS_CLAIMS_REMOTE || 'origin';
const mainOf = (env = process.env) => env.NEXUS_MAIN_BRANCH || 'main';

function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return '127.0.0.1';
}

/** This session's claims id: NEXUS_SESSION, else the Claude Code session (first 8), else the parent process. */
export function sessionId(env = process.env) {
  return env.NEXUS_SESSION || (env.CLAUDE_CODE_SESSION_ID ?? '').slice(0, 8) || `pid${process.ppid}`;
}

/** A Claude Code session id in full (a UUID), as CLAUDE_CODE_SESSION_ID holds it. */
const FULL_SESSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A --session value as claims store it: a full Claude Code session id cut to its first 8, as sessionId cuts it, so
 * a renew or release given the full id matches; anything else (a NEXUS_SESSION name, a claims id) stays whole.
 */
export function claimsSession(given) {
  return FULL_SESSION.test(given) ? given.slice(0, 8) : given;
}

/** Where the guard hook (.claude/hooks/guard.mjs pre-bash) marks a session that loaded it, at the primary checkout. */
export const HOOKS_DIR = path.join('.nexus', 'hooks');
/** A marker older than this no longer proves the hooks run (the hook touches it on every Bash call, this one's too). */
export const HOOK_FRESH_MS = 60 * 60 * 1000;
const markerName = (id) => String(id).replace(/[^\w.-]/g, '_');

/**
 * Inside a Claude Code session (CLAUDECODE or CLAUDE_CODE_SESSION_ID set), why claiming must stop when that session
 * loaded no project hooks: the guard hook writes .nexus/hooks/<session id> at the primary checkout on every Bash call,
 * so no fresh marker means no guard. With no session id, any fresh marker will do. '' when fine, outside Claude Code,
 * or with NEXUS_NO_HOOK_CHECK=1.
 */
export function hookProblem(cwd, env = process.env, now = Date.now()) {
  if (env.NEXUS_NO_HOOK_CHECK === '1') return '';
  const id = env.CLAUDE_CODE_SESSION_ID || '';
  if (!id && !env.CLAUDECODE) return '';
  let dir;
  try {
    dir = path.join(primaryRoot(cwd), HOOKS_DIR);
  } catch {
    return ''; // not a git checkout: the claim fails on its own
  }
  const fresh = (name) => {
    try {
      return now - fs.statSync(path.join(dir, name)).mtimeMs < HOOK_FRESH_MS;
    } catch {
      return false;
    }
  };
  let ok = false;
  try {
    ok = id ? fresh(markerName(id)) : fs.readdirSync(dir).some(fresh);
  } catch {}
  if (ok) return '';
  return (
    `claims: this Claude Code session (${id || 'no session id'}) loaded no project hooks: no fresh marker in ${dir}, so ` +
    'the guard hook (.claude/hooks/guard.mjs) is not running and nothing stops a bare `git worktree remove` or a ' +
    'force push. Fix: start Claude Code at the repo root, where .claude/settings.json wires the guard as a PreToolUse ' +
    'hook on Bash (check with /hooks), then run any Bash command and claim again. NEXUS_NO_HOOK_CHECK=1 skips this check.'
  );
}

export function whoami(cwd = process.cwd(), env = process.env) {
  const owner = isOwner(cwd, env);
  let name = '';
  try {
    name = git(['config', 'user.name'], { cwd }).trim();
  } catch {}
  const session = sessionId(env);
  return { owner, who: owner ? PRIVILEGED : name || os.userInfo().username, ip: lanIp(), host: os.hostname(), session, star: starOf(cwd, session, env) };
}

/**
 * This session's star name from its ledger (.nexus/sessions/*.json at the primary checkout, scripts/ledger.mjs): the
 * ledger whose id is this session's full id (NEXUS_SESSION, else CLAUDE_CODE_SESSION_ID) or `session` itself, or whose
 * claims id is `session`; one still held (not resumed or ended) first. A ledger this session took and runs (its `runner`,
 * ledger.mjs take) comes before all of them: its star is the loop it resumed. '' when none says: the tag stays `s:<session>`.
 */
export function starOf(cwd, session, env = process.env) {
  if (!session) return '';
  const ledgers = [];
  try {
    const dir = path.join(primaryRoot(cwd), '.nexus', 'sessions');
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
      try {
        const l = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (l && typeof l.id === 'string' && typeof l.star === 'string' && STAR.test(l.star)) ledgers.push(l);
      } catch {} // a half-written ledger: skipped
    }
  } catch {
    return ''; // no ledgers here
  }
  const full = sessionId(env) === session ? env.NEXUS_SESSION || env.CLAUDE_CODE_SESSION_ID || '' : '';
  const hits = ledgers.filter((l) => (full && l.id === full) || l.id === session || (l.claims ?? l.id.slice(0, 8)) === session);
  const held = hits.filter((l) => l.state !== 'resumed' && l.state !== 'ended');
  const runs = ledgers.filter((l) => l.runner === session && l.state !== 'ended');
  return (runs[0] ?? held[0] ?? hits[0])?.star ?? '';
}

/** A session as people read it: `<session>~<star>`, the session alone, or '-'. */
const tagOf = (c) => `${c.session || '-'}${c.session && c.star ? `~${c.star}` : ''}`;

/** This machine's GitHub login through gh (NEXUS_GH_LOGIN overrides; '' when gh can't say): a held claim's match. */
export function ghLogin(env = process.env) {
  if (env.NEXUS_GH_LOGIN !== undefined) return env.NEXUS_GH_LOGIN;
  const res = spawnSync('gh', ['api', 'user', '--jq', '.login'], { encoding: 'utf8', timeout: 8000, shell: process.platform === 'win32' });
  return res.status === 0 ? res.stdout.trim() : '';
}

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Fetch the claims tip. Returns { tip, map } (tip null when the branch doesn't exist yet). */
export function fetchClaims(cwd, remote = remoteOf()) {
  const ref = `refs/remotes/${remote}/${BRANCH}`;
  // Several worktrees of one machine share this ref: a fetch beside another can't lock it, so it waits and tries again.
  let res;
  for (let i = 0; i < 6; i++) {
    res = spawnSync('git', ['fetch', '-q', remote, `+refs/heads/${BRANCH}:${ref}`], { cwd, encoding: 'utf8' });
    if (res.status === 0 || !/lock/i.test(res.stderr)) break;
    pause(250 * (i + 1));
  }
  if (res.status !== 0) {
    if (/couldn't find remote ref/i.test(res.stderr)) return { tip: null, map: {} };
    throw new Error(`git fetch ${remote} ${BRANCH}: ${res.stderr.trim()}`);
  }
  const tip = git(['rev-parse', ref], { cwd }).trim();
  // An unreadable file is never read as empty: the next write would wipe everyone's claims.
  let text;
  try {
    text = git(['show', `${tip}:${FILE}`], { cwd });
  } catch (e) {
    const why = e instanceof Error ? e.message.split('\n')[0] : String(e);
    throw new Error(`claims: ${FILE} at ${tip.slice(0, 8)} can't be read (${why}); fix the branch, then retry.`);
  }
  return { tip, map: readMap(text, tip.slice(0, 8)) };
}

function writeObject(cwd, text) {
  return git(['hash-object', '-w', '--stdin'], { cwd, input: text }).trim();
}

/** mktree's input: the parent's files (a board's README or images) with `blobs` laid over; a first commit gets the README. */
export function treeWith(cwd, parent, blobs) {
  const files = new Map();
  if (parent) {
    for (const line of git(['ls-tree', parent], { cwd }).split('\n').filter(Boolean)) {
      const [meta, name] = line.split('\t');
      files.set(name, meta);
    }
  }
  if (!files.has('README.md') && !blobs['README.md']) files.set('README.md', `100644 blob ${writeObject(cwd, README)}`);
  for (const [name, sha] of Object.entries(blobs)) files.set(name, `100644 blob ${sha}`);
  return [...files].map(([name, meta]) => `${meta}\t${name}\n`).join('');
}

// Pushes this process made to the claims branch: the CLI asks for a board redraw after any (redrawBoard).
let pushes = 0;
export const pushCount = () => pushes;

/**
 * Ask the host to redraw a claims board (NEXUS_CLAIMS_BOARD names its workflow file; off when unset). A push to
 * `claims` can't start it: the orphan branch holds no workflows. Best effort: a failure says so in one line and never
 * fails the claim. Returns whether the dispatch went.
 */
export function redrawBoard({ env = process.env, run = spawnSync, log = console.error } = {}) {
  const workflow = env.NEXUS_CLAIMS_BOARD;
  if (!workflow) return false;
  const res = run('gh', ['workflow', 'run', workflow, '--ref', mainOf(env)], { encoding: 'utf8', shell: process.platform === 'win32' });
  if (res?.status === 0) return true;
  log(`claims: the board isn't redrawn (gh workflow run ${workflow}: ${String(res?.stderr ?? res?.error ?? 'failed').trim().split('\n')[0]}); it catches up on the next redraw.`);
  return false;
}

/**
 * Build a commit of `map` on `parent` and push it without force. True when origin took it, false when the push lost a
 * race (origin moved); any other refusal throws with git's words, never retried: a ruleset restricting the branch
 * (protected claims) as "claims are protected: ask the owner", anything else (a hook, access) as it came.
 */
export function pushClaims(cwd, parent, map, message, remote = remoteOf()) {
  const blob = writeObject(cwd, serialize(map));
  // --missing: a sparse or partial clone may not hold the parent's other files locally.
  const tree = git(['mktree', '--missing'], { cwd, input: treeWith(cwd, parent, { [FILE]: blob }) }).trim();
  const commit = git(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message], { cwd }).trim();
  const res = spawnSync('git', ['push', '-q', remote, `${commit}:refs/heads/${BRANCH}`], { cwd, encoding: 'utf8' });
  if (res.status === 0) return (pushes++, true);
  const why = pushRefusal(res.stderr);
  if (why === 'race') return false;
  if (why === 'protected') throw new Error(`claims are protected: ask the owner (the host refused a write to ${BRANCH}: ${res.stderr.trim()})`);
  throw new Error(`claims: origin refused the push: ${res.stderr.trim()}`);
}

/**
 * Read, change, push; on a lost race fetch again and redo the change on the new tip (up to `tries`).
 * `change(map)` returns { map, message } or null for nothing to write.
 */
export function update(cwd, change, { remote = remoteOf(), tries = TRIES } = {}) {
  for (let i = 0; i < tries; i++) {
    const { tip, map } = fetchClaims(cwd, remote);
    const out = change({ ...map });
    if (!out) return { written: false };
    if (pushClaims(cwd, tip, out.map, out.message, remote)) return { written: true, ...out };
    pause(100 + Math.floor(Math.random() * 400));
  }
  throw new Error(`claims: ${remote}'s ${BRANCH} kept moving; ${tries} tries lost the race. Run it again.`);
}

/** Claim ids for `me`, all or nothing. A contributor claims one chunk per call, or a package (`pkg`). */
export function claim(cwd, ids, me, { remote, force = false, base = '', pkg = false, now = () => Date.now() } = {}) {
  const problem = idsProblem(ids, me, { pkg });
  if (problem) throw new Error(problem);
  let results = [];
  const res = update(
    cwd,
    (map) => {
      const out = claimInto(map, ids, me, now(), { force, base });
      results = out.results;
      return out.next;
    },
    { remote },
  );
  return { ok: results.every((r) => r.ok), written: res.written, results };
}

/**
 * The owner holds chunks for a person (`to`: their git user.name, `login`: their GitHub login): no expiry, theirs in any
 * session. A chunk someone else holds live is refused unless --force; one the person already holds keeps its PR.
 */
export function assign(cwd, ids, me, { to, login, base = '', remote, force = false, now = () => Date.now() } = {}) {
  if (!me.owner) throw new Error('claims: only the owner assigns chunks.');
  if (!to || !login) throw new Error('claims: assign needs --to <git name> and --login <github login>.');
  for (const id of ids) if (!ID.test(id)) throw new Error(`claims: "${id}" is not a chunk id (e.g. 06.24).`);
  let results = [];
  const res = update(
    cwd,
    (map) => {
      const t = now();
      results = ids.map((id) => {
        if (!map[id]) return { id, ok: true, why: 'assigned' };
        const c = parse(map[id]);
        if (c.who === to) return { id, ok: true, why: 'assigned (theirs already)' };
        if (force || state(c, t) === 'stale') return { id, ok: true, why: 'assigned', reclaimed: c };
        return { id, ok: false, why: `held by ${c.who} on ${c.host} since ${c.at}${c.pr ? ` (PR #${c.pr})` : ''}` };
      });
      if (results.some((r) => !r.ok)) return null;
      const at = new Date(t).toISOString();
      for (const id of ids) {
        const prev = map[id] ? parse(map[id]) : null;
        const theirs = prev && prev.who === to ? prev : null;
        const held = login.replace(/^@/, '');
        map[id] = format({ who: to, ip: theirs?.ip || '-', host: theirs?.host || '-', at, session: theirs?.session ?? '', star: theirs?.star ?? '', pr: theirs?.pr ?? null, held, base: base || theirs?.base || '' });
      }
      return { map, message: `assign ${ids.join(', ')} to ${to} · ${me.who}@${me.host}` };
    },
    { remote },
  );
  return { ok: results.every((r) => r.ok), written: res.written, results };
}

export function release(cwd, ids, me, { remote, force = false } = {}) {
  let gone = [];
  let kept = [];
  update(
    cwd,
    (map) => {
      const out = releaseFrom(map, ids, me, { force });
      ({ gone, kept } = out);
      return out.next;
    },
    { remote },
  );
  return { gone: [...gone], kept: [...kept] };
}

/** Restart the clock on these (or all) of this session's claims. */
export function renew(cwd, ids, me, { remote, now = () => Date.now() } = {}) {
  let done = [];
  update(
    cwd,
    (map) => {
      const out = renewIn(map, ids, me, now());
      done = out.done;
      return out.next;
    },
    { remote },
  );
  return [...done];
}

export function attachPr(cwd, id, number, me, { remote } = {}) {
  if (!/^\d+$/.test(String(number ?? ''))) throw new Error('claims: pr needs <id> <number>.');
  let ok = false;
  update(
    cwd,
    (map) => {
      ok = false;
      if (!map[id] || !mine(parse(map[id]), me)) return null;
      map[id] = format({ ...parse(map[id]), pr: Number(number) });
      ok = true;
      return { map, message: `pr #${number} for ${id} · ${me.who}@${me.host}` };
    },
    { remote },
  );
  return ok;
}

/** Drop claims whose PR is merged or closed (a held claim keeps its hold). `prState(n)`: OPEN, MERGED or CLOSED. */
export function prune(cwd, { remote, prState = ghPrState } = {}) {
  const dropped = [];
  const seen = new Map();
  const ask = (n) => (seen.has(n) ? seen.get(n) : seen.set(n, prState(n)).get(n));
  update(
    cwd,
    (map) => {
      dropped.length = 0;
      for (const [id, v] of Object.entries(map)) {
        const c = parse(v);
        if (!c.pr) continue;
        const s = ask(c.pr);
        if (s === 'CLOSED' && c.held) {
          map[id] = format({ ...c, pr: null });
          dropped.push(`${id} (PR #${c.pr} closed, still held for ${c.who})`);
        } else if (s === 'MERGED' || s === 'CLOSED') {
          delete map[id];
          dropped.push(`${id} (PR #${c.pr} ${s.toLowerCase()})`);
        }
      }
      return dropped.length ? { map, message: `prune ${dropped.join(', ')}` } : null;
    },
    { remote },
  );
  return [...dropped];
}

/**
 * Why a claim may go: `archived` (its chunk has an archive line on its base, a pending close counted), `gone` (no
 * spec there lists it), `stale` (past 24 h, no PR) or `pr-closed`; null when nothing says so. `plan` is the base's
 * text: { archive, specs, names }. A held claim is never stale.
 */
export function verdict(id, c, plan, { now = Date.now(), prState = () => 'UNKNOWN' } = {}) {
  if (plan.archive.includes(` · ${id} · `)) return 'archived';
  const spec = id.split('.')[0];
  if (id.includes('.') && !plan.specs.some((s) => s.includes(`**${id}**`))) return 'gone';
  // A bare number no spec holds yet is /plot's reservation of a new spec's number, landing soon: it goes only once
  // stale, so a /tidy mid-plot never frees the number for a second plot to take.
  if (!id.includes('.') && !plan.specs.some((s) => s.includes(`**${spec}.`)) && !plan.names.some((n) => n.startsWith(`plan/${spec}-`))) {
    return c.held || state(c, now) !== 'stale' ? null : 'gone';
  }
  if (c.pr) {
    const s = prState(c.pr);
    return s === 'MERGED' || s === 'CLOSED' ? 'pr-closed' : null;
  }
  return state(c, now) === 'stale' ? 'stale' : null;
}

/** A branch's plan as text (main's by default), from <remote>/<branch> (fetched by the caller). */
export function branchPlan(cwd, remote = remoteOf(), branch = mainOf()) {
  const ref = `${remote}/${branch}`;
  const names = git(['ls-tree', '--name-only', ref, 'plan/'], { cwd }).split('\n').filter((n) => /^plan\/\d{2,}-.*\.md$/.test(n));
  // A close waiting in plan/pending/ counts as archived (scripts/plan/pending.mjs): settle only writes it down.
  const pending = pendingArchiveLines(pendingAtRef(cwd, ref));
  let archive = '';
  try {
    archive = git(['show', `${ref}:plan/ARCHIVE.md`], { cwd });
  } catch {
    // no archive yet
  }
  return {
    archive: `${archive.replace(/\n*$/, '\n')}${pending.map((l) => `${l}\n`).join('')}`,
    specs: names.map((n) => git(['show', `${ref}:${n}`], { cwd })),
    names,
  };
}

function ghPrState(n) {
  const res = spawnSync('gh', ['pr', 'view', String(n), '--json', 'state', '--jq', '.state'], { encoding: 'utf8', shell: process.platform === 'win32' });
  return res.status === 0 ? res.stdout.trim() : 'UNKNOWN';
}

/** Every claim with why it may go; with `doRelease`, drops those that may go and are this session's, this machine's owner claims, or (archived, gone, pr-closed) anyone's. */
export function audit(cwd, me, { remote = remoteOf(), main = mainOf(), doRelease = false, prState = ghPrState, now = Date.now() } = {}) {
  git(['fetch', '-q', remote, `+refs/heads/${main}:refs/remotes/${remote}/${main}`], { cwd });
  const plans = new Map([[main, branchPlan(cwd, remote, main)]]);
  // A claim on a base branch is read against that branch's plan; a base gone from origin keeps its claims (null).
  const planOf = (base) => {
    if (!plans.has(base)) {
      const res = spawnSync('git', ['fetch', '-q', remote, `+refs/heads/${base}:refs/remotes/${remote}/${base}`], { cwd, encoding: 'utf8' });
      plans.set(base, res.status === 0 ? branchPlan(cwd, remote, base) : null);
    }
    return plans.get(base);
  };
  const { map } = fetchClaims(cwd, remote);
  const rows = Object.entries(map).map(([id, v]) => {
    const c = parse(v);
    const plan = planOf(c.base || main);
    return { id, c, why: plan ? verdict(id, c, plan, { prState, now }) : null };
  });
  let released = [];
  if (doRelease) {
    const drop = rows.filter((r) => r.why && (r.why !== 'stale' || mine(r.c, me) || (me.owner && r.c.host === me.host && r.c.who === PRIVILEGED))).map((r) => r.id);
    if (drop.length) {
      update(
        cwd,
        (m) => {
          const gone = drop.filter((id) => id in m);
          for (const id of gone) delete m[id];
          released = gone;
          return gone.length ? { map: m, message: `tidy ${gone.join(', ')} · ${me.who}@${me.host}` } : null;
        },
        { remote },
      );
    }
  }
  return { rows, released };
}

const USAGE =
  'usage: claims.mjs whoami | list | claim <id…> [--force] [--base <b>] [--package] | renew [<id…>] | pr <id> <n> | release <id…> [--force] | prune | free <id> | audit [--release] | assign <id…> --to <name> --login <gh> [--base <b>] [--force]   (each: [--session <id>] [--json])';
const row = (id, c, me, now) => ({ id, ...c, state: state(c, now), mine: mine(c, me) });

export function main(argv, { cwd = process.cwd(), env = process.env, out = console.log, err = console.error } = {}) {
  const [cmd = 'list', ...rest] = argv;
  const valued = (name) => {
    const i = rest.indexOf(name);
    return i >= 0 ? (rest.splice(i, 2)[1] ?? '') : '';
  };
  const session = claimsSession(valued('--session'));
  const base = valued('--base');
  const to = valued('--to');
  const login = valued('--login');
  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  const args = rest.filter((a) => !a.startsWith('--'));
  const json = flags.has('--json');
  const say = (value, text) => out(json ? JSON.stringify(value, null, 2) : text);
  // A Claude Code session without the guard hook claims nothing: the worktree guard can't be bypassed silently.
  const unhooked = cmd === 'whoami' || cmd === 'claim' ? hookProblem(cwd, env) : '';
  if (unhooked) throw new Error(unhooked);
  const me = whoami(cwd, env);
  if (session) Object.assign(me, { session, star: starOf(cwd, session, env) });
  // A held claim is its person's by GitHub login too (mine()); the owner's claims are never held for the owner.
  if (!me.owner && cmd !== 'whoami') me.login = ghLogin(env);
  const now = Date.now();
  switch (cmd) {
    case 'whoami':
      if (!me.owner) me.login = ghLogin(env);
      say(me, `${me.owner ? 'owner' : 'contributor'} · claims as ${me.who}${me.login ? ` (@${me.login})` : ''} · session ${tagOf(me)} · ${me.host} · ${me.ip}`);
      // A pid session dies with this shell: a later terminal can't renew or release what it claims.
      if (!session && !env.NEXUS_SESSION && !env.CLAUDE_CODE_SESSION_ID) err(`claims: session ${me.session} is this shell's parent process, so a later terminal can't renew its claims; set NEXUS_SESSION (any name you'll reuse) to keep one.`);
      return 0;
    case 'list': {
      const { map } = fetchClaims(cwd);
      const rows = Object.entries(map).map(([id, v]) => row(id, parse(v), me, now));
      if (json) say(rows);
      else if (!rows.length) out('no claims');
      else for (const r of rows) out(`${r.id.padEnd(8)} ${r.state.padEnd(5)} ${r.who} · ${r.host} · ${tagOf(r)} · ${r.at}${r.pr ? ` · PR #${r.pr}` : ''}${r.held ? ` · held for @${r.held}` : ''}${r.base ? ` · on ${r.base}` : ''}${r.mine ? (r.held ? ' · yours' : ' · this session') : ''}`);
      return 0;
    }
    case 'free': {
      if (args.length !== 1) throw new Error('claims: free needs one <id>.');
      const { map } = fetchClaims(cwd);
      const d = decide(map[args[0]], me, now);
      say({ id: args[0], ok: d.ok, why: d.why }, `${args[0]}: ${d.why}`);
      return d.ok ? 0 : 1;
    }
    case 'claim':
    case 'assign': {
      const r = cmd === 'claim' ? claim(cwd, args, me, { force: flags.has('--force'), base, pkg: flags.has('--package') }) : assign(cwd, args, me, { to, login, base, force: flags.has('--force') });
      const lines = r.results.map((x) => `${x.id}: ${x.ok ? x.why : `refused, ${x.why}`}${x.reclaimed ? ` (was ${x.reclaimed.who} on ${x.reclaimed.host}, ${x.reclaimed.at})` : ''}`);
      if (!r.ok) lines.push(cmd === 'claim' ? 'nothing claimed (a claim is all or nothing).' : 'nothing assigned (an assignment is all or nothing).');
      say(r, lines.join('\n'));
      return r.ok ? 0 : 1;
    }
    case 'renew': {
      const done = renew(cwd, args, me);
      say({ renewed: done }, `renewed: ${done.join(', ') || 'nothing'}`);
      return 0;
    }
    case 'pr': {
      const ok = attachPr(cwd, args[0], args[1], me);
      say({ ok, id: args[0], pr: Number(args[1]) }, ok ? `${args[0]}: PR #${args[1]}` : `${args[0]}: not this session's claim`);
      return ok ? 0 : 1;
    }
    case 'release': {
      const r = release(cwd, args, me, { force: flags.has('--force') });
      say({ released: r.gone, kept: r.kept }, `released: ${r.gone.join(', ') || 'nothing'}${r.kept.length ? ` · not this session's: ${r.kept.join(', ')}` : ''}`);
      return r.kept.length ? 1 : 0;
    }
    case 'audit': {
      const r = audit(cwd, me, { doRelease: flags.has('--release') });
      const rows = r.rows.map((x) => ({ ...row(x.id, x.c, me, now), why: x.why }));
      const lines = r.rows.map((x) => `${x.id.padEnd(8)} ${(x.why ?? 'keep').padEnd(9)} ${x.c.who} · ${x.c.host} · ${tagOf(x.c)} · ${x.c.at}${x.c.pr ? ` · PR #${x.c.pr}` : ''}`);
      if (flags.has('--release')) lines.push(`released: ${r.released.join(', ') || 'nothing'}`);
      say({ rows, released: r.released }, lines.join('\n'));
      return 0;
    }
    case 'prune': {
      const pruned = prune(cwd);
      say({ pruned }, `pruned: ${pruned.join(', ') || 'nothing'}`);
      return 0;
    }
    default:
      err(USAGE);
      return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const argv = process.argv.slice(2);
  let code = 1;
  try {
    code = main(argv);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (argv.includes('--json')) console.log(JSON.stringify({ ok: false, error: msg }));
    else console.error(msg);
  }
  // Any write (a claim, a release, a renew, a prune) asks for a board redraw, even one a later error cut short.
  if (pushCount() > 0) redrawBoard();
  process.exit(code);
}
