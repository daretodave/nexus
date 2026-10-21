import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { startServer } from '../server/server.mjs';
import { FILE, findRunning, instanceFile, pidAlive, readInstance, removeInstance, writeInstance } from '../server/instance.mjs';

const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
const fake = () => ({ kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} });

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-inst-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

/** A pid that was real and is gone. */
function deadPid() {
  return spawnSync(process.execPath, ['-e', '0']).pid;
}

const record = (app, root) => ({ pid: process.pid, port: app.port, token: app.token, url: app.url, repo: root, root, started: new Date().toISOString() });

test('a second launch finds the running server through .nexus/server.json', async () => {
  const root = tmpRepo();
  const app = await startServer({ repo: root, provider: fake(), pollRuns: false, dist: NO_DIST });
  try {
    await writeInstance(root, record(app, root));
    const found = await findRunning(root);
    assert.ok(found, 'the running server answers');
    assert.equal(found.url, app.url, 'the existing link opens, token and all');
    assert.equal(found.rec.port, app.port);
  } finally {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('server.json is owner-only, kept out of git, and removed only by its own server', async () => {
  const root = tmpRepo();
  try {
    await writeInstance(root, { pid: process.pid, port: 1, token: 't', root });
    if (process.platform !== 'win32') assert.equal(fs.statSync(instanceFile(root)).mode & 0o077, 0, 'no group or other access');
    assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).trim(), '', 'never shows as untracked');
    assert.match(fs.readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf8'), new RegExp(`^/${FILE.replace(/\./g, '\\.')}$`, 'm'));
    await writeInstance(root, { pid: process.pid, port: 1, token: 't', root });
    assert.equal(fs.readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf8').split(`/${FILE}`).length, 2, 'excluded once');
    assert.equal(removeInstance(root, process.pid + 1), false, 'another server never removes this one');
    assert.ok(readInstance(root));
    assert.equal(removeInstance(root), true);
    assert.equal(readInstance(root), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a stale server.json (dead pid, no answer, wrong token) is replaced', async () => {
  const root = tmpRepo();
  try {
    assert.equal(pidAlive(deadPid()), false);
    await writeInstance(root, { pid: deadPid(), port: 1, token: 't', root });
    assert.equal(await findRunning(root), null, 'dead pid');
    assert.ok(!fs.existsSync(instanceFile(root)), 'the stale record is removed');

    const app = await startServer({ repo: root, provider: fake(), pollRuns: false, dist: NO_DIST });
    const rec = record(app, root);
    await app.close();
    await writeInstance(root, rec);
    assert.equal(await findRunning(root, { timeout: 500 }), null, 'a live pid whose port no longer answers');

    const other = await startServer({ repo: root, provider: fake(), pollRuns: false, dist: NO_DIST });
    try {
      await writeInstance(root, { ...record(other, root), token: 'x'.repeat(other.token.length) });
      assert.equal(await findRunning(root), null, 'a server that refuses the token is not ours');
      const elsewhere = tmpRepo();
      await writeInstance(elsewhere, record(other, elsewhere));
      assert.equal(await findRunning(elsewhere), null, 'a server for another repo is not this one');
      fs.rmSync(elsewhere, { recursive: true, force: true });
    } finally {
      await other.close();
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('npx twice: the second launch prints the first one\'s link and exits', async () => {
  const { spawn } = await import('node:child_process');
  const root = tmpRepo();
  const bin = path.resolve(import.meta.dirname, '..', 'bin', 'nexus.mjs');
  // No gh, no SDK: the launch never calls out.
  const env = { ...process.env, NEXUS_GH_LOGIN: '', NEXUS_PROVIDER: 'cli' };
  const first = spawn(process.execPath, [bin, '--repo', root, '--no-open'], { env });
  try {
    const url = await new Promise((resolve, reject) => {
      let out = '';
      const t = setTimeout(() => reject(new Error(`no link printed: ${out}`)), 20000);
      first.stdout.on('data', (d) => {
        out += d;
        const m = /(http:\/\/127\.0\.0\.1:\d+\/\?t=\S+)/.exec(out);
        if (m) { clearTimeout(t); resolve(m[1]); }
      });
    });
    assert.equal(readInstance(root).url, url);
    const second = spawnSync(process.execPath, [bin, '--repo', root, '--no-open'], { env, encoding: 'utf8', timeout: 20000 });
    assert.equal(second.status, 0);
    assert.match(second.stdout, /already running/);
    assert.ok(second.stdout.includes(url), 'the same link, not a second server');
  } finally {
    first.kill();
    await new Promise((r) => first.once('exit', r));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
