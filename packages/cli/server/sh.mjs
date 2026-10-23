// One way to run a local program: no shell interpolation of user text,
// a timeout, and a result object instead of a throw.
import { spawn, spawnSync } from 'node:child_process';

const WIN = process.platform === 'win32';

// Every program this server starts is tracked until it exits, so closing the server can wait for (and at worst kill)
// what is still running: a program left behind holds its folder on Windows (it, and its console host, keep the cwd),
// and the folder cannot be removed until it goes.
const LIVE = new Set();

/** Track a started child until it exits; returns it. */
export function track(child) {
  if (!child || !child.pid) return child;
  LIVE.add(child);
  const done = () => LIVE.delete(child);
  child.once('exit', done);
  child.once('error', done);
  return child;
}

/** Kill a process and everything it started (taskkill /T /F on Windows: a shell's kill leaves its program running). */
export function killTree(child) {
  if (!child || !child.pid || child.exitCode != null || child.signalCode != null) return;
  if (WIN) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else { try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } } }
}

const ended = (c) => c.exitCode != null || c.signalCode != null;

/**
 * Wait up to `ms` for every tracked child to exit (and no new one to start for `quiet` ms: a chain of git calls in
 * flight starts its next one as the last exits), then kill the trees of those still running; the count killed.
 */
export async function settle({ ms = 5000, quiet = 150 } = {}) {
  const end = Date.now() + ms;
  for (let calm = Date.now(); Date.now() < end; await new Promise((r) => setTimeout(r, 25))) {
    if (LIVE.size) calm = Date.now();
    else if (Date.now() - calm >= quiet) break;
  }
  const left = [...LIVE];
  for (const c of left) killTree(c);
  const gone = Promise.all(left.map((c) => new Promise((r) => (ended(c) ? r() : c.once('exit', r)))));
  if (left.length) await Promise.race([gone, new Promise((r) => setTimeout(r, 3000))]);
  return left.length;
}

// On Windows, npm-installed CLIs are .cmd shims that need a shell. Every
// argument passed through here is either a constant or validated by the
// caller (SAFE_ARG), so quoting is not a user-controlled surface.
export const SAFE_ARG = /^[\w@./:=,+{}-]*$/;
const DIRECT = new Set(['git', 'node']);

export function run(cmd, args = [], { cwd, timeout = 20000, input, env: extra } = {}) {
  const env = extra ? { ...process.env, ...extra } : process.env;
  return new Promise((resolve) => {
    for (const a of args) {
      if (WIN && !SAFE_ARG.test(a)) return resolve({ ok: false, code: -1, stdout: '', stderr: `refused unsafe argument: ${a}` });
    }
    let child;
    try {
      // Joined by hand on Windows: every argument passed SAFE_ARG above. git and node are real programs there, so they
      // skip the shell: a cmd.exe in front doubles what starting one costs, and starting one blocks the server.
      child = WIN && !DIRECT.has(cmd)
        ? spawn([cmd, ...args].join(' '), { cwd, shell: true, windowsHide: true, env })
        : WIN ? spawn(cmd, args, { cwd, windowsHide: true, env })
        : spawn(cmd, args, { cwd, windowsHide: true, env, detached: true }); // its own group, so killTree's -pid reaches its children
    } catch (e) {
      return resolve({ ok: false, code: -1, stdout: '', stderr: String(e.message || e), missing: true });
    }
    track(child);
    let stdout = '';
    let stderr = '';
    // The whole tree: on Windows the child is a shell, and killing it alone leaves its program (and its cwd) behind.
    const timer = setTimeout(() => { killTree(child); stderr += `\ntimed out after ${timeout} ms`; }, timeout);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, code: -1, stdout, stderr: String(e.message || e), missing: e.code === 'ENOENT' });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const missing = code === 127 || (WIN && code === 1 && /is not recognized/.test(stderr));
      resolve({ ok: code === 0, code, stdout, stderr, missing });
    });
    if (input != null) child.stdin.end(input);
    else child.stdin.end();
  });
}

export function json(text) {
  try { return JSON.parse(text); } catch { return null; }
}
