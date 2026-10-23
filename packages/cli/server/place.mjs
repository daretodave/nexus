// Where the folder nexus runs in stands, as one word every screen reads (no screen guesses):
//
//   none      not a git repo, and no parent repo              -> make it one (RepoStart, from the start)
//   nested    inside a bigger repo (toplevel != this folder)  -> point at the toplevel, never git init
//   refused   home folder, drive root or a system folder      -> guidance only
//   local     a repo with no origin                           -> put it on GitHub
//   other     origin is not github.com                        -> honest: the cloud loop needs GitHub
//   unpushed  origin is GitHub but has nothing pushed yet     -> push (only GET /api/repo/start can tell)
//   github    origin is GitHub                                -> ready
//
// Pure helpers plus one reader (repoPlace) that uses git only, no network. Its own module so repo.mjs and
// repo-start.mjs can both read it without importing each other.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { track } from './sh.mjs';

// What a git hook's environment would leak into a git run in another folder (cloud.mjs keeps the same list).
const GIT_LEAKS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT'];

/** git without a shell, in `cwd`: { ok, out, err, missing }. `env` is added to a clean copy of this process's. */
export function gitRun(cwd, args, { timeout = 20000, env = {} } = {}) {
  return new Promise((resolve) => {
    const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !GIT_LEAKS.includes(k)));
    let child;
    try {
      child = execFile('git', args, { cwd, timeout, windowsHide: true, maxBuffer: 64 * 1024 * 1024, env: { ...base, ...env } }, (err, stdout, stderr) => {
        resolve({ ok: !err, out: String(stdout || '').replace(/\s+$/, ''), err: String(stderr || (err && err.message) || '').trim(), missing: err?.code === 'ENOENT' });
      });
    } catch (e) {
      resolve({ ok: false, out: '', err: String(e.message || e), missing: true });
      return;
    }
    track(child);
  });
}

/** One spelling per folder (lowercased on Windows), so two paths to one folder compare equal. */
export function samePath(p, platform = process.platform) {
  if (!p) return '';
  let r = path.resolve(String(p));
  try { r = fs.realpathSync.native(r); } catch { /* a folder that is gone keeps its spelling */ }
  r = r.replace(/[\\/]+$/, '') || r;
  return platform === 'win32' ? r.toLowerCase() : r;
}

/**
 * An origin URL read as { host, owner, name, web } (web only for github.com), or { host } for a host it cannot split,
 * or null for nothing. Takes https://host/O/R(.git), git@host:O/R(.git) and ssh://git@host/O/R(.git).
 */
export function parseRemote(url) {
  const u = String(url || '').trim();
  if (!u) return null;
  let m = /^(?:https?|ssh|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(u);
  if (!m) m = /^(?:[^@/]+@)?([^/:]+):([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(u);
  if (!m) {
    // A local path or a URL shape this does not split: a host when it has one, else "a path".
    const h = /^[a-z]+:\/\/(?:[^@/]+@)?([^/:]+)/i.exec(u);
    return { host: h ? h[1].toLowerCase() : null, owner: null, name: null, web: null };
  }
  const host = m[1].toLowerCase();
  const github = host === 'github.com' || host === 'www.github.com';
  return { host: github ? 'github.com' : host, owner: m[2], name: m[3], web: github ? `https://github.com/${m[2]}/${m[3]}` : null };
}

const SYSTEM_POSIX = ['/usr', '/bin', '/sbin', '/etc', '/System', '/Library', '/var', '/opt/homebrew'];

/** Why nexus will not start a repo here: 'home' | 'root' | 'system' | null. */
export function refusedAs(folder, { home = os.homedir(), platform = process.platform, env = process.env } = {}) {
  const p = samePath(folder, platform);
  if (!p) return null;
  if (home && p === samePath(home, platform)) return 'home';
  const abs = path.resolve(String(folder));
  if (path.parse(abs).root === abs || p === '/') return 'root';
  const under = (dir) => {
    if (!dir) return false;
    const d = samePath(dir, platform);
    return !!d && (p === d || p.startsWith(d + (platform === 'win32' ? '\\' : '/')));
  };
  if (platform === 'win32') {
    if ([env.SystemRoot || env.SYSTEMROOT, env.ProgramFiles || env.PROGRAMFILES, env['ProgramFiles(x86)'], env.ProgramData].some(under)) return 'system';
  } else if (SYSTEM_POSIX.some(under)) return 'system';
  return null;
}

/**
 * The place from what git already said: { place, top?, remote?, refusedAs? }. `top` is git's toplevel (null outside
 * a repo), `origin` its origin URL (null without one). No network: a GitHub origin reads 'github' here.
 */
export function placeOf({ folder, top = null, origin = null, home, platform, env } = {}) {
  if (!top) {
    const why = refusedAs(folder, { home, platform, env });
    return why ? { place: 'refused', refusedAs: why } : { place: 'none' };
  }
  if (samePath(top, platform) !== samePath(folder, platform)) return { place: 'nested', top };
  if (!origin) return { place: 'local' };
  const remote = parseRemote(origin);
  return { place: remote?.web ? 'github' : 'other', remote };
}

/** Places where the cloud loop's writes cannot land (no repo here, or no origin to push to). */
export const NO_ORIGIN = new Set(['none', 'refused', 'local', 'unpushed']);

/** The words for a place that is not on GitHub, the same everywhere (actions, runs, cloud, the screens). */
export function placeNote(p) {
  const place = p?.place || p;
  if (place === 'none' || place === 'refused') return 'This folder is not a git repo yet, so it has no GitHub repo for the cloud loop. Put it on GitHub first (Cloud setup, step 0).';
  if (place === 'local') return 'This repo is not on GitHub yet: it has no origin. Put it on GitHub first (Cloud setup, step 0).';
  if (place === 'unpushed') return 'The GitHub repo has nothing pushed yet. Push main first (Cloud setup, step 0).';
  if (place === 'nested') return `This folder is inside the repo at ${p?.top || 'a parent folder'}. Start nexus at that repo's root.`;
  if (place === 'other') return `origin is on ${p?.remote?.host || 'another host'}. The cloud loop runs on GitHub Actions, so it needs a GitHub repo.`;
  return null;
}

/** git's view of `repo`, read with `git(cwd, args)` -> { ok, out }: the place, no network. */
export async function repoPlace(repo, { git = gitRun, home, platform, env } = {}) {
  const top = await git(repo, ['rev-parse', '--show-toplevel']);
  if (!top.ok) return placeOf({ folder: repo, home, platform, env });
  const origin = await git(repo, ['remote', 'get-url', 'origin']);
  return placeOf({ folder: repo, top: top.out.trim(), origin: origin.ok ? origin.out.trim() : null, home, platform, env });
}
