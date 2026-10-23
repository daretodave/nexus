// Shared by the restart tests: a temp repo with a bare origin and the /reboot-resume command, one fake provider per
// session, calls to a server, ledgers and Claude Code session files.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { claudeSlug } from '../../server/sessions.mjs';

export const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
export const commit = (cwd, file, text, msg) => {
  fs.writeFileSync(path.join(cwd, file), text);
  git(cwd, 'add', file);
  git(cwd, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', msg);
};

export function tmpRepo() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-restart-'));
  const origin = path.join(parent, 'origin.git');
  const dir = path.join(parent, 'repo');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  fs.mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'main');
  commit(dir, 'README.md', '# r\n', 'init');
  git(dir, 'remote', 'add', 'origin', origin);
  git(dir, 'push', '-q', 'origin', 'main');
  git(dir, 'fetch', '-q', 'origin');
  fs.mkdirSync(path.join(dir, '.claude', 'commands'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'commands', 'reboot-resume.md'), '---\ndescription: resume\n---\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), '.nexus/\n.claude/\n');
  const home = path.join(parent, 'claude-home');
  fs.mkdirSync(home);
  return { parent, dir, home };
}

/** One fake provider per session: what it was sent, and the hooks it was made with (resume, repo = its cwd). */
export function fakes() {
  const by = new Map();
  const factory = (hooks) => {
    const p = { kind: 'fake', sent: [], hooks, resume: hooks.resume || null, cwd: hooks.repo, send(t) { this.sent.push(typeof t === 'string' ? t : JSON.stringify(t)); }, async interrupt() {}, async stop() {}, async fresh() {} };
    by.set(hooks.session, p);
    return p;
  };
  return { by, factory };
}

export function call(app, pathname, body) {
  return new Promise((resolve, reject) => {
    const headers = { host: `127.0.0.1:${app.port}`, 'x-nexus-token': app.token };
    if (body !== undefined) Object.assign(headers, { 'content-type': 'application/json', origin: `http://127.0.0.1:${app.port}` });
    const r = http.request({ host: '127.0.0.1', port: app.port, method: body === undefined ? 'GET' : 'POST', path: pathname, headers }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => { let json = null; try { json = JSON.parse(data); } catch { /* html */ } resolve({ status: res.statusCode, json }); });
    });
    r.on('error', reject);
    r.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

export const readLedger = (dir, id) => JSON.parse(fs.readFileSync(path.join(dir, '.nexus', 'sessions', `${id}.json`), 'utf8'));

/** A Claude Code session file for `cwd`, written now (fresh: what made a GUI session read as a terminal one before). */
export function claudeFile(home, cwd, id, words = 'working on it') {
  const folder = path.join(home, 'projects', claudeSlug(cwd));
  fs.mkdirSync(folder, { recursive: true });
  const at = new Date().toISOString();
  const lines = [
    { type: 'user', cwd, timestamp: at, message: { role: 'user', content: 'do the thing' } },
    { type: 'assistant', cwd, timestamp: at, message: { id: `m-${id}`, content: [{ type: 'text', text: words }], stop_reason: 'end_turn' } },
  ];
  fs.writeFileSync(path.join(folder, `${id}.jsonl`), `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
}

