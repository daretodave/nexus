// One server per repo: `.nexus/server.json` at the primary checkout's root says where it runs, so a second launch
// opens the first instead of starting another.
//
//   { pid, port, token, url, repo, root, started, version }
//
// The file carries the launch token (the server already demands one on every API call), so it is written owner-only
// (0600; on Windows the folder's own ACL is what guards it) and kept out of git (info/exclude when no ignore rule
// covers it). A record whose pid is gone, or whose server does not answer as nexus for this root within the probe
// window, is stale: it is removed, and the launch starts a fresh server that writes its own.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { run } from './sh.mjs';
import { gitPath } from './repo.mjs';

export const FILE = '.nexus/server.json';
export const PROBE_MS = 1500;

export const instanceFile = (root) => path.join(root, FILE);

export function readInstance(root) {
  try {
    const rec = JSON.parse(fs.readFileSync(instanceFile(root), 'utf8'));
    return rec && Number.isInteger(rec.port) && typeof rec.token === 'string' ? rec : null;
  } catch {
    return null;
  }
}

/** Keep server.json out of git when no ignore rule already does. */
async function exclude(root) {
  const ignored = await run('git', ['check-ignore', '-q', FILE], { cwd: root });
  if (ignored.ok) return;
  const file = await gitPath(root, 'info/exclude');
  if (!file) return;
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (cur.split(/\r?\n/).includes(`/${FILE}`)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${cur && !cur.endsWith('\n') ? '\n' : ''}/${FILE}\n`);
}

/** Write this server's record, owner-only, whole (a temp file and a rename). */
export async function writeInstance(root, rec) {
  const file = instanceFile(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(rec, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, file);
  await exclude(root);
  return file;
}

/** Remove the record when it is this process's (a later server's record is never touched). */
export function removeInstance(root, pid = process.pid) {
  const rec = readInstance(root);
  if (rec && rec.pid !== pid) return false;
  try { fs.unlinkSync(instanceFile(root)); return true; } catch { return false; }
}

export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

const same = (a, b) => {
  const norm = (p) => path.resolve(String(p || '')).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? norm(a).toLowerCase() === norm(b).toLowerCase() : norm(a) === norm(b);
};

/** Does the recorded server answer, as nexus, for this root? */
export function probe(rec, root, timeout = PROBE_MS) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: rec.port, path: '/api/server', headers: { host: `127.0.0.1:${rec.port}`, 'x-nexus-token': rec.token }, timeout }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          resolve(res.statusCode === 200 && j.nexus === true && (!root || same(j.root, root)));
        } catch {
          resolve(false);
        }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

/** The server already running for this root ({ rec, url }), or null (a stale record is removed). */
export async function findRunning(root, { timeout = PROBE_MS } = {}) {
  const rec = readInstance(root);
  if (!rec) return null;
  if (pidAlive(rec.pid) && await probe(rec, root, timeout)) {
    return { rec, url: rec.url || `http://127.0.0.1:${rec.port}/?t=${encodeURIComponent(rec.token)}` };
  }
  try { fs.unlinkSync(instanceFile(root)); } catch { /* already gone */ }
  return null;
}
