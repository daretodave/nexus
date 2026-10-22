// Permissions for new sessions (spec 49, A10): Settings saves the mode per checkout through POST /api/prefs (Ask by
// default), a new conversation starts in it (bypass alone adds the SDK's opt-in), a running one keeps its mode, and
// `nexus run` still refuses bypass.
import './jsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PERMISSION_MODES, BYPASS, modeOptions, modeArgs, permissionModeOf, sdkProvider } from '../server/provider.mjs';
import { parseRunArgs, runOnce, RUN_MODES, UsageError } from '../server/headless.mjs';
import { startServer } from '../server/server.mjs';
import { removeTreeSync } from './helpers/tmp.mjs';

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

test('the modes: Ask, Accept edits, Auto, plan and Allow everything; anything else reads as Ask', () => {
  assert.deepEqual(PERMISSION_MODES, ['default', 'acceptEdits', 'auto', 'plan', 'bypassPermissions']);
  assert.equal(BYPASS, 'bypassPermissions');
  assert.equal(permissionModeOf('nope'), 'default');
  assert.equal(permissionModeOf(undefined), 'default');
});

test('the SDK options per mode: only bypass carries allowDangerouslySkipPermissions', () => {
  for (const m of ['default', 'acceptEdits', 'auto', 'plan']) {
    assert.deepEqual(modeOptions(m), { permissionMode: m });
    assert.deepEqual(modeArgs(m), ['--permission-mode', m]);
  }
  assert.deepEqual(modeOptions('bypassPermissions'), { permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true });
  assert.deepEqual(modeArgs('bypassPermissions'), ['--permission-mode', 'bypassPermissions', '--allow-dangerously-skip-permissions']);
  assert.deepEqual(modeOptions('rm -rf'), { permissionMode: 'default' }, 'an unknown mode never reaches the SDK');
});

/** A fake Agent SDK: each query() records its options and ends when its input ends. */
function fakeSdk() {
  const calls = [];
  return {
    calls,
    query({ prompt, options }) {
      calls.push(options);
      let n = 0;
      return {
        async *[Symbol.asyncIterator]() { for await (const _ of prompt) { n += 1; yield { type: 'assistant', session_id: `s-${calls.length}`, n }; } },
        async interrupt() {},
        close() {},
      };
    },
  };
}

test('a new conversation reads the pref; a running or resumed one keeps the mode it started with', async () => {
  const sdk = fakeSdk();
  let pref = 'bypassPermissions';
  const p = sdkProvider(sdk, { repo: os.tmpdir(), onMessage() {}, onAsk: async () => ({}), onPermission: async () => ({ allow: false }), onStatus() {}, permissionMode: () => pref });
  p.send('one');
  assert.equal(sdk.calls.length, 1);
  assert.equal(sdk.calls[0].permissionMode, 'bypassPermissions');
  assert.equal(sdk.calls[0].allowDangerouslySkipPermissions, true);
  assert.equal(p.mode, 'bypassPermissions');

  pref = 'default';
  p.send('two');
  assert.equal(sdk.calls.length, 1, 'the running query keeps going; nothing changes it silently');
  await new Promise((r) => setTimeout(r, 10));

  // Stopped and sent again: the same conversation resumes in the mode it started with.
  const stop = p.stop();
  await stop;
  p.send('three');
  assert.equal(sdk.calls.length, 2);
  assert.ok(sdk.calls[1].resume, 'a resume');
  assert.equal(sdk.calls[1].permissionMode, 'bypassPermissions');
  await new Promise((r) => setTimeout(r, 10));

  // A new conversation reads the pref again, and Ask carries no opt-in.
  await p.fresh();
  p.send('four');
  assert.equal(sdk.calls.length, 3);
  assert.equal(sdk.calls[2].resume, undefined);
  assert.equal(sdk.calls[2].permissionMode, 'default');
  assert.equal('allowDangerouslySkipPermissions' in sdk.calls[2], false);
  await p.stop();
});

test('nexus run still refuses bypass, from the flag and from runOnce', async () => {
  assert.deepEqual(RUN_MODES, ['default', 'acceptEdits', 'auto', 'plan']);
  assert.throws(() => parseRunArgs(['--permission-mode', 'bypassPermissions', 'x']), /bypassPermissions is refused/);
  assert.throws(() => parseRunArgs(['--permission-mode', 'nope', 'x']), (e) => e instanceof UsageError && !/bypassPermissions/.test(e.message));
  let called = false;
  await assert.rejects(runOnce({ prompt: 'x', cwd: os.tmpdir(), permissionMode: 'bypassPermissions', query: () => { called = true; } }), /bypassPermissions is refused/);
  assert.equal(called, false, 'no session starts');
});

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-perm-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: dir });
  return dir;
}

function req(port, { method = 'GET', pathname, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: pathname, headers }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null }));
    });
    r.on('error', reject);
    r.end(body);
  });
}

test('POST /api/prefs takes every listed mode per checkout, Ask by default, drops anything else; a session reads it', async () => {
  const repo = tmpRepo();
  const hooks = [];
  const provider = (h) => { hooks.push(h); return { kind: 'fake', active: false, send() {}, async interrupt() {}, async stop() {}, async fresh() {} }; };
  const app = await startServer({ repo, provider, pollRuns: false, dist: path.join(os.tmpdir(), 'nexus-cli-no-dist') });
  const { port, token } = app;
  const get = { 'x-nexus-token': token };
  const post = { ...get, 'content-type': 'application/json', origin: `http://127.0.0.1:${port}` };
  const set = (b) => req(port, { method: 'POST', pathname: '/api/prefs', headers: post, body: JSON.stringify(b) });
  try {
    const state = await req(port, { pathname: '/api/state', headers: get });
    assert.equal(state.data.prefs.permissionMode, 'default', 'Ask by default');
    assert.ok(state.data.permissionModes.includes('bypassPermissions'));
    for (const m of PERMISSION_MODES) {
      assert.equal((await set({ permissionMode: m })).data.permissionMode, m);
      assert.equal(hooks[0].permissionMode(), m, 'the session reads the saved mode when it starts');
    }
    assert.equal((await set({ permissionMode: 'nope' })).data.permissionMode, 'bypassPermissions', 'an unknown mode is dropped, the saved one stays');
    assert.equal((await set({ permissionMode: '' })).data.permissionMode, 'bypassPermissions');
    const saved = JSON.parse(fs.readFileSync(path.join(repo, '.git', 'nexus-gui.json'), 'utf8'));
    assert.equal(saved.permissionMode, 'bypassPermissions', 'kept in the checkout\'s own prefs');
  } finally {
    await app.close();
    removeTreeSync(repo);
  }
});

test('Settings\' control: four radios with one-line explanations, Ask checked by default, a warning for Allow everything only', async () => {
  // .jsx loads through test/jsx.mjs's hooks, registered before this dynamic import.
  const { PermissionModes, PERMISSION_CHOICES, BYPASS_WARNING, shownMode } = await import('../src/screens/cloud-settings/permission-mode.jsx');
  const html = (props) => renderToStaticMarkup(createElement(PermissionModes, props));
  assert.deepEqual(PERMISSION_CHOICES.map((c) => [c.value, c.label]), [['default', 'Ask'], ['acceptEdits', 'Accept edits'], ['auto', 'Auto'], ['bypassPermissions', 'Allow everything']]);
  for (const c of PERMISSION_CHOICES) assert.ok(c.sub && !c.sub.includes('\n'), `${c.label} has a one-line explanation`);
  const ask = html({ value: undefined });
  assert.equal((ask.match(/type="radio"/g) || []).length, 4);
  assert.match(ask, /role="radiogroup" aria-label="Permissions for new sessions"/);
  assert.match(ask, /checked="" value="default"/);
  assert.doesNotMatch(ask, /perm-warn/);
  assert.equal(shownMode('plan'), 'default');

  const all = html({ value: 'bypassPermissions' });
  assert.match(all, /checked="" value="bypassPermissions"/);
  assert.match(all, /class="perm-warn"/);
  assert.ok(all.includes(BYPASS_WARNING.replace(/'/g, '&#x27;')));
  assert.match(BYPASS_WARNING, /every tool without asking/);
  assert.match(BYPASS_WARNING, /--dangerously-skip-permissions/);

  const src = read('../src/screens/Settings.jsx');
  assert.match(src, /Permissions for new sessions/);
  assert.match(src, /api\('\/api\/prefs', \{ permissionMode: mode \}\)/);
  assert.match(src, /import '\.\.\/styles\/permission-mode\.css'/);
  const css = read('../src/styles/permission-mode.css');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, 'tokens only, so both themes follow');
});
