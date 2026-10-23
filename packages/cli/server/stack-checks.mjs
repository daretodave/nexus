// The stack hand-off's outbound calls (design section 7): one check per service and the actions that write for the
// person (DNS records, the domain, the project's env, the registrar's nameservers). Each call goes to an allowlisted
// host only, over https, with the token in a header (never the URL), redirects refused and an 8 second timeout.
// Answers are read for an allowlist of facts; every error becomes a plain reason. This module never logs: no line
// here writes to the console, and a fetch error's own message (which can echo the URL) is never passed on.
//
// Everything takes an injected `fetchImpl`, so the tests run every path against a fake.

export const ALLOW = [
  'api.cloudflare.com', 'api.vercel.com', 'api.supabase.com',
  // 0.5.2: each service's own API, exactly; nothing else.
  'oauth2.googleapis.com', 'cloudresourcemanager.googleapis.com', 'identitytoolkit.googleapis.com',
  'login.microsoftonline.com', 'management.azure.com',
  'discord.com', 'slack.com', 'api.twilio.com', 'api.stripe.com', 'api.clerk.com',
  'api.anthropic.com', 'api.openai.com', 'api.resend.com',
  'sentry.io', 'us.sentry.io', 'de.sentry.io', 'us.posthog.com', 'eu.posthog.com',
  'console.neon.tech', 'api.netlify.com', 'api.machines.dev',
];
const SUPABASE_HOST = /^[a-z0-9]{20}\.supabase\.co$/;
/** AWS STS: the global endpoint or a regional one (sts.eu-west-2.amazonaws.com). */
export const STS_HOST = /^sts(\.[a-z]{2,4}(-[a-z]+)+-\d{1,2})?\.amazonaws\.com$/;
/** An Upstash database's own REST endpoint (us1-merry-cat-32748.upstash.io). */
export const UPSTASH_HOST = /^[a-z0-9-]+\.upstash\.io$/;
const MAX_BYTES = 256 * 1024;
export const TIMEOUT_MS = 8000;

/** True for a host a call may reach: a service's API, a project's own <ref>.supabase.co, STS, or an Upstash database. */
export function hostAllowed(host) {
  const h = String(host);
  return ALLOW.includes(h) || SUPABASE_HOST.test(h) || STS_HOST.test(h) || UPSTASH_HOST.test(h);
}

/** The header each auth mode puts the token in. Only these names ever carry a token, and `extra` may not set them. */
const AUTH_HEADER = { bearer: 'authorization', bot: 'authorization', basic: 'authorization', raw: 'authorization', apikey: 'apikey', xapikey: 'x-api-key', goog: 'x-goog-api-key' };
const AUTH_PREFIX = { bearer: 'Bearer ', bot: 'Bot ', basic: 'Basic ', raw: '', apikey: '', xapikey: '', goog: '' };
const TOKEN_HEADERS = new Set(Object.values(AUTH_HEADER));

/** An error a call raises: kind is 'host' | 'timeout' | 'connect' | 'large'. Its message names the host only. */
export class CallError extends Error {
  constructor(kind, host) {
    super(kind === 'host' ? `${host} is not a host nexus calls` : kind);
    this.kind = kind;
    this.host = host;
  }
}

async function readCapped(res) {
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const parts = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { try { await reader.cancel(); } catch { /* gone */ } return null; }
      parts.push(value);
    }
    return Buffer.concat(parts.map((p) => Buffer.from(p))).toString('utf8');
  }
  const text = typeof res.text === 'function' ? await res.text() : '';
  return text.length > MAX_BYTES ? null : text;
}

/**
 * One call. host must pass hostAllowed (else it throws before any connection opens). The token goes only in a header,
 * by `header`: 'bearer' (Authorization: Bearer), 'bot' (Discord's Authorization: Bot), 'basic' (a base64 user:pass the
 * caller built), 'raw' (an Authorization the caller built, an AWS signature), 'apikey' (Supabase), 'xapikey'
 * (Anthropic's x-api-key) or 'goog' (Google's x-goog-api-key). `extra` adds plain headers (a version, a date), never
 * a token header. A body is JSON (`body`), a form (`form`) or text the caller signed (`rawBody`, its type in extra).
 * Returns { status, json, headers }: x-ratelimit-remaining and any `keep` names, each cut short; `text` too when
 * `raw` (an XML answer).
 */
export async function call(fetchImpl, { host, path = '/', method = 'GET', token, header = 'bearer', body, form, rawBody, extra = {}, keep = [], raw = false, ua, timeoutMs = TIMEOUT_MS }) {
  if (!hostAllowed(host)) throw new CallError('host', host);
  if (typeof path !== 'string' || !path.startsWith('/')) throw new CallError('host', host);
  const headers = { 'user-agent': ua || 'nexus-cli', accept: 'application/json' };
  for (const [k, v] of Object.entries(extra || {})) {
    const name = String(k).toLowerCase();
    if (TOKEN_HEADERS.has(name) || typeof v !== 'string') continue;
    headers[name] = v;
  }
  if (token) {
    const mode = AUTH_HEADER[header] ? header : 'bearer';
    headers[AUTH_HEADER[mode]] = `${AUTH_PREFIX[mode]}${token}`;
  }
  let payload;
  if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  else if (form) { headers['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form).toString(); }
  else if (typeof rawBody === 'string') payload = rawBody;
  let res;
  try {
    res = await fetchImpl(`https://${host}${path}`, {
      method, headers, redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      ...(payload !== undefined ? { body: payload } : {}),
    });
  } catch (e) {
    const name = e && (e.name || e.code);
    throw new CallError(name === 'AbortError' || name === 'TimeoutError' ? 'timeout' : 'connect', host);
  }
  let text;
  try { text = await readCapped(res); } catch { throw new CallError('connect', host); }
  if (text === null) throw new CallError('large', host);
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  const out = {};
  for (const k of ['x-ratelimit-remaining', ...keep]) {
    const v = res.headers && typeof res.headers.get === 'function' ? res.headers.get(k) : null;
    if (v != null) out[k] = String(v).slice(0, 80);
  }
  return { status: res.status, json, headers: out, ...(raw ? { text } : {}) };
}

// ---- plain reasons (design 7.4) ----------------------------------------------------------------------------------

const NAMES = {
  cloudflare: 'Cloudflare', supabase: 'Supabase', vercel: 'Vercel', aws: 'AWS', gcp: 'Google Cloud', azure: 'Azure', firebase: 'Firebase',
  stripe: 'Stripe', clerk: 'Clerk', neon: 'Neon', upstash: 'Upstash', netlify: 'Netlify', fly: 'Fly.io', discord: 'Discord', slack: 'Slack',
  twilio: 'Twilio', resend: 'Resend', anthropic: 'Anthropic', openai: 'OpenAI', sentry: 'Sentry', posthog: 'PostHog',
};

/** A plain reason for a failed call or status. hint: { what, permission, thing, field }. */
export function reasonFor(service, r, hint = {}) {
  const S = NAMES[service] || service;
  if (r instanceof CallError) {
    if (r.kind === 'timeout') return `No answer from ${r.host} in 8 seconds. Try again.`;
    if (r.kind === 'host') return 'nexus only calls the service\'s own API. Nothing was sent.';
    if (r.kind === 'large') return `${S} answered with more than nexus reads. Nothing was changed.`;
    return `This machine could not reach ${r.host}.`;
  }
  const status = r && r.status;
  if (status === 401) return `${S} says this token is not valid. It may have been copied short or revoked.`;
  if (status === 403) return `The token works but is not allowed to ${hint.what || 'do that'}.${hint.permission ? ` Add ${hint.permission}.` : ''}`;
  if (status === 404 && hint.thing) return `${S} cannot find ${hint.thing}.${hint.field ? ` Check ${hint.field}.` : ''}`;
  if (status === 429) return 'The service asked us to slow down. Try again in a minute.';
  return `${S} answered ${status}. Nothing was changed.`;
}

/** Run a call and turn a thrown CallError into { error } (the reason), so each check reads straight down. */
export async function attempt(fetchImpl, service, opts) {
  try { return await call(fetchImpl, opts); } catch (e) { return { status: 0, error: e instanceof CallError ? reasonFor(service, e) : `${NAMES[service]} could not be reached.` }; }
}

// ---- facts ------------------------------------------------------------------------------------------------------

/** The facts each check may keep. Anything else in an answer is dropped before it reaches stack.json or the browser. */
export const FACTS = {
  cloudflare: ['zone', 'status', 'active', 'nameServers', 'originalNameServers', 'zoneId', 'accountId', 'accountName', 'expiresOn'],
  supabase: ['ref', 'authOk', 'authVersion', 'providers', 'secretOk', 'tables', 'projectName', 'region', 'projectStatus'],
  vercel: ['projects', 'team', 'fullAccount', 'defaultTeamId', 'username', 'domainOnProject', 'domainOk', 'configuredBy', 'recommended', 'vercelRegistrar'],
  aws: ['keyOk', 'account', 'arn', 'principalType', 'keyKind', 'region'],
  gcp: ['keyOk', 'clientEmail', 'projectId', 'projectOk', 'projectNumber', 'projectName', 'projectState'],
  azure: ['tenantOk', 'subscriptionName', 'subscriptionState', 'resourceGroupOk', 'resourceGroupLocation'],
  firebase: ['projectId', 'projectMatches', 'authorizedDomains', 'domainAuthorized', 'authReady', 'referrerLocked', 'serviceAccountProject', 'serviceAccountMatches'],
  stripe: ['mode', 'keyKind', 'permissionOk', 'missingPermission'],
  clerk: ['keyOk', 'mode', 'frontendApi'],
  neon: ['keyOk', 'projectId', 'projectName', 'regionId', 'pgVersion', 'projects'],
  upstash: ['pong', 'endpoint'],
  netlify: ['siteFound', 'siteName', 'siteUrl', 'accountSlug'],
  fly: ['appFound', 'appName', 'appStatus', 'orgSlug'],
  discord: ['botOk', 'botUser', 'botId', 'applicationId', 'appName', 'publicKeyMatches', 'botPublic', 'guildCount', 'messageContent'],
  slack: ['botOk', 'teamId', 'team', 'botUser', 'botId', 'isBot', 'enterprise'],
  twilio: ['keyOk', 'numbers', 'numberCount', 'hasFrom', 'smsCapable'],
  resend: ['keyOk', 'access', 'domains', 'verifiedDomains', 'domainStatus', 'domainOk'],
  anthropic: ['keyOk', 'models', 'newestModel', 'workspaceId', 'organizationId', 'needsWorkspace'],
  openai: ['keyOk', 'models', 'restricted'],
  sentry: ['keyOk', 'orgSlug', 'region'],
  posthog: ['keyOk', 'projectId', 'projectName', 'region'],
};

const short = (s, n = 200) => String(s).slice(0, n);
function clean(v, depth = 0) {
  if (v == null || typeof v === 'boolean' || typeof v === 'number') return v;
  if (typeof v === 'string') return short(v);
  if (depth > 2) return null;
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => clean(x, depth + 1));
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).slice(0, 10).map(([k, x]) => [short(k, 40), clean(x, depth + 1)]));
  return null;
}

/** Keep only a check's allowlisted facts, each trimmed to a plain shape. */
export function pickFacts(id, facts) {
  const allow = FACTS[id] || [];
  const out = {};
  for (const k of allow) if (facts && facts[k] !== undefined) out[k] = clean(facts[k]);
  return out;
}

// ---- checks (design 7.2) ----------------------------------------------------------------------------------------

const CF = 'api.cloudflare.com';
const VC = 'api.vercel.com';
const SB = 'api.supabase.com';
const enc = encodeURIComponent;

/** Cloudflare: the token verifies, then (with a domain) the zone it can see, its status and nameservers. */
export async function checkCloudflare(fetchImpl, { token, domain, accountId } = {}) {
  if (!token) return { ok: false, reason: 'Paste the API token first.', facts: {} };
  const facts = {};
  const accountToken = /^cfat_/.test(token);
  const path = accountToken && accountId ? `/client/v4/accounts/${enc(accountId)}/tokens/verify` : '/client/v4/user/tokens/verify';
  const v = await attempt(fetchImpl, 'cloudflare', { host: CF, path, token });
  if (v.error) return { ok: false, reason: v.error, facts };
  if (v.status !== 200 || !v.json?.success || v.json?.result?.status !== 'active') {
    if (accountToken && !accountId) return { ok: false, reason: 'Account tokens are checked against an account. Paste the account ID first.', facts };
    if (v.status === 200) return { ok: false, reason: 'Cloudflare says this token is not active. Make a new one, or turn it back on.', facts };
    return { ok: false, reason: reasonFor('cloudflare', v, { what: 'check itself' }), facts };
  }
  if (v.json.result.expires_on) facts.expiresOn = v.json.result.expires_on;
  if (!domain) return { ok: true, summary: 'Token works. Add your domain to see the zone.', facts: pickFacts('cloudflare', facts), fill: {} };
  const z = await attempt(fetchImpl, 'cloudflare', { host: CF, path: `/client/v4/zones?name=${enc(domain)}`, token });
  if (z.error) return { ok: false, reason: z.error, facts: pickFacts('cloudflare', facts) };
  const codes = (z.json?.errors || []).map((e) => e && e.code);
  if (z.status === 403 || codes.includes(9109)) return { ok: false, reason: 'The token works but is not allowed to read zones. Add Zone: Read to the token.', facts: pickFacts('cloudflare', facts) };
  if (z.status !== 200) return { ok: false, reason: reasonFor('cloudflare', z, { what: 'read the zone', permission: 'Zone: Read' }), facts: pickFacts('cloudflare', facts) };
  const zone = (z.json?.result || [])[0];
  if (!zone) return { ok: false, reason: `The token works but cannot see ${domain}. Add the site on Cloudflare, or scope the token to that zone.`, facts: pickFacts('cloudflare', { ...facts, zone: false }) };
  Object.assign(facts, {
    zone: true,
    status: zone.status,
    active: zone.status === 'active',
    nameServers: Array.isArray(zone.name_servers) ? zone.name_servers : [],
    originalNameServers: Array.isArray(zone.original_name_servers) ? zone.original_name_servers : [],
    zoneId: zone.id,
    accountId: zone.account?.id,
    accountName: zone.account?.name,
  });
  const ns = facts.nameServers.join(' and ');
  const summary = facts.active
    ? `Token works. ${domain} is active.`
    : `Token works. ${domain} is waiting for the nameservers to change${ns ? `: set ${ns} at your registrar.` : '.'}`;
  return { ok: true, summary, facts: pickFacts('cloudflare', facts), fill: { zoneId: facts.zoneId, accountId: facts.accountId } };
}

/** The project ref in a supabase.co URL, or null (a custom domain is never fetched). */
export function refOf(url) {
  const m = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/.exec(String(url || '').trim());
  return m ? m[1] : null;
}

/** Supabase: whichever of the publishable key, the secret key and the access token are present, each on its own. */
export async function checkSupabase(fetchImpl, { url, publishable, secret, pat } = {}) {
  if (!url) return { ok: false, reason: 'Paste the project URL first; every check starts from it.', facts: {} };
  const ref = refOf(url);
  if (!ref) return { ok: false, reason: 'Check it only knows supabase.co URLs. Your values are saved; nothing was called.', facts: {} };
  const host = `${ref}.supabase.co`;
  const facts = { ref };
  const reasons = [];
  let ran = 0;
  if (publishable) {
    ran += 1;
    const h = await attempt(fetchImpl, 'supabase', { host, path: '/auth/v1/health', token: publishable, header: 'apikey' });
    if (h.error) reasons.push(h.error);
    else if (h.status === 200) {
      facts.authOk = true;
      if (h.json?.version) facts.authVersion = h.json.version;
      const s = await attempt(fetchImpl, 'supabase', { host, path: '/auth/v1/settings', token: publishable, header: 'apikey' });
      if (s.status === 200 && s.json?.external && typeof s.json.external === 'object') {
        facts.providers = Object.entries(s.json.external).filter(([k, on]) => on === true && k !== 'email' && k !== 'phone').map(([k]) => k);
      }
    } else reasons.push(h.status === 401 ? 'Supabase says the publishable key is not valid for this project. Copy it again from Connect.' : reasonFor('supabase', h));
  }
  if (secret) {
    ran += 1;
    const r = await attempt(fetchImpl, 'supabase', { host, path: '/rest/v1/', token: secret, header: 'apikey' });
    if (r.error) reasons.push(r.error);
    else if (r.status === 200) {
      facts.secretOk = true;
      facts.tables = Object.keys(r.json?.paths || {}).filter((p) => p !== '/' && !p.startsWith('/rpc/')).length;
    } else reasons.push(r.status === 401 ? 'Supabase says the secret key is not valid for this project. Copy it again from API keys.' : reasonFor('supabase', r));
  }
  if (pat) {
    ran += 1;
    const p = await attempt(fetchImpl, 'supabase', { host: SB, path: `/v1/projects/${enc(ref)}`, token: pat });
    if (p.error) reasons.push(p.error);
    else if (p.status === 200) Object.assign(facts, { projectName: p.json?.name, region: p.json?.region, projectStatus: p.json?.status });
    else if (p.status === 403) {
      const miss = (Array.isArray(p.json?.missing_permissions) ? p.json.missing_permissions : []).map((x) => (typeof x === 'string' ? x : x && x.name)).filter(Boolean);
      reasons.push(`The access token is missing: ${miss.length ? miss.join(', ') : 'Project Settings: Read'}.`);
    } else if (p.status === 404) reasons.push(facts.authOk ? 'The access token cannot see this project.' : 'Supabase cannot find this project. Check the project URL.');
    else reasons.push(reasonFor('supabase', p));
  }
  if (!ran) return { ok: false, reason: 'Paste the publishable key or the secret key, then check.', facts: pickFacts('supabase', facts), fill: { ref } };
  const name = facts.projectName ? `project ${facts.projectName}${facts.region ? ` (${facts.region})` : ''}` : `project ${ref}`;
  const bits = [];
  if (facts.authOk) bits.push('Sign-in is up');
  if (facts.secretOk) bits.push(`the secret key reads ${facts.tables} ${facts.tables === 1 ? 'table' : 'tables'}`);
  const summary = `Keys work for ${name}.${bits.length ? ` ${bits.join('; ')}.` : ''}`;
  if (reasons.length) return { ok: false, reason: reasons.join(' '), summary: bits.length ? summary : undefined, facts: pickFacts('supabase', facts), fill: { ref } };
  return { ok: true, summary, facts: pickFacts('supabase', facts), fill: { ref } };
}

const teamQuery = (teamId, first = '?') => (/^team_/.test(String(teamId || '')) ? `${first}teamId=${enc(teamId)}` : '');

/** Vercel: who the token is, the projects it sees, and (with a project and a domain) whether the domain is ready. */
export async function checkVercel(fetchImpl, { token, projectId, teamId, domain } = {}) {
  if (!token) return { ok: false, reason: 'Paste the access token first.', facts: {} };
  const facts = {};
  const u = await attempt(fetchImpl, 'vercel', { host: VC, path: '/v2/user', token });
  if (u.error) return { ok: false, reason: u.error, facts };
  if (u.status === 401) return { ok: false, reason: reasonFor('vercel', u), facts };
  if (u.status === 200) Object.assign(facts, { fullAccount: !u.json?.user?.limited, defaultTeamId: u.json?.user?.defaultTeamId, username: u.json?.user?.username });
  else facts.fullAccount = false;
  const tq = facts.fullAccount ? teamQuery(teamId, '&') : '';
  const p = await attempt(fetchImpl, 'vercel', { host: VC, path: `/v10/projects?limit=20${tq}`, token });
  if (p.error) return { ok: false, reason: p.error, facts: pickFacts('vercel', facts) };
  if (p.status !== 200) return { ok: false, reason: reasonFor('vercel', p, { what: 'list projects' }), facts: pickFacts('vercel', facts) };
  const list = Array.isArray(p.json) ? p.json : Array.isArray(p.json?.projects) ? p.json.projects : [];
  facts.projects = list.slice(0, 20).map((x) => ({ id: x.id, name: x.name }));
  facts.team = list[0]?.accountId || (/^team_/.test(String(teamId || '')) ? teamId : facts.defaultTeamId) || undefined;
  const reasons = [];
  let domainLine = '';
  const picked = projectId && facts.projects.find((x) => x.id === projectId);
  if (projectId && domain) {
    const q = teamQuery(teamId);
    const d = await attempt(fetchImpl, 'vercel', { host: VC, path: `/v9/projects/${enc(projectId)}/domains${q}`, token });
    if (d.status === 403) reasons.push('This token is limited to one project, so it cannot read the domain. Make a team token to finish the domain steps.');
    else if (d.status === 200) facts.domainOnProject = (d.json?.domains || []).some((x) => x && x.name === domain);
    else if (d.error) reasons.push(d.error);
    if (!reasons.length) {
      const c = await attempt(fetchImpl, 'vercel', { host: VC, path: `/v6/domains/${enc(domain)}/config?projectIdOrName=${enc(projectId)}${teamQuery(teamId, '&')}`, token });
      if (c.status === 200) {
        facts.domainOk = c.json?.misconfigured === false;
        facts.configuredBy = c.json?.configuredBy ?? null;
        const ip = (c.json?.recommendedIPv4 || []).find((x) => x.rank === 1) || (c.json?.recommendedIPv4 || [])[0];
        const cn = (c.json?.recommendedCNAME || []).find((x) => x.rank === 1) || (c.json?.recommendedCNAME || [])[0];
        facts.recommended = { a: Array.isArray(ip?.value) ? ip.value[0] : ip?.value, cname: cn?.value };
        if (facts.configuredBy === 'http') reasons.push('Vercel sees the domain through a proxy. Set the records to DNS only (grey cloud).');
        domainLine = facts.domainOk ? ` ${domain} is valid on ${picked?.name || 'the project'}.` : facts.domainOnProject ? ` ${domain} is on ${picked?.name || 'the project'}; its records are not there yet.` : '';
      } else if (c.status === 403) reasons.push('This token is limited to one project, so it cannot read the domain. Make a team token to finish the domain steps.');
      const r = await attempt(fetchImpl, 'vercel', { host: VC, path: `/v4/domains/${enc(domain)}${teamQuery(teamId)}`, token });
      if (r.status === 200) facts.vercelRegistrar = !!(r.json?.domain?.boughtAt);
    }
  }
  const fill = {};
  if (facts.team) fill.teamId = facts.team;
  if (picked) fill.projectId = picked.id;
  else if (facts.projects.length === 1) fill.projectId = facts.projects[0].id;
  const n = facts.projects.length;
  const summary = `Token works. It sees ${n} ${n === 1 ? 'project' : 'projects'}${picked ? `, ${picked.name} among them` : ''}.${domainLine}`;
  if (reasons.length) return { ok: false, reason: reasons.join(' '), summary, facts: pickFacts('vercel', facts), fill };
  return { ok: true, summary, facts: pickFacts('vercel', facts), fill };
}

export const CHECKS = { cloudflare: checkCloudflare, supabase: checkSupabase, vercel: checkVercel };

// ---- actions (design 6.7) ---------------------------------------------------------------------------------------

/**
 * cloudflare.dns, the plan: the records Vercel recommends for the apex and www, read from Vercel; any A, AAAA or
 * CNAME already at those names listed as a conflict (by a key, never its record id); a TXT for Vercel's verification
 * when the domain add asked for one. ctx: { domain, cf: { token, zoneId }, vc: { token, projectId, teamId },
 * verification? }.
 */
export async function planCloudflareDns(fetchImpl, ctx) {
  const { domain, cf, vc } = ctx;
  if (!domain || !cf?.token || !cf?.zoneId) return { ok: false, reason: 'Save the Cloudflare token and zone ID first.' };
  if (!vc?.token || !vc?.projectId) return { ok: false, reason: 'Save the Vercel token and pick the project first.' };
  const want = [];
  for (const [name, type] of [[domain, 'A'], [`www.${domain}`, 'CNAME']]) {
    const c = await attempt(fetchImpl, 'vercel', { host: VC, path: `/v6/domains/${enc(name)}/config?projectIdOrName=${enc(vc.projectId)}${teamQuery(vc.teamId, '&')}`, token: vc.token });
    if (c.error) return { ok: false, reason: c.error };
    if (c.status !== 200) return { ok: false, reason: reasonFor('vercel', c, { what: 'read the domain', thing: name, field: 'that the domain is on the project' }) };
    if (type === 'A') {
      const ip = (c.json?.recommendedIPv4 || []).find((x) => x.rank === 1) || (c.json?.recommendedIPv4 || [])[0];
      const v = Array.isArray(ip?.value) ? ip.value[0] : ip?.value;
      if (!v) return { ok: false, reason: `Vercel did not say which address ${domain} should use. Add the domain to the project first.` };
      want.push({ type: 'A', name: domain, content: v });
    } else {
      const cn = (c.json?.recommendedCNAME || []).find((x) => x.rank === 1) || (c.json?.recommendedCNAME || [])[0];
      if (!cn?.value) return { ok: false, reason: `Vercel did not say where www.${domain} should point. Add the domain to the project first.` };
      want.push({ type: 'CNAME', name: `www.${domain}`, content: String(cn.value).replace(/\.$/, '') });
    }
  }
  for (const v of ctx.verification || []) if (v && v.type === 'TXT' && v.domain && v.value) want.push({ type: 'TXT', name: v.domain, content: v.value, verify: true });
  const rows = [];
  const conflicts = [];
  const ids = {};
  for (const w of want) {
    const r = await attempt(fetchImpl, 'cloudflare', { host: CF, path: `/client/v4/zones/${enc(cf.zoneId)}/dns_records?name=${enc(w.name)}`, token: cf.token });
    if (r.error) return { ok: false, reason: r.error };
    if (r.status !== 200) return { ok: false, reason: reasonFor('cloudflare', r, { what: 'read DNS records', permission: 'Zone: DNS: Edit' }) };
    const have = (r.json?.result || []).filter((x) => x && x.name === w.name);
    const same = have.find((x) => x.type === w.type && String(x.content).replace(/\.$/, '') === w.content);
    if (same && !same.proxied) { rows.push({ ...w, op: 'keep' }); continue; }
    if (w.type !== 'TXT') {
      for (const x of have.filter((y) => ['A', 'AAAA', 'CNAME'].includes(y.type))) {
        const key = `c${conflicts.length}`;
        ids[key] = x.id;
        conflicts.push({ key, type: x.type, name: x.name, content: short(x.content, 120), proxied: !!x.proxied });
      }
    }
    rows.push({ ...w, op: 'create' });
  }
  const make = rows.filter((x) => x.op === 'create');
  const lines = rows.map((x) => (x.op === 'keep' ? `${x.type} ${x.name} -> ${x.content} is there already.` : `Create ${x.type} ${x.name} -> ${x.content} (DNS only).`));
  return {
    ok: true,
    plan: { rows, conflicts, lines, count: make.length, cta: make.length ? `Write ${make.length} ${make.length === 1 ? 'record' : 'records'}` : 'Nothing to write', summary: lines.join(' ') },
    secret: { ids },
  };
}

/** cloudflare.dns, the write: delete only the conflicts the person ticked, then create each planned record. */
export async function doCloudflareDns(fetchImpl, ctx, plan, secretPart, replace = []) {
  const { cf, vc, domain } = ctx;
  const ticked = new Set(replace);
  let removed = 0;
  for (const c of plan.conflicts) {
    if (!ticked.has(c.key)) continue;
    const id = secretPart.ids[c.key];
    const d = await attempt(fetchImpl, 'cloudflare', { host: CF, path: `/client/v4/zones/${enc(cf.zoneId)}/dns_records/${enc(id)}`, method: 'DELETE', token: cf.token });
    if (d.error || d.status !== 200) return { ok: false, reason: d.error || reasonFor('cloudflare', d, { what: 'delete records', permission: 'Zone: DNS: Edit' }) };
    removed += 1;
  }
  const blocked = new Set(plan.conflicts.filter((c) => !ticked.has(c.key)).map((c) => c.name));
  let written = 0;
  const skipped = [];
  for (const r of plan.rows.filter((x) => x.op === 'create')) {
    if (r.type !== 'TXT' && blocked.has(r.name)) { skipped.push(r.name); continue; }
    const p = await attempt(fetchImpl, 'cloudflare', {
      host: CF, path: `/client/v4/zones/${enc(cf.zoneId)}/dns_records`, method: 'POST', token: cf.token,
      body: { type: r.type, name: r.name, content: r.content, ttl: 1, proxied: false, comment: 'nexus: vercel' },
    });
    if (p.error) return { ok: false, reason: p.error };
    if (p.status !== 200 || p.json?.success === false) return { ok: false, reason: p.status === 403 ? 'The token works but is not allowed to write DNS records. Add Zone: DNS: Edit.' : `Cloudflare did not take the ${r.type} record for ${r.name}. Nothing else was changed after it.` };
    written += 1;
  }
  if (plan.rows.some((x) => x.verify) && vc?.token && vc?.projectId) {
    await attempt(fetchImpl, 'vercel', { host: VC, path: `/v9/projects/${enc(vc.projectId)}/domains/${enc(domain)}/verify${teamQuery(vc.teamId)}`, method: 'POST', token: vc.token });
  }
  const parts = [`${written} ${written === 1 ? 'record' : 'records'} written, DNS only.`];
  if (removed) parts.push(`${removed} replaced.`);
  if (skipped.length) parts.push(`Left ${skipped.join(', ')} alone: tick Replace to swap the record there.`);
  // A record left behind a conflict means the name still points elsewhere: not done, whatever else was written.
  if (skipped.length) return { ok: false, summary: parts.join(' '), reason: `${parts.join(' ')} ${skipped.join(', ')} still ${skipped.length === 1 ? 'points' : 'point'} at the old host.` };
  return { ok: true, summary: `Done. ${parts.join(' ')}` };
}

/** vercel.domain, the plan. ctx: { domain, vc: { token, projectId, teamId }, projectName? }. */
export async function planVercelDomain(_fetchImpl, ctx) {
  const { domain, vc } = ctx;
  if (!domain) return { ok: false, reason: 'Add your domain first.' };
  if (!vc?.token || !vc?.projectId) return { ok: false, reason: 'Save the Vercel token and pick the project first.' };
  const to = ctx.projectName || 'the project';
  const lines = [`Add ${domain} and www.${domain} (redirects to ${domain}, 308) to ${to}.`];
  return { ok: true, plan: { lines, count: 2, cta: 'Add the domain', summary: lines[0] }, secret: {} };
}

/** vercel.domain, the write: the apex, then www redirecting to it. Keeps Vercel's verification asks (not secret). */
export async function doVercelDomain(fetchImpl, ctx) {
  const { domain, vc } = ctx;
  const verification = [];
  for (const body of [{ name: domain }, { name: `www.${domain}`, redirect: domain, redirectStatusCode: 308 }]) {
    const r = await attempt(fetchImpl, 'vercel', { host: VC, path: `/v10/projects/${enc(vc.projectId)}/domains${teamQuery(vc.teamId)}`, method: 'POST', token: vc.token, body });
    if (r.error) return { ok: false, reason: r.error };
    const code = r.json?.error?.code || '';
    const msg = String(r.json?.error?.message || '');
    if (r.status === 409) {
      if (/transfer/i.test(`${code} ${msg}`)) return { ok: false, reason: 'The project is being transferred. Try again once the transfer is done.' };
      if (/not allowed|forbidden|blocked/i.test(`${code} ${msg}`)) return { ok: false, reason: `Vercel does not allow ${body.name} to be used. Check the name, or ask Vercel support.` };
      if (/taken|another project|in use|already|conflict/i.test(`${code} ${msg}`) || !msg) return { ok: false, reason: `${body.name} is on another Vercel project. Remove it there first.` };
      return { ok: false, reason: `Vercel did not add ${body.name}: ${short(msg, 160)}` };
    }
    if (r.status === 400 && /already|exists/i.test(`${code} ${msg}`) && !/another/i.test(msg)) continue;
    if (r.status === 400 && /deploy/i.test(`${code} ${msg}`)) return { ok: false, reason: 'Vercel adds a domain only after a production deploy finished. Let the first build finish.' };
    if (r.status !== 200) return { ok: false, reason: reasonFor('vercel', r, { what: 'add domains', thing: 'the project', field: 'the project ID' }) };
    for (const v of r.json?.verification || []) if (v && v.type && v.domain && v.value) verification.push({ type: short(v.type, 10), domain: short(v.domain), value: short(v.value) });
  }
  return { ok: true, summary: `Done. ${domain} and www.${domain} are on ${ctx.projectName || 'the project'}.`, facts: verification.length ? { verification } : {} };
}

/**
 * vercel.env, the plan: each name as Vercel will hold it. A secret goes as `sensitive` (write-only there; Vercel keeps
 * sensitive values for production and preview only), a public value as `encrypted` to all three environments.
 * ctx: { entries: [{ key, secret }], projectName? }.
 */
export async function planVercelEnv(_fetchImpl, ctx) {
  const entries = ctx.entries || [];
  if (!entries.length) return { ok: false, reason: 'Save the Supabase values first.' };
  if (!ctx.vc?.token || !ctx.vc?.projectId) return { ok: false, reason: 'Save the Vercel token and pick the project first.' };
  const rows = entries.map((e) => ({ key: e.key, type: e.secret ? 'sensitive' : 'encrypted', target: envTargets(e.secret) }));
  const enc2 = rows.filter((r) => r.type === 'encrypted').map((r) => r.key);
  const sen = rows.filter((r) => r.type === 'sensitive').map((r) => r.key);
  const to = ctx.projectName || 'the project';
  const line = `Send ${rows.length} ${rows.length === 1 ? 'name' : 'names'} to ${to}: ${[enc2.length ? `${enc2.join(', ')} (encrypted)` : '', sen.length ? `${sen.join(', ')} (sensitive)` : ''].filter(Boolean).join('; ')}.`;
  return { ok: true, plan: { rows, lines: [line], count: rows.length, cta: 'Send to Vercel', summary: line }, secret: {} };
}

export const envTargets = (secret) => (secret ? ['production', 'preview'] : ['production', 'preview', 'development']);

/** vercel.env, the write: one upsert of every name; values are read from the vault by the caller and go only here. */
export async function doVercelEnv(fetchImpl, ctx, values) {
  const { vc } = ctx;
  const body = (ctx.entries || []).filter((e) => typeof values[e.key] === 'string').map((e) => ({ key: e.key, value: values[e.key], type: e.secret ? 'sensitive' : 'encrypted', target: envTargets(e.secret), comment: 'nexus: stack' }));
  if (!body.length) return { ok: false, reason: 'The vault holds none of these values yet.' };
  const r = await attempt(fetchImpl, 'vercel', { host: VC, path: `/v10/projects/${enc(vc.projectId)}/env?upsert=true${teamQuery(vc.teamId, '&')}`, method: 'POST', token: vc.token, body });
  if (r.error) return { ok: false, reason: r.error };
  if (r.status !== 200 && r.status !== 201) return { ok: false, reason: reasonFor('vercel', r, { what: 'set the project\'s env', thing: 'the project', field: 'the project ID' }) };
  const failed = (r.json?.failed || []).map((f) => ({ name: short(f?.error?.envVarKey || f?.error?.key || f?.key || '?', 80), why: short(f?.error?.message || 'Vercel did not take it.', 160) }));
  const sent = body.length - failed.length;
  const head = `${sent} ${sent === 1 ? 'value' : 'values'} sent to ${ctx.projectName || 'the project'} (production, preview, development; secrets to production and preview).`;
  return { ok: failed.length === 0, summary: `${head}${failed.length ? ` Not taken: ${failed.map((f) => `${f.name} (${f.why})`).join('; ')}.` : ''} Redeploy to use them.`, sent: body.map((b) => b.key).filter((k) => !failed.some((f) => f.name === k)) };
}

/** vercel.nameservers, the plan. ctx: { domain, nameServers }. */
export async function planVercelNameservers(_fetchImpl, ctx) {
  const ns = ctx.nameServers || [];
  if (!ctx.domain || ns.length < 2) return { ok: false, reason: 'Check the Cloudflare card first, so nexus knows the two nameservers.' };
  if (!ctx.vc?.token) return { ok: false, reason: 'Save the Vercel token first.' };
  const line = `Set ${ctx.domain}'s nameservers at Vercel to ${ns.join(', ')}.`;
  return { ok: true, plan: { lines: [line], count: ns.length, cta: 'Set the nameservers', summary: line }, secret: {} };
}

/** vercel.nameservers, the write: only for a domain bought through Vercel. */
export async function doVercelNameservers(fetchImpl, ctx) {
  const r = await attempt(fetchImpl, 'vercel', { host: VC, path: `/v1/registrar/domains/${enc(ctx.domain)}/nameservers${teamQuery(ctx.vc.teamId)}`, method: 'PATCH', token: ctx.vc.token, body: { nameservers: ctx.nameServers } });
  if (r.error) return { ok: false, reason: r.error };
  if (r.status === 204 || r.status === 200) return { ok: true, summary: `Done. ${ctx.domain} now points at Cloudflare's nameservers. It can take a while to spread.` };
  if (r.json?.error?.code === 'domain_not_registered') return { ok: false, reason: 'This domain is not registered with Vercel. Change the nameservers at your registrar.' };
  return { ok: false, reason: reasonFor('vercel', r, { what: 'change nameservers' }) };
}

export const ACTION_FNS = {
  'cloudflare.dns': { plan: planCloudflareDns, run: doCloudflareDns },
  'vercel.domain': { plan: planVercelDomain, run: doVercelDomain },
  'vercel.env': { plan: planVercelEnv, run: doVercelEnv },
  'vercel.nameservers': { plan: planVercelNameservers, run: doVercelNameservers },
};
