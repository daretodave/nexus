// The model and effort (spec 54, A1): one list with labels, the prefs Settings saves (validated, the effort limited to
// the chosen model's levels), the SDK options a new conversation gets (model / effort only when set), the init
// message read back onto the session, and the cockpit's switch reaching the live query's setModel / applyFlagSettings.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { MODELS, EFFORTS, HELPER_MODEL, modelLabel, modelOf, baseModel, effortsFor, badgeText, validModel, validEffort } from '../shared/models.mjs';
import { modelOptions, sdkProvider } from '../server/provider.mjs';
import { createSession } from '../server/session.mjs';
import { SUMMARY_MODEL } from '../server/summaries.mjs';
import { fleetRows } from '../server/fleet-home.mjs';
import { startServer } from '../server/server.mjs';
import { removeTreeSync } from './helpers/tmp.mjs';

const CATALOG = [
  { value: 'default', resolvedModel: 'claude-opus-5-5', displayName: 'Default', description: '' },
  { value: 'opus', resolvedModel: 'claude-opus-5-5', displayName: 'Opus', description: '', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { value: 'claude-sonnet-5-5', displayName: 'Sonnet', description: '', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high'] },
  { value: 'claude-haiku-5-5', displayName: 'Haiku', description: '', supportsEffort: false },
];

test('one list: four models with labels, five efforts, the helpers on Haiku 5.5; any id is shown', () => {
  assert.deepEqual(MODELS.map((m) => [m.id, m.label]), [
    ['claude-fable-5-1', 'Fable 5.1'], ['claude-opus-5-5', 'Opus 5.5'], ['claude-sonnet-5-5', 'Sonnet 5.5'], ['claude-haiku-5-5', 'Haiku 5.5'],
  ]);
  assert.deepEqual(EFFORTS, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(HELPER_MODEL, 'claude-haiku-5-5');
  assert.equal(SUMMARY_MODEL, HELPER_MODEL, 'summaries and explode use the named helper model');
  assert.equal(modelLabel('claude-opus-5-5'), 'Opus 5.5');
  assert.equal(modelLabel('claude-opus-5-5[1m]'), 'Opus 5.5', 'a [1m] spelling is the same model');
  assert.equal(modelLabel('claude-sonnet-5-5-20260901'), 'Sonnet 5.5', 'a dated spelling too');
  assert.equal(modelLabel('claude-mystery-9'), 'claude-mystery-9', 'an unknown id is shown as it is');
  assert.equal(baseModel(' claude-haiku-5-5[1m] '), 'claude-haiku-5-5');
  assert.equal(modelOf('nope'), null);
  assert.ok(validModel('') && validModel('claude-fable-5-1') && !validModel('gpt') && !validModel(undefined));
  assert.ok(validEffort('') && validEffort('max') && !validEffort('extreme'));
});

test('effort levels per model: the SDK\'s supportedEffortLevels, none without effort support, all five when unknown', () => {
  assert.deepEqual(effortsFor('claude-sonnet-5-5', CATALOG), ['low', 'medium', 'high']);
  assert.deepEqual(effortsFor('claude-opus-5-5', CATALOG), EFFORTS, 'an alias row matches by its resolved model');
  assert.deepEqual(effortsFor('claude-haiku-5-5', CATALOG), [], 'no effort support: none offered');
  assert.deepEqual(effortsFor('claude-fable-5-1', CATALOG), EFFORTS, 'a model the SDK did not list: all five');
  assert.deepEqual(effortsFor('', CATALOG), EFFORTS, 'Claude Code\'s default: all five');
  assert.deepEqual(effortsFor('claude-sonnet-5-5', null), EFFORTS, 'no catalog yet: all five');
});

test('the badge: "Opus 5.5 · high", the model alone without an effort, starting before the SDK says', () => {
  assert.equal(badgeText({ model: 'claude-opus-5-5', effort: 'high' }), 'Opus 5.5 · high');
  assert.equal(badgeText({ model: 'claude-haiku-5-5', effort: null }), 'Haiku 5.5');
  assert.equal(badgeText({}), 'model: starting…');
});

test('the SDK options carry model and effort only when set', () => {
  assert.deepEqual(modelOptions({}), {});
  assert.deepEqual(modelOptions({ model: '', effort: '' }), {});
  assert.deepEqual(modelOptions({ model: 'claude-opus-5-5' }), { model: 'claude-opus-5-5' });
  assert.deepEqual(modelOptions({ model: 'claude-opus-5-5', effort: 'low' }), { model: 'claude-opus-5-5', effort: 'low' });
});

/** A fake Agent SDK: each query() records its options, answers each prompt with an init naming its model, and records switches. */
function fakeSdk({ initEffort } = {}) {
  const calls = [];
  const switches = [];
  return {
    calls,
    switches,
    query({ prompt, options }) {
      calls.push(options);
      let current = options.model || 'claude-opus-5-5';
      let eff = options.effort;
      return {
        async *[Symbol.asyncIterator]() {
          for await (const _ of prompt) {
            yield { type: 'system', subtype: 'init', model: current, session_id: `s-${calls.length}`, ...(initEffort ? { effort: eff ?? null } : {}) };
            yield { type: 'result', session_id: `s-${calls.length}` };
          }
        },
        async setModel(m) { switches.push(['setModel', m]); current = m || 'claude-opus-5-5'; },
        async applyFlagSettings(x) { switches.push(['applyFlagSettings', x]); eff = x.effortLevel || undefined; },
        async supportedModels() { return CATALOG; },
        async interrupt() {},
        close() {},
      };
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 10));
const hooksFor = (extra) => ({ repo: os.tmpdir(), onMessage() {}, onAsk: async () => ({}), onPermission: async () => ({ allow: false }), onStatus() {}, ...extra });

test('a new conversation passes the prefs\' model and effort only when set; a switch reaches the live query and a resume keeps it', async () => {
  const sdk = fakeSdk();
  let pref = { model: '', effort: '' };
  let rows = null;
  const p = sdkProvider(sdk, hooksFor({ model: () => pref.model, effort: () => pref.effort, onModels: (r) => { rows = r; } }));
  p.send('one');
  assert.equal('model' in sdk.calls[0], false, 'Claude Code\'s default passes no model');
  assert.equal('effort' in sdk.calls[0], false);
  await tick();
  assert.deepEqual(rows, CATALOG, 'supportedModels() is asked once the query is up');

  const r = await p.switchModel({ model: 'claude-sonnet-5-5', effort: 'low' });
  assert.deepEqual(sdk.switches, [['setModel', 'claude-sonnet-5-5'], ['applyFlagSettings', { effortLevel: 'low' }]]);
  assert.deepEqual(r, { model: 'claude-sonnet-5-5', effort: 'low', live: true });
  await p.switchModel({ effort: '' });
  assert.deepEqual(sdk.switches.at(-1), ['applyFlagSettings', { effortLevel: null }], 'back to the default effort');

  await p.stop();
  p.send('two');
  assert.equal(sdk.calls[1].model, 'claude-sonnet-5-5', 'a resumed conversation keeps the switch');
  assert.equal('effort' in sdk.calls[1], false);
  await tick();

  pref = { model: 'claude-haiku-5-5', effort: 'medium' };
  await p.fresh();
  p.send('three');
  assert.equal(sdk.calls[2].model, 'claude-haiku-5-5', 'a new conversation reads the prefs again');
  assert.equal(sdk.calls[2].effort, 'medium');
  await p.stop();
});

test('the session reads its model and effort from the init message; a switch is pending until the next init', async () => {
  const sdk = fakeSdk({ initEffort: true });
  const statuses = [];
  const seen = [];
  const s = await createSession({
    id: 'sess-m', cwd: os.tmpdir(), model: () => 'claude-opus-5-5', effort: () => 'high',
    provider: (h) => sdkProvider(sdk, h), onModel: (m) => seen.push(m),
  });
  const origSet = s.hub.setStatus;
  s.hub.setStatus = (x) => { statuses.push(x); return origSet(x); };
  assert.deepEqual(s.model, { model: null, effort: null, pending: null }, 'nothing known before the first init');
  await s.send('go');
  await tick();
  assert.deepEqual(s.model, { model: 'claude-opus-5-5', effort: 'high', pending: null });
  assert.deepEqual(seen[0], { model: 'claude-opus-5-5', effort: 'high', requested: 'claude-opus-5-5' });
  assert.ok(statuses.some((x) => x.model === 'claude-opus-5-5' && x.effort === 'high'), 'the channel\'s status carries it');

  const r = await s.switchModel({ model: 'claude-sonnet-5-5', effort: 'low' });
  assert.equal(r.ok, true);
  assert.deepEqual(s.model.pending, { model: 'claude-sonnet-5-5', effort: 'low' });
  assert.equal(s.model.model, 'claude-opus-5-5', 'the badge waits for the SDK');
  await s.send('next');
  await tick();
  assert.deepEqual(s.model, { model: 'claude-sonnet-5-5', effort: 'low', pending: null }, 'the next turn\'s init confirms it');
  await s.close();
});

test('without an effort in the init, the effort asked for is shown', async () => {
  const sdk = fakeSdk();
  const s = await createSession({ id: 'sess-e', cwd: os.tmpdir(), effort: () => 'low', provider: (h) => sdkProvider(sdk, h) });
  await s.send('go');
  await tick();
  assert.deepEqual(s.model, { model: 'claude-opus-5-5', effort: 'low', pending: null });
  await s.close();
});

test('Fleet rows carry a hosted session\'s model and effort', () => {
  const [row] = fleetRows([{ id: 'a', claude: 'c', state: 'live' }], { hosted: [{ id: 'a', claude: 'c', asks: 0, busy: true, model: 'claude-opus-5-5', effort: 'high' }] });
  assert.equal(row.model, 'claude-opus-5-5');
  assert.equal(row.effort, 'high');
  const [plain] = fleetRows([{ id: 'b', state: 'observing' }], {});
  assert.equal(plain.model, undefined, 'a terminal session carries none');
});

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-model-'));
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

test('prefs, GET /api/models and POST /api/sessions/:id/model through the server', async () => {
  const repo = tmpRepo();
  const hooks = [];
  const switched = [];
  const provider = (h) => {
    hooks.push(h);
    let chosen = null;
    return {
      kind: 'fake', active: false, send() {}, async interrupt() {}, async stop() {}, async fresh() {},
      get chosen() { return chosen; },
      async switchModel(pick) { switched.push(pick); chosen = { model: h.model(), effort: h.effort(), ...chosen, ...pick }; return { ...chosen, live: true }; },
      async supportedModels() { return CATALOG; },
    };
  };
  const app = await startServer({ repo, provider, pollRuns: false, dist: path.join(os.tmpdir(), 'nexus-cli-no-dist') });
  const { port, token } = app;
  const get = { 'x-nexus-token': token };
  const post = { ...get, 'content-type': 'application/json', origin: `http://127.0.0.1:${port}` };
  const set = (b) => req(port, { method: 'POST', pathname: '/api/prefs', headers: post, body: JSON.stringify(b) });
  try {
    const state = await req(port, { pathname: '/api/state', headers: get });
    assert.equal(state.data.prefs.model, '', 'Claude Code\'s default unless chosen');
    assert.equal(state.data.prefs.effort, '');

    // The models view: the list, each model's levels (from the SDK, cached), the helper, the default's last model.
    const mv = await req(port, { pathname: '/api/models', headers: get });
    assert.deepEqual(mv.data.models.map((m) => m.id), MODELS.map((m) => m.id));
    assert.deepEqual(mv.data.models.find((m) => m.id === 'claude-haiku-5-5').efforts, []);
    assert.deepEqual(mv.data.models.find((m) => m.id === 'claude-sonnet-5-5').efforts, ['low', 'medium', 'high']);
    assert.deepEqual(mv.data.helper, { id: 'claude-haiku-5-5', label: 'Haiku 5.5' });
    assert.equal(mv.data.lastModel, 'claude-opus-5-5', 'the SDK\'s default row names what the default resolves to');

    // Prefs: listed ids and levels only; a level the chosen model does not take falls back to the default.
    assert.equal((await set({ model: 'claude-sonnet-5-5', effort: 'high' })).data.model, 'claude-sonnet-5-5');
    assert.equal(hooks[0].model(), 'claude-sonnet-5-5', 'a new session reads the saved model');
    assert.equal(hooks[0].effort(), 'high');
    assert.equal((await set({ model: 'gpt-4' })).data.model, 'claude-sonnet-5-5', 'an unknown model is dropped');
    assert.equal((await set({ effort: 'extreme' })).data.effort, 'high', 'an unknown effort is dropped');
    assert.equal((await set({ effort: 'max' })).data.effort, '', 'Sonnet 5.5 takes no max: back to its default');
    assert.equal((await set({ model: 'claude-haiku-5-5', effort: 'low' })).data.effort, '', 'Haiku 5.5 takes no effort');
    assert.equal((await set({ lastModel: 'x' })).data.lastModel, '', 'lastModel is the server\'s own note');
    const saved = JSON.parse(fs.readFileSync(path.join(repo, '.git', 'nexus-gui.json'), 'utf8'));
    assert.equal(saved.model, 'claude-haiku-5-5', 'kept in the checkout\'s own prefs');

    // A session on the default names what it resolved to; Settings labels the default with it.
    await set({ model: '' });
    hooks[0].onMessage({ type: 'system', subtype: 'init', model: 'claude-fable-5-1', session_id: 'x' });
    await tick();
    assert.equal(app.sessions.get(app.home).model.model, 'claude-fable-5-1', 'the init is read onto the session');
    assert.equal((await req(port, { pathname: '/api/models', headers: get })).data.lastModel, 'claude-fable-5-1');

    // The switch route: the session's provider gets the pick; the badge waits for the next init.
    const sw = (id, b) => req(port, { method: 'POST', pathname: `/api/sessions/${id}/model`, headers: post, body: JSON.stringify(b) });
    const ok = await sw(app.home, { model: 'claude-sonnet-5-5', effort: 'low' });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.note, 'applies from the next turn');
    assert.deepEqual(switched.at(-1), { model: 'claude-sonnet-5-5', effort: 'low' });
    assert.deepEqual(app.sessions.get(app.home).model.pending, { model: 'claude-sonnet-5-5', effort: 'low' });
    assert.equal((await sw(app.home, { model: 'gpt-4' })).status, 400);
    assert.equal((await sw(app.home, {})).status, 400);
    assert.equal((await sw(app.home, { effort: 'max' })).status, 400, 'Sonnet 5.5 takes no max');
    const toHaiku = await sw(app.home, { model: 'claude-haiku-5-5', effort: 'high' });
    assert.equal(toHaiku.status, 200);
    assert.deepEqual(switched.at(-1), { model: 'claude-haiku-5-5', effort: '' }, 'a model without effort takes none');
    assert.equal((await sw('nobody', { model: 'claude-opus-5-5' })).status, 409);
  } finally {
    await app.close();
    removeTreeSync(repo);
  }
});
