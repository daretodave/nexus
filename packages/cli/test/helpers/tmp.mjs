// Temp folders for tests that start processes, and their teardown. A test fails for what it tests, never for
// Windows' file locks: `removeTree` first stops what the test started (the `stop` callbacks: servers, sessions),
// then removes the folder with retries and backoff; on Windows, a folder still held after that is checked for
// leftover child processes of this test file (killed as a tree, named in the log), tried once more, and at worst
// left behind with a line on stderr instead of a failure.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const WIN = process.platform === 'win32';
const BUSY = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY', 'EMFILE']);
const nap = (ms) => new Promise((r) => setTimeout(r, ms));

/** This process's descendants on Windows: [{ pid, ppid, name, cmd }] (empty elsewhere, or when the query fails). */
export function descendants(root = process.pid) {
  if (!WIN) return [];
  const ps = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId)`t$($_.ParentProcessId)`t$($_.Name)`t$($_.CommandLine)" }'],
  { encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
  if (ps.status !== 0 || !ps.stdout) return [];
  const all = ps.stdout.split(/\r?\n/).filter(Boolean).map((l) => {
    const [pid, ppid, name, ...cmd] = l.split('\t');
    return { pid: Number(pid), ppid: Number(ppid), name, cmd: cmd.join('\t') };
  });
  const out = [];
  const seen = new Set([root]);
  for (let grew = true; grew;) {
    grew = false;
    for (const p of all) {
      if (!seen.has(p.pid) && seen.has(p.ppid) && p.pid !== p.ppid) { seen.add(p.pid); out.push(p); grew = true; }
    }
  }
  return out;
}

/** Kill a process and its tree (taskkill /T /F on Windows, SIGKILL elsewhere); never throws. */
export function killTree(pid) {
  if (!pid) return;
  if (WIN) spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ }
}

/** Wait for a child process to exit (resolves at once when it already has). */
export function exited(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once('exit', () => resolve());
  });
}

/** Poll `check` (sync or async) until it returns a truthy value, or throw `what` after `ms`. */
export async function until(check, { ms = 30000, every = 25, what = 'the condition' } = {}) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out after ${ms} ms waiting for ${what}`);
    await nap(every);
  }
}

async function tryRemove(dir, ms) {
  const end = Date.now() + ms;
  for (let pause = 50; ; pause = Math.min(pause * 2, 1000)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return null;
    } catch (e) {
      if (!e || !BUSY.has(e.code)) throw e;
      if (Date.now() > end) return e;
      await nap(pause);
    }
  }
}

/**
 * removeTree for a synchronous test (its processes ran with spawnSync/execFileSync and have exited): retries with
 * backoff, then on Windows leaves the folder with a line on stderr instead of failing.
 */
export function removeTreeSync(dirs, { ms = 10000 } = {}) {
  for (const dir of [dirs].flat().filter(Boolean)) {
    const end = Date.now() + ms;
    for (let pause = 50; ; pause = Math.min(pause * 2, 1000)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        break;
      } catch (e) {
        if (!e || !BUSY.has(e.code)) throw e;
        if (Date.now() > end) {
          if (!WIN) throw e;
          process.stderr.write(`[teardown] left ${dir} behind (${e.code}): Windows still holds it\n`);
          break;
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pause);
      }
    }
  }
}

/**
 * Tear a test's temp folders down: run each `stop` (close servers, sessions; errors are logged, not thrown), kill the
 * `children` given (ChildProcess or pid) as trees, then remove every folder in `dirs`.
 * @param {string|string[]} dirs
 * @param {{ stop?: Array<() => any>, children?: any[], ms?: number }} [o]
 */
export async function removeTree(dirs, { stop = [], children = [], ms = 10000 } = {}) {
  for (const fn of stop) {
    try { await fn(); } catch (e) { process.stderr.write(`[teardown] stop failed: ${e?.message || e}\n`); }
  }
  for (const c of children) {
    const pid = typeof c === 'number' ? c : c?.pid;
    if (typeof c === 'object' && c && (c.exitCode !== null || c.signalCode !== null)) continue;
    killTree(pid);
    if (typeof c === 'object') await Promise.race([exited(c), nap(5000)]);
  }
  for (const dir of [dirs].flat().filter(Boolean)) {
    let err = await tryRemove(dir, ms);
    if (!err) continue;
    if (WIN) {
      // Something still holds it: name this file's leftover children, kill them, try again.
      // (Not the query's own powershell, nor a console host: one goes when its program does.)
      const left = descendants().filter((p) => !/^(powershell|conhost)\.exe$/i.test(p.name));
      for (const p of left) process.stderr.write(`[teardown] ${dir} held; killing leftover pid ${p.pid} (${p.name}): ${p.cmd.slice(0, 300)}\n`);
      for (const p of left) killTree(p.pid);
      err = await tryRemove(dir, ms);
      if (!err) continue;
      process.stderr.write(`[teardown] left ${dir} behind (${err.code}): Windows still holds it\n`);
      continue;
    }
    throw err;
  }
}
