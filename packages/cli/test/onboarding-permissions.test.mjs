// Onboarding asks the permission mode first (spec 50, A1): Permissions is the second of eight steps, its screen is
// 49.10's control with Ask preselected and the Allow-everything warning, a change saves through POST /api/prefs, and
// the Plot step's sessions and Launch's session start in the saved mode.
import './jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { STEPS, stepNo, stepCount, stepBefore, stepAfter } from '../src/ui/steps.js';
import { startServer } from '../server/server.mjs';
import { removeTreeSync } from './helpers/tmp.mjs';

// The data client reads its launch token from the page at import: a bare page for the screen imported here.
globalThis.window ||= { location: { href: 'http://localhost/' }, history: { replaceState() {} } };

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

test('the step list: Welcome, then Permissions, then the rest, eight in all', () => {
  assert.deepEqual(STEPS.map((s) => s.id), ['welcome', 'permissions', 'detect', 'shape', 'secrets', 'plot', 'cloud', 'launch']);
  assert.equal(STEPS[1].label, 'Permissions');
  assert.equal(stepNo('permissions'), 2);
  assert.equal(stepCount('permissions'), '2 of 8');
  assert.equal(stepBefore('permissions'), 'welcome');
  assert.equal(stepAfter('welcome'), 'permissions');
  assert.equal(stepAfter('permissions'), 'detect');
  assert.equal(stepBefore('detect'), 'permissions');
});

test('Back and Continue link every step, end to end, and every counter reads "N of 8"', () => {
  STEPS.forEach((s, i) => {
    assert.equal(stepCount(s.id), `${i + 1} of 8`);
    assert.equal(stepBefore(s.id), i ? STEPS[i - 1].id : null);
    assert.equal(stepAfter(s.id), STEPS[i + 1]?.id ?? null);
  });
  // walking Continue from Welcome visits every step once, and Back walks it home
  const fwd = ['welcome'];
  while (stepAfter(fwd.at(-1))) fwd.push(stepAfter(fwd.at(-1)));
  assert.deepEqual(fwd, STEPS.map((s) => s.id));
  const back = ['launch'];
  while (stepBefore(back.at(-1))) back.push(stepBefore(back.at(-1)));
  assert.deepEqual(back, STEPS.map((s) => s.id).reverse());
});

test('the onboarding route serves the Permissions screen', () => {
  const src = read('../src/screens/Onboarding.jsx');
  assert.match(src, /import Permissions from '\.\/onboarding\/Permissions\.jsx'/);
  assert.match(src, /permissions: Permissions/);
});

async function renderStep(prefs) {
  const { default: Permissions } = await import('../src/screens/onboarding/Permissions.jsx');
  const { ShellContext } = await import('../src/ui/shell.jsx');
  const shell = { inbox: 0, owner: true, repo: 'r', app: { data: { prefs } } };
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ShellContext.Provider, { value: shell }, createElement(Permissions))));
}

test('the Permissions screen: the frame\'s kicker and count, 49.10\'s control, Ask preselected', async () => {
  const { HEADLINE, LEDE } = await import('../src/screens/onboarding/Permissions.jsx');
  const html = await renderStep(undefined);
  assert.match(html, /step 2 · permissions/);
  assert.match(html, /class="ob-count">2 of 8/);
  assert.ok(html.includes(HEADLINE));
  assert.match(LEDE, /change it any time in Settings/);
  assert.match(html, /role="radiogroup" aria-label="Permissions for new sessions"/);
  assert.equal((html.match(/type="radio"/g) || []).length, 4);
  assert.match(html, /checked="" value="default"/, 'Ask preselected');
  assert.doesNotMatch(html, /perm-warn/);
  assert.match(html, /href="\/onboarding\/welcome"/, 'Back to Welcome');
  assert.match(html, /href="\/onboarding\/detect"/, 'Continue to Detect');
  // a mode the checkout already holds is shown as chosen
  assert.match(await renderStep({ permissionMode: 'acceptEdits' }), /checked="" value="acceptEdits"/);
});

test('Allow everything carries the warning, from the same control Settings uses', async () => {
  const { BYPASS_WARNING } = await import('../src/screens/cloud-settings/permission-mode.jsx');
  const html = await renderStep({ permissionMode: 'bypassPermissions' });
  assert.match(html, /checked="" value="bypassPermissions"/);
  assert.match(html, /class="perm-warn"/);
  assert.ok(html.includes(BYPASS_WARNING.replace(/'/g, '&#x27;')));
  const src = read('../src/screens/onboarding/Permissions.jsx');
  assert.match(src, /from '\.\.\/cloud-settings\/permission-mode\.jsx'/);
  assert.doesNotMatch(src, /dangerously/, 'the warning lives in one place');
});

test('a change saves through POST /api/prefs { permissionMode }, then the shell reloads its prefs', async () => {
  const { savePermission } = await import('../src/screens/onboarding/Permissions.jsx');
  const calls = [];
  let reloaded = 0;
  const r = await savePermission('bypassPermissions', { setPrefs: async (b) => { calls.push(b); return { permissionMode: b.permissionMode }; }, reload: () => { reloaded += 1; } });
  assert.deepEqual(calls, [{ permissionMode: 'bypassPermissions' }]);
  assert.equal(reloaded, 1);
  assert.deepEqual(r, { permissionMode: 'bypassPermissions' });
  await assert.rejects(savePermission('auto', { setPrefs: async () => { throw new Error('offline'); } }), /offline/);
  // the default setter is the data layer's POST /api/prefs
  assert.match(read('../src/data/client.js'), /setPrefs: \(patch\) => api\('\/api\/prefs', patch\)/);
});

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-obperm-'));
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

test('the Plot step\'s sessions and Launch\'s session start in the mode chosen at step 2', async () => {
  const repo = tmpRepo();
  const seen = []; // { text, mode }: the mode each conversation reads as it starts
  const provider = (h) => ({ kind: 'fake', active: false, send(text) { seen.push({ text, mode: h.permissionMode() }); }, async interrupt() {}, async stop() {}, async fresh() {} });
  const app = await startServer({ repo, provider, pollRuns: false, ghLogin: async () => '', dist: path.join(os.tmpdir(), 'nexus-cli-no-dist') });
  const headers = { 'x-nexus-token': app.token, 'content-type': 'application/json', origin: `http://127.0.0.1:${app.port}` };
  const post = (pathname, b) => req(app.port, { method: 'POST', pathname, headers, body: JSON.stringify(b) });
  try {
    assert.equal((await post('/api/prefs', { permissionMode: 'bypassPermissions' })).data.permissionMode, 'bypassPermissions');
    // Plot: /messy in the home session, then the kept ideas' /plot run in a new hosted session
    assert.equal((await post('/api/send', { text: '/messy fix the login redirect' })).status, 200);
    const plot = await post('/api/plot', { spec: 'plan/01-fix-the-login-redirect.md', thoughts: 'fix it', chunks: [{ id: '1.1', title: 'Fix the login redirect', size: 'S' }] });
    assert.equal(plot.status, 200);
    // Launch: a new hosted session
    const launch = await post('/api/sessions', { worktree: false, prompt: 'go' });
    assert.equal(launch.status, 200);
    assert.deepEqual(seen.map((s) => s.mode), ['bypassPermissions', 'bypassPermissions', 'bypassPermissions']);
    assert.match(seen[1].text, /^\/plot /);
    assert.equal(seen[2].text, 'go');
  } finally {
    await app.close();
    removeTreeSync(repo);
  }
});
