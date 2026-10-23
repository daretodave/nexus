// The stack hand-off's view model (src/screens/vault/stack/model.js): progress and the one next action across the
// trinity, card states, value rows, the names still missing, template fill, the save body and paste-many. Pure
// functions over GET /api/stack fixtures; no value is ever kept or returned.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  progress, nextAction, cardState, cardHead, valueRow, missing, saveBody, matchPaste, stepStates, envChips, writtenLine, joinList, shortId, openCard, ctxOf, valueOf,
} from '../src/screens/vault/stack/model.js';
import { fillTemplate } from '../shared/stack/recipes.mjs';

const T = [{ id: 'vault', label: '.env (the vault)', on: true, locked: true }, { id: 'app', label: 'apps/web/.env.local', on: true }];
const NAMES = {
  'supabase.url': ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'], 'supabase.publishable': ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY'],
  'supabase.secret': ['SUPABASE_SECRET_KEY'], 'supabase.dbUrl': ['DATABASE_URL'], 'supabase.ref': ['SUPABASE_PROJECT_REF'], 'supabase.pat': ['SUPABASE_ACCESS_TOKEN'],
  'cloudflare.apiToken': ['CLOUDFLARE_API_TOKEN'], 'cloudflare.zoneId': ['CLOUDFLARE_ZONE_ID'], 'cloudflare.accountId': ['CLOUDFLARE_ACCOUNT_ID'],
  'vercel.token': ['VERCEL_TOKEN'], 'vercel.teamId': ['VERCEL_ORG_ID'], 'vercel.projectId': ['VERCEL_PROJECT_ID'],
};

/** A GET /api/stack fixture with the given values saved. */
function stack({ picked = ['cloudflare', 'supabase', 'vercel'], saved = [], checks = {}, actions = {}, ticks = {}, domain = 'fieldday.dev', drift = [] } = {}) {
  const values = {};
  const names = {};
  for (const [k, ns] of Object.entries(NAMES)) {
    if (!picked.includes(k.split('.')[0])) continue;
    const on = saved.includes(k);
    values[k] = { names: ns, saved: on };
    for (const n of ns) names[n] = { service: k.split('.')[0], key: k.split('.')[1], vault: on, app: on, drift: drift.includes(n) };
  }
  return { picked, inputs: { domain }, app: { dir: 'apps/web', framework: 'next' }, targets: T, values, names, checks, actions, ticks };
}
const SB = ['supabase.url', 'supabase.publishable', 'supabase.secret', 'supabase.dbUrl'];
const VC = ['vercel.token', 'vercel.teamId', 'vercel.projectId'];
const CF = ['cloudflare.apiToken', 'cloudflare.zoneId'];
const pending = { cloudflare: { ok: true, facts: { zone: true, active: false, nameServers: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'] } } };
const active = { cloudflare: { ok: true, facts: { zone: true, active: true } } };

test('a fresh trinity: zone, db and host are ready; the first next action is the slow one', () => {
  const s = stack();
  const p = progress(s);
  assert.equal(p.total, 8);
  assert.deepEqual(p.milestones.map((m) => [m.id, m.state]), [['zone', 'ready'], ['db', 'ready'], ['host', 'ready'], ['env', 'blocked'], ['domain', 'blocked'], ['dns', 'blocked'], ['auth', 'blocked'], ['live', 'blocked']]);
  const n = nextAction(p, s);
  assert.equal(n.milestone, 'zone');
  assert.equal(n.text, 'Add fieldday.dev to Cloudflare and change the nameservers. It is the slow one, so start here.');
  assert.equal(p.milestones.find((m) => m.id === 'env').note, 'after Supabase keys saved');
});

test('while the zone is pending, the keys and the env stay actionable', () => {
  const s = stack({ saved: [...CF, ...SB, ...VC], checks: pending });
  const p = progress(s);
  const st = Object.fromEntries(p.milestones.map((m) => [m.id, m.state]));
  assert.equal(st.zone, 'waiting');
  assert.equal(st.db, 'done');
  assert.equal(st.host, 'done');
  assert.equal(st.env, 'ready');
  assert.equal(st.domain, 'ready', 'a waiting zone does not hold up adding the domain');
  const n = nextAction(p, s);
  assert.equal(n.milestone, 'env');
  assert.equal(n.text, 'Send the 4 Supabase values to Vercel.');
  assert.equal(n.cta, 'Send to Vercel');
  assert.equal(n.action, 'vercel.env');
  assert.equal(cardState('cloudflare', s), 'waiting');
  assert.equal(cardHead('cloudflare', s), 'Waiting on nameservers');
});

test('next action order through to done, and the waiting line', () => {
  const base = { saved: [...CF, ...SB, ...VC], checks: active };
  assert.equal(nextAction(progress(stack({ ...base, actions: { 'vercel.env': { ok: true } } })), stack(base)).milestone, 'domain');
  const dns = stack({ ...base, actions: { 'vercel.env': { ok: true }, 'vercel.domain': { ok: true } } });
  assert.deepEqual([nextAction(progress(dns), dns).milestone, nextAction(progress(dns), dns).cta], ['dns', 'Write the records']);
  const auth = stack({ ...base, actions: { 'vercel.env': { ok: true }, 'vercel.domain': { ok: true }, 'cloudflare.dns': { ok: true } } });
  assert.equal(nextAction(progress(auth), auth).milestone, 'auth');
  const live = stack({ ...base, actions: { 'vercel.env': { ok: true }, 'vercel.domain': { ok: true }, 'cloudflare.dns': { ok: true } }, ticks: { 'sb.auth': true } });
  const ln = nextAction(progress(live), live);
  assert.equal(ln.milestone, 'live');
  assert.equal(ln.check, 'vercel');
  const all = stack({ ...base, checks: { ...active, vercel: { ok: true, facts: { domainOk: true } } }, actions: { 'vercel.env': { ok: true }, 'vercel.domain': { ok: true }, 'cloudflare.dns': { ok: true } }, ticks: { 'sb.auth': true } });
  const done = nextAction(progress(all), all);
  assert.equal(done.kind, 'done');
  assert.equal(done.text, 'Your stack is set. Push to main and Vercel builds it.');
  assert.equal(progress(all).done, 8);
  for (const svc of ['cloudflare', 'supabase', 'vercel']) assert.equal(cardState(svc, all), 'done');
  const onlyWait = stack({ picked: ['cloudflare'], saved: CF, checks: pending });
  assert.equal(nextAction(progress(onlyWait), onlyWait).text, 'Waiting on nameservers. Nothing else to do right now.');
});

test('two services: the domain milestones drop out and sign-in follows the project', () => {
  const s = stack({ picked: ['supabase', 'vercel'], saved: [...SB, ...VC], actions: { 'vercel.env': { ok: true } } });
  const p = progress(s);
  assert.deepEqual(p.milestones.map((m) => m.id), ['db', 'host', 'env', 'auth']);
  const n = nextAction(p, s);
  assert.equal(n.milestone, 'auth');
  assert.equal(n.text, 'Tell Supabase sign-in about your vercel.app URL.');
});

test('card states for each fixture', () => {
  assert.equal(cardState('supabase', stack()), 'not-started');
  assert.equal(cardHead('supabase', stack()), 'Start');
  const some = stack({ saved: ['supabase.url', 'supabase.publishable'] });
  assert.equal(cardState('supabase', some), 'in-progress');
  assert.equal(cardHead('supabase', some), '2 of 4 saved');
  assert.equal(cardState('supabase', stack({ saved: SB, checks: { supabase: { ok: true, facts: {} } } })), 'checked');
  assert.equal(cardState('vercel', stack({ saved: ['vercel.token'], checks: { vercel: { ok: false, reason: 'x' } } })), 'check-failed');
});

test('value rows: env names with their chips, the phases, and a saved line by place', () => {
  const s = stack({ saved: ['supabase.url'] });
  const url = valueRow('supabase', valueOf('supabase', 'url'), s);
  assert.deepEqual(url.names, ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL']);
  assert.deepEqual(url.chips.map((c) => [c.name, c.public]), [['NEXT_PUBLIC_SUPABASE_URL', true], ['SUPABASE_URL', false]]);
  assert.equal(url.phase, 'saved');
  assert.equal(url.note, 'Written to .env and apps/web/.env.local');
  assert.equal(writtenLine(url.names, s, [{ destination: 'github-actions', ok: true }]), 'Written to .env, apps/web/.env.local and Actions');
  const secret = valueOf('supabase', 'secret');
  assert.equal(valueRow('supabase', secret, s).phase, 'empty');
  const bad = valueRow('supabase', secret, s, { paste: 'sb_publishable_TESTONLYxx0000' });
  assert.deepEqual([bad.phase, bad.canSave], ['typed-bad', false]);
  assert.match(bad.note, /publishable key/);
  const good = valueRow('supabase', secret, s, { paste: 'sb_secret_TESTONLYxx00000000' });
  assert.deepEqual([good.phase, good.note, good.canSave], ['typed-ok', 'Looks right.', true]);
  assert.ok(!JSON.stringify(good).includes('TESTONLY'), 'a row never carries the paste');
  assert.equal(valueRow('supabase', secret, s, { busy: true, paste: 'x' }).phase, 'saving');
  assert.equal(valueRow('supabase', secret, s, { error: 'refused' }).note, 'refused');
  const drift = valueRow('supabase', valueOf('supabase', 'url'), stack({ saved: ['supabase.url'], drift: ['NEXT_PUBLIC_SUPABASE_URL'] }));
  assert.equal(drift.phase, 'drift');
  assert.equal(drift.note, 'apps/web/.env.local has a different value than the vault.');
  assert.equal(valueRow('supabase', valueOf('supabase', 'ref'), s).readOnly, true);
  const found = valueRow('cloudflare', valueOf('cloudflare', 'zoneId'), stack({ checks: { cloudflare: { ok: true, fill: { zoneId: '0123456789abcdef0123456789abcdef' }, facts: {} } } }));
  assert.equal(found.found, '0123456789abcdef0123456789abcdef');
  assert.equal(shortId(found.found), '0123…cdef');
  assert.deepEqual(envChips(['VITE_X']).map((c) => c.title), ['Ships to the browser']);
});

test('steps: done by values, facts, ticks and actions; the first open one is ready; the nameservers wait', () => {
  const st = stepStates('cloudflare', stack({ saved: ['cloudflare.apiToken'], checks: pending }));
  assert.deepEqual(st.map((x) => [x.id, x.state]), [['cf.add', 'done'], ['cf.dnssec', 'ready'], ['cf.ns', 'waiting'], ['cf.token', 'done'], ['cf.ids', 'todo']]);
  const v = stepStates('vercel', stack({ saved: VC, checks: { vercel: { ok: true, facts: { projects: [{ id: 'p', name: 'w' }] } } }, actions: { 'vercel.env': { ok: true } } }));
  assert.deepEqual(v.map((x) => x.state), ['done', 'done', 'done', 'done', 'ready', 'todo']);
});

test('missing: the names still unset across the picked services', () => {
  const m = missing(stack({ picked: ['supabase', 'vercel'], saved: ['supabase.url', 'supabase.publishable', 'vercel.token'] }));
  assert.deepEqual(m.map((x) => x.name), ['SUPABASE_SECRET_KEY', 'DATABASE_URL', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID']);
  assert.deepEqual(missing(stack({ picked: [] })), []);
});

test('template fill, the save body, the open card, a list in plain English', () => {
  assert.equal(fillTemplate('http://localhost:{port}/**', ctxOf(stack())), 'http://localhost:3000/**');
  assert.deepEqual(saveBody('cloudflare', 'apiToken', '  cfut_TESTONLYbody000000000000000 ', { app: false }), { service: 'cloudflare', key: 'apiToken', value: 'cfut_TESTONLYbody000000000000000', targets: { app: false } });
  assert.equal(saveBody('cloudflare', 'zoneId', 'X').value, 'X');
  assert.equal(joinList(['a', 'b', 'c']), 'a, b and c');
  const s = stack({ saved: [...CF], checks: pending });
  assert.equal(openCard(s, nextAction(progress(s), s)), 'supabase');
});

test('paste-many: Supabase\'s Connect lines matched by name, then by shape; one line is not a batch', () => {
  const text = [
    'NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TESTONLYpaste00',
    '# server',
    'SUPABASE_SERVICE_ROLE_KEY="sb_secret_TESTONLYpaste0000000"',
    'postgresql://postgres.abcdefghijklmnopqrst:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres',
  ].join('\n');
  assert.deepEqual(matchPaste(text).map((m) => m.key), ['url', 'publishable', 'secret', 'dbUrl']);
  assert.deepEqual(matchPaste('NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co'), []);
  // A secret pasted under a publishable name does not land in the publishable field.
  assert.deepEqual(matchPaste('SUPABASE_PUBLISHABLE_KEY=sb_secret_TESTONLYpaste0000000\nX=1').map((m) => m.key), []);
});
