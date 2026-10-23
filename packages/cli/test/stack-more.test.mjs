// The 0.5.2 stack builder: twenty-one services. The registry holds for every one of them (names, shapes, secret flags,
// no public secret, https links on the service's own console, guidance whose commands name the service's own env
// names); every check calls only allowlisted hosts, read-only, with the token in a header and facts allowlisted; the
// agent guide lists only the picked services, never a value, rewrites idempotently and keeps hand edits outside its
// block; the picker groups, searches and presets; and the demo answers each service. No test opens a connection.
import './jsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SERVICES, ORDER, GROUPS, PRESETS, MILESTONES, CONSOLE_HOSTS, CI_NAMES, aliasesOf, milestonesFor, searchServices, groupedServices, nameClashes, valueOf,
} from '../shared/stack/recipes.mjs';
import { SHAPES, PUBLIC_NAME, checkShape, normalize } from '../shared/stack/shapes.mjs';
import { FRAMEWORKS, envNamesFor } from '../shared/stack/frameworks.mjs';
import { renderGuide, applyBlock, applyPointer, BEGIN, END, GUIDE_FILE } from '../shared/stack/guide.mjs';
import { call, hostAllowed, FACTS } from '../server/stack-checks.mjs';
import { CHECKS, sigv4Headers, clerkFrontendApi, sentryTokenInfo } from '../server/stack-checks-more.mjs';
import { writeGuide, guideStatus } from '../server/stack-guide.mjs';
import { createStack } from '../server/stack.mjs';
import { createDemoStack, DEMO_CHECKS } from '../server/demo/stack.mjs';
import { openVault, upsertEnv, parseEnv } from '../../../templates/scripts/secrets-vault.mjs';
import { EXAMPLES, fakeServiceAccount } from './helpers/stack-examples.mjs';
import { removeTreeSync } from './helpers/tmp.mjs';

globalThis.window ||= { location: { href: 'http://localhost/' }, history: { replaceState() {} } };

const NEW = ORDER.filter((id) => !['cloudflare', 'supabase', 'vercel'].includes(id));
const dirs = [];
test.after(() => removeTreeSync(dirs));
const tmp = (files = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-stack-more-'));
  dirs.push(root);
  for (const [rel, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); }
  return root;
};

// ---- the registry ---------------------------------------------------------------------------------------------------

test('the registry: twenty-one services, each in ORDER once, a group, a unique monogram, console hosts and a milestone', () => {
  assert.equal(ORDER.length, 21);
  assert.deepEqual([...ORDER].sort(), Object.keys(SERVICES).sort());
  assert.equal(NEW.length, 18);
  const monos = new Set();
  for (const id of ORDER) {
    const s = SERVICES[id];
    assert.ok(GROUPS.some((g) => g.id === s.group), `${id}: a known group`);
    assert.ok(!monos.has(s.mono), `${id}: a unique monogram`);
    monos.add(s.mono);
    assert.ok(CONSOLE_HOSTS[id]?.length, `${id}: console hosts`);
    assert.ok(MILESTONES.some((m) => m.service === id), `${id}: a milestone`);
    assert.ok(CHECKS[id], `${id}: a check`);
    assert.ok(FACTS[id]?.length, `${id}: an allowlist of facts`);
  }
  for (const g of GROUPS) assert.ok(ORDER.some((id) => SERVICES[id].group === g.id), `${g.id}: not empty`);
  for (const p of PRESETS) for (const id of p.picked) assert.ok(SERVICES[id], `${p.id}: ${id}`);
  assert.deepEqual(PRESETS.find((p) => p.id === 'trinity').picked, ['cloudflare', 'supabase', 'vercel']);
  assert.deepEqual(PRESETS.find((p) => p.id === 'saas').picked, ['vercel', 'neon', 'clerk', 'stripe', 'resend', 'sentry']);
  assert.deepEqual(PRESETS.find((p) => p.id === 'discord').picked, ['discord', 'fly', 'upstash']);
  assert.deepEqual(PRESETS.find((p) => p.id === 'ai').picked, ['anthropic', 'vercel', 'supabase', 'posthog']);
});

test('every value has a label, an env name, a known shape and a secret flag; a secret never gets a public name', () => {
  for (const id of ORDER) {
    const seen = new Set();
    for (const v of SERVICES[id].values) {
      assert.ok(v.key && v.label, `${id}: key and label`);
      assert.ok(!seen.has(v.key), `${id}.${v.key}: unique`);
      seen.add(v.key);
      assert.equal(typeof v.secret, 'boolean', `${id}.${v.key}: secret flag`);
      assert.equal(typeof v.required, 'boolean', `${id}.${v.key}: required flag`);
      assert.ok(v.shape in SHAPES, `${id}.${v.key}: shape ${v.shape}`);
      assert.ok(v.env?.server || v.env?.public, `${id}.${v.key}: an env name`);
      for (const n of [v.env.server, v.env.public].filter(Boolean)) {
        assert.match(n, /^[A-Z][A-Z0-9_]*$/);
        assert.doesNotMatch(n, PUBLIC_NAME, `${id}.${v.key}: the recipe name carries no prefix itself`);
      }
      if (v.secret) {
        assert.equal(v.env.public, undefined, `${id}.${v.key} is secret: no public name`);
        for (const fw of FRAMEWORKS) for (const n of envNamesFor(v, fw)) assert.doesNotMatch(n, PUBLIC_NAME, `${id}.${v.key} in ${fw.id}`);
      }
      if (v.fill === 'check') assert.equal(v.secret, false, `${id}.${v.key}: a filled value is never a secret`);
      for (const a of aliasesOf(v.env.server || '')) assert.notEqual(a, 'GOOGLE_APPLICATION_CREDENTIALS');
    }
    assert.ok(SERVICES[id].values.some((v) => v.required), `${id}: at least one required value`);
  }
});

test('every link is https on the service\'s own console, step ids are unique, and every step has a way to be done', () => {
  const ids = new Set();
  for (const id of ORDER) {
    const s = SERVICES[id];
    const links = [...s.steps.map((x) => x.link), s.token?.create, ...s.values.map((v) => v.where)].filter(Boolean);
    for (const l of links) {
      const u = new URL(l.href);
      assert.equal(u.protocol, 'https:', l.href);
      assert.ok(CONSOLE_HOSTS[id].includes(u.host), `${id}: ${u.host}`);
    }
    for (const st of s.steps) {
      assert.ok(!ids.has(st.id), `step ${st.id} is unique`);
      ids.add(st.id);
      for (const k of st.values || []) assert.ok(valueOf(id, k), `${st.id}: value ${k}`);
      if (st.auto) { const [svc, f] = st.auto.split('.'); assert.equal(svc, id); assert.ok(FACTS[id].includes(f), `${st.auto} is an allowlisted fact`); }
    }
    for (const v of s.values.filter((x) => x.required)) assert.ok(s.steps.some((st) => (st.values || []).includes(v.key)), `${id}.${v.key}: a step asks for it`);
  }
});

test('every service carries guidance, and its commands name only the service\'s own env names', () => {
  for (const id of ORDER) {
    const s = SERVICES[id];
    const g = s.guide;
    assert.ok(g && g.reads && g.test && g.limits, `${id}: reads, test and limits`);
    assert.ok(g.run?.length && g.do?.length && g.dont?.length, `${id}: commands, do and don't`);
    const own = new Set(s.values.map((v) => v.env.server).filter(Boolean));
    for (const c of g.run) {
      const only = /--only ([A-Z0-9_,]+)/.exec(c);
      if (only) for (const n of only[1].split(',')) assert.ok(own.has(n), `${id}: ${n} in "${c}" is one of its names`);
      if (/secrets\.mjs run/.test(c)) assert.match(c, /^node scripts\/secrets\.mjs run (--only [A-Z0-9_,]+ )?-- /, c);
      // A value is expanded only inside a child shell, never on the outer line.
      const outer = c.split(/ -- /)[1] || '';
      if (/\$[A-Z]/.test(outer)) assert.match(outer, /^(sh|bash) -c '/, `${id}: $NAME only inside the child: ${c}`);
    }
  }
});

test('the check hosts: each service API exactly, STS and Upstash by pattern, nothing that only ends like them', () => {
  for (const h of ['api.stripe.com', 'discord.com', 'slack.com', 'api.twilio.com', 'api.anthropic.com', 'api.openai.com', 'api.resend.com', 'console.neon.tech', 'api.netlify.com', 'api.machines.dev', 'sts.amazonaws.com', 'sts.eu-west-2.amazonaws.com', 'eu1-fieldday-32748.upstash.io', 'de.sentry.io', 'eu.posthog.com']) assert.ok(hostAllowed(h), h);
  for (const h of ['evil.amazonaws.com', 'sts.amazonaws.com.evil.example', 'upstash.io.evil.example', 'a.b.upstash.io.evil', 'stripe.com', 'hooks.slack.com', 'evil.sentry.io', 'posthog.com']) assert.equal(hostAllowed(h), false, h);
});

test('call(): extra headers never carry a token, a form is url-encoded, raw text and kept headers come back', async () => {
  const seen = [];
  const f = async (url, init) => { seen.push({ url, init }); return { status: 200, headers: new Headers({ 'anthropic-workspace-id': 'wrkspc_x', 'set-cookie': 'no' }), text: async () => '<A>1</A>' }; };
  const r = await call(f, { host: 'api.anthropic.com', path: '/v1/models', token: 'TOKEN-A', header: 'xapikey', extra: { authorization: 'Bearer stolen', 'X-API-Key': 'stolen', 'anthropic-version': '2023-06-01' }, keep: ['anthropic-workspace-id'], raw: true });
  assert.equal(seen[0].init.headers['x-api-key'], 'TOKEN-A');
  assert.equal(seen[0].init.headers.authorization, undefined, 'extra cannot add an authorization header');
  assert.equal(seen[0].init.headers['anthropic-version'], '2023-06-01');
  assert.equal(r.text, '<A>1</A>');
  assert.deepEqual(r.headers, { 'anthropic-workspace-id': 'wrkspc_x' });
  await call(f, { host: 'login.microsoftonline.com', path: '/t/oauth2/v2.0/token', method: 'POST', token: 'dXNlcjpwYXNz', header: 'basic', form: { grant_type: 'client_credentials', scope: 'https://management.azure.com/.default' } });
  assert.equal(seen[1].init.headers.authorization, 'Basic dXNlcjpwYXNz');
  assert.equal(seen[1].init.headers['content-type'], 'application/x-www-form-urlencoded');
  assert.equal(seen[1].init.body, 'grant_type=client_credentials&scope=https%3A%2F%2Fmanagement.azure.com%2F.default');
  await call(f, { host: 'discord.com', path: '/api/v10/users/@me', token: 'T', header: 'bot', ua: 'DiscordBot (x, 1)' });
  assert.equal(seen[2].init.headers.authorization, 'Bot T');
  assert.equal(seen[2].init.headers['user-agent'], 'DiscordBot (x, 1)');
});

test('SigV4: the signature is deterministic for a moment and carries the key ID, never the secret', () => {
  const o = { host: 'sts.eu-west-2.amazonaws.com', region: 'eu-west-2', service: 'sts', body: 'Action=GetCallerIdentity&Version=2011-06-15', accessKeyId: EXAMPLES.awsAccessKeyId, secretAccessKey: EXAMPLES.awsSecretAccessKey, now: new Date('2026-10-23T12:00:00Z') };
  const a = sigv4Headers(o);
  assert.deepEqual(sigv4Headers(o), a);
  assert.equal(a['x-amz-date'], '20261023T120000Z');
  assert.match(a.authorization, new RegExp(`^AWS4-HMAC-SHA256 Credential=${EXAMPLES.awsAccessKeyId}/20261023/eu-west-2/sts/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=[a-f0-9]{64}$`));
  assert.ok(!JSON.stringify(a).includes(EXAMPLES.awsSecretAccessKey));
});

// ---- every check, against a fake --------------------------------------------------------------------------------

const json = (status, body, headers = {}) => ({ status, body: JSON.stringify(body), headers });
/** A fake fetch: routes [regex on 'METHOD url', answer]. Records every call. */
function fake(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    const key = `${init.method || 'GET'} ${url}`;
    for (const [re, a] of routes) if (re.test(key)) { const x = typeof a === 'function' ? a(url, init) : a; return { status: x.status, headers: new Headers(x.headers || {}), text: async () => x.body }; }
    return { status: 404, headers: new Headers(), text: async () => '{}' };
  };
  fn.calls = calls;
  return fn;
}

const SA = fakeServiceAccount();
function argsFor(id) {
  const a = { domain: 'fieldday.dev' };
  for (const v of SERVICES[id].values) a[v.key] = normalize(v.shape, EXAMPLES[v.shape]);
  if (id === 'gcp') a.key = JSON.stringify(SA);
  if (id === 'firebase') { a.serviceAccount = JSON.stringify(SA); a.projectId = SA.project_id; }
  if (id === 'gcp') a.projectId = SA.project_id;
  return a;
}
const OK_ROUTES = {
  aws: [[/^POST https:\/\/sts\.eu-west-2\.amazonaws\.com\/$/, { status: 200, body: '<GetCallerIdentityResult><Arn>arn:aws:iam::123456789012:user/fieldday-app</Arn><UserId>AIDATESTONLY</UserId><Account>123456789012</Account></GetCallerIdentityResult>' }]],
  gcp: [[/^POST https:\/\/oauth2\.googleapis\.com\/token$/, json(200, { access_token: 'ya29.TESTONLYaccess', expires_in: 3599 })], [/^GET https:\/\/cloudresourcemanager\.googleapis\.com\/v3\/projects\/fieldday-test$/, json(200, { name: 'projects/412', displayName: 'Fieldday', state: 'ACTIVE' })]],
  azure: [[/^POST https:\/\/login\.microsoftonline\.com\/[^/]+\/oauth2\/v2\.0\/token$/, json(200, { access_token: 'eyTESTONLYaccess' })], [/^GET https:\/\/management\.azure\.com\/subscriptions\/[^/]+\/resourcegroups\/fieldday-rg\?api-version=/, json(200, { location: 'westeurope' })]],
  firebase: [[/^GET https:\/\/identitytoolkit\.googleapis\.com\/v1\/projects$/, json(200, { projectId: 'fieldday-test', authorizedDomains: ['localhost', 'fieldday.dev'] })]],
  stripe: [[/^GET https:\/\/api\.stripe\.com\/v1\/prices\?limit=1&active=true$/, json(200, { object: 'list', data: [{ id: 'price_x', unit_amount: 900 }] })]],
  clerk: [[/^GET https:\/\/api\.clerk\.com\/v1\/users\/count$/, json(200, { object: 'total_count', total_count: 3 })]],
  neon: [[/^GET https:\/\/console\.neon\.tech\/api\/v2\/projects\/cool-darkness-123456$/, json(200, { project: { id: 'cool-darkness-123456', name: 'fieldday', region_id: 'aws-eu-west-2', pg_version: 17 } })]],
  upstash: [[/^GET https:\/\/eu1-fieldday-32748\.upstash\.io\/ping$/, json(200, { result: 'PONG' })]],
  netlify: [[/^GET https:\/\/api\.netlify\.com\/api\/v1\/sites\/11111111-2222/, json(200, { name: 'fieldday', ssl_url: 'https://fieldday.netlify.app', account_slug: 'sam' })]],
  fly: [[/^GET https:\/\/api\.machines\.dev\/v1\/apps\/fieldday-bot$/, json(200, { name: 'fieldday-bot', status: 'deployed', organization: { slug: 'personal', name: 'Sam' } })]],
  discord: [[/users\/@me$/, json(200, { id: '998877665544332211', username: 'Fieldday', bot: true })], [/applications\/@me$/, json(200, { id: '112233445566778899', name: 'Fieldday', verify_key: 'ab'.repeat(32), bot_public: false, approximate_guild_count: 2, flags: 0 })]],
  slack: [[/^POST https:\/\/slack\.com\/api\/auth\.test$/, json(200, { ok: true, team_id: 'T0TESTONLY', team: 'Fieldday HQ', user: 'fieldday', bot_id: 'B0TEST' })]],
  twilio: [[/^GET https:\/\/api\.twilio\.com\/2010-04-01\/Accounts\/AC[a-f0-9]{32}\/IncomingPhoneNumbers\.json\?PageSize=20$/, json(200, { incoming_phone_numbers: [{ phone_number: '+14155550123', capabilities: { sms: true, voice: true } }] })]],
  resend: [[/^GET https:\/\/api\.resend\.com\/domains$/, json(401, { name: 'restricted_api_key', message: 'This API key is restricted to only send emails.' })]],
  anthropic: [[/^GET https:\/\/api\.anthropic\.com\/v1\/models\?limit=5$/, json(200, { data: [{ id: 'claude-opus-5-5' }] }, { 'anthropic-workspace-id': 'wrkspc_TESTONLY00000000', 'anthropic-organization-id': 'org-uuid' })]],
  openai: [[/^GET https:\/\/api\.openai\.com\/v1\/models$/, json(200, { data: [{ id: 'gpt-x' }, { id: 'gpt-y' }] })]],
  sentry: [[/^GET https:\/\/de\.sentry\.io\/api\/0\/$/, json(200, { version: '0', auth: { scopes: ['org:ci'] } })]],
  posthog: [[/^GET https:\/\/us\.posthog\.com\/api\/users\/@me\/$/, json(200, { email: 'sam@fieldday.dev', first_name: 'Sam', team: { id: 12345, name: 'Fieldday' }, organization: { name: 'Fieldday', teams: [{ id: 12345, name: 'Fieldday' }] } })]],
};
const AUTH = {
  aws: (h) => /^AWS4-HMAC-SHA256 /.test(h.authorization) && h.accept === 'text/xml', gcp: (h, i) => i === 0 ? !h.authorization : /^Bearer ya29/.test(h.authorization),
  azure: (h, i) => (i === 0 ? /^Basic /.test(h.authorization) : /^Bearer /.test(h.authorization)), firebase: (h) => !!h['x-goog-api-key'] && !h.authorization,
  discord: (h) => /^Bot /.test(h.authorization) && /^DiscordBot /.test(h['user-agent']), twilio: (h) => /^Basic /.test(h.authorization),
  anthropic: (h) => !!h['x-api-key'] && h['anthropic-version'] === '2023-06-01',
};

for (const id of NEW) {
  test(`check ${id}: a pass on allowlisted https hosts, the token in a header only, facts allowlisted`, async () => {
    const f = fake(OK_ROUTES[id]);
    const args = argsFor(id);
    const r = await CHECKS[id](f, args);
    assert.equal(r.ok, true, `${id}: ${r.reason}`);
    assert.ok(f.calls.length >= 1, `${id} called out`);
    const secrets = SERVICES[id].values.filter((v) => v.secret).map((v) => args[v.key]).filter(Boolean);
    f.calls.forEach((c, i) => {
      const u = new URL(c.url);
      assert.equal(u.protocol, 'https:');
      assert.ok(hostAllowed(u.host), `${id}: ${u.host}`);
      assert.equal(c.init.redirect, 'error');
      assert.ok(c.init.method === undefined || ['GET', 'POST'].includes(c.init.method), 'read-only methods');
      for (const s of secrets) assert.ok(!c.url.includes(s) && !c.url.includes(encodeURIComponent(s)), `${id}: a secret in the URL`);
      if (AUTH[id]) assert.ok(AUTH[id](c.init.headers, i), `${id}: call ${i}'s auth header`);
    });
    for (const k of Object.keys(r.facts || {})) assert.ok(FACTS[id].includes(k), `${id}: fact ${k} is allowlisted`);
    const out = JSON.stringify(r);
    for (const s of secrets) assert.ok(!out.includes(s), `${id}: a secret in the answer`);
    for (const [k, x] of Object.entries(r.fill || {})) { const v = valueOf(id, k); assert.ok(v && !v.secret && checkShape(v.shape, x).ok, `${id}: fill ${k}`); }
  });
}

test('checks fail plainly: wrong keys, narrow keys, a user token, mixed modes, a disabled API, a refused host', async () => {
  const one = async (id, routes, patch = {}) => CHECKS[id](fake(routes), { ...argsFor(id), ...patch });
  assert.match((await one('aws', [[/sts/, { status: 403, body: '<ErrorResponse><Error><Code>InvalidClientTokenId</Code></Error></ErrorResponse>' }]])).reason, /does not know this access key ID/);
  assert.match((await one('aws', [[/sts/, { status: 200, body: '<Arn>arn:aws:iam::123456789012:root</Arn><Account>123456789012</Account>' }]])).reason, /root access key/);
  // STS answers in JSON when a client asks for JSON: the check reads that shape too (the live answer, not a guess).
  const awsJson = await one('aws', [[/sts/, json(200, { GetCallerIdentityResponse: { GetCallerIdentityResult: { Account: '123456789012', Arn: 'arn:aws:iam::123456789012:user/fieldday-app', UserId: 'AIDATESTONLY' }, ResponseMetadata: { RequestId: 'x' } } })]]);
  assert.equal(awsJson.ok, true); assert.match(awsJson.summary, /IAM user fieldday-app in account 123456789012/);
  assert.match((await one('aws', [[/sts/, json(403, { Error: { Code: 'InvalidClientTokenId', Message: 'The security token included in the request is invalid.' } })]])).reason, /does not know this access key ID/);
  assert.match((await one('aws', [[/sts/, json(403, { Error: { Code: 'SignatureDoesNotMatch' } })]])).reason, /does not match this key ID/);
  assert.match((await one('aws', [[/sts/, json(200, { GetCallerIdentityResponse: { GetCallerIdentityResult: { Account: '123456789012', Arn: 'arn:aws:iam::123456789012:root' } } })]])).reason, /root access key/);
  assert.equal((await one('aws', [[/sts/, json(200, {})]])).ok, false);
  assert.match((await one('slack', [[/auth\.test/, json(200, { ok: false, error: 'invalid_auth' })]])).reason, /not valid/);
  assert.match((await one('slack', [[/auth\.test/, json(200, { ok: true, team_id: 'T0TESTONLY', user: 'sam' })]])).reason, /user token/);
  assert.match((await one('stripe', [[/prices/, json(403, { error: { type: 'invalid_request_error', message: 'The provided key rk_test_TESTONLY... does not have the permission' } })]])).reason, /Add Prices: Read/);
  const stripeMsg = await one('stripe', [[/prices/, json(403, { error: { message: 'key rk_test_TESTONLYleak' } })]]);
  assert.ok(!JSON.stringify(stripeMsg).includes('TESTONLYleak'), 'Stripe\'s own message is never passed on');
  const mixed = fake([]);
  assert.match((await CHECKS.stripe(mixed, { secret: EXAMPLES.stripeSecret, publishable: EXAMPLES.stripePublishable.replace('_test_', '_live_') })).reason, /different modes/);
  assert.equal(mixed.calls.length, 0, 'mixed modes are refused before any call');
  assert.match((await one('azure', [[/token$/, json(401, { error: 'invalid_client', error_codes: [7000215], error_description: 'secret TESTONLY' })]])).reason, /Copy the Value/);
  assert.match((await one('discord', [[/users\/@me/, json(401, {})]])).reason, /Do not retry/);
  assert.match((await one('gcp', [[/token$/, json(200, { access_token: 'ya29.x' })], [/projects/, json(403, { error: { status: 'PERMISSION_DENIED', details: [{ reason: 'SERVICE_DISABLED' }] } })]])).reason, /Cloud Resource Manager API/);
  assert.match((await one('twilio', [[/Incoming/, json(401, { code: 20003 })]])).reason, /another region/);
  const open = await one('openai', [[/models/, json(403, { error: { message: 'Missing scopes: api.model.read' } })]]);
  assert.equal(open.ok, true, 'a restricted OpenAI key that cannot list models still works');
  const full = await one('resend', [[/domains/, json(200, { data: [{ name: 'fieldday.dev', status: 'verified' }] })]]);
  assert.match(full.summary, /full access/);
  assert.equal(full.facts.domainOk, true);
  const evil = fake([]);
  const up = await CHECKS.upstash(evil, { restUrl: 'https://evil.example', restToken: EXAMPLES.upstashToken });
  assert.equal(up.ok, false);
  assert.equal(evil.calls.length, 0, 'a host off the list is never fetched');
  const ph = await one('posthog', OK_ROUTES.posthog);
  assert.ok(!JSON.stringify(ph).includes('sam@fieldday.dev'), 'PostHog: the person\'s email is never kept');
  assert.equal(ph.fill.projectId, '12345');
  const ph2 = await one('posthog', [[/@me/, json(200, { team: { id: 12345, name: 'Fieldday' }, organization: { name: 'Fieldday', teams: [{ id: 12345 }, { id: 67890 }] } })]]);
  assert.equal(ph2.ok, true); assert.deepEqual(ph2.fill, {}); assert.equal(ph2.facts.projectId, undefined, 'several projects: the current one is not guessed');
  assert.match((await CHECKS.neon(fake([]), { dbUrl: EXAMPLES.neonPooledUrl })).reason, /optional API key/);
  assert.equal((await one('anthropic', OK_ROUTES.anthropic)).fill.workspaceId, 'wrkspc_TESTONLY00000000');
});

test('local reads: a Clerk key names its Frontend API, a Sentry org token its org and region', () => {
  assert.equal(clerkFrontendApi(EXAMPLES.clerkPublishable), 'fieldday.clerk.accounts.dev');
  assert.equal(clerkFrontendApi('pk_test_bm90IGEgaG9zdA=='), null);
  assert.deepEqual(sentryTokenInfo(EXAMPLES.sentryToken), { org: 'fieldday', region: 'de.sentry.io' });
  assert.deepEqual(sentryTokenInfo('nope'), {});
});

// ---- shapes ---------------------------------------------------------------------------------------------------------

test('a pasted JSON key folds to one line; anything else multi-line is refused with the shape\'s hint', () => {
  const pretty = JSON.stringify(SA, null, 2);
  const r = checkShape('gcpServiceAccountKey', pretty);
  assert.equal(r.ok, true, JSON.stringify(r));
  const one = normalize('gcpServiceAccountKey', pretty);
  assert.doesNotMatch(one, /[\r\n]/);
  assert.equal(JSON.parse(one).private_key, SA.private_key, 'the private key survives, its newlines escaped');
  assert.match(checkShape('gcpServiceAccountKey', 'not\njson').why, /whole JSON key file/);
  assert.match(checkShape('gcpServiceAccountKey', JSON.stringify({ ...SA, type: 'authorized_user' })).why, /gcloud sign-in/);
  assert.match(checkShape('cloudflareToken', 'a\nb').why, /one line/, 'every other shape still refuses a second line');
});

test('the new shapes refuse the value meant for the next field, and never echo it', () => {
  const bad = [
    ['awsAccessKeyId', EXAMPLES.awsSecretAccessKey, /secret access key/], ['awsSecretAccessKey', EXAMPLES.awsAccessKeyId, /access key ID/],
    ['awsRegion', 'eu-west-2a', /availability zone/], ['stripePublishable', EXAMPLES.stripeSecret, /server key/], ['stripeSecret', EXAMPLES.stripePublishable, /publishable/],
    ['slackBotToken', EXAMPLES.slackBotToken.replace('xb-', 'xp-'), /user token/], ['twilioAccountSid', EXAMPLES.twilioApiKeySid, /API key SID/],
    ['flyToken', EXAMPLES.flyToken.replace('FlyV1 ', ''), /prefix is missing/], ['netlifyToken', `nfb_${'x'.repeat(32)}`, /build token/],
    ['clerkPublishable', EXAMPLES.clerkSecret, /secret key/], ['posthogProjectKey', EXAMPLES.posthogPersonalKey, /private key/],
    ['anthropicKey', 'sk-ant-admin01-TESTONLYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', /Admin key/], ['azureClientSecret', EXAMPLES.guid, /Secret ID/],
    ['upstashRestUrl', EXAMPLES.redisUrl, /Redis URL/], ['gcpProjectId', '412000000000', /project number/], ['e164Phone', '+1 415 555 0123', /spaces/],
  ];
  for (const [id, v, why] of bad) {
    const r = checkShape(id, v);
    assert.equal(r.ok, false, `${id} refuses`);
    assert.match(r.why, why, id);
    assert.ok(!JSON.stringify(r).includes('TESTONLY'), `${id}: no piece of the value`);
  }
  assert.equal(checkShape('awsAccessKeyId', EXAMPLES.awsAccessKeyId.replace('AKIA', 'ASIA')).kind, 'legacy');
  assert.equal(checkShape('stripeSecret', EXAMPLES.stripeSecret.replace('rk_', 'sk_')).kind, 'warn');
  assert.equal(checkShape('neonPooledUrl', EXAMPLES.neonDirectUrl).kind, 'warn');
  assert.equal(checkShape('neonDirectUrl', EXAMPLES.neonPooledUrl).kind, 'warn');
  assert.equal(checkShape('netlifyToken', `nfc_${'x'.repeat(32)}`).kind, 'warn');
});

// ---- the agent guide ----------------------------------------------------------------------------------------------

test('the guide lists only the picked services, their names in this framework, and how to run each one', () => {
  const g = renderGuide({ picked: ['stripe', 'neon'], app: { dir: 'apps/web', framework: 'next' } });
  assert.ok(g.startsWith(BEGIN) && g.endsWith(END));
  assert.match(g, /### Neon \(Data\)/);
  assert.match(g, /### Stripe \(Payments\)/);
  assert.ok(g.indexOf('### Neon') < g.indexOf('### Stripe'), 'card order');
  for (const id of ORDER.filter((x) => !['stripe', 'neon'].includes(x))) assert.ok(!g.includes(`### ${SERVICES[id].name}`), `${id} is not in the guide`);
  assert.match(g, /\| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` \| Publishable key \| ships to the browser \|/);
  assert.match(g, /\| `STRIPE_SECRET_KEY` \| Restricted key \| secret, server only \|/);
  assert.match(g, /node scripts\/secrets\.mjs run --only DATABASE_URL_UNPOOLED -- npx drizzle-kit migrate/);
  assert.match(g, /Next\.js in apps\/web; names that ship to the browser start NEXT_PUBLIC_/);
  assert.match(renderGuide({ picked: [] }), /No services are picked yet/);
});

test('the guide takes the name the repo already reads, in the table and in the commands', () => {
  const g = renderGuide({ picked: ['stripe'], app: { framework: 'node' }, names: { 'stripe.secret': ['STRIPE_API_KEY'] } });
  assert.match(g, /\| `STRIPE_API_KEY` \| Restricted key/);
  assert.match(g, /--only STRIPE_API_KEY,STRIPE_WEBHOOK_SECRET -- npm run dev/);
  assert.doesNotMatch(g.split('**Test')[0].split('| --- |')[1], /STRIPE_SECRET_KEY/);
  // The Stripe CLI's own name is not rewritten into nonsense, and the guide never says to put a second key under it.
  assert.doesNotMatch(g, /STRIPE_API_KEY, not STRIPE_API_KEY/);
  assert.doesNotMatch(g, /separate sandbox read key as STRIPE_API_KEY/);
  assert.match(g, /keeps the restricted key as `STRIPE_API_KEY`, the name the Stripe CLI reads by itself/);
  // The default names keep the plain note.
  assert.match(renderGuide({ picked: ['stripe'] }), /The Stripe CLI reads STRIPE_API_KEY, not STRIPE_SECRET_KEY/);
});

test('a name a tool reads by itself stays that tool\'s name in prose, and the guide says how to bridge a repo name', () => {
  const g = renderGuide({ picked: ['discord', 'twilio'], names: { 'discord.botToken': ['DISCORD_BOT_TOKEN'], 'twilio.apiKey': ['TWILIO_API_KEY_SID'] } });
  assert.match(g, /`client\.login\(\)` reads DISCORD_TOKEN/);
  assert.match(g, /--only DISCORD_BOT_TOKEN -- npm run bot/);
  assert.match(g, /discord\.js reads only `DISCORD_TOKEN`.*sh -c 'DISCORD_TOKEN="\$DISCORD_BOT_TOKEN"/);
  assert.match(g, /The Twilio CLI reads TWILIO_ACCOUNT_SID, TWILIO_API_KEY and TWILIO_API_SECRET/);
  assert.match(g, /the Twilio CLI reads only `TWILIO_API_KEY`/);
  assert.doesNotMatch(renderGuide({ picked: ['discord', 'twilio'] }), /This repo keeps/);
});

test('a domain-scoped Google Cloud project ID is a project ID', () => {
  assert.equal(checkShape('gcpProjectId', 'example.com:my-project').ok, true);
  assert.equal(checkShape('gcpProjectId', 'evil:my-project').ok, false);
});

test('the block goes in place: hand edits outside it stay, a rewrite is idempotent, the pointer is added once', () => {
  const b1 = renderGuide({ picked: ['slack'] });
  const fresh = applyBlock('', b1);
  assert.match(fresh, /^# Stack\n/);
  const hand = `# Our stack\n\nMy own notes.\n\n${b1}\n\nMore notes after.\n`;
  const b2 = renderGuide({ picked: ['slack', 'discord'] });
  const next = applyBlock(hand, b2);
  assert.ok(next.startsWith('# Our stack\n\nMy own notes.\n\n'));
  assert.ok(next.endsWith('\n\nMore notes after.\n'));
  assert.match(next, /### Discord/);
  assert.equal(applyBlock(next, b2), next, 'the same block twice changes nothing');
  const book = applyPointer('# agents.md\n\nRules.\n');
  assert.equal(applyPointer(book), book);
  assert.equal(book.match(/nexus:stack-pointer:begin/g).length, 1);
  assert.match(book, /\[docs\/stack\.md\]\(docs\/stack\.md\)/);
});

test('writeGuide: docs/stack.md and the agents.md pointer, idempotent, CRLF kept, nothing written for no picks', () => {
  const repo = tmp({ 'agents.md': '# agents.md\r\n\r\nRules.\r\n' });
  assert.equal(writeGuide({ repo, picked: [] }).written, false);
  assert.equal(fs.existsSync(path.join(repo, GUIDE_FILE)), false);
  const a = writeGuide({ repo, picked: ['twilio'], app: { framework: 'node' } });
  assert.deepEqual([a.written, a.pointer, a.pointerWritten], [true, 'agents.md', true]);
  const book = fs.readFileSync(path.join(repo, 'agents.md'), 'utf8');
  assert.doesNotMatch(book.replace(/\r\n/g, ''), /\n/, 'the rule book keeps its CRLF');
  const b = writeGuide({ repo, picked: ['twilio'], app: { framework: 'node' } });
  assert.deepEqual([b.written, b.pointerWritten], [false, false]);
  const doc = path.join(repo, GUIDE_FILE);
  fs.writeFileSync(doc, `${fs.readFileSync(doc, 'utf8')}\nA note I wrote.\n`);
  writeGuide({ repo, picked: [], app: {} });
  const after = fs.readFileSync(doc, 'utf8');
  assert.match(after, /No services are picked yet/);
  assert.match(after, /A note I wrote\./);
  assert.deepEqual(guideStatus(repo), { path: GUIDE_FILE, exists: true, pointer: 'agents.md' });
});

// ---- the server ---------------------------------------------------------------------------------------------------

function harness(root, { fetchImpl } = {}) {
  const git = () => ({ status: 0, stdout: '' });
  const kit = { openVault: (o) => openVault({ ...o, git }), upsertEnv, parseEnv, localSettings: () => ({}) };
  const secrets = {
    status: async () => ({ status: 200, available: true, vaultState: 'ready', owner: true, vault: {}, sinks: [] }),
    store: async (name, b) => { kit.openVault({ root }).set([[name, b.value]]); return { status: 200, ok: true, pushed: [] }; },
  };
  let t = Date.parse('2026-10-23T10:00:00Z');
  return { stack: createStack({ repo: root, root, secrets, kit, git, owner: () => true, fetchImpl, now: () => (t += 5000) }) };
}

test('the server: a pick writes the guide and its pointer; a save keeps every value out of both', async () => {
  const root = tmp({ 'package.json': JSON.stringify({ dependencies: { next: '15' } }), 'agents.md': '# agents.md\n', '.env': '' });
  const { stack } = harness(root);
  const st = await stack.pick({ picked: ['stripe', 'clerk'] });
  assert.equal(st.guide.exists, true);
  assert.equal(st.guide.pointer, 'agents.md');
  const r = await stack.save({ service: 'stripe', key: 'secret', value: EXAMPLES.stripeSecret });
  assert.equal(r.status, 200);
  const doc = fs.readFileSync(path.join(root, GUIDE_FILE), 'utf8');
  assert.match(doc, /### Clerk/);
  assert.match(doc, /`STRIPE_SECRET_KEY`/);
  for (const f of [GUIDE_FILE, 'agents.md']) assert.ok(!fs.readFileSync(path.join(root, f), 'utf8').includes('TESTONLY'), `${f} holds no value`);
  assert.match(fs.readFileSync(path.join(root, '.env'), 'utf8'), /STRIPE_SECRET_KEY=/, 'the value went to the vault');
});

test('the server: a new service\'s check gets its values by key, and a found id is kept by its own shape', async () => {
  const root = tmp({ 'package.json': '{}', '.env': '' });
  const f = fake(OK_ROUTES.anthropic);
  const { stack } = harness(root, { fetchImpl: f });
  await stack.pick({ picked: ['anthropic'] });
  await stack.save({ service: 'anthropic', key: 'apiKey', value: EXAMPLES.anthropicKey });
  const r = await stack.check('anthropic', {});
  assert.equal(r.ok, true, r.reason);
  assert.equal(f.calls[0].init.headers['x-api-key'], EXAMPLES.anthropicKey, 'the key read from the vault, in its header');
  assert.deepEqual(r.fill, { workspaceId: 'wrkspc_TESTONLY00000000' });
  assert.ok(!JSON.stringify(r).includes(EXAMPLES.anthropicKey));
  const status = await stack.status();
  assert.equal(status.checks.anthropic.facts.newestModel, 'claude-opus-5-5');
});

// ---- the picker and the model ---------------------------------------------------------------------------------------

test('search and groups: by name, role, group or keyword; groups keep their order and drop when empty', () => {
  assert.deepEqual(searchServices('redis'), ['upstash']);
  assert.deepEqual(searchServices('PAYMENTS'), ['stripe']);
  assert.ok(searchServices('postgres').includes('neon') && searchServices('postgres').includes('supabase'));
  assert.deepEqual(searchServices('chat bot').sort(), ['discord', 'slack']);
  assert.deepEqual(searchServices('zzz'), []);
  assert.equal(searchServices('').length, 21);
  assert.deepEqual(groupedServices(['aws', 'stripe', 'fly']).map((g) => [g.id, g.services]), [['hosting', ['fly']], ['payments', ['stripe']], ['cloud', ['aws']]]);
  assert.deepEqual(groupedServices().map((g) => g.id), GROUPS.map((g) => g.id));
  assert.deepEqual(nameClashes(['supabase', 'neon']), [{ name: 'DATABASE_URL', services: ['supabase', 'neon'] }]);
  assert.deepEqual(nameClashes(PRESETS.find((p) => p.id === 'saas').picked), []);
  assert.ok(CI_NAMES.has('FLY_API_TOKEN') && !CI_NAMES.has('AWS_SECRET_ACCESS_KEY'), 'CI gets deploy names, never a cloud key');
});

const T = [{ id: 'vault', label: '.env (the vault)', on: true, locked: true }];
function stackOf(picked, saved = []) {
  const values = {};
  const names = {};
  for (const id of picked) for (const v of SERVICES[id].values) {
    const ns = envNamesFor(v, 'next');
    values[`${id}.${v.key}`] = { names: ns, saved: saved.includes(`${id}.${v.key}`) };
    for (const n of ns) names[n] = { service: id, key: v.key, vault: saved.includes(`${id}.${v.key}`), drift: false };
  }
  return { available: true, vaultState: 'ready', owner: true, picked, inputs: { domain: 'fieldday.dev' }, apps: [], app: { dir: '.', framework: 'next', label: 'Next.js', prefix: 'NEXT_PUBLIC_' }, targets: T, values, names, checks: {}, actions: {}, ticks: {}, guide: { path: 'docs/stack.md', exists: true, pointer: 'agents.md' } };
}
const ui = () => ({ field: () => ({}), setField() {}, save() {}, saveAll() {}, resync() {}, check() {}, checks: {}, plan() {}, confirm() {}, plans: {}, toggleReplace() {}, pick() {}, tick() {}, busy: false, opened: {}, setOpen() {}, go() {}, offer: null, setOffer() {}, pasted() {}, fill() {}, repoll: {} });

test('with services picked the picker folds to a line of chips, notes a clash, and the guide line shows where agents read', async () => {
  const { default: StackPanel } = await import('../src/screens/vault/stack/StackPanel.jsx');
  const s = stackOf(['supabase', 'neon', 'stripe']);
  const html = renderToStaticMarkup(createElement(StackPanel, { sp: { res: { status: 'ready', data: s, reload() {} }, stack: s, ui: ui() } }));
  assert.match(html, /Runs on/);
  assert.match(html, /class="stk-picked-chip"><span class="stk-orb g-data is-neon is-small"/);
  assert.match(html, />Add or remove</);
  assert.doesNotMatch(html, /aria-label="Search services"/, 'the search box waits behind Add or remove');
  assert.match(html, /Supabase and Neon both write <code>DATABASE_URL<\/code>/);
  assert.match(html, /Sessions read <code>docs\/stack\.md<\/code>, which agents\.md points to/);
  assert.match(html, /### Stripe \(Payments\)/, 'the preview renders the guide');
  assert.match(html, /<section id="stk-stripe" class="stk-card/);
});

test('the model moves on for a new service: its next action, its plain steps, the done line', async () => {
  const { progress, nextAction, stepStates } = await import('../src/screens/vault/stack/model.js');
  const s = stackOf(['discord']);
  const n = nextAction(progress(s), s);
  assert.equal(n.text, 'Paste your Discord keys.');
  assert.equal(n.step, 'dc.ids');
  assert.equal(stepStates('discord', s).find((x) => x.id === 'dc.new').state, 'ready');
  const req = SERVICES.discord.values.filter((v) => v.required).map((v) => `discord.${v.key}`);
  const done = stackOf(['discord'], req);
  assert.equal(stepStates('discord', done).find((x) => x.id === 'dc.new').state, 'done', 'a plain step is done once the keys are saved');
  assert.equal(nextAction(progress(done), done).text, 'Your stack is set. Sessions read how to use it in the agent guide.');
  assert.deepEqual(milestonesFor(['discord', 'fly']).map((m) => m.id), ['fly', 'discord']);
});

// ---- the demo -----------------------------------------------------------------------------------------------------

test('the demo answers every new service: a refusal before its key, canned facts after', () => {
  const d = createDemoStack({ vault: null });
  d.pick({ picked: NEW });
  for (const id of NEW) {
    const need = DEMO_CHECKS[id].needs;
    assert.ok(valueOf(id, need), `${id}: ${need} is a value`);
    assert.equal(d.check(id, {}).ok, false, `${id} refuses before its key`);
    const v = valueOf(id, need);
    const r = d.check(id, { values: { [need]: id === 'gcp' ? JSON.stringify(SA) : EXAMPLES[v.shape] } });
    assert.equal(r.ok, true, `${id}: ${r.reason}`);
    for (const k of Object.keys(r.facts)) assert.ok(FACTS[id].includes(k), `${id}: ${k}`);
    for (const [k, x] of Object.entries(r.fill || {})) assert.ok(checkShape(valueOf(id, k).shape, x).ok, `${id}: fill ${k}`);
  }
  assert.equal(d.status().guide.exists, true);
  const saved = d.save({ service: 'fly', key: 'token', value: EXAMPLES.flyToken });
  assert.deepEqual(saved.pushed.map((p) => p.name), ['FLY_API_TOKEN']);
});
