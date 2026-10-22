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
    'yesterday | rotated GH_TOKEN · local, Actions still has the old one',
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

test('the plan board: a chunk waiting on a secret wears the key, names it, and sits in its own lane', async () => {
  const { normalizePlan, rowModel, lanes, withClaim } = await import('../src/screens/board/model.js');
  const plan = normalizePlan({ specs: [{ id: '07', title: 'Deploys', chunks: [
    { id: '07.1', title: 'Preview deploys', size: 'M', state: 'ready', needsSecret: ['VERCEL_TOKEN'] },
    { id: '07.2', title: 'Docs', size: 'S', state: 'ready' },
    { id: '07.3', title: 'Old', size: 'S', state: 'closed', needsSecret: ['X'] },
  ] }], order: ['07.2', '07.1'] });
  const claims = { chunk: {}, spec: {} };
  const chunks = plan.chunks.map((c) => withClaim(c, claims));
  const owner = rowModel(chunks[0], null, { owner: true, prot: false, ownerName: 'you' });
  assert.deepEqual([owner.state, owner.stateLabel, owner.needs, owner.showAddKey, owner.canClaim, owner.canHold], ['secret', 'needs secret', 'VERCEL_TOKEN', true, false, false]);
  const contrib = rowModel(chunks[0], null, { owner: false, prot: true, ownerName: 'mira' });
  assert.deepEqual([contrib.showAddKey, contrib.canRequest, contrib.freeLabel], [false, false, 'mira adds the key']);
  assert.equal(rowModel(chunks[2], null, { owner: true }).state, 'closed', 'a closed chunk waits on nothing');
  const next = lanes(plan, chunks, 'next', {}, {}, { owner: true });
  assert.deepEqual(next.map((l) => [l.title, l.secret, l.rows.map(([c]) => c.id).join()]), [['Next up', false, '07.2'], ['Waiting on a secret', true, '07.1']]);
  const byClaim = lanes(plan, chunks, 'claim', {}, {}, { owner: false, ownerName: 'mira' });
  assert.deepEqual(byClaim.map((l) => l.title), ['Unclaimed', 'Waiting on a secret']);
  assert.deepEqual(lanes(plan, chunks, 'next', { unclaimed: true }, {}).map((l) => l.title), ['Next up'], 'unclaimed leaves out what nobody can take');
});

test('the inbox: a secret request is one key item per missing name, with no default', async () => {
  const { fromDurable, fromInbox } = await import('../src/screens/headsdown-inbox/inboxModel.js');
  const d = { id: 'plan/pending/secrets-07.1.md:5', file: 'plan/pending/secrets-07.1.md', line: 5, text: 'secret request 07.1: set A_KEY, B_KEY in your terminal', secret: { chunk: '07.1', names: ['A_KEY', 'B_KEY'], missing: ['B_KEY'] } };
  const items = fromDurable([d]);
  assert.deepEqual(items.map((i) => [i.id, i.q, i.secret, i.hasDefault, i.kind]), [['plan:plan/pending/secrets-07.1.md:5:B_KEY', '07.1 needs B_KEY', 'B_KEY', false, 'plan']]);
  assert.equal(fromInbox([{ id: 'plan:x', src: 'durable', durable: d }]).length, 1);
  assert.equal(fromDurable([{ id: 'q', file: 'plan/a.md', line: 1, text: 'A plain question?' }])[0].secret, undefined);
});

test('the inbox fallback: an unmarked secret request is never a free-text question, loading or not', async () => {
  const { fromDurable, collect } = await import('../src/screens/headsdown-inbox/inboxModel.js');
  const raw = { id: 'plan/pending/secrets-3.2.md:6', file: 'plan/pending/secrets-3.2.md', line: 6, source: 'needs-user-call', text: 'secret request 3.2: set SMTP_PASSWORD in your terminal or the GUI vault (never in a session)' };
  const plain = { id: 'plan/a.md:1', file: 'plan/a.md', line: 1, source: 'needs-user-call', text: 'A plain question?' };
  assert.deepEqual(fromDurable([raw, plain]).map((i) => i.q), ['A plain question?'], 'dropped, never freeText');
  for (const inbox of [{ status: 'loading' }, { status: 'error' }]) {
    const { items } = collect({ inbox, live: {}, oversight: { status: 'ready', data: { durable: [raw, plain] } } });
    assert.ok(!items.some((i) => i.freeText && /secret request/.test(i.q)), inbox.status);
  }
  const marked = { ...raw, secret: { chunk: '3.2', names: ['SMTP_PASSWORD'], missing: ['SMTP_PASSWORD'] } };
  const { items } = collect({ inbox: { status: 'loading' }, live: {}, oversight: { status: 'ready', data: { durable: [marked] } } });
  assert.deepEqual(items.map((i) => [i.secret, i.freeText, i.hasDefault]), [['SMTP_PASSWORD', false, false]], 'a marked one is the key card');
});

test('Launch\'s secrets row: the vault by name, a skip, or a contributor\'s none', async () => {
  const { secretsLine } = await import('../src/screens/vault/model.js');
  assert.equal(secretsLine(STATUS, 'imp'), '3 names in the vault · values in .env and CI');
  assert.equal(secretsLine({ owner: true, secrets: [], vault: { keychain: 'nexus' } }, 'skip'), 'skipped · the vault is in the rail');
  assert.equal(secretsLine({ owner: false, secrets: [] }), 'no project secrets needed · local keys stay on this machine');
  assert.equal(secretsLine(null), null);
});

test('the import: ticking an existing name replaces it where the manifest sends it, and only there; Local stays on', async () => {
  const { keepToggle, importTick } = await import('../src/screens/vault/model.js');
  const status = { ...STATUS, secrets: [...STATUS.secrets, { name: 'DEPLOY_HOOK', for: 'Deploys', set: true, rings: ['local'], destinations: [{ destination: 'local', state: 'set' }, { destination: 'vercel', state: 'pushed' }] }] };
  const rows = importRows({ names: [{ name: 'DEPLOY_HOOK', looks: 'secret', rings: ['local'] }, { name: 'NEW_KEY', looks: 'secret', rings: [] }, { name: 'PUBLIC_URL', looks: 'public', rings: [] }] }, status, { owner: true });
  const [hook, fresh, pub] = rows;
  assert.equal(hook.keep, false);
  const ticked = { ...hook, ...keepToggle(hook) };
  assert.deepEqual(ticked.dests, { local: true, 'github-actions': false, vercel: true, cloudflare: false }, 'the declared places, not Actions');
  assert.deepEqual(importBody([ticked], { text: 'x' }).destinations, { DEPLOY_HOOK: ['local', 'vercel'] });
  assert.deepEqual(importTick(ticked, 'github-actions'), { checked: false, disabled: true, title: 'DEPLOY_HOOK does not go to Actions in nexus.secrets.json' });
  assert.deepEqual(importTick(ticked, 'local'), { checked: true, disabled: true, title: 'The vault keeps every value; pushes read it from there.' });
  assert.equal(importTick(ticked, 'vercel').disabled, false);
  // a new name ticks local and Actions; a public-looking one ticked comes back with the same defaults
  assert.deepEqual({ ...pub, ...keepToggle(pub) }.dests, { local: true, 'github-actions': true, vercel: false, cloudflare: false });
  assert.deepEqual(keepToggle(fresh), { keep: false });
  // Local cannot be unticked away: the body always names it
  assert.deepEqual(importBody([{ ...fresh, dests: { ...fresh.dests, local: false } }], { text: 'x' }).destinations, { NEW_KEY: ['local', 'github-actions'] });
});

test('the import in onboarding sends only the columns it draws: a declared Vercel name is never pushed there unseen', async () => {
  const { keepToggle } = await import('../src/screens/vault/model.js');
  const status = { secrets: [{ name: 'VERCEL_TOKEN', set: true, destinations: [{ destination: 'local', state: 'set' }, { destination: 'vercel', state: 'pushed' }] }] };
  const preview = { names: [{ name: 'VERCEL_TOKEN', rings: ['local'], looks: 'secret' }, { name: 'NEW_KEY', rings: [], looks: 'secret' }] };
  const cols = ['local', 'github-actions'];
  const rows = importRows(preview, status, { owner: true, cols }).map((r) => ({ ...r, ...(r.keep ? {} : keepToggle(r)) }));
  assert.deepEqual(importBody(rows, { file: '.env.local' }).destinations, { VERCEL_TOKEN: ['local'], NEW_KEY: ['local', 'github-actions'] });
  assert.equal(rows[0].dests.vercel, false, 'no tick where no box is drawn');
  // the Vault draws every column, so there the declared places stand
  const all = importRows(preview, status, { owner: true }).map((r) => ({ ...r, ...(r.keep ? {} : keepToggle(r)) }));
  assert.deepEqual(importBody(all, { file: '.env.local' }).destinations.VERCEL_TOKEN, ['local', 'vercel']);
});

test('the import draws Local ticked only on a row it will store', async () => {
  const { importTick, keepToggle } = await import('../src/screens/vault/model.js');
  const [pub] = importRows({ names: [{ name: 'NEXT_PUBLIC_SITE_URL', rings: [], looks: 'public' }] }, {});
  assert.equal(pub.keep, false);
  assert.equal(importTick(pub, 'local').checked, false);
  assert.equal(importTick(pub, 'local').disabled, true);
  assert.equal(importTick({ ...pub, ...keepToggle(pub) }, 'local').checked, true);
});

test('Add a secret: Local is locked on, and the body names only the sinks', async () => {
  const { addBody, addTick } = await import('../src/screens/vault/model.js');
  const nw = { name: 'NEW_KEY', for: 'x', value: 'v', dests: { local: false, 'github-actions': true, vercel: false, cloudflare: false } };
  assert.deepEqual(addBody(nw), { value: 'v', declare: true, for: 'x', destinations: ['github-actions'] });
  assert.deepEqual(addTick(nw, 'local'), { checked: true, disabled: true, title: 'The vault keeps every value; pushes read it from there.' });
  assert.deepEqual(addTick(nw, 'vercel'), { checked: false, disabled: false, title: undefined });
});

test('the audit log: a rotation names the places still holding the old value', () => {
  const rows = auditRows(STATUS, { now: NOW });
  assert.equal(rows[1].rest, '· local, Actions still has the old one');
  const two = { ...STATUS, secrets: STATUS.secrets.map((s) => (s.name === 'GH_TOKEN' ? { ...s, destinations: [...s.destinations, { destination: 'vercel', state: 'pushed', stale: true }] } : s)) };
  assert.equal(auditRows(two, { now: NOW })[1].rest, '· local, Actions and Vercel still have the old one');
});

test('the Inbox key row\'s Add value is the design\'s warn button', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/screens/Inbox.jsx', import.meta.url), 'utf8');
  assert.match(src, /r\.secret \? <button className="btn btn-s btn-warn"[^\n]*?<Icon name="key" size=\{14\} \/>Add value/);
  assert.match(fs.readFileSync(new URL('../design/handoff/Inbox.dc.html', import.meta.url), 'utf8'), /btn btn-s btn-warn/);
});

test('a paste field never mirrors the value into the DOM: no value attribute, cleared through the property', async () => {
  const fs = await import('node:fs');
  const { maskInputProps, clearPaste } = await import('../src/ui/mask-input.js');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const props = maskInputProps({ show: false, onChange() {}, label: 'Paste the value of X', placeholder: 'Paste the value' });
  assert.ok(!('value' in props) && !('defaultValue' in props), 'an uncontrolled input: React never writes the value attribute');
  assert.equal(props.type, 'password');
  assert.equal(maskInputProps({ show: true }).type, 'text');
  assert.doesNotMatch(renderToStaticMarkup(createElement('input', props)), /value=/);
  // the parent's '' (after Save) clears the field's property, never an attribute
  const el = { value: 'TESTONLY_paste_42' };
  clearPaste(el, '');
  assert.equal(el.value, '');
  const kept = { value: 'TESTONLY_paste_42' };
  clearPaste(kept, 'TESTONLY_paste_42');
  assert.equal(kept.value, 'TESTONLY_paste_42');
  clearPaste(null, '');
  // MaskField draws its input from these props, with no value prop of its own
  const src = fs.readFileSync(new URL('../src/ui/vault.jsx', import.meta.url), 'utf8');
  const field = src.slice(src.indexOf('export function MaskField'), src.indexOf('export function TickBox'));
  assert.match(field, /maskInputProps\(/);
  assert.doesNotMatch(field, /\bvalue=\{/);
});

test('Settings\' Secrets section follows the effective mode, as the Vault does: owner mode off draws the contributor\'s', async () => {
  const fs = await import('node:fs');
  const { secretsSide } = await import('../src/screens/cloud-settings/secrets.js');
  assert.equal(secretsSide({ owner: true, ownerMode: true }), 'owner');
  assert.equal(secretsSide({ owner: true }), 'owner', 'owner mode is on unless turned off');
  assert.equal(secretsSide({ owner: true, ownerMode: false }), 'contributor');
  assert.equal(secretsSide({ owner: false, ownerMode: true }), 'contributor');
  const src = fs.readFileSync(new URL('../src/screens/Settings.jsx', import.meta.url), 'utf8');
  assert.match(src, /secretsSide\(/);
  assert.doesNotMatch(src, /\{owner \? \(\s*<section className="set-sec" style=\{SEC\}>\s*<div><h2 className="set-h">Secrets/, 'the Secrets section is not chosen by the .owner file alone');
});

// ---- a mature repo's vault (spec 47, A2) ---------------------------------------------------------------------------

test('secretsStep: missing before any file is picked, the root .env as the vault already, else the import', async () => {
  const { secretsStep, alreadyCopy, missingCopy, setupToast, secretsLine, vaultMissing, WAITS_FOR_VAULT } = await import('../src/screens/vault/model.js');
  assert.deepEqual(secretsStep(null), { kind: 'unknown' });
  assert.deepEqual(secretsStep({ available: false, vaultState: 'missing', rootEnv: { exists: true, names: 5 } }), { kind: 'missing', envNames: 5 });
  assert.deepEqual(secretsStep({ available: false, vaultState: 'missing', rootEnv: { exists: false, names: 0 } }), { kind: 'missing', envNames: 0 });
  assert.deepEqual(secretsStep({ ...STATUS, vaultState: 'ready', rootEnv: { exists: true, names: 4, undeclared: 2 } }), { kind: 'already', names: 4, undeclared: 2, manifest: false });
  assert.deepEqual(secretsStep({ ...STATUS, manifest: true, vaultState: 'ready', rootEnv: { exists: true, names: 4, undeclared: 2 } }), { kind: 'already', names: 4, undeclared: 2, manifest: true });
  assert.deepEqual(secretsStep({ ...STATUS, vaultState: 'ready', rootEnv: { exists: true, names: 0, undeclared: 0 } }), { kind: 'import' });
  assert.deepEqual(secretsStep({ ...STATUS, vaultState: 'ready', rootEnv: { exists: false, names: 0 } }), { kind: 'import' });
  assert.ok(vaultMissing({ available: false }) && !vaultMissing(STATUS) && !vaultMissing(null));
  assert.match(WAITS_FOR_VAULT, /set it up/);

  const all = alreadyCopy({ names: 4, undeclared: 4 });
  assert.equal(all.title, 'Your .env is already the vault · 4 names');
  assert.equal(all.action, 'Write the manifest');
  assert.match(all.line, /name them in nexus\.secrets\.json, names only/);
  assert.match(alreadyCopy({ names: 4, undeclared: 1 }).line, /the 1 not named yet/);
  assert.equal(alreadyCopy({ names: 1, undeclared: 0 }).action, null, 'nothing to write');
  assert.equal(alreadyCopy({ names: 1, undeclared: 0 }).title, 'Your .env is already the vault · 1 name');
  assert.equal(alreadyCopy({ names: 3, undeclared: 3 }, { owner: false }).action, null, 'a contributor sees the owner keeps secrets');

  const o = missingCopy({ owner: true, envNames: 3 });
  assert.equal(o.title, 'This repo has no vault yet');
  assert.equal(o.action, 'Set up the vault');
  assert.match(o.body, /Your \.env \(3 names\) becomes the vault's own file/);
  const c = missingCopy({ owner: false });
  assert.equal(c.action, 'Propose it in a pull request');
  for (const x of [o, c, all]) assert.doesNotMatch(JSON.stringify(x), /templates|nexus\/customization|scripts\//, 'no kit path in the copy');

  assert.equal(setupToast({ landed: 'main', here: true }).title, 'The vault is set up');
  assert.equal(setupToast({ landed: 'main', here: false, note: 'pull main' }).body, 'pull main');
  assert.equal(setupToast({ landed: 'branch', pr: 'https://x/pull/1' }).body, 'https://x/pull/1');
  assert.equal(secretsLine({ available: false, vaultState: 'missing', owner: true }), 'no vault yet · set it up from the Vault');
});

// ---- the GUI tells the truth (spec 49) -------------------------------------------------------------------------------

test('49.2: with a manifest present, the card names what it lacks with Add it / Add them, in the headings\' sans face', async () => {
  const fs = await import('node:fs');
  const { alreadyCopy, alreadyPick, lacksLine } = await import('../src/screens/vault/model.js');
  assert.equal(lacksLine(1), '1 name in .env isn\'t in nexus.secrets.json yet');
  assert.equal(lacksLine(2), '2 names in .env aren\'t in nexus.secrets.json yet');
  const one = alreadyCopy({ names: 3, undeclared: 1, manifest: true });
  assert.equal(one.title, 'Your .env is already the vault · 3 names');
  assert.match(one.line, /^1 name in \.env isn't in nexus\.secrets\.json yet\./);
  assert.equal(one.action, 'Add it');
  assert.equal(alreadyCopy({ names: 3, undeclared: 2, manifest: true }).action, 'Add them');
  assert.equal(alreadyCopy({ names: 3, undeclared: 0, manifest: true }).action, null, 'nothing lacking, nothing to add');
  assert.equal(alreadyCopy({ names: 3, undeclared: 3, manifest: false }).action, 'Write the manifest', 'no manifest yet: write it');
  assert.equal(alreadyCopy({ names: 3, undeclared: 1, manifest: true }, { owner: false }).action, null);
  assert.equal(alreadyPick({ names: 3, undeclared: 1, manifest: true }), 'your .env is already the vault · 3 names · 1 name in .env isn\'t in nexus.secrets.json yet');
  assert.equal(alreadyPick({ names: 3, undeclared: 0, manifest: true }), 'your .env is already the vault · 3 names');

  const step = fs.readFileSync(new URL('../src/screens/onboarding/Secrets.jsx', import.meta.url), 'utf8');
  assert.match(step, /<EnvFile prose name=\{already\.title\}/, 'the card\'s title is a sentence: sans, not mono');
  assert.match(step, /already \? alreadyPick\(step\)/, 'the radio\'s lowercase twin reads the same count');
  const ui = fs.readFileSync(new URL('../src/ui/vault.jsx', import.meta.url), 'utf8');
  assert.match(ui, /cx\('env-file', prose && 'is-prose'\)/);
  const css = fs.readFileSync(new URL('../src/styles/vault-truth.css', import.meta.url), 'utf8');
  assert.match(css, /\.env-file\.is-prose \.t b \{ font-family: var\(--font-ui\); font-size: 15px; line-height: 22px; font-weight: 600;/, 'the .t-title-s face');
  const nexus = fs.readFileSync(new URL('../src/styles/nexus.css', import.meta.url), 'utf8');
  assert.equal(nexus, fs.readFileSync(new URL('../design/handoff/nexus.css', import.meta.url), 'utf8'), 'nexus.css stays the handoff\'s');
});

test('49.4: the header counts declared names; an undeclared vault name says so, Local set, with Declare only', async () => {
  const { subLine, declaredSecrets } = await import('../src/screens/vault/model.js');
  const st = {
    ...STATUS,
    secrets: [
      ...STATUS.secrets.slice(0, 2).map((s) => ({ ...s, declared: true })),
      { name: 'GITHUB_TOKEN', for: null, where: null, chunk: null, declared: false, set: true, rings: ['local'], destinations: [], age: null, setAt: null, rotate: false },
    ],
  };
  assert.equal(subLine(st), '2 secrets in nexus.secrets.json', 'the undeclared name is not counted');
  assert.deepEqual(declaredSecrets(st).map((s) => s.name), ['VERCEL_TOKEN', 'GH_TOKEN']);
  const rows = vaultRows(st, { now: NOW });
  const u = rows[2];
  assert.equal(u.name, 'GITHUB_TOKEN');
  assert.equal(u.for, 'in .env, not in the manifest');
  assert.equal(u.undeclared, true);
  assert.equal(u.mask, MASK);
  assert.deepEqual(u.dots.map((d) => d.cls), ['dd is-set', 'dd is-none', 'dd is-none', 'dd is-none'], 'Local reads set where it is set');
  assert.equal(u.dots[0].title, 'local: set');
  assert.deepEqual([u.canDeclare, u.canAdd, u.canSync, u.canReplace], [true, false, false, false]);
  assert.ok(!rows[0].canDeclare && !rows[1].canDeclare, 'a declared row offers no Declare');
  const ws = vaultRows({ secrets: [{ name: 'X_KEY', declared: false, set: true, rings: ['workspace'], destinations: [] }] })[0];
  assert.equal(ws.for, 'in .env.workspace, not in the manifest');
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/screens/Vault.jsx', import.meta.url), 'utf8');
  assert.match(src, /server\.startManifest\(\{ fromEnv: true, names: \[name\] \}\)/, 'Declare writes through the manifest route, names only');
  assert.match(src, /r\.canDeclare \? <button[^\n]*>Declare<\/button>/);
});

test('49.6: an optional secret that is not set reads "optional · not set", with no missing dot anywhere', async () => {
  const { OPTIONAL_UNSET, shownState } = await import('../src/screens/vault/model.js');
  const opt = { name: 'GH_TOKEN', for: 'Optional locally.', chunk: null, declared: true, optional: true, set: false, rings: [], destinations: [{ destination: 'local', state: 'missing' }, { destination: 'github-actions', state: 'not pushed' }], setAt: null, age: null, rotate: false };
  const st = { ...STATUS, requests: [], secrets: [opt] };
  const [r] = vaultRows(st, { now: NOW });
  assert.equal(OPTIONAL_UNSET, 'optional · not set');
  assert.equal(r.mask, 'optional · not set');
  assert.equal(r.age, '', 'no "never set" for an optional secret');
  assert.deepEqual(r.dots.map((d) => d.cls), ['dd is-none', 'dd is-none', 'dd is-none', 'dd is-none'], 'no missing dot');
  assert.equal(r.dots[0].title, 'local: optional · not set');
  assert.equal(r.canAdd, true, 'a value can still be added');
  assert.ok(destRows(st).every((g) => !/missing/.test(g.count) && g.dot !== 'dd is-missing'), 'Where values go warns of nothing');
  assert.equal(shownState({ ...opt, optional: false }, 'local'), 'missing', 'a required one still reads missing');
  const set = vaultRows({ ...st, secrets: [{ ...opt, set: true, rings: ['local'], destinations: [{ destination: 'local', state: 'set' }] }] }, { now: NOW })[0];
  assert.equal(set.mask, MASK);
});

test('49.5: the Actions column follows what GitHub lists; unknown when gh cannot tell, never missing', async () => {
  const actionsAt = (remote, extra = {}) => ({ name: 'ACTIONS_PAT', declared: true, set: false, rings: [], destinations: [{ destination: 'github-actions', state: 'not pushed', remote, ...extra }] });
  assert.equal(destState(actionsAt('set'), 'github-actions'), 'set', 'listed by gh: set, though the vault never pushed it');
  assert.equal(destState(actionsAt('not set'), 'github-actions'), 'missing');
  assert.equal(destState(actionsAt('unknown'), 'github-actions'), 'unknown');
  assert.equal(destState(actionsAt('unknown', { state: 'pushed' }), 'github-actions'), 'unknown', 'gh is what says; the audit log records pushes');
  assert.equal(destState(actionsAt('set', { state: 'pushed', stale: true }), 'github-actions'), 'stale', 'listed, but the vault value is newer');
  assert.equal(destState({ destinations: [{ destination: 'github-actions', state: 'pushed' }] }, 'github-actions'), 'set', 'an older kit: the audit log says');
  const st = { secrets: [actionsAt('unknown'), { ...actionsAt('set'), name: 'B_TOKEN' }] };
  const [u] = vaultRows(st, { now: NOW });
  assert.equal(u.dots[1].cls, 'dd is-unknown');
  assert.equal(u.dots[1].title, 'Actions: unknown (gh can\'t tell)');
  const g = destRows(st).find((x) => x.d === 'github-actions');
  assert.equal(g.count, '1 set · 1 unknown');
  assert.equal(g.dot, 'dd is-unknown');
  const fs = await import('node:fs');
  assert.match(fs.readFileSync(new URL('../src/styles/vault-truth.css', import.meta.url), 'utf8'), /\.dd\.is-unknown \{[^}]*dashed var\(--text-3\)/, 'a muted dashed ring, theme tokens only');
  assert.match(fs.readFileSync(new URL('../src/screens/Vault.jsx', import.meta.url), 'utf8'), /dd is-unknown" \/>unknown: gh can&apos;t tell/);
});

test('49.6 follow-up: an optional secret not set reads in the muted tone, never the warning colour', async () => {
  const fs = await import('node:fs');
  const opt = { name: 'GH_TOKEN', declared: true, optional: true, set: false, rings: [], destinations: [{ destination: 'local', state: 'missing' }] };
  const [r] = vaultRows({ secrets: [opt] }, { now: NOW });
  assert.equal(r.maskTone, 'quiet');
  assert.deepEqual(r.dots.map((d) => d.cls), ['dd is-none', 'dd is-none', 'dd is-none', 'dd is-none'], 'no dot');
  assert.equal(vaultRows({ secrets: [{ ...opt, optional: false }] }, { now: NOW })[0].maskTone, 'empty', 'a required one still warns');
  assert.equal(vaultRows(STATUS, { now: NOW })[1].maskTone, '', 'a set value: the dots');
  const src = fs.readFileSync(new URL('../src/screens/Vault.jsx', import.meta.url), 'utf8');
  assert.match(src, /cx\('mask', r\.maskTone && 'is-empty', r\.maskTone === 'quiet' && 'is-quiet'\)/);
  const css = fs.readFileSync(new URL('../src/styles/vault-truth.css', import.meta.url), 'utf8');
  assert.match(css, /\.mask\.is-empty\.is-quiet \{ color: var\(--text-3\); \}/);
});

test('49.5 follow-up: a name held where it lives reads "in GitHub Actions" (muted), its age from GitHub, and Replace', async () => {
  const { heldRemotely } = await import('../src/screens/vault/model.js');
  const pat = { name: 'ACTIONS_PAT', for: 'The cloud loop.', declared: true, set: false, rings: [], destinations: [{ destination: 'github-actions', state: 'not pushed', remote: 'set', remoteAt: day(3) }] };
  assert.deepEqual(heldRemotely(pat), { places: ['GitHub Actions'], at: day(3) });
  const [r] = vaultRows({ secrets: [pat] }, { now: NOW });
  assert.equal(r.mask, 'in GitHub Actions');
  assert.equal(r.maskTone, 'quiet');
  assert.equal(r.age, '3 days ago', 'like other rotation dates');
  assert.deepEqual([r.canAdd, r.canReplace, r.canSync], [false, true, false]);
  assert.deepEqual(r.pushTo, ['github-actions'], 'Replace pushes where it lives');
  assert.equal(r.dots[1].cls, 'dd is-set');
  assert.equal(heldRemotely({ ...pat, destinations: [{ ...pat.destinations[0], remote: 'unknown' }] }), null, 'gh cannot tell: not held');
  assert.equal(heldRemotely({ ...pat, destinations: [...pat.destinations, { destination: 'local', state: 'missing' }] }), null, 'a local place it lacks');
  assert.equal(vaultRows({ secrets: [{ ...pat, destinations: [{ ...pat.destinations[0], remoteAt: undefined }] }] }, { now: NOW })[0].age, '', 'no date: nothing made up');
});
