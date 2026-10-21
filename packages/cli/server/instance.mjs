// One server per repo: `.nexus/server.json` at the primary checkout's root says where it runs, so a second launch
// opens the first instead of starting another.
//
//   { pid, port, token, url, repo, root, started, version }
//
// The file carries the launch token (the server already demands one on every API call), so it is written owner-only
// (0600; on Windows the folder's own ACL is what guards it) and kept out of git (info/exclude when no ignore rule
// covers it). A record whose pid is gone, whose port takes no connection within CONNECT_MS, or whose server answers as
// something other than nexus for this root, is stale: it is removed, and the launch starts a fresh server that writes
// its own. A server that took the connection is alive, only busy (a loaded machine, git calls of its own): it gets
// ANSWER_MS to reply before it counts as stale, so a second launch never starts a second server beside a slow one.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { run } from './sh.mjs';
import { gitPath } from './repo.mjs';

export const FILE = '.nexus/server.json';
/** How long the recorded port gets to take the connection: no listener there means no server. */
export const CONNECT_MS = 3000;
/** How long a server that took the connection gets to answer: it is up, maybe busy, so the wait is generous. */
export const ANSWER_MS = 15000;

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
export function probe(rec, root, { connect = CONNECT_MS, answer = ANSWER_MS } = {}) {
  return new Promise((resolve) => {
    let timer = null;
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(v);
    };
    const wait = (ms) => {
      clearTimeout(timer);
      timer = setTimeout(() => { req.destroy(); finish(false); }, ms);
    };
    const req = http.get({ host: '127.0.0.1', port: rec.port, path: '/api/server', agent: false, headers: { host: `127.0.0.1:${rec.port}`, 'x-nexus-token': rec.token } }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          finish(res.statusCode === 200 && j.nexus === true && (!root || same(j.root, root)));
        } catch {
          finish(false);
        }
      });
      res.on('error', () => finish(false));
    });
    wait(connect);
    // Connected: something listens on the port, so the answer gets the longer window.
    req.on('socket', (socket) => {
      if (!socket.connecting) wait(answer);
      else socket.once('connect', () => wait(answer));
    });
    req.on('error', () => finish(false));
  });
}

/** The server already running for this root ({ rec, url }), or null (a stale record is removed). */
export async function findRunning(root, windows = {}) {
  const rec = readInstance(root);
  if (!rec) return null;
  if (pidAlive(rec.pid) && await probe(rec, root, windows)) {
    return { rec, url: rec.url || `http://127.0.0.1:${rec.port}/?t=${encodeURIComponent(rec.token)}` };
  }
  try { fs.unlinkSync(instanceFile(root)); } catch { /* already gone */ }
  return null;
}
