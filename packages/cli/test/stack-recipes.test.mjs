// The stack hand-off's registry (shared/stack/*): every value has a name, a known shape and a secret flag; a secret
// never gets a public name; links go to the service's own console; the milestones form a graph with no cycle; and
// each shape takes its example and refuses the obvious wrong ones without ever echoing the value.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SERVICES, MILESTONES, CONSOLE_HOSTS, ORDER, ACTIONS, aliasesOf, milestonesFor, fillTemplate, recipeFor, valueOf } from '../shared/stack/recipes.mjs';
import { SHAPES, PUBLIC_NAME, checkShape, normalize, publicSafe } from '../shared/stack/shapes.mjs';
import { FRAMEWORKS, detectFramework, envNamesFor } from '../shared/stack/frameworks.mjs';
import { looksOf } from '../server/secrets.mjs';

test('every service has a role, steps, and values with a name, a known shape and a secret flag', () => {
  for (const id of ORDER) {
    const s = SERVICES[id];
    assert.equal(s.id, id);
    assert.ok(s.name && s.role && s.why && /^[A-Z]{2}$/.test(s.mono), `${id}: name, role, why, a two-letter monogram`);
    assert.ok(s.steps.length >= 1, `${id}: at least one step`);
    for (const v of s.values) {
      assert.ok(v.key && v.label, `${id}: a value with a key and label`);
      assert.ok(v.env && (v.env.server || v.env.public), `${id}.${v.key}: an env name`);
      assert.equal(typeof v.secret, 'boolean', `${id}.${v.key}: a secret flag`);
      assert.ok(v.shape in SHAPES, `${id}.${v.key}: a known shape (${v.shape})`);
      for (const n of [v.env.server, v.env.public].filter(Boolean)) assert.match(n, /^[A-Z][A-Z0-9_]*$/);
    }
    for (const a of s.actions) assert.ok(ACTIONS[a], `${id}: a known action ${a}`);
  }
});

test('a secret value has no public name, and its server name is not public (PUBLIC_NAME and looksOf agree)', () => {
  for (const s of Object.values(SERVICES)) {
    for (const v of s.values.filter((x) => x.secret)) {
      assert.equal(v.env.public, undefined, `${s.id}.${v.key} is secret: no public name`);
      assert.doesNotMatch(v.env.server, PUBLIC_NAME);
      assert.notEqual(looksOf(v.env.server, 'sb_secret_TESTONLYxxxxxxxxxxxx'), 'public', `${v.env.server} does not look public to the vault`);
      for (const fw of FRAMEWORKS) {
        for (const n of envNamesFor(v, fw)) assert.ok(publicSafe(n, true), `${s.id}.${v.key} in ${fw.id}: ${n}`);
      }
    }
  }
});

test('PUBLIC_NAME is the same regex server/secrets.mjs uses', () => {
  const src = fs.readFileSync(new URL('../server/secrets.mjs', import.meta.url), 'utf8');
  const m = /const PUBLIC_NAME = (\/.*\/);/.exec(src);
  assert.ok(m, 'server/secrets.mjs defines PUBLIC_NAME');
  assert.equal(m[1], String(PUBLIC_NAME));
});

test('step links are https on the service\'s own console hosts', () => {
  for (const s of Object.values(SERVICES)) {
    const links = [...s.steps.map((x) => x.link), s.token?.create, ...s.values.map((v) => v.where)].filter(Boolean);
    for (const l of links) {
      const u = new URL(l.href);
      assert.equal(u.protocol, 'https:', l.href);
      assert.ok(CONSOLE_HOSTS[s.id].includes(u.host), `${s.id}: ${u.host}`);
      assert.ok(l.label, `${l.href} has a label`);
    }
  }
});

test('milestones name real services and steps, and their after lists have no cycle', () => {
  const ids = new Set(MILESTONES.map((m) => m.id));
  for (const m of MILESTONES) {
    assert.ok(SERVICES[m.service], m.id);
    for (const a of m.after) assert.ok(ids.has(a), `${m.id} after ${a}`);
    const tick = /^tick:(.+)$/.exec(m.done);
    if (tick) assert.ok(Object.values(SERVICES).some((s) => s.steps.some((x) => x.id === tick[1] && x.tick)), `${m.done} is a tick step`);
    const act = /^action:(.+)$/.exec(m.done);
    if (act) assert.ok(ACTIONS[act[1]], m.done);
  }
  const by = new Map(MILESTONES.map((m) => [m.id, m]));
  const seen = new Set();
  const visit = (id, path = []) => {
    assert.ok(!path.includes(id), `cycle: ${[...path, id].join(' -> ')}`);
    if (seen.has(id)) return;
    for (const a of by.get(id).after) visit(a, [...path, id]);
    seen.add(id);
  };
  for (const m of MILESTONES) visit(m.id);
});

test('milestones drop out with their services; sign-in falls back to after host', () => {
  assert.equal(milestonesFor(['cloudflare', 'supabase', 'vercel']).length, 8);
  const two = milestonesFor(['supabase', 'vercel']);
  assert.deepEqual(two.map((m) => m.id), ['db', 'host', 'env', 'auth']);
  assert.deepEqual(two.find((m) => m.id === 'auth').after, ['host']);
  assert.deepEqual(milestonesFor(['supabase']).map((m) => m.id), ['db', 'auth']);
});

test('aliases: the legacy names a repo may already read', () => {
  assert.deepEqual(aliasesOf('SUPABASE_SECRET_KEY'), ['SUPABASE_SERVICE_ROLE_KEY']);
  assert.deepEqual(aliasesOf('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), ['NEXT_PUBLIC_SUPABASE_ANON_KEY']);
  assert.deepEqual(aliasesOf('DATABASE_URL'), ['POSTGRES_URL']);
  assert.deepEqual(aliasesOf('VERCEL_TOKEN'), []);
});

test('templates fill from the context, and read as plain words when it is empty', () => {
  assert.equal(fillTemplate('Add {domain} and www.{domain}', { domain: 'fieldday.dev' }), 'Add fieldday.dev and www.fieldday.dev');
  assert.equal(fillTemplate('https://*-{team}.vercel.app/**', {}), 'https://*-your-team.vercel.app/**');
  assert.match(recipeFor('supabase', 'secret'), /server only/);
  assert.equal(valueOf('vercel', 'nope'), null);
});

test('frameworks: detection order and env names', () => {
  assert.equal(detectFramework({ dependencies: { next: '15', react: '19' } }), 'next');
  assert.equal(detectFramework({ devDependencies: { vite: '8', '@sveltejs/kit': '2' } }), 'sveltekit');
  assert.equal(detectFramework({ dependencies: { express: '5' } }), 'node');
  const url = valueOf('supabase', 'url');
  assert.deepEqual(envNamesFor(url, 'next'), ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL']);
  assert.deepEqual(envNamesFor(url, 'vite'), ['VITE_SUPABASE_URL', 'SUPABASE_URL']);
  assert.deepEqual(envNamesFor(url, 'sveltekit'), ['PUBLIC_SUPABASE_URL', 'SUPABASE_URL']);
  assert.deepEqual(envNamesFor(url, 'node'), ['SUPABASE_URL']);
  assert.deepEqual(envNamesFor(url, 'remix'), ['SUPABASE_URL']);
  assert.deepEqual(envNamesFor(valueOf('supabase', 'secret'), 'next'), ['SUPABASE_SECRET_KEY']);
  // A hand-made secret with a public base still never gets one.
  assert.deepEqual(envNamesFor({ secret: true, env: { public: 'X', server: 'X_SERVER' } }, 'vite'), ['X_SERVER']);
});

// Test values only, obviously fake.
const EXAMPLES = {
  hostname: 'fieldday.dev',
  cloudflareToken: 'cfut_TESTONLYdemo0000000000000000',
  hex32: '0123456789abcdef0123456789abcdef',
  supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
  supabaseRef: 'abcdefghijklmnopqrst',
  supabasePublishable: 'sb_publishable_TESTONLYdemo0000',
  supabaseSecret: 'sb_secret_TESTONLYdemo00000000',
  postgresUrl: 'postgresql://postgres.abcdefghijklmnopqrst:TESTONLYpw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres',
  supabasePat: 'sbp_TESTONLYdemo0000000000000000',
  vercelToken: 'vcp_TESTONLYdemo00000000000',
  vercelTeam: 'team_TESTONLYdemo0000',
  vercelProject: 'prj_TESTONLYdemo0000',
};

test('each shape accepts its example', () => {
  for (const [id, v] of Object.entries(EXAMPLES)) {
    const r = checkShape(id, v);
    assert.ok(r.ok, `${id}: ${JSON.stringify(r)}`);
  }
  assert.deepEqual(Object.keys(EXAMPLES).sort(), Object.keys(SHAPES).sort(), 'every shape has an example here');
});

test('shapes refuse the obvious wrong ones, and never echo the value', () => {
  const bad = [
    ['supabasePublishable', EXAMPLES.supabaseSecret, /secret key/],
    ['supabaseSecret', EXAMPLES.supabasePublishable, /publishable key/],
    ['postgresUrl', 'postgresql://postgres.x:[YOUR-PASSWORD]@aws-0-eu.pooler.supabase.com:6543/postgres', /\[YOUR-PASSWORD\]/],
    ['hostname', 'www.fieldday.dev', /bare domain/],
    ['cloudflareToken', `${EXAMPLES.cloudflareToken}\nmore`, /one line/],
    ['vercelProject', 'project-name', /prj_/],
    ['hex32', 'XYZ', /32-character/],
  ];
  for (const [id, v, why] of bad) {
    const r = checkShape(id, v);
    assert.equal(r.ok, false, `${id} refuses`);
    assert.equal(r.kind, 'bad');
    assert.match(r.why, why);
    if (v.includes('TESTONLY')) assert.ok(!JSON.stringify(r).includes('TESTONLY'), 'the answer carries no piece of the value');
  }
});

test('legacy and warn shapes pass with a note', () => {
  assert.equal(checkShape('supabasePublishable', 'eyJhbGciOi.eyJyb2xlIjoiYW5vbiJ9.TESTONLYsig').kind, 'legacy');
  assert.equal(checkShape('cloudflareToken', 'A'.repeat(40)).kind, 'legacy');
  assert.equal(checkShape('vercelTeam', 'a1b2c3d4e5f6g7h8').kind, 'legacy');
  const direct = checkShape('postgresUrl', 'postgresql://postgres:TESTONLYpw@db.abcdefghijklmnopqrst.supabase.co:5432/postgres');
  assert.equal(direct.kind, 'warn');
  assert.match(direct.note, /IPv6/);
  assert.match(checkShape('postgresUrl', EXAMPLES.postgresUrl).note, /pgbouncer/);
  assert.equal(checkShape('supabaseUrl', 'https://db.fieldday.dev').kind, 'warn');
  assert.equal(normalize('hostname', ' https://FieldDay.dev/ '), 'fieldday.dev');
  assert.ok(checkShape('hostname', 'https://FieldDay.dev/').ok);
});

test('publicSafe: a secret under a public prefix is the one thing refused', () => {
  assert.equal(publicSafe('NEXT_PUBLIC_SUPABASE_SECRET_KEY', true), false);
  assert.equal(publicSafe('VITE_DATABASE_URL', true), false);
  assert.equal(publicSafe('NEXT_PUBLIC_SUPABASE_URL', false), true);
  assert.equal(publicSafe('SUPABASE_SECRET_KEY', true), true);
});
