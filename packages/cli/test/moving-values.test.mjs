// Moving values (0.5.2): the stack guide teaches both directions per service, a request that knows its stack service
// opens that card and its save pushes to each place it named, Send to Vercel sends every picked service's values the
// app reads, and each push (a session's, the GUI's) lands on the change feed by name, place and environment, never a
// value. The kit's sinks (scripts/secrets-sinks.mjs) have their own tests in templates/scripts/__tests__.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openVault, upsertEnv, parseEnv } from '../../../templates/scripts/secrets-vault.mjs';
import { SINKS } from '../../../templates/scripts/secrets-sinks.mjs';
import { DESTINATIONS as MANIFEST_DESTINATIONS } from '../../../templates/scripts/plan/secrets-manifest.mjs';
import { DEST_ORDER, DESTINATIONS, appReads, placesFor, recipeOfName, hostDests } from '../shared/stack/moves.mjs';
import { renderGuide, movingValues } from '../shared/stack/guide.mjs';
import { SERVICES, milestonesFor } from '../shared/stack/recipes.mjs';
import { createStack } from '../server/stack.mjs';
import { parseRequest } from '../server/secrets.mjs';
import { createSecretsWatch, pushEventOf, whoPushed, AUDIT_FILE } from '../server/feed-secrets.mjs';
import { createChangeFeed } from '../server/feed.mjs';
import { createDemoVault, DEMO_STACK_REQUEST } from '../server/demo/vault.mjs';
import { createDemoStack } from '../server/demo/stack.mjs';
import { fromDurable, stackLink, stackAsk } from '../src/screens/headsdown-inbox/inboxModel.js';
import { destsIn, destRows, LABEL } from '../src/screens/vault/model.js';
import { tickerText } from '../src/ui/change-feed.js';
import { EXAMPLES } from './helpers/stack-examples.mjs';
import { removeTreeSync } from './helpers/tmp.mjs';

const dirs = [];
test.after(() => removeTreeSync(dirs));
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-move-')); dirs.push(d); return d; };

test('the GUI knows every place the kit can push to, by the same ids, and the manifest takes each one', () => {
  assert.deepEqual(DEST_ORDER, Object.keys(SINKS));
  assert.deepEqual(['local', ...DEST_ORDER], MANIFEST_DESTINATIONS);
  for (const d of DEST_ORDER) {
    assert.ok(DESTINATIONS[d].label && DESTINATIONS[d].what, d);
    const check = DESTINATIONS[d].verify('A_NAME');
    if (!/^the /.test(check)) assert.ok(!/env:list|env pull|secrets:access|get-secret-value|get-parameter|versions access|secret show/.test(check), `${d}: the check never prints a value (${check})`);
  }
});

test('which values the running app reads: not a host\'s own token, not a tool-only key', () => {
  assert.equal(appReads('stripe', 'secret'), true);
  assert.equal(appReads('supabase', 'dbUrl'), true);
  assert.equal(appReads('vercel', 'token'), false, 'a host\'s own token');
  assert.equal(appReads('supabase', 'pat'), false, 'the CLI\'s token');
  assert.equal(appReads('neon', 'apiKey'), false, 'an admin key');
  assert.equal(appReads('nope', 'x'), false);
  assert.deepEqual(hostDests(['stripe', 'vercel', 'fly', 'cloudflare']), ['vercel', 'fly'], 'next to a host, Cloudflare holds DNS');
  assert.deepEqual(hostDests(['stripe', 'cloudflare']), ['cloudflare'], 'alone, it runs the app on Workers');
  assert.deepEqual(placesFor('stripe', 'secret', 'STRIPE_SECRET_KEY', ['stripe', 'vercel']), ['vercel']);
  assert.deepEqual(placesFor('stripe', 'secret', 'STRIPE_SECRET_KEY', ['stripe', 'aws']), ['aws-secrets-manager', 'aws-ssm'], 'no host: the picked secret stores');
  assert.deepEqual(placesFor('vercel', 'token', 'VERCEL_TOKEN', ['vercel']), ['github-actions'], 'a CI name goes to Actions only');
  assert.deepEqual(recipeOfName('STRIPE_SECRET_KEY'), { service: 'stripe', key: 'secret' });
  assert.deepEqual(recipeOfName('STRIPE_API_KEY'), { service: 'stripe', key: 'secret' }, 'an alias');
  assert.deepEqual(recipeOfName('NEXT_PUBLIC_SUPABASE_URL'), { service: 'supabase', key: 'url' }, 'a framework prefix');
  assert.equal(recipeOfName('MY_OWN_KEY'), null);
});

test('the guide teaches both directions: the rule up top, then per service where it goes, the push, the check, the ask', () => {
  const g = renderGuide({ picked: ['stripe', 'vercel', 'fly'], app: { framework: 'next' } });
  assert.match(g, /Values move two ways, and a session handles names in both/);
  assert.match(g, /\*\*In\.\*\* Missing a value\? File the ask: `node scripts\/secrets\.mjs request <chunk>/);
  assert.match(g, /Never ask for a value in chat, never read one, never guess or make one up\./);
  const stripe = g.slice(g.indexOf('### Stripe'));
  assert.match(stripe, /\*\*Moving values\.\*\*/);
  assert.match(stripe, /To Vercel \(project environment variables\): .*`STRIPE_SECRET_KEY`/);
  assert.match(stripe, /Declare `"vercel"` in each one's `destinations` in `nexus\.secrets\.json`/);
  assert.match(stripe, /node scripts\/secrets\.mjs push STRIPE_SECRET_KEY --to vercel\n/);
  assert.match(stripe, /node scripts\/secrets\.mjs push STRIPE_SECRET_KEY --to fly\n/);
  assert.match(stripe, /Confirm it landed: `vercel env ls` \(names only\)\./);
  assert.match(stripe, /Confirm it landed: `fly secrets list` \(names only\)\./);
  assert.match(stripe, /Missing one: `node scripts\/secrets\.mjs request <chunk> --to vercel,fly --service stripe`/);
  const alone = movingValues('stripe', SERVICES.stripe, ['stripe'], (v) => [v.env.server].filter(Boolean)).join('\n');
  assert.match(alone, /These stay in the vault: nothing picked runs code that reads them\./);
  assert.match(alone, /request <chunk> --service stripe/);
  const azure = renderGuide({ picked: ['azure', 'resend'], app: { framework: 'node' } });
  assert.match(azure, /push RESEND_API_KEY --to azure-key-vault --vault <vault>/);
  assert.ok(!/sk_live|rk_live|whsec_[A-Za-z0-9]{6}/.test(g), 'names only');
});

test('a request names where its value goes and its service; an older one finds its service by the name', () => {
  const r = parseRequest('secret request 15.5: set STRIPE_SECRET_KEY in your terminal or the GUI\'s vault (never in a session), and 15.5 is ready again. It goes to vercel, fly once it is set; it is a stripe value, so the GUI opens its card in Set up a stack (stack: stripe). Then delete this row.');
  assert.deepEqual(r, { chunk: '15.5', names: ['STRIPE_SECRET_KEY'], to: ['vercel', 'fly'], service: 'stripe', serviceName: 'Stripe' });
  assert.deepEqual(parseRequest('secret request 9.1: set SMTP_PASSWORD in your terminal'), { chunk: '9.1', names: ['SMTP_PASSWORD'], to: [] }, 'no recipe writes it: the key card answers it');
  assert.equal(parseRequest('secret request 9.1: set X_KEY. It goes to heroku once it is set (stack: nope)').service, undefined, 'an unknown place or service is dropped');
});

test('Oversight\'s Add value goes to the stack card, the field named, and the Vault reads the URL back', () => {
  const [item] = fromDurable([{ id: 'r', file: 'plan/pending/secrets-15.5.md', line: 5, text: DEMO_STACK_REQUEST.durable.text, secret: { ...parseRequest(DEMO_STACK_REQUEST.durable.text), missing: ['STRIPE_SECRET_KEY'] } }]);
  assert.deepEqual(item.stack, { service: 'stripe', name: 'Stripe', key: 'STRIPE_SECRET_KEY', chunk: '15.5', to: ['vercel'] });
  const link = stackLink(item.stack);
  assert.equal(link, '/vault?panel=stack&service=stripe&key=STRIPE_SECRET_KEY&chunk=15.5&to=vercel');
  assert.deepEqual(stackAsk(new URL(`http://x${link}`).searchParams), { service: 'stripe', key: 'STRIPE_SECRET_KEY', chunk: '15.5', to: ['vercel'] });
  assert.equal(stackAsk(new URLSearchParams('panel=stack&service=stripe&key=lower')), null);
  assert.equal(stackAsk(new URLSearchParams('panel=table&service=stripe&key=A')), null);
});

/** The stack server on a temp repo with a fake secrets API: what each save stored and pushed. */
function harness({ sinks = Object.keys(SINKS) } = {}) {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { next: '15' } }));
  const git = () => ({ status: 0, stdout: '' });
  const kit = { openVault: (o) => openVault({ ...o, git }), upsertEnv, parseEnv, localSettings: () => ({}) };
  const stored = [];
  const secrets = {
    status: async () => ({ status: 200, available: true, vaultState: 'ready', owner: true, vault: {}, sinks }),
    store: async (name, b) => {
      stored.push({ name, destinations: b.destinations });
      kit.openVault({ root }).set([[name, b.value]]);
      return { status: 200, ok: true, pushed: (b.destinations || []).map((d) => ({ destination: d, ok: true })) };
    },
  };
  return { root, stored, stack: createStack({ repo: root, root, secrets, kit, git, owner: () => true }) };
}

test('a save that answers a request pushes to each place it named; a place with no sink is refused, names only', async () => {
  const h = harness();
  await h.stack.pick({ picked: ['stripe'] });
  const r = await h.stack.save({ service: 'stripe', key: 'secret', value: EXAMPLES.stripeSecret, request: { chunk: '15.5', to: ['vercel', 'fly'] } });
  assert.equal(r.status, 200, r.error);
  assert.deepEqual(r.request, { chunk: '15.5', to: ['vercel', 'fly'] });
  assert.deepEqual(h.stored.at(-1), { name: 'STRIPE_SECRET_KEY', destinations: ['vercel', 'fly'] });
  assert.deepEqual(r.pushed.map((p) => p.destination), ['vercel', 'fly']);
  assert.ok(!JSON.stringify(r).includes(EXAMPLES.stripeSecret));
  const old = harness({ sinks: ['github-actions', 'vercel', 'cloudflare'] });
  await old.stack.pick({ picked: ['stripe'] });
  const no = await old.stack.save({ service: 'stripe', key: 'secret', value: EXAMPLES.stripeSecret, request: { chunk: '15.5', to: ['fly'] } });
  assert.equal(no.status, 400);
  assert.match(no.error, /no sink for fly/);
  assert.ok(!no.error.includes(EXAMPLES.stripeSecret));
  assert.equal((await old.stack.save({ service: 'stripe', key: 'secret', value: EXAMPLES.stripeSecret, request: { chunk: 'nope' } })).status, 400);
});

test('Send to Vercel sends every picked service\'s values the app reads, not only Supabase\'s', async () => {
  const h = harness();
  await h.stack.pick({ picked: ['vercel', 'stripe', 'resend'] });
  for (const [s, k, v] of [['vercel', 'token', EXAMPLES.vercelToken], ['vercel', 'projectId', EXAMPLES.vercelProject], ['stripe', 'secret', EXAMPLES.stripeSecret], ['resend', 'apiKey', EXAMPLES.resendKey]]) {
    assert.equal((await h.stack.save({ service: s, key: k, value: v })).status, 200);
  }
  const plan = await h.stack.apply('vercel.env', {});
  assert.equal(plan.ok, true, plan.reason);
  assert.match(plan.plan.summary, /STRIPE_SECRET_KEY/);
  assert.match(plan.plan.summary, /RESEND_API_KEY/);
  assert.doesNotMatch(plan.plan.summary, /VERCEL_TOKEN|VERCEL_PROJECT_ID/, 'the host\'s own names stay out');
  assert.ok(milestonesFor(['vercel', 'stripe']).some((m) => m.id === 'env'), 'the send is a step without Supabase too');
  assert.ok(!milestonesFor(['vercel', 'cloudflare']).some((m) => m.id === 'env'), 'nothing to send with hosts alone');
  // A save with Vercel ticked and linked pushes a value the app reads there too.
  const linked = harness();
  fs.mkdirSync(path.join(linked.root, '.vercel'));
  fs.writeFileSync(path.join(linked.root, '.vercel', 'project.json'), '{"projectId":"prj_x","orgId":"team_x"}');
  await linked.stack.pick({ picked: ['vercel', 'stripe'] });
  await linked.stack.save({ service: 'stripe', key: 'secret', value: EXAMPLES.stripeSecret });
  assert.deepEqual(linked.stored.at(-1).destinations, ['vercel']);
  await linked.stack.save({ service: 'vercel', key: 'token', value: EXAMPLES.vercelToken });
  assert.deepEqual(linked.stored.at(-1).destinations, ['github-actions'], 'a host\'s own token goes to CI, never to the host');
});

test('a push becomes one feed event: who, the name, the place and its environments, never anything else', () => {
  const at = '2026-10-23T10:00:00.000Z';
  const ev = pushEventOf({ time: at, action: 'push', name: 'STRIPE_SECRET_KEY', destination: 'cloudflare', environments: ['production'], session: 's-deneb', token: 'fake-not-a-field' }, (id) => (id === 's-deneb' ? 'deneb' : null));
  assert.deepEqual(ev, { id: `secret:${at}:STRIPE_SECRET_KEY:cloudflare`, kind: 'secret-push', at, name: 'STRIPE_SECRET_KEY', destination: 'cloudflare', label: 'Cloudflare', where: 'production', who: { name: 'deneb', kind: 'local', session: 's-deneb' }, line: 'deneb pushed STRIPE_SECRET_KEY to Cloudflare (production)' });
  assert.equal(pushEventOf({ time: at, action: 'push', name: 'A', destination: 'fly', app: 'my-app', via: 'gui' }).line, 'You pushed A to Fly.io (app my-app)');
  assert.equal(pushEventOf({ time: at, action: 'push', name: 'A', destination: 'github-actions' }).line, 'A terminal pushed A to GitHub Actions');
  assert.equal(pushEventOf({ time: at, action: 'set', name: 'A', destination: 'local' }), null, 'a set is not a push');
  assert.equal(pushEventOf({ time: at, action: 'push', name: 'a b', destination: 'fly' }), null);
  assert.equal(pushEventOf({ time: at, action: 'push', name: 'A', destination: 'fly', environments: ['bad value!'] }).line, 'A terminal pushed A to Fly.io');
  assert.deepEqual(whoPushed({ session: 'gone-1' }), { name: 'A session', kind: 'terminal', session: 'gone-1' });
  assert.equal(tickerText(ev), 'deneb pushed STRIPE_SECRET_KEY to Cloudflare (production)');
});

test('the watch reads only what was added: no backlog on the first start, catch-up after a restart, a torn line waits', () => {
  const root = tmp();
  const file = path.join(root, AUDIT_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const line = (name, extra = {}) => `${JSON.stringify({ time: '2026-10-23T10:00:00.000Z', action: 'push', name, destination: 'vercel', ...extra })}\n`;
  fs.writeFileSync(file, line('OLD_ONE'));
  const got = [];
  const w = createSecretsWatch({ root, watch: false, onPush: (e) => got.push(e.name) });
  w.start();
  assert.deepEqual(w.look(), [], 'what was there before the first start is not news');
  fs.appendFileSync(file, line('NEW_ONE', { via: 'gui' }) + line('SET_ONE', { action: 'set' }));
  w.look();
  assert.deepEqual(got, ['NEW_ONE']);
  const half = line('TORN_ONE');
  fs.appendFileSync(file, half.slice(0, 20));
  w.look();
  assert.deepEqual(got, ['NEW_ONE'], 'half a line waits');
  w.stop();
  fs.appendFileSync(file, half.slice(20) + line('WHILE_CLOSED'));
  const again = createSecretsWatch({ root, watch: false, onPush: (e) => got.push(e.name) });
  again.start();
  again.look();
  assert.deepEqual(got, ['NEW_ONE', 'TORN_ONE', 'WHILE_CLOSED'], 'a restart picks up where it left off');
});

test('the change feed carries a push from the audit record, nudged by the GUI right after its own push', async () => {
  const root = tmp();
  const file = path.join(root, AUDIT_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');
  const feed = createChangeFeed({ repo: root, root, watch: false, git: async () => ({ ok: false, stdout: '' }), gh: async () => ({ ok: false, stdout: '' }), query: false, sessionName: (id) => (id === 's1' ? 'deneb' : null) });
  feed.sync();
  fs.appendFileSync(file, `${JSON.stringify({ time: '2026-10-23T10:00:00.000Z', action: 'push', name: 'STRIPE_SECRET_KEY', destination: 'vercel', environments: ['production'], session: 's1' })}\n`);
  feed.nudgeSecrets();
  const ev = feed.list().events.find((e) => e.kind === 'secret-push');
  assert.equal(ev.line, 'deneb pushed STRIPE_SECRET_KEY to Vercel (production)');
  assert.equal(ev.deploy, undefined, 'no deploy to follow');
  feed.close();
});

test('the Vault shows a column and a "Where values go" row for each other place a declared name goes', () => {
  const st = { secrets: [{ name: 'A', set: true, destinations: [{ destination: 'local', state: 'set' }, { destination: 'fly', state: 'pushed', at: '2026-10-23T10:00:00Z' }] }] };
  assert.deepEqual(destsIn(st), ['local', 'github-actions', 'vercel', 'cloudflare', 'fly']);
  assert.equal(LABEL.fly, 'Fly.io');
  const fly = destRows(st).find((r) => r.d === 'fly');
  assert.equal(fly.label, 'Fly.io');
  assert.equal(fly.what, 'app secrets');
  assert.deepEqual(destsIn({ secrets: [] }), ['local', 'github-actions', 'vercel', 'cloudflare']);
});

test('the demo: the Stripe request, its card\'s save pushes to Vercel, and the push is a feed event', () => {
  const pushes = [];
  const vault = createDemoVault({ onPush: (line) => pushes.push(line) });
  const st = vault.status();
  assert.ok(st.requests.some((r) => r.chunk === '15.5' && r.service === 'stripe' && r.to.includes('vercel')));
  const stack = createDemoStack({ vault });
  stack.pick({ picked: ['stripe'] });
  const r = stack.save({ service: 'stripe', key: 'secret', value: 'rk_test_demo0000000000000000000000', request: { chunk: '15.5', to: ['vercel'] } });
  assert.equal(r.status, 200, r.error);
  assert.deepEqual(r.request, { chunk: '15.5', to: ['vercel'] });
  assert.equal(pushes.length, 1);
  assert.equal(pushEventOf(pushes[0]).line, 'You pushed STRIPE_SECRET_KEY to Vercel (production, preview, development)');
  assert.ok(!JSON.stringify(pushes).includes('rk_test_demo'));
  assert.ok(!vault.status().requests.some((q) => q.chunk === '15.5'), 'answered: the request leaves');
});

test('the key card for a request ticks the places it named, and declares the new ones on save', async () => {
  const { keyCard, saveBody } = await import('../src/screens/vault/model.js');
  const st = { secrets: [{ name: 'STRIPE_SECRET_KEY', destinations: [{ destination: 'local', state: 'missing' }, { destination: 'vercel', state: 'not pushed' }] }] };
  const card = keyCard({ chunk: '15.5', to: ['vercel', 'fly'] }, 'STRIPE_SECRET_KEY', st);
  assert.deepEqual(card.sinks, ['vercel', 'fly']);
  assert.deepEqual(card.adds, ['fly']);
  assert.deepEqual(saveBody('v', ['local', 'vercel', 'fly'], card.adds), { value: 'v', destinations: ['vercel', 'fly'], declare: true });
  assert.deepEqual(saveBody('v', ['local', 'vercel'], card.adds), { value: 'v', destinations: ['vercel'] }, 'untick the new place: nothing to declare');
  assert.equal(keyCard({ chunk: '15.5' }, 'STRIPE_SECRET_KEY', st).adds, undefined);
});
