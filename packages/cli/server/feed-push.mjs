// Push detection for the change feed (feed.mjs): main advancing on origin, from any source (a session here, a
// terminal, the owner on another machine). Cheap and never blocking: every git call is async (sh.mjs run), the refs
// are watched with fs.watch on the common git folder (a fetch or a push rewrites them), a slow poll covers a watch
// that misses, and a light `git fetch` of the one branch runs every FETCH_MS while a tab is open and a remote exists.
//
// One event per push: the commits between the tip last seen and the new one, grouped, with their subjects, authors
// and the paths they changed. The tip last seen is kept in .nexus/feed/state.json, so a restart neither repeats a
// push nor misses one that landed while the GUI was closed. A first look only records the tip.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { track } from './sh.mjs';

export const FETCH_MS = 90000;
export const POLL_MS = 20000;
export const MAX_COMMITS = 50;
export const MAX_PATHS = 40;
const SEP = '\x1f';
const NO_PROMPT = { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_ASKPASS: '', SSH_ASKPASS: '' };

/** `git log --format=%H%x1f%an%x1f%ae%x1f%cI%x1f%s` output -> [{ sha, author, email, at, subject }]. */
export function parseLog(text) {
  return String(text || '').split(/\r?\n/).filter((l) => l.includes(SEP)).map((l) => {
    const [sha, author, email, at, ...rest] = l.split(SEP);
    return { sha: sha.trim(), author: author || '', email: email || '', at: at || '', subject: rest.join(SEP).trim() };
  }).filter((c) => /^[0-9a-f]{7,40}$/.test(c.sha));
}

/** A push's event from its commits (newest first) and changed paths. `who` overrides the newest commit's author. */
export function pushEvent({ from, to, branch, commits, paths, who = null, at = new Date().toISOString() }) {
  const list = commits.slice(0, MAX_COMMITS);
  const lead = list[0] || {};
  return {
    id: `push:${to}`,
    kind: 'push',
    at,
    branch,
    from: from || null,
    to,
    sha: String(to).slice(0, 7),
    count: commits.length,
    commits: list.map((c) => ({ sha: c.sha.slice(0, 7), subject: c.subject, author: c.author })),
    paths: (paths || []).slice(0, MAX_PATHS),
    morePaths: Math.max(0, (paths || []).length - MAX_PATHS),
    who: who || { name: lead.author || 'someone', kind: 'author' },
  };
}

/** git in `cwd` with no shell (its format strings carry `%`) and no prompt: { ok, stdout }. Never throws. */
export function runGit(cwd, args, { timeout = 20000 } = {}) {
  return new Promise((resolve) => {
    try {
      track(execFile('git', args, { cwd, timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, ...NO_PROMPT } }, (err, stdout) => {
        resolve({ ok: !err, stdout: String(stdout || '') });
      }));
    } catch {
      resolve({ ok: false, stdout: '' });
    }
  });
}

function readState(file) {
  try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return j && typeof j === 'object' ? j : {}; } catch { return {}; }
}

function writeState(file, state) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(state)}\n`);
    fs.renameSync(tmp, file);
  } catch { /* the next look writes it */ }
}

/**
 * @param {object} o
 * @param {string} o.repo
 * @param {string} o.stateFile             where the tip last seen is kept
 * @param {(ev: object) => void|Promise<void>} o.onPush
 * @param {() => boolean} [o.active]       a tab is watching: the fetch and the poll run only then
 * @param {(commits: object[]) => Promise<object|null>} [o.whoFor]  who made it, when a session here did
 * @param {Function} [o.git]               (args, opts) => Promise<{ ok, stdout }>; tests may pass their own
 * @param {boolean} [o.watch=true]         fs.watch the refs (tests drive check() by hand)
 */
export function createPushWatch({ repo, stateFile, onPush, active = () => true, whoFor = async () => null, git, watch = true, fetchMs = FETCH_MS, pollMs = POLL_MS, now = () => new Date().toISOString() }) {
  const g = git || ((args, o = {}) => runGit(repo, args, o));
  let target = null; // { ref, branch, remote, common }
  let checking = null;
  let again = false;
  let timers = [];
  let watchers = [];
  let debounce = null;
  let running = false;
  let fetching = false;

  const out = async (args, o) => {
    const r = await g(args, o);
    return r && r.ok ? String(r.stdout || '').trim() : null;
  };

  /** Which ref is main: origin's default branch when there is a remote, else the local main (or master). */
  async function resolve() {
    if (target) return target;
    const remotes = (await out(['remote'])) || '';
    const remote = remotes.split(/\s+/).includes('origin') ? 'origin' : null;
    let branch = null;
    if (remote) {
      const head = await out(['symbolic-ref', '--short', '-q', 'refs/remotes/origin/HEAD']);
      if (head && head.startsWith('origin/')) branch = head.slice('origin/'.length);
      for (const b of branch ? [] : ['main', 'master']) {
        if (await out(['rev-parse', '--verify', '-q', `refs/remotes/origin/${b}`])) { branch = b; break; }
      }
    }
    if (!branch) {
      for (const b of ['main', 'master']) if (await out(['rev-parse', '--verify', '-q', `refs/heads/${b}`])) { branch = b; break; }
    }
    if (!branch) return null;
    const ref = remote && (await out(['rev-parse', '--verify', '-q', `refs/remotes/origin/${branch}`])) ? `refs/remotes/origin/${branch}` : `refs/heads/${branch}`;
    const common = await out(['rev-parse', '--path-format=absolute', '--git-common-dir']);
    target = { ref, branch, remote: ref.startsWith('refs/remotes/') ? remote : null, common };
    return target;
  }

  async function build(from, to, branch) {
    let log = from ? await out(['log', `--format=%H${SEP}%an${SEP}%ae${SEP}%cI${SEP}%s`, '-n', String(MAX_COMMITS + 1), `${from}..${to}`]) : null;
    let base = from;
    if (log == null) { log = await out(['log', `--format=%H${SEP}%an${SEP}%ae${SEP}%cI${SEP}%s`, '-n', '1', to]); base = null; }
    const commits = parseLog(log);
    if (!commits.length) return null; // main went back (a reset on origin): nothing new landed
    const names = base ? await out(['diff', '--name-only', base, to]) : await out(['show', '--name-only', '--format=', to]);
    const paths = String(names || '').split(/\r?\n/).map((p) => p.trim()).filter(Boolean);
    const who = await whoFor(commits).catch(() => null);
    return pushEvent({ from: base, to, branch, commits, paths, who, at: now() });
  }

  /** Look at main's tip once; a move since the last look becomes one event. Overlapping calls share one look. */
  async function check() {
    if (checking) { again = true; return checking; }
    checking = (async () => {
      try {
        const t = await resolve();
        if (!t) return null;
        const tip = await out(['rev-parse', '--verify', '-q', t.ref]);
        if (!tip) return null;
        const state = readState(stateFile);
        if (state.ref === t.ref && state.tip === tip) return null;
        if (state.ref !== t.ref || !state.tip) { writeState(stateFile, { ref: t.ref, tip }); return null; }
        const ev = await build(state.tip, tip, t.branch);
        writeState(stateFile, { ref: t.ref, tip });
        if (ev) await onPush(ev);
        return ev;
      } finally {
        checking = null;
        if (again) { again = false; setTimeout(() => { check().catch(() => null); }, 50).unref?.(); }
      }
    })();
    return checking;
  }

  async function fetchNow() {
    if (fetching || !active()) return;
    const t = await resolve();
    if (!t || !t.remote) return; // no remote: nothing to fetch, the local refs are watched
    fetching = true;
    try {
      await g(['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', t.remote, `+refs/heads/${t.branch}:refs/remotes/${t.remote}/${t.branch}`], { timeout: 45000 });
    } finally {
      fetching = false;
    }
    await check();
  }

  const soon = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { check().catch(() => null); }, 400);
    debounce.unref?.();
  };

  function watchRefs(t) {
    if (!watch || !t?.common) return;
    const dirs = [t.common, path.join(t.common, 'refs', 'remotes', 'origin'), path.join(t.common, 'refs', 'heads')];
    for (const d of dirs) {
      try {
        const w = fs.watch(d, { persistent: false }, (_e, name) => {
          const n = String(name || '');
          if (!n || /packed-refs|HEAD|main|master|origin/.test(n) || d !== t.common) soon();
        });
        w.on('error', () => null);
        watchers.push(w);
      } catch { /* a folder that is not there yet: the poll covers it */ }
    }
  }

  return {
    check,
    fetchNow,
    get target() { return target; },
    /** Start watching: a first look (which only records the tip), the ref watch, the poll and the fetch. */
    async start() {
      if (running) return;
      running = true;
      const t = await resolve().catch(() => null);
      if (!running) return;
      watchRefs(t);
      await check().catch(() => null);
      const poll = setInterval(() => { if (active()) check().catch(() => null); }, pollMs);
      poll.unref?.();
      const fetcher = setInterval(() => { fetchNow().catch(() => null); }, fetchMs);
      fetcher.unref?.();
      timers = [poll, fetcher];
      setTimeout(() => { fetchNow().catch(() => null); }, 3000).unref?.();
    },
    stop() {
      running = false;
      for (const t of timers) clearInterval(t);
      timers = [];
      clearTimeout(debounce);
      for (const w of watchers) { try { w.close(); } catch { /* closed */ } }
      watchers = [];
    },
    /** Forget the tip last seen: the next look records the tip again (the feed turned back on starts from now). */
    reset() { writeState(stateFile, {}); },
  };
}
