// The GUI's Upgrade banner (spec 58, A9): the server side. GET /api/state's info carries the repo's shape (repo.mjs
// kitShape: v1, half, v2 or none, read from the local checkout); the banner's button asks for the dry run here, and
// this runs it the way a terminal would, `nexus upgrade --json`, in a child process: the dry run fetches origin,
// cuts a temporary worktree and runs the repo's gate, which takes a while and must never hold the server's event
// loop. One run at a time: a second ask while one runs gets the same answer. The last result is kept for a tab that
// opens later. Writes nothing: the dry run never touches the local checkout.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { killTree, track } from './sh.mjs';
import { render } from './upgrade.mjs';

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'nexus.mjs');
/** The dry run's ceiling: a fetch, a worktree, the converter and the repo's own gate. */
export const DRY_MS = 10 * 60 * 1000;

/**
 * Run `nexus upgrade --json` for `repo` in a child process: { code, report }. The repo is the child's cwd, so no path
 * goes through argv. Never throws: a child that dies or prints no JSON answers as an error report.
 */
export function dryRunChild(repo, { node = process.execPath, bin = BIN, ms = DRY_MS } = {}) {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let done = false;
    const finish = (r) => { if (!done) { done = true; clearTimeout(timer); resolve(r); } };
    let child;
    try {
      child = track(spawn(node, [bin, 'upgrade', '--json'], { cwd: repo, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }));
    } catch (e) {
      finish({ code: 2, report: { error: `could not start the dry run: ${e.message}` } });
      return;
    }
    const timer = setTimeout(() => { killTree(child); finish({ code: 2, report: { error: `the dry run took longer than ${Math.round(ms / 60000)} minutes and was stopped` } }); }, ms);
    timer.unref?.();
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => finish({ code: 2, report: { error: `could not start the dry run: ${e.message}` } }));
    child.on('close', (status) => {
      const start = out.indexOf('{');
      try {
        const { code, ...report } = JSON.parse(out.slice(start));
        finish({ code: Number.isInteger(code) ? code : status ?? 2, report });
      } catch {
        finish({ code: status || 2, report: { error: (err || out).trim().split(/\r?\n/).slice(-6).join('\n') || `the dry run exited ${status} with no report` } });
      }
    });
  });
}

/**
 * The banner's runs for one repo. `run(repo)` -> Promise<{ code, report }> is the seam (tests inject one; the default
 * is dryRunChild). status() -> { running, last }; dry() -> Promise<last>, where last is
 * { code, report, text, at }: text is the report as the terminal prints it (upgrade.mjs render, no colour).
 */
export function createUpgradeView({ repo, run = dryRunChild, now = () => Date.now() } = {}) {
  let running = null;
  let last = null;
  return {
    status: () => ({ running: !!running, last }),
    dry() {
      if (running) return running;
      running = Promise.resolve()
        .then(() => run(repo))
        .catch((e) => ({ code: 2, report: { error: e?.message || String(e) } }))
        .then(({ code, report }) => {
          last = { code, report, text: render(report || {}), at: now() };
          return last;
        })
        .finally(() => { running = null; });
      return running;
    },
  };
}
