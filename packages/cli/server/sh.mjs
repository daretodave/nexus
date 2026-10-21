// One way to run a local program: no shell interpolation of user text,
// a timeout, and a result object instead of a throw.
import { spawn } from 'node:child_process';

const WIN = process.platform === 'win32';

// On Windows, npm-installed CLIs are .cmd shims that need a shell. Every
// argument passed through here is either a constant or validated by the
// caller (SAFE_ARG), so quoting is not a user-controlled surface.
export const SAFE_ARG = /^[\w@./:=,+{}-]*$/;

export function run(cmd, args = [], { cwd, timeout = 20000, input } = {}) {
  return new Promise((resolve) => {
    for (const a of args) {
      if (WIN && !SAFE_ARG.test(a)) return resolve({ ok: false, code: -1, stdout: '', stderr: `refused unsafe argument: ${a}` });
    }
    let child;
    try {
      // Joined by hand on Windows: every argument passed SAFE_ARG above.
      child = WIN
        ? spawn([cmd, ...args].join(' '), { cwd, shell: true, windowsHide: true, env: process.env })
        : spawn(cmd, args, { cwd, windowsHide: true, env: process.env });
    } catch (e) {
      return resolve({ ok: false, code: -1, stdout: '', stderr: String(e.message || e), missing: true });
    }
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); stderr += `\ntimed out after ${timeout} ms`; }, timeout);
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
