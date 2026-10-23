// The stack hand-off's outbound calls (server/stack-checks.mjs) against a fake fetch: each service's happy path, the
// plain reasons for 401, 403, 404, 429 and a timeout, the host guard, redirects refused, the token only in a header,
// the fact allowlist, the DNS plan's conflicts and the env types. No test opens a connection.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  call, hostAllowed, CallError, pickFacts, checkCloudflare, checkSupabase, checkVercel,
  planCloudflareDns, doCloudflareDns, planVercelEnv, doVercelEnv, doVercelDomain, doVercelNameservers, refOf,
} from '../server/stack-checks.mjs';

// Test values only.
const CF_TOKEN = 'cfut_TESTONLYcheck000000000000000';
const VC_TOKEN = 'vcp_TESTONLYcheck0000000000';
const SB_PUB = 'sb_publishable_TESTONLYcheck00';
const SB_SECRET = 'sb_secret_TESTONLYcheck000000';
const SB_PAT = 'sbp_TESTONLYcheck00000000000000';
const URL_ = 'https://abcdefghijklmnopqrst.supabase.co';
const ZONE = '0123456789abcdef0123456789abcdef';
const ACCOUNT = 'fedcba9876543210fedcba9876543210';

/** A fake fetch: routes are [method?, regex, (url, init) => { status, json } | Error]. Records every call. */
function fake(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    const method = init.method || 'GET';
    for (const [m, re, answer] of routes) {
      if (m !== method || !re.test(url)) continue;
      const a = typeof answer === 'function' ? answer(url, init) : answer;
      if (a instanceof Error) throw a;
      const text = a.json === undefined ? '' : JSON.stringify(a.json);
      return { status: a.status ?? 200, headers: new Headers(a.headers || {}), text: async () => text };
    }
    return { status: 404, headers: new Headers(), text: async () => '{}' };
  };
  fn.calls = calls;
  return fn;
}

const ZONES_OK = { success: true, result: [{ id: ZONE, status: 'pending', name_servers: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'], original_name_servers: ['ns1.registrar.example'], account: { id: ACCOUNT, name: "Sam's account" }, secret_echo: CF_TOKEN }] };
const VERIFY_OK = { success: true, result: { id: 'x', status: 'active', expires_on: '2027-01-21T00:00:00Z' }, messages: [{ code: 10000 }] };

test('the host guard throws for anything but the three APIs and a project\'s own supabase.co', async () => {
  assert.ok(hostAllowed('api.cloudflare.com') && hostAllowed('api.vercel.com') && hostAllowed('api.supabase.com'));
  assert.ok(hostAllowed('abcdefghijklmnopqrst.supabase.co'));
  for (const h of ['evil.example', 'db.fieldday.dev', 'api.cloudflare.com.evil.example', 'abc.supabase.co']) assert.equal(hostAllowed(h), false, h);
  const f = fake([]);
  await assert.rejects(call(f, { host: 'evil.example', path: '/' }), (e) => e instanceof CallError && e.kind === 'host');
  assert.equal(f.calls.length, 0, 'no connection opened');
  // A custom Supabase domain is never fetched: the check stops before calling.
  const r = await checkSupabase(f, { url: 'https://db.fieldday.dev', publishable: SB_PUB });
  assert.equal(r.ok, false);
  assert.match(r.reason, /only knows supabase\.co/);
  assert.equal(f.calls.length, 0);
});

test('a call refuses redirects, times out, says who it is, and carries the token only in a header', async () => {
  const f = fake([['GET', /tokens\/verify/, { json: VERIFY_OK }], ['GET', /zones\?name=/, { json: ZONES_OK }]]);
  await checkCloudflare(f, { token: CF_TOKEN, domain: 'fieldday.dev' });
  for (const c of f.calls) {
    assert.equal(c.init.redirect, 'error');
    assert.ok(c.init.signal, 'a timeout signal');
    assert.equal(c.init.headers['user-agent'], 'nexus-cli');
    assert.ok(!c.url.includes(CF_TOKEN), 'never in the URL');
    assert.equal(c.init.headers.authorization, `Bearer ${CF_TOKEN}`);
    assert.ok(c.url.startsWith('https://api.cloudflare.com/'));
  }
  const s = fake([['GET', /auth\/v1\/health/, { json: { version: 'v2' } }]]);
  await checkSupabase(s, { url: URL_, publishable: SB_PUB });
  assert.equal(s.calls[0].init.headers.apikey, SB_PUB, 'Supabase keys go in apikey');
  assert.equal(s.calls[0].init.headers.authorization, undefined);
});

test('cloudflare: token works, zone pending with its nameservers, ids filled, extra fields dropped', async () => {
  const f = fake([['GET', /user\/tokens\/verify/, { json: VERIFY_OK }], ['GET', /zones\?name=fieldday\.dev/, { json: ZONES_OK }]]);
  const r = await checkCloudflare(f, { token: CF_TOKEN, domain: 'fieldday.dev' });
  assert.equal(r.ok, true);
  assert.match(r.summary, /fieldday\.dev is waiting for the nameservers to change: set ada\.ns\.cloudflare\.com and bob\.ns\.cloudflare\.com/);
  assert.deepEqual(r.facts.nameServers, ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com']);
  assert.equal(r.facts.active, false);
  assert.deepEqual(r.fill, { zoneId: ZONE, accountId: ACCOUNT });
  assert.ok(!JSON.stringify(r).includes(CF_TOKEN), 'the echoed token in an unknown field never comes back');
  const active = fake([['GET', /verify/, { json: VERIFY_OK }], ['GET', /zones/, { json: { success: true, result: [{ ...ZONES_OK.result[0], status: 'active' }] } }]]);
  assert.match((await checkCloudflare(active, { token: CF_TOKEN, domain: 'fieldday.dev' })).summary, /fieldday\.dev is active/);
});

test('cloudflare: an account token uses the account verify; without the account it asks for it', async () => {
  const f = fake([['GET', /accounts\/fedcba.*\/tokens\/verify/, { json: VERIFY_OK }]]);
  const r = await checkCloudflare(f, { token: 'cfat_TESTONLYcheck000000000000000', accountId: ACCOUNT });
  assert.equal(r.ok, true);
  assert.match(f.calls[0].url, /\/accounts\//);
  const no = fake([['GET', /user\/tokens\/verify/, { status: 401, json: { success: false } }]]);
  assert.match((await checkCloudflare(no, { token: 'cfat_TESTONLYcheck000000000000000' })).reason, /Paste the account ID first/);
});

test('plain reasons: 401, 403 (code 9109), no zone, 429 and a timeout', async () => {
  const bad = fake([['GET', /verify/, { status: 401, json: { success: false } }]]);
  assert.match((await checkCloudflare(bad, { token: CF_TOKEN })).reason, /Cloudflare says this token is not valid/);
  const noZoneRead = fake([['GET', /verify/, { json: VERIFY_OK }], ['GET', /zones/, { status: 200, json: { success: false, errors: [{ code: 9109 }], result: [] } }]]);
  assert.match((await checkCloudflare(noZoneRead, { token: CF_TOKEN, domain: 'fieldday.dev' })).reason, /Add Zone: Read/);
  const noZone = fake([['GET', /verify/, { json: VERIFY_OK }], ['GET', /zones/, { json: { success: true, result: [] } }]]);
  assert.match((await checkCloudflare(noZone, { token: CF_TOKEN, domain: 'fieldday.dev' })).reason, /cannot see fieldday\.dev/);
  const slow = fake([['GET', /verify/, { status: 429, json: {} }]]);
  assert.match((await checkCloudflare(slow, { token: CF_TOKEN })).reason, /slow down/);
  const abort = Object.assign(new Error('The operation was aborted: https://api.cloudflare.com/client/v4/user/tokens/verify'), { name: 'AbortError' });
  const timeout = fake([['GET', /verify/, abort]]);
  const t = await checkCloudflare(timeout, { token: CF_TOKEN });
  assert.equal(t.reason, 'No answer from api.cloudflare.com in 8 seconds. Try again.');
  const down = fake([['GET', /verify/, new TypeError('fetch failed')]]);
  assert.equal((await checkCloudflare(down, { token: CF_TOKEN })).reason, 'This machine could not reach api.cloudflare.com.');
});

test('supabase: each key on its own; the summary names the project, sign-in and tables', async () => {
  const f = fake([
    ['GET', /abcdefghijklmnopqrst\.supabase\.co\/auth\/v1\/health/, { json: { version: 'v2.170', name: 'GoTrue' } }],
    ['GET', /\/auth\/v1\/settings/, { json: { external: { github: true, google: false, email: true } } }],
    ['GET', /\/rest\/v1\//, { json: { paths: { '/': {}, '/teams': {}, '/fixtures': {}, '/rpc/x': {} } } }],
    ['GET', /api\.supabase\.com\/v1\/projects\/abcdefghijklmnopqrst/, { json: { name: 'fieldday-db', region: 'eu-west-2', status: 'ACTIVE_HEALTHY', db_pass: SB_SECRET } }],
  ]);
  const r = await checkSupabase(f, { url: URL_, publishable: SB_PUB, secret: SB_SECRET, pat: SB_PAT });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.summary, 'Keys work for project fieldday-db (eu-west-2). Sign-in is up; the secret key reads 2 tables.');
  assert.deepEqual(r.facts.providers, ['github']);
  assert.deepEqual(r.fill, { ref: 'abcdefghijklmnopqrst' });
  assert.ok(!JSON.stringify(r).includes(SB_SECRET));
  assert.equal(refOf(URL_), 'abcdefghijklmnopqrst');
});

test('supabase: missing_permissions names what to add; a 404 for the ref says the token cannot see it', async () => {
  const f = fake([
    ['GET', /auth\/v1\/health/, { json: {} }],
    ['GET', /api\.supabase\.com/, { status: 403, json: { message: 'nope', missing_permissions: ['Project Settings: Read'] } }],
  ]);
  const r = await checkSupabase(f, { url: URL_, publishable: SB_PUB, pat: SB_PAT });
  assert.equal(r.ok, false);
  assert.match(r.reason, /The access token is missing: Project Settings: Read\./);
  const g = fake([['GET', /auth\/v1\/health/, { json: {} }], ['GET', /api\.supabase\.com/, { status: 404, json: {} }]]);
  assert.match((await checkSupabase(g, { url: URL_, publishable: SB_PUB, pat: SB_PAT })).reason, /cannot see this project/);
  const h = fake([['GET', /rest\/v1/, { status: 401, json: {} }]]);
  assert.match((await checkSupabase(h, { url: URL_, secret: SB_SECRET })).reason, /secret key is not valid/);
});

test('vercel: projects to pick from, the team, and the domain\'s readiness', async () => {
  const f = fake([
    ['GET', /\/v2\/user/, { status: 403, json: {} }],
    ['GET', /\/v10\/projects\?limit=20/, { json: { projects: [{ id: 'prj_TESTONLYweb000', name: 'fieldday-web', accountId: 'team_TESTONLYteam00' }, { id: 'prj_TESTONLYdocs00', name: 'fieldday-docs', accountId: 'team_TESTONLYteam00' }] } }],
    ['GET', /\/v9\/projects\/prj_TESTONLYweb000\/domains/, { json: { domains: [{ name: 'fieldday.dev' }] } }],
    ['GET', /\/v6\/domains\/fieldday\.dev\/config/, { json: { misconfigured: true, configuredBy: null, recommendedIPv4: [{ rank: 1, value: ['76.76.21.21'] }], recommendedCNAME: [{ rank: 2, value: 'b.vercel-dns-017.com.' }, { rank: 1, value: 'a.vercel-dns-017.com.' }] } }],
    ['GET', /\/v4\/domains\/fieldday\.dev/, { status: 404, json: {} }],
  ]);
  const r = await checkVercel(f, { token: VC_TOKEN, projectId: 'prj_TESTONLYweb000', teamId: 'team_TESTONLYteam00', domain: 'fieldday.dev' });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.facts.projects.map((p) => p.name), ['fieldday-web', 'fieldday-docs']);
  assert.equal(r.facts.fullAccount, false);
  assert.equal(r.facts.domainOnProject, true);
  assert.equal(r.facts.domainOk, false);
  assert.deepEqual(r.facts.recommended, { a: '76.76.21.21', cname: 'a.vercel-dns-017.com.' });
  assert.deepEqual(r.fill, { teamId: 'team_TESTONLYteam00', projectId: 'prj_TESTONLYweb000' });
  assert.match(r.summary, /It sees 2 projects, fieldday-web among them/);
  const scoped = fake([['GET', /v2\/user/, { status: 403, json: {} }], ['GET', /v10\/projects/, { json: [{ id: 'prj_TESTONLYweb000', name: 'w' }] }], ['GET', /v9\/projects/, { status: 403, json: {} }]]);
  assert.match((await checkVercel(scoped, { token: VC_TOKEN, projectId: 'prj_TESTONLYweb000', domain: 'fieldday.dev' })).reason, /limited to one project/);
  const bad = fake([['GET', /v2\/user/, { status: 401, json: {} }]]);
  assert.match((await checkVercel(bad, { token: VC_TOKEN })).reason, /Vercel says this token is not valid/);
});

test('the fact allowlist keeps only named facts', () => {
  assert.deepEqual(pickFacts('cloudflare', { zone: true, token: CF_TOKEN, nameServers: ['a', 'b'], extra: 1 }), { zone: true, nameServers: ['a', 'b'] });
  assert.deepEqual(pickFacts('nope', { a: 1 }), {});
});

const DNS_CTX = { domain: 'fieldday.dev', cf: { token: CF_TOKEN, zoneId: ZONE }, vc: { token: VC_TOKEN, projectId: 'prj_TESTONLYweb000', teamId: 'team_TESTONLYteam00' } };
const CONFIG = { misconfigured: true, recommendedIPv4: [{ rank: 2, value: ['216.198.79.1'] }, { rank: 1, value: ['76.76.21.21'] }], recommendedCNAME: [{ rank: 1, value: 'd1d4.vercel-dns-017.com.' }] };

test('cloudflare.dns plan: rank-1 records, conflicts listed by key (never an id), replaced only when ticked', async () => {
  const posted = [];
  const deleted = [];
  const f = fake([
    ['GET', /api\.vercel\.com\/v6\/domains\/.*\/config/, { json: CONFIG }],
    ['GET', /dns_records\?name=fieldday\.dev$/, { json: { result: [{ id: 'rec-aaaa-1', type: 'AAAA', name: 'fieldday.dev', content: '2606:4700::1', proxied: true }] } }],
    ['GET', /dns_records\?name=www\.fieldday\.dev$/, { json: { result: [] } }],
    ['POST', /dns_records$/, (u, init) => { posted.push(JSON.parse(init.body)); return { json: { success: true } }; }],
    ['DELETE', /dns_records\/rec-aaaa-1$/, () => { deleted.push(1); return { json: { success: true } }; }],
  ]);
  const p = await planCloudflareDns(f, DNS_CTX);
  assert.equal(p.ok, true, p.reason);
  assert.deepEqual(p.plan.rows.map((r) => [r.op, r.type, r.name, r.content]), [['create', 'A', 'fieldday.dev', '76.76.21.21'], ['create', 'CNAME', 'www.fieldday.dev', 'd1d4.vercel-dns-017.com']]);
  assert.deepEqual(p.plan.conflicts, [{ key: 'c0', type: 'AAAA', name: 'fieldday.dev', content: '2606:4700::1', proxied: true }]);
  assert.ok(!JSON.stringify(p.plan).includes('rec-aaaa-1'), 'record ids stay on the server');
  assert.equal(p.plan.cta, 'Write 2 records');
  // Not ticked: the conflict stays, and the A at the same name is left alone.
  const kept = await doCloudflareDns(f, DNS_CTX, p.plan, p.secret, []);
  assert.equal(deleted.length, 0);
  assert.deepEqual(posted.map((b) => b.type), ['CNAME']);
  assert.match(kept.summary, /Left fieldday\.dev alone/);
  assert.equal(kept.ok, false, 'the apex still points at the old host, so the records are not done');
  assert.match(kept.reason, /fieldday\.dev still points at the old host/);
  posted.length = 0;
  const done = await doCloudflareDns(f, DNS_CTX, p.plan, p.secret, ['c0']);
  assert.equal(deleted.length, 1);
  assert.deepEqual(posted.map((b) => [b.type, b.proxied, b.ttl, b.comment]), [['A', false, 1, 'nexus: vercel'], ['CNAME', false, 1, 'nexus: vercel']]);
  assert.equal(done.summary, 'Done. 2 records written, DNS only. 1 replaced.');
});

test('vercel.env: secrets go sensitive, public values encrypted; values only in the body', async () => {
  const entries = [{ key: 'NEXT_PUBLIC_SUPABASE_URL', secret: false }, { key: 'SUPABASE_SECRET_KEY', secret: true }];
  const p = await planVercelEnv(null, { entries, vc: DNS_CTX.vc, projectName: 'fieldday-web' });
  assert.deepEqual(p.plan.rows.map((r) => [r.key, r.type]), [['NEXT_PUBLIC_SUPABASE_URL', 'encrypted'], ['SUPABASE_SECRET_KEY', 'sensitive']]);
  assert.match(p.plan.summary, /Send 2 names to fieldday-web: NEXT_PUBLIC_SUPABASE_URL \(encrypted\); SUPABASE_SECRET_KEY \(sensitive\)\./);
  let sent;
  const f = fake([['POST', /\/v10\/projects\/prj_TESTONLYweb000\/env\?upsert=true/, (u, init) => { sent = { u, body: JSON.parse(init.body) }; return { status: 201, json: { created: [], failed: [] } }; }]]);
  const r = await doVercelEnv(f, { entries, vc: DNS_CTX.vc, projectName: 'fieldday-web' }, { NEXT_PUBLIC_SUPABASE_URL: URL_, SUPABASE_SECRET_KEY: SB_SECRET });
  assert.equal(r.ok, true);
  assert.match(r.summary, /2 values sent to fieldday-web/);
  assert.match(r.summary, /Redeploy to use them\./);
  assert.ok(!sent.u.includes(SB_SECRET));
  assert.deepEqual(sent.body.map((b) => [b.key, b.type, b.target.length]), [['NEXT_PUBLIC_SUPABASE_URL', 'encrypted', 3], ['SUPABASE_SECRET_KEY', 'sensitive', 2]]);
  assert.ok(!JSON.stringify(r).includes(SB_SECRET));
});

test('vercel.domain and nameservers: the plain answers for 409, a missing deploy and an outside registrar', async () => {
  const taken = fake([['POST', /domains/, { status: 409, json: { error: { code: 'domain_taken' } } }]]);
  assert.match((await doVercelDomain(taken, DNS_CTX)).reason, /on another Vercel project/);
  const moving = fake([['POST', /domains/, { status: 409, json: { error: { code: 'conflict', message: 'The project is currently being transferred' } } }]]);
  assert.match((await doVercelDomain(moving, DNS_CTX)).reason, /being transferred/);
  const barred = fake([['POST', /domains/, { status: 409, json: { error: { code: 'forbidden', message: 'The domain is not allowed to be used' } } }]]);
  assert.match((await doVercelDomain(barred, DNS_CTX)).reason, /does not allow fieldday\.dev/);
  const early = fake([['POST', /domains/, { status: 400, json: { error: { code: 'missing_deployment', message: 'needs a production deployment' } } }]]);
  assert.match((await doVercelDomain(early, DNS_CTX)).reason, /Let the first build finish/);
  const ok = fake([['POST', /domains/, { json: { verified: false, verification: [{ type: 'TXT', domain: '_vercel.fieldday.dev', value: 'vc-domain-verify=fieldday.dev,abc', reason: 'x' }] } }]]);
  const r = await doVercelDomain(ok, DNS_CTX);
  assert.equal(r.ok, true);
  assert.equal(r.facts.verification[0].domain, '_vercel.fieldday.dev');
  const outside = fake([['PATCH', /nameservers/, { status: 400, json: { error: { code: 'domain_not_registered' } } }]]);
  assert.match((await doVercelNameservers(outside, { ...DNS_CTX, nameServers: ['a', 'b'] })).reason, /not registered with Vercel/);
});

test('nothing in the stack modules writes to the console', () => {
  for (const f of ['../server/stack-checks.mjs', '../server/stack.mjs']) {
    const src = fs.readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /console\./, f);
  }
});
