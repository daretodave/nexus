// The vault's view model (spec 42 A14; screens/vault/model.js): what the Vault, the key card, the import, a
// contributor's local keys and the audit timeline draw from GET /api/secrets. Pure functions over names and status:
// a stored value is always eight dots, a request has no default, an existing key changes only when ticked.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MASK, ageText, auditRows, destRows, destState, importBody, importNote, importRows, keyCard, keyCards, localRows, localSub,
  saveBody, savedPlaces, staleList, vaultRows, waitingOn, whenText, nameInput, validName,
} from '../src/screens/vault/model.js';

const NOW = Date.parse('2026-10-21T14:00:00');
const day = (n, h = 12) => new Date(NOW - n * 86400000 + (h - 14) * 3600000).toISOString();

const STATUS = {
  mode: 'owner', owner: true,
  vault: { local: '/r/.env', workspace: '/ws/.env.workspace', keychain: null },
  secrets: [
    { name: 'VERCEL_TOKEN', for: 'Deploys previews', where: 'https://vercel.com/account/tokens', chunk: '07.1', set: false, rings: [], destinations: [{ destination: 'local', state: 'missing' }, { destination: 'vercel', state: 'not pushed' }], setAt: null, age: null, rotate: false },
    { name: 'GH_TOKEN', for: 'gh in the loop', chunk: null, set: true, rings: ['local'], destinations: [{ destination: 'local', state: 'set' }, { destination: 'github-actions', state: 'pushed', at: day(3), stale: true }], setAt: day(1), age: 1, rotate: false },
    { name: 'SMTP_PASSWORD', for: 'Sends mail', chunk: '03.2', set: true, rings: ['local'], destinations: [{ destination: 'local', state: 'set' }, { destination: 'github-actions', state: 'pushed', at: day(96) }], setAt: day(96), age: 96, rotate: true },
  ],
  localKeys: [],
  audit: [
    { time: day(96, 10), action: 'set', name: 'SMTP_PASSWORD', destination: 'local', ring: 'local' },
    { time: new Date(Date.parse(day(96, 10)) + 2000).toISOString(), action: 'push', name: 'SMTP_PASSWORD', destination: 'github-actions' },
    { time: day(3), action: 'push', name: 'GH_TOKEN', destination: 'github-actions' },
    { time: day(1), action: 'rotate', name: 'GH_TOKEN', destination: 'local', ring: 'local' },
  ],
  requests: [{ chunk: '07.1', names: ['VERCEL_TOKEN'], missing: ['VERCEL_TOKEN'], file: 'plan/pending/secrets-07.1.md', line: 5, date: '2026-10-21' }],
  rotateDays: 90,
};

test('a stored value is always eight dots; an unset one says so', () => {
  assert.equal(MASK, '•'.repeat(8));
  const rows = vaultRows(STATUS, { now: NOW });
  assert.deepEqual(rows.map((r) => r.mask), ['no value', MASK, MASK]);
  for (const r of rows) assert.ok(!('value' in r), 'no row carries a value');
});

test('each destination reads set, out of sync, missing or not used; the row offers Add value, Sync or Replace', () => {
  const [vercel, gh, smtp] = vaultRows(STATUS, { now: NOW });
  assert.deepEqual(vercel.dots.map((d) => d.cls), ['dd is-missing', 'dd is-none', 'dd is-missing', 'dd is-none']);
  assert.deepEqual(gh.dots.map((d) => d.cls), ['dd is-set', 'dd is-stale', 'dd is-none', 'dd is-none']);
  assert.equal(gh.dots[1].title, 'Actions: out of sync');
  assert.deepEqual([vercel.canAdd, vercel.canSync, vercel.canReplace, vercel.requested], [true, false, false, true]);
  assert.deepEqual([gh.canAdd, gh.canSync, gh.canReplace], [false, true, true]);
  assert.deepEqual(gh.stale, ['github-actions']);
  assert.deepEqual(vercel.pushTo, ['vercel'], 'a first value goes everywhere the manifest names');
  assert.deepEqual(gh.pushTo, ['github-actions'], 'a replaced value goes where the old one lives');
  assert.equal(smtp.old, true, 'a rotate nudge past 90 days');
  assert.equal(smtp.age, '96 days ago');
  assert.equal(gh.age, 'yesterday');
  assert.equal(vercel.age, 'never set');
  assert.equal(destState(STATUS.secrets[1], 'cloudflare'), 'none');
  assert.deepEqual(staleList(STATUS), [{ name: 'GH_TOKEN', destinations: ['github-actions'] }]);
});

test('where values go: a row per destination with its worst dot', () => {
  const rows = destRows(STATUS, { repo: 'lantern' });
  assert.deepEqual(rows.map((r) => [r.label, r.count, r.dot]), [
    ['Local', '2 set · 1 missing', 'dd is-missing'],
    ['GitHub Actions', '1 set · 1 out of sync', 'dd is-stale'],
    ['Vercel', '1 missing', 'dd is-missing'],
    ['Cloudflare', 'none', 'dd is-none'],
  ]);
  assert.equal(rows[1].what, 'lantern repository secrets');
});

test('the audit timeline: newest first, a push right after a set folds into it, a later push reads synced, requests join', () => {
  const rows = auditRows(STATUS, { now: NOW });
  assert.deepEqual(rows.map((r) => `${r.w} | ${r.verb} ${r.name} ${r.rest}`), [
    'today | requested VERCEL_TOKEN for 07.1',
    'yesterday | rotated GH_TOKEN · local',
    'Oct 18 | synced GH_TOKEN → Actions',
    'Jul 17 | set SMTP_PASSWORD → local, Actions',
  ]);
  assert.deepEqual(rows.map((r) => r.pt), ['pt is-requested', 'pt is-rotated', 'pt is-synced', 'pt is-set']);
  assert.equal(whenText(day(0, 9), NOW), '09:00');
});

test('the key card: no default, every named place ticked, the vault locked on; Save sends the sinks only', () => {
  const [card] = keyCards(STATUS, { now: NOW });
  assert.equal(card.name, 'VERCEL_TOKEN');
  assert.equal(card.chunk, '07.1');
  assert.equal(card.whereLabel, 'vercel.com');
  assert.deepEqual(card.dests.map((d) => [d.d, d.label, d.locked]), [['local', 'Store locally · .env', true], ['vercel', 'Push to Vercel', false]]);
  assert.match(card.why, /07\.1 waits on it/);
  assert.deepEqual(saveBody('v', ['local', 'vercel']), { value: 'v', destinations: ['vercel'] });
  assert.deepEqual(savedPlaces({ pushed: [{ destination: 'vercel', ok: true }, { destination: 'github-actions', ok: false, error: 'bad token' }] }), { places: 'local, Vercel', failed: [{ d: 'github-actions', label: 'GitHub Actions', error: 'bad token' }] });
  assert.equal(keyCard(null, 'X', { secrets: [] }).chunk, '');
});

test('the import: public-looking keys and settings start unticked, an existing key stays until ticked, a requested one says so', () => {
  const preview = { names: [
    { name: 'PUBLIC_SITE_URL', looks: 'public', rings: [] },
    { name: 'VERCEL_TOKEN', looks: 'secret', rings: [] },
    { name: 'GH_TOKEN', looks: 'secret', rings: ['local'] },
    { name: 'DEBUG', looks: 'setting', rings: [] },
    { name: 'NEW_KEY', looks: 'secret', rings: [] },
    { name: 'lower', rings: [], skip: 'not an env-var name' },
  ] };
  const rows = importRows(preview, STATUS, { owner: true });
  assert.deepEqual(rows.map((r) => [r.name, r.keep, r.note]), [
    ['PUBLIC_SITE_URL', false, 'looks public, not a secret'],
    ['VERCEL_TOKEN', true, 'new · answers the request from 07.1'],
    ['GH_TOKEN', false, 'already in the vault; the vault value stays'],
    ['DEBUG', false, 'a setting, not a secret'],
    ['NEW_KEY', true, 'new'],
  ]);
  assert.deepEqual(rows[1].dests, { local: true, 'github-actions': false, vercel: true, cloudflare: false }, 'a declared name ticks its own places');
  assert.deepEqual(rows[4].dests, { local: true, 'github-actions': true, vercel: false, cloudflare: false }, 'a new one: local and Actions');
  assert.deepEqual(importNote({ ...rows[2], keep: true }), { note: 'replaces the vault value, a rotation', cls: 'env-note is-warn' });
  const body = importBody(rows, { file: '.env.production' });
  assert.deepEqual(body, { file: '.env.production', confirm: true, names: ['VERCEL_TOKEN', 'NEW_KEY'], destinations: { VERCEL_TOKEN: ['local', 'vercel'], NEW_KEY: ['local', 'github-actions'] } });
  // a contributor: this machine only, their own key stays
  const mine = importRows({ names: [{ name: 'TIDES_SANDBOX_KEY', looks: 'secret', rings: ['local'] }, { name: 'DATABASE_URL', looks: 'secret', rings: [] }] }, { localKeys: [{ name: 'TIDES_SANDBOX_KEY', rings: ['local'] }] }, { owner: false });
  assert.deepEqual(mine.map((r) => [r.name, r.keep, r.note]), [['TIDES_SANDBOX_KEY', false, 'already a local key; yours stays'], ['DATABASE_URL', true, 'new']]);
  assert.deepEqual(importNote({ ...mine[0], keep: true }, false).note, 'replaces your local value');
  assert.equal(importBody(mine, { text: 'x' }, { owner: false }).destinations, undefined, 'a contributor names no places');
});

test('a contributor: local keys by name, the empty line, and what the board waits on the owner for', () => {
  const st = { localKeys: [{ name: 'DATABASE_URL', rings: ['local'] }], audit: [{ time: day(4), action: 'set', name: 'DATABASE_URL' }] };
  assert.deepEqual(localRows(st, { now: NOW }).map((r) => [r.name, r.sub]), [['DATABASE_URL', 'in .env · set 4 days ago']]);
  assert.equal(localSub(2, 'tidepool'), '2 keys for running tidepool on this machine');
  assert.equal(localSub(0, 'tidepool'), 'only if tidepool needs them to run here');
  const plan = { specs: [{ chunks: [{ id: '14.3', state: 'closed', needsSecret: ['X'] }, { id: '14.4', title: 'Live tide heights', state: 'ready', needsSecret: ['TIDES_API_KEY'], ownerOnly: true }] }] };
  assert.deepEqual(waitingOn(plan), { chunk: '14.4', name: 'TIDES_API_KEY', title: 'Live tide heights' });
  assert.equal(waitingOn({ specs: [] }), null);
});

test('names: typed upper case, checked before a store', () => {
  assert.equal(nameInput('vercel-token'), 'VERCEL_TOKEN');
  assert.equal(validName('VERCEL_TOKEN'), true);
  assert.equal(validName('_X'), false);
  assert.equal(ageText({ set: true, setAt: null, age: null }, NOW), '');
});
