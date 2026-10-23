// Check it for the 0.5.2 services (AWS through PostHog), on the same rails as stack-checks.mjs: an allowlisted host
// only, https, the token in a header (never the URL or a log), redirects refused, an 8 second timeout, read-only calls,
// and only allowlisted facts kept (FACTS there). A service's own error text is never passed on: some echo part of the
// key. This module never logs.
//
// CHECKS here is the full map server/stack.mjs dispatches on: the first three from stack-checks.mjs plus these.
import crypto from 'node:crypto';
import { CHECKS as FIRST, attempt, reasonFor, pickFacts } from './stack-checks.mjs';

const enc = encodeURIComponent;
const sha256hex = (x) => crypto.createHash('sha256').update(x).digest('hex');
const hmac = (k, x) => crypto.createHmac('sha256', k).update(x).digest();

// ---- AWS ----------------------------------------------------------------------------------------------------------

/** SigV4 headers for a POST to `/` with a form body (AWS's own algorithm). Returns headers; never keeps the secret. */
export function sigv4Headers({ host, region, service, body, accessKeyId, secretAccessKey, now = new Date() }) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const ct = 'application/x-www-form-urlencoded; charset=utf-8';
  const signed = 'content-type;host;x-amz-date';
  const canonical = ['POST', '/', '', `content-type:${ct}`, `host:${host}`, `x-amz-date:${amzDate}`, '', signed, sha256hex(body)].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonical)].join('\n');
  let k = hmac(`AWS4${secretAccessKey}`, day);
  k = hmac(k, region); k = hmac(k, service); k = hmac(k, 'aws4_request');
  const sig = crypto.createHmac('sha256', k).update(toSign).digest('hex');
  return { 'content-type': ct, 'x-amz-date': amzDate, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${sig}` };
}

/** AWS: STS GetCallerIdentity, which needs no permission. Proves the key pair; names the account and the principal. */
export async function checkAws(fetchImpl, { accessKeyId, secretAccessKey, region, now } = {}) {
  if (!accessKeyId || !secretAccessKey) return { ok: false, reason: 'Paste both parts of the access key first.', facts: {} };
  const rg = /^[a-z]{2,4}(-[a-z]+)+-\d{1,2}$/.test(String(region || '')) ? region : 'us-east-1';
  const host = `sts.${rg}.amazonaws.com`;
  const body = 'Action=GetCallerIdentity&Version=2011-06-15';
  const { authorization, ...plain } = sigv4Headers({ host, region: rg, service: 'sts', body, accessKeyId, secretAccessKey, now });
  const r = await attempt(fetchImpl, 'aws', { host, path: '/', method: 'POST', token: authorization, header: 'raw', extra: plain, rawBody: body, raw: true });
  if (r.error) return { ok: false, reason: r.error, facts: {} };
  const code = /<Code>([A-Za-z]+)<\/Code>/.exec(r.text || '')?.[1] || '';
  if (r.status !== 200) {
    if (code === 'InvalidClientTokenId') return { ok: false, reason: 'AWS does not know this access key ID. It may be deleted or copied short.', facts: {} };
    if (code === 'SignatureDoesNotMatch') return { ok: false, reason: 'The secret access key does not match this key ID.', facts: {} };
    if (/Expired/i.test(code)) return { ok: false, reason: 'This computer\'s clock is off by more than five minutes, or the key has expired. Fix the time and try again.', facts: {} };
    return { ok: false, reason: reasonFor('aws', r), facts: {} };
  }
  const account = /<Account>(\d{12})<\/Account>/.exec(r.text || '')?.[1];
  const arn = /<Arn>(arn:aws[\w-]*:(?:iam|sts)::\d{12}:[^<]{1,200})<\/Arn>/.exec(r.text || '')?.[1];
  const principalType = /:root$/.test(arn || '') ? 'root' : /:user\//.test(arn || '') ? 'user' : /:assumed-role\//.test(arn || '') ? 'role' : 'other';
  const facts = pickFacts('aws', { keyOk: true, account, arn, principalType, keyKind: accessKeyId.startsWith('ASIA') ? 'temporary' : 'long-term', region: rg });
  if (principalType === 'root') return { ok: false, reason: 'This is a root access key. Delete it and make one for an IAM user.', facts };
  return { ok: true, summary: `Key works for ${principalType === 'user' ? `IAM user ${String(arn).split('/').pop()}` : 'this account'} in account ${account}.`, facts };
}

// ---- Google Cloud and Firebase ------------------------------------------------------------------------------------

const parseKey = (key) => { try { const k = JSON.parse(String(key || '')); return k && typeof k === 'object' ? k : null; } catch { return null; } };

/** Google Cloud: a 5-minute signed assertion swapped for a read-only token, then the project read with it. */
export async function checkGcp(fetchImpl, { key, projectId, now = Date.now() } = {}) {
  const k = parseKey(key);
  if (!k || !k.client_email || !k.private_key) return { ok: false, reason: 'Paste the JSON key first.', facts: {} };
  const project = projectId || k.project_id;
  const t0 = Math.floor(now / 1000);
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64u({ alg: 'RS256', typ: 'JWT', kid: k.private_key_id })}.${b64u({
    iss: k.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform.read-only', aud: 'https://oauth2.googleapis.com/token', iat: t0, exp: t0 + 300,
  })}`;
  let sig;
  try { sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(k.private_key, 'base64url'); } catch { return { ok: false, reason: 'The private key in this file is damaged. Download a new key.', facts: {} }; }
  const t = await attempt(fetchImpl, 'gcp', { host: 'oauth2.googleapis.com', path: '/token', method: 'POST', form: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` } });
  if (t.error) return { ok: false, reason: t.error, facts: {} };
  if (t.status !== 200 || !t.json?.access_token) {
    if (t.json?.error === 'invalid_grant') return { ok: false, reason: 'Google refused this key. It may be deleted or disabled, or this computer\'s clock is off.', facts: {} };
    return { ok: false, reason: reasonFor('gcp', t), facts: {} };
  }
  const facts = { keyOk: true, clientEmail: k.client_email, projectId: project };
  const p = await attempt(fetchImpl, 'gcp', { host: 'cloudresourcemanager.googleapis.com', path: `/v3/projects/${enc(project)}`, token: t.json.access_token });
  if (p.error) return { ok: false, reason: p.error, facts: pickFacts('gcp', facts) };
  if (p.status === 403) {
    const off = JSON.stringify(p.json || {}).includes('SERVICE_DISABLED');
    return { ok: false, reason: off ? 'Turn on the Cloud Resource Manager API in the service account\'s project, then try again.' : 'The key works but cannot read the project. Add the Browser role.', facts: pickFacts('gcp', facts) };
  }
  if (p.status !== 200) return { ok: false, reason: reasonFor('gcp', p, { thing: 'that project', field: 'the project ID' }), facts: pickFacts('gcp', facts) };
  Object.assign(facts, { projectOk: true, projectNumber: String(p.json?.name || '').replace(/^projects\//, ''), projectName: p.json?.displayName, projectState: p.json?.state });
  const fill = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(String(project)) ? { projectId: project } : {};
  if (p.json?.state && p.json.state !== 'ACTIVE') return { ok: false, reason: `The project is ${String(p.json.state).toLowerCase()}, not active.`, facts: pickFacts('gcp', facts), fill };
  return { ok: true, summary: `Key works as ${k.client_email}. It can read ${facts.projectName || project}.`, facts: pickFacts('gcp', facts), fill };
}

/** Firebase: which project the web key belongs to and which domains may sign in. The service account is read locally. */
export async function checkFirebase(fetchImpl, { apiKey, projectId, serviceAccount, domain } = {}) {
  if (!apiKey) return { ok: false, reason: 'Paste the web API key first.', facts: {} };
  const facts = {};
  const sa = parseKey(serviceAccount);
  if (sa) Object.assign(facts, { serviceAccountProject: sa.project_id, serviceAccountMatches: !projectId || sa.project_id === projectId });
  const r = await attempt(fetchImpl, 'firebase', { host: 'identitytoolkit.googleapis.com', path: '/v1/projects', token: apiKey, header: 'goog' });
  if (r.error) return { ok: false, reason: r.error, facts: pickFacts('firebase', facts) };
  const msg = JSON.stringify(r.json?.error || {});
  if (r.status === 403 && /REFERRER|referer/i.test(msg)) {
    return { ok: true, summary: 'The key is locked to your websites, so this machine cannot confirm the project. That is the safe setting.', facts: pickFacts('firebase', { ...facts, referrerLocked: true }) };
  }
  if (r.status === 400 && /CONFIGURATION_NOT_FOUND/.test(msg)) return { ok: false, reason: 'The key works, but Authentication is not turned on. Turn it on in the Firebase console.', facts: pickFacts('firebase', { ...facts, authReady: false }) };
  if (r.status === 400 && /API_KEY_INVALID/.test(msg)) return { ok: false, reason: 'Firebase says this web API key is not valid. Copy it again from Project settings.', facts: pickFacts('firebase', facts) };
  if (r.status !== 200) return { ok: false, reason: reasonFor('firebase', r), facts: pickFacts('firebase', facts) };
  const domains = (Array.isArray(r.json?.authorizedDomains) ? r.json.authorizedDomains : []).filter((d) => typeof d === 'string').slice(0, 50);
  Object.assign(facts, { authReady: true, projectId: r.json?.projectId, projectMatches: !projectId || r.json?.projectId === projectId, authorizedDomains: domains, ...(domain ? { domainAuthorized: domains.includes(domain) } : {}) });
  const reasons = [];
  if (projectId && !facts.projectMatches) reasons.push('The web key belongs to another project than the project ID here.');
  if (sa && !facts.serviceAccountMatches) reasons.push('The service account key is for another project.');
  const line = `Web key works for ${facts.projectId}.${domain ? (facts.domainAuthorized ? ` ${domain} may sign in.` : ` Add ${domain} to Authorized domains.`) : ''}`;
  if (reasons.length) return { ok: false, reason: reasons.join(' '), summary: line, facts: pickFacts('firebase', facts) };
  return { ok: true, summary: line, facts: pickFacts('firebase', facts) };
}

// ---- Azure --------------------------------------------------------------------------------------------------------

const AAD = {
  7000215: 'The client secret is wrong. Copy the Value, not the Secret ID.',
  7000222: 'This client secret has expired. Make a new one.',
  700016: 'This tenant has no app with that client ID. Check both IDs.',
  90002: 'Azure cannot find that tenant. Check the Directory (tenant) ID.',
};

/** Azure: sign in as the app (client credentials, Basic auth), then read the resource group or the subscription. */
export async function checkAzure(fetchImpl, { tenantId, clientId, clientSecret, subscriptionId, resourceGroup } = {}) {
  if (!tenantId || !clientId || !clientSecret) return { ok: false, reason: 'Paste the tenant ID, client ID and secret first.', facts: {} };
  const basic = Buffer.from(`${enc(clientId)}:${enc(clientSecret)}`).toString('base64');
  const t = await attempt(fetchImpl, 'azure', { host: 'login.microsoftonline.com', path: `/${enc(tenantId)}/oauth2/v2.0/token`, method: 'POST', token: basic, header: 'basic', form: { grant_type: 'client_credentials', scope: 'https://management.azure.com/.default' } });
  if (t.error) return { ok: false, reason: t.error, facts: {} };
  if (t.status !== 200 || !t.json?.access_token) {
    const code = (Array.isArray(t.json?.error_codes) ? t.json.error_codes : []).find((c) => AAD[c]);
    return { ok: false, reason: AAD[code] || reasonFor('azure', t), facts: {} };
  }
  const facts = { tenantOk: true };
  if (!subscriptionId) return { ok: true, summary: 'The app signs in. Paste the subscription ID to check its role.', facts: pickFacts('azure', facts) };
  const path = resourceGroup
    ? `/subscriptions/${enc(subscriptionId)}/resourcegroups/${enc(resourceGroup)}?api-version=2021-04-01`
    : `/subscriptions/${enc(subscriptionId)}?api-version=2022-12-01`;
  const r = await attempt(fetchImpl, 'azure', { host: 'management.azure.com', path, token: t.json.access_token });
  if (r.error) return { ok: false, reason: r.error, facts: pickFacts('azure', facts) };
  if (r.status === 403) return { ok: false, reason: `The app signs in but has no role on ${resourceGroup ? 'that resource group' : 'the subscription'}. Add the role assignment.`, facts: pickFacts('azure', facts) };
  if (r.status === 404) return { ok: false, reason: resourceGroup ? 'Azure cannot find that resource group in this subscription.' : 'Azure cannot find that subscription. Check the subscription ID.', facts: pickFacts('azure', facts) };
  if (r.status !== 200) return { ok: false, reason: reasonFor('azure', r), facts: pickFacts('azure', facts) };
  if (resourceGroup) Object.assign(facts, { resourceGroupOk: true, resourceGroupLocation: r.json?.location });
  else Object.assign(facts, { subscriptionName: r.json?.displayName, subscriptionState: r.json?.state });
  if (!resourceGroup && r.json?.state && r.json.state !== 'Enabled') return { ok: false, reason: `The subscription is ${r.json.state}.`, facts: pickFacts('azure', facts) };
  return { ok: true, summary: resourceGroup ? `The app signs in and can read ${resourceGroup}${facts.resourceGroupLocation ? ` (${facts.resourceGroupLocation})` : ''}.` : `The app signs in and can read ${facts.subscriptionName || 'the subscription'}.`, facts: pickFacts('azure', facts) };
}

// ---- Stripe, Clerk ------------------------------------------------------------------------------------------------

const modeOf = (k) => (/_live_/.test(String(k || '')) ? 'live' : /_test_/.test(String(k || '')) ? 'test' : null);

/** Stripe: both keys in one mode (no call), then one price read with the restricted key. A 403 means the key works. */
export async function checkStripe(fetchImpl, { secret, publishable } = {}) {
  if (!secret) return { ok: false, reason: 'Paste the restricted key first.', facts: {} };
  const mode = modeOf(secret);
  if (publishable && modeOf(publishable) && modeOf(publishable) !== mode) return { ok: false, reason: 'The keys are from different modes: pair pk_test_ with rk_test_, or pk_live_ with rk_live_.', facts: {} };
  const facts = { mode, keyKind: /^rk_/.test(secret) ? 'restricted' : 'secret' };
  const r = await attempt(fetchImpl, 'stripe', { host: 'api.stripe.com', path: '/v1/prices?limit=1&active=true', token: secret });
  if (r.error) return { ok: false, reason: r.error, facts: pickFacts('stripe', facts) };
  // Stripe's own message repeats part of the key: only the status and the error type are read.
  if (r.status === 403) return { ok: false, reason: 'The key works but cannot read prices. Add Prices: Read to the restricted key.', facts: pickFacts('stripe', { ...facts, permissionOk: false, missingPermission: 'Prices: Read' }) };
  if (r.status !== 200 || r.json?.object !== 'list') return { ok: false, reason: reasonFor('stripe', r), facts: pickFacts('stripe', facts) };
  const note = facts.keyKind === 'secret' ? ' It is an unrestricted key; a restricted one can only do what you allow.' : '';
  return { ok: true, summary: `Key works in ${mode === 'live' ? 'live mode' : 'the sandbox'}.${note}`, facts: pickFacts('stripe', { ...facts, permissionOk: true }) };
}

/** The Frontend API host a Clerk publishable key names (base64 of "<host>$"), or null. Not secret. */
export function clerkFrontendApi(publishable) {
  const m = /^pk_(test|live)_([A-Za-z0-9+/=]+)$/.exec(String(publishable || ''));
  if (!m) return null;
  let s = '';
  try { s = Buffer.from(m[2], 'base64').toString('utf8'); } catch { return null; }
  return /^[a-z0-9.-]+\.[a-z]{2,}\$$/.test(s) ? s.slice(0, -1) : null;
}

/** Clerk: both keys from one instance (no call), then the Backend API's user count read with the secret key. */
export async function checkClerk(fetchImpl, { secret, publishable } = {}) {
  if (!secret) return { ok: false, reason: 'Paste the secret key first.', facts: {} };
  const mode = modeOf(secret);
  if (publishable && modeOf(publishable) && modeOf(publishable) !== mode) return { ok: false, reason: 'The keys are from different instances: pair pk_test_ with sk_test_, or pk_live_ with sk_live_.', facts: {} };
  const facts = { mode, frontendApi: clerkFrontendApi(publishable) || undefined };
  const r = await attempt(fetchImpl, 'clerk', { host: 'api.clerk.com', path: '/v1/users/count', token: secret });
  if (r.error) return { ok: false, reason: r.error, facts: pickFacts('clerk', facts) };
  if (r.status !== 200) return { ok: false, reason: reasonFor('clerk', r), facts: pickFacts('clerk', facts) };
  return { ok: true, summary: `Key works for the ${mode === 'live' ? 'production' : 'development'} instance${facts.frontendApi ? ` (${facts.frontendApi})` : ''}.`, facts: pickFacts('clerk', { ...facts, keyOk: true }) };
}

// ---- Neon, Upstash ------------------------------------------------------------------------------------------------

/** Neon: the project read by ID (or listed) with the API key. The database URL is never sent anywhere. */
export async function checkNeon(fetchImpl, { apiKey, projectId } = {}) {
  if (!apiKey) return { ok: false, reason: 'Check it needs the optional API key. The database URLs are checked by their shape only; nexus opens no database connection.', facts: {} };
  const path = projectId ? `/api/v2/projects/${enc(projectId)}` : '/api/v2/projects?limit=10';
  const r = await attempt(fetchImpl, 'neon', { host: 'console.neon.tech', path, token: apiKey });
  if (r.error) return { ok: false, reason: r.error, facts: {} };
  if (r.status === 404 && projectId) return { ok: false, reason: 'Neon cannot find that project for this key. Check the project ID.', facts: {} };
  if (r.status !== 200) return { ok: false, reason: reasonFor('neon', r), facts: {} };
  const list = r.json?.project ? [r.json.project] : Array.isArray(r.json?.projects) ? r.json.projects : [];
  const one = list.length === 1 ? list[0] : null;
  const facts = { keyOk: true, projects: list.length, ...(one ? { projectId: one.id, projectName: one.name, regionId: one.region_id, pgVersion: one.pg_version } : {}) };
  const fill = one && /^[a-z]+(-[a-z]+)*-\d{6,8}$/.test(String(one.id)) ? { projectId: one.id } : {};
  return { ok: true, summary: one ? `Key works for ${one.name || one.id}${one.region_id ? ` (${one.region_id})` : ''}.` : `Key works. It sees ${list.length} projects; save the project ID to pick one.`, facts: pickFacts('neon', facts), fill };
}

/** Upstash: one PING to the database's own REST endpoint. Reads and writes no data. */
export async function checkUpstash(fetchImpl, { restUrl, restToken } = {}) {
  if (!restUrl || !restToken) return { ok: false, reason: 'Paste the REST URL and token first.', facts: {} };
  let host = '';
  try { host = new URL(restUrl).host; } catch { host = ''; }
  const r = await attempt(fetchImpl, 'upstash', { host, path: '/ping', token: restToken });
  if (r.error) return { ok: false, reason: r.error, facts: {} };
  if (r.status !== 200 || r.json?.result !== 'PONG') return { ok: false, reason: r.status === 401 ? 'Upstash says this token is not valid for this database. Copy both again from the same database.' : reasonFor('upstash', r), facts: {} };
  return { ok: true, summary: `PING answered PONG from ${host}.`, facts: pickFacts('upstash', { pong: true, endpoint: host }) };
}

// ---- Netlify, Fly.io ----------------------------------------------------------------------------------------------

/** Netlify: the project read by its ID with the token. */
export async function checkNetlify(fetchImpl, { token, siteId } = {}) {
  if (!token) return { ok: false, reason: 'Paste the access token first.', facts: {} };
  if (!siteId) return { ok: false, reason: 'Paste the Project ID too; Check it reads that project.', facts: {} };
  const r = await attempt(fetchImpl, 'netlify', { host: 'api.netlify.com', path: `/api/v1/sites/${enc(siteId)}`, token });
  if (r.error) return { ok: false, reason: r.error, facts: {} };
  if (r.status === 404) return { ok: false, reason: 'The token cannot see that project: another team, a wrong ID, or the SAML box not ticked.', facts: pickFacts('netlify', { siteFound: false }) };
  if (r.status !== 200) return { ok: false, reason: reasonFor('netlify', r), facts: {} };
  const facts = { siteFound: true, siteName: r.json?.name, siteUrl: r.json?.ssl_url || r.json?.url, accountSlug: r.json?.account_slug };
  return { ok: true, summary: `Token works. It can see ${facts.siteName || 'the project'}.`, facts: pickFacts('netlify', facts) };
}

/** Fly.io: the app read through the Machines API with the whole FlyV1 token after Bearer. */
export async function checkFly(fetchImpl, { token, app } = {}) {
  if (!token) return { ok: false, reason: 'Paste the deploy token first.', facts: {} };
  if (!app) return { ok: false, reason: 'Type the app name too; Check it reads that app.', facts: {} };
  const r = await attempt(fetchImpl, 'fly', { host: 'api.machines.dev', path: `/v1/apps/${enc(app)}`, token });
  if (r.error) return { ok: false, reason: r.error, facts: {} };
  if (r.status === 404) return { ok: false, reason: `Fly cannot find ${app} for this token. Check the name, or make the token for this app.`, facts: pickFacts('fly', { appFound: false }) };
  if (r.status !== 200) return { ok: false, reason: r.status === 401 ? 'Fly says this token is not valid. Paste the whole line, "FlyV1 " included.' : reasonFor('fly', r), facts: {} };
  const facts = { appFound: true, appName: r.json?.name, appStatus: r.json?.status, orgSlug: r.json?.organization?.slug };
  return { ok: true, summary: `Token works for ${facts.appName || app}${facts.appStatus ? ` (${facts.appStatus})` : ''}.`, facts: pickFacts('fly', facts) };
}

// ---- Discord, Slack, Twilio, Resend -------------------------------------------------------------------------------

const DISCORD_UA = 'DiscordBot (https://github.com/daretodave/nexus, 1)';

/** Discord: who the bot is, then its application (the public key compared, never sent). */
export async function checkDiscord(fetchImpl, { botToken, publicKey } = {}) {
  if (!botToken) return { ok: false, reason: 'Paste the bot token first.', facts: {} };
  const u = await attempt(fetchImpl, 'discord', { host: 'discord.com', path: '/api/v10/users/@me', token: botToken, header: 'bot', ua: DISCORD_UA });
  if (u.error) return { ok: false, reason: u.error, facts: {} };
  if (u.status === 401) return { ok: false, reason: 'Discord says this bot token is not valid. Reset it on the Bot page and paste the new one. Do not retry the old one.', facts: {} };
  if (u.status !== 200) return { ok: false, reason: reasonFor('discord', u), facts: {} };
  const facts = { botOk: true, botUser: u.json?.username, botId: u.json?.id };
  const a = await attempt(fetchImpl, 'discord', { host: 'discord.com', path: '/api/v10/applications/@me', token: botToken, header: 'bot', ua: DISCORD_UA });
  if (a.status === 200) {
    const flags = Number(a.json?.flags) || 0;
    Object.assign(facts, { applicationId: a.json?.id, appName: a.json?.name, botPublic: !!a.json?.bot_public, guildCount: a.json?.approximate_guild_count, messageContent: !!(flags & ((1 << 18) | (1 << 19))), ...(publicKey ? { publicKeyMatches: a.json?.verify_key === publicKey } : {}) });
  }
  const fill = /^[0-9]{17,20}$/.test(String(facts.applicationId || '')) ? { applicationId: facts.applicationId } : {};
  if (facts.publicKeyMatches === false) return { ok: false, reason: 'The token works, but the public key is from another application. Copy it again from General Information.', facts: pickFacts('discord', facts), fill };
  return { ok: true, summary: `Bot ${facts.botUser || ''} works${facts.guildCount != null ? `, in ${facts.guildCount} ${facts.guildCount === 1 ? 'server' : 'servers'}` : ''}.${facts.botPublic ? ' "Public Bot" is on: anyone can add it.' : ''}`, facts: pickFacts('discord', facts), fill };
}

/** Slack: auth.test, which needs no scope. It answers 200 with ok:false on failure, so ok is read, not the status. */
export async function checkSlack(fetchImpl, { botToken } = {}) {
  if (!botToken) return { ok: false, reason: 'Paste the bot token first.', facts: {} };
  const r = await attempt(fetchImpl, 'slack', { host: 'slack.com', path: '/api/auth.test', method: 'POST', token: botToken });
  if (r.error) return { ok: false, reason: r.error, facts: {} };
  if (r.status === 200 && r.json?.ok === false) {
    const bad = ['invalid_auth', 'token_revoked', 'account_inactive', 'not_authed', 'token_expired'].includes(r.json?.error);
    return { ok: false, reason: bad ? 'Slack says this token is not valid. It may have been copied short, revoked, or the app uninstalled.' : `Slack answered ${String(r.json?.error || 'an error').slice(0, 40)}.`, facts: {} };
  }
  if (r.status !== 200 || r.json?.ok !== true) return { ok: false, reason: reasonFor('slack', r), facts: {} };
  const facts = { botOk: true, teamId: r.json.team_id, team: r.json.team, botUser: r.json.user, botId: r.json.bot_id, isBot: !!r.json.bot_id, enterprise: !!r.json.enterprise_id };
  const fill = /^[TE][A-Z0-9]{8,12}$/.test(String(facts.teamId || '')) ? { teamId: facts.teamId } : {};
  if (!facts.isBot) return { ok: false, reason: 'That is a user token. Paste the Bot User OAuth Token (xoxb-).', facts: pickFacts('slack', facts) };
  return { ok: true, summary: `Bot ${facts.botUser || ''} works in ${facts.team || 'the workspace'}.`, facts: pickFacts('slack', facts), fill };
}

/** Twilio: the numbers this key can see (a Standard key cannot read the account itself). Sends nothing. */
export async function checkTwilio(fetchImpl, { accountSid, apiKey, apiSecret, phoneNumber } = {}) {
  if (!accountSid || !apiKey || !apiSecret) return { ok: false, reason: 'Paste the Account SID, the API key SID and its secret first.', facts: {} };
  const basic = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const r = await attempt(fetchImpl, 'twilio', { host: 'api.twilio.com', path: `/2010-04-01/Accounts/${enc(accountSid)}/IncomingPhoneNumbers.json?PageSize=20`, token: basic, header: 'basic' });
  if (r.error) return { ok: false, reason: r.error, facts: {} };
  if (r.status === 401) return { ok: false, reason: 'Twilio refused the key: the SID or secret is wrong, or the key was made in another region.', facts: {} };
  if (r.status === 403) return { ok: false, reason: 'The key works but cannot read phone numbers. Give a Restricted key Phone Numbers read.', facts: {} };
  if (r.status === 404) return { ok: false, reason: 'That Account SID is not this key\'s account.', facts: {} };
  if (r.status !== 200) return { ok: false, reason: reasonFor('twilio', r), facts: {} };
  const list = (Array.isArray(r.json?.incoming_phone_numbers) ? r.json.incoming_phone_numbers : []).slice(0, 20);
  const numbers = list.map((n) => n && n.phone_number).filter((n) => typeof n === 'string');
  const facts = { keyOk: true, numbers, numberCount: numbers.length, smsCapable: list.some((n) => n?.capabilities?.sms), ...(phoneNumber ? { hasFrom: numbers.includes(phoneNumber) } : {}) };
  if (phoneNumber && !facts.hasFrom) return { ok: false, reason: 'The key works, but the From number is not on this account.', facts: pickFacts('twilio', facts) };
  return { ok: true, summary: `Key works. It sees ${numbers.length} ${numbers.length === 1 ? 'number' : 'numbers'}.`, facts: pickFacts('twilio', facts) };
}

/** Resend: the domains list. A sending-only key answers 401 restricted_api_key: the right key, and a pass. */
export async function checkResend(fetchImpl, { apiKey, domain } = {}) {
  if (!apiKey) return { ok: false, reason: 'Paste the API key first.', facts: {} };
  const r = await attempt(fetchImpl, 'resend', { host: 'api.resend.com', path: '/domains', token: apiKey });
  if (r.error) return { ok: false, reason: r.error, facts: {} };
  if (r.status === 401 && r.json?.name === 'restricted_api_key') return { ok: true, summary: 'Key works, and it can only send email: the right key for the app. Check the domain shows Verified on Resend.', facts: pickFacts('resend', { keyOk: true, access: 'sending' }) };
  if (r.status === 403 && /not active/i.test(String(r.json?.message || ''))) return { ok: false, reason: 'Resend says this key is turned off. Make a new one.', facts: {} };
  if (r.status !== 200) return { ok: false, reason: reasonFor('resend', r), facts: {} };
  const list = (Array.isArray(r.json?.data) ? r.json.data : []).filter((d) => d && typeof d.name === 'string');
  const facts = { keyOk: true, access: 'full', domains: list.map((d) => d.name), verifiedDomains: list.filter((d) => d.status === 'verified').map((d) => d.name) };
  const mine = domain ? list.find((d) => d.name === domain) : null;
  if (domain) Object.assign(facts, { domainStatus: mine ? String(mine.status) : 'missing', domainOk: mine?.status === 'verified' });
  const where = !domain ? '' : !mine ? ` ${domain} is not on Resend yet.` : mine.status === 'verified' ? ` ${domain} is verified.` : ` ${domain} is ${mine.status}; add the DNS records and press Verify.`;
  return { ok: true, summary: `Key works, but it has full access. Make a sending-only key for the app.${where}`, facts: pickFacts('resend', facts) };
}

// ---- Anthropic, OpenAI --------------------------------------------------------------------------------------------

/** Anthropic: the models list (free, read-only). The workspace and organization come back as response headers. */
export async function checkAnthropic(fetchImpl, { apiKey, workspaceId } = {}) {
  if (!apiKey) return { ok: false, reason: 'Paste the API key first.', facts: {} };
  const extra = { 'anthropic-version': '2023-06-01', ...(workspaceId ? { 'anthropic-workspace-id': workspaceId } : {}) };
  const r = await attempt(fetchImpl, 'anthropic', { host: 'api.anthropic.com', path: '/v1/models?limit=5', token: apiKey, header: 'xapikey', extra, keep: ['anthropic-workspace-id', 'anthropic-organization-id'] });
  if (r.error) return { ok: false, reason: r.error, facts: {} };
  if (r.status === 400 && /workspace/i.test(String(r.json?.error?.message || ''))) return { ok: false, reason: 'The key works but is not tied to a workspace. Save the workspace ID, or make a key for one workspace.', facts: pickFacts('anthropic', { needsWorkspace: true }) };
  if (r.status === 404 && workspaceId) return { ok: false, reason: 'Anthropic cannot find that workspace for this key. Check the workspace ID.', facts: {} };
  if (r.status !== 200) return { ok: false, reason: reasonFor('anthropic', r, { what: 'list models' }), facts: {} };
  const ids = (Array.isArray(r.json?.data) ? r.json.data : []).map((m) => m && m.id).filter((x) => typeof x === 'string');
  const ws = r.headers?.['anthropic-workspace-id'];
  const facts = { keyOk: true, models: ids, newestModel: ids[0], workspaceId: ws, organizationId: r.headers?.['anthropic-organization-id'] };
  const fill = /^wrkspc_[A-Za-z0-9]{16,40}$/.test(String(ws || '')) ? { workspaceId: ws } : {};
  return { ok: true, summary: `Key works.${ids[0] ? ` Newest model: ${ids[0]}.` : ''}`, facts: pickFacts('anthropic', facts), fill };
}

/** OpenAI: the models list (free, read-only). A restricted key without List models: Read answers 403 and still works. */
export async function checkOpenai(fetchImpl, { apiKey, projectId, orgId } = {}) {
  if (!apiKey) return { ok: false, reason: 'Paste the API key first.', facts: {} };
  const extra = { ...(projectId ? { 'openai-project': projectId } : {}), ...(orgId ? { 'openai-organization': orgId } : {}) };
  const r = await attempt(fetchImpl, 'openai', { host: 'api.openai.com', path: '/v1/models', token: apiKey, extra });
  if (r.error) return { ok: false, reason: r.error, facts: {} };
  const msg = String(r.json?.error?.message || '');
  if (r.status === 403 && /missing scopes?/i.test(msg) && /model\.read/.test(msg)) return { ok: true, summary: 'Key works. It cannot list models, which is fine; add List models: Read if you want Check it to show them.', facts: pickFacts('openai', { keyOk: true, restricted: true }) };
  if (r.status === 401 && /project|organization/i.test(msg)) return { ok: false, reason: 'OpenAI says the key and the project or organization do not match. Check those IDs, or clear them.', facts: {} };
  if (r.status !== 200) return { ok: false, reason: reasonFor('openai', r, { what: 'list models', permission: 'List models: Read' }), facts: {} };
  const n = (Array.isArray(r.json?.data) ? r.json.data : []).length;
  return { ok: true, summary: `Key works. It can see ${n} ${n === 1 ? 'model' : 'models'}.`, facts: pickFacts('openai', { keyOk: true, models: n }) };
}

// ---- Sentry, PostHog ----------------------------------------------------------------------------------------------

const SENTRY_HOSTS = ['sentry.io', 'us.sentry.io', 'de.sentry.io'];

/** What an organization token's own payload says (its org and region), read locally. Never the signature. */
export function sentryTokenInfo(token) {
  const m = /^sntrys_([A-Za-z0-9+/=]+)_[A-Za-z0-9+/]{43}$/.exec(String(token || ''));
  if (!m) return {};
  try {
    const p = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
    let region = 'sentry.io';
    try { const h = new URL(String(p.region_url || '')).host; if (SENTRY_HOSTS.includes(h)) region = h; } catch { /* the default */ }
    return { org: /^[a-z0-9][a-z0-9_-]{0,49}$/.test(String(p.org || '')) ? p.org : undefined, region };
  } catch { return {}; }
}

/** Sentry: the API root with the token, on the token's own region. Fills the org slug the token names. */
export async function checkSentry(fetchImpl, { authToken, org } = {}) {
  if (!authToken) return { ok: false, reason: 'Paste the organization token first.', facts: {} };
  const info = sentryTokenInfo(authToken);
  const host = info.region || 'sentry.io';
  const r = await attempt(fetchImpl, 'sentry', { host, path: '/api/0/', token: authToken });
  if (r.error) return { ok: false, reason: r.error, facts: {} };
  if (r.status === 401) return { ok: false, reason: 'Sentry does not know this token. It may be revoked; make a new one.', facts: {} };
  if (r.status !== 200) return { ok: false, reason: reasonFor('sentry', r), facts: {} };
  const facts = { keyOk: true, orgSlug: info.org || org, region: host };
  const fill = info.org ? { org: info.org } : {};
  if (org && info.org && org !== info.org) return { ok: false, reason: `The token belongs to ${info.org}, not ${org}. Fix the org slug.`, facts: pickFacts('sentry', facts), fill };
  return { ok: true, summary: `Token works${facts.orgSlug ? ` for ${facts.orgSlug}` : ''} on ${host}.`, facts: pickFacts('sentry', facts), fill };
}

/** PostHog: who the personal key is, on the region's app host. Keeps the project, never the person's email. */
export async function checkPosthog(fetchImpl, { personalKey, host } = {}) {
  if (!personalKey) return { ok: false, reason: 'Check it needs the personal API key. The project key is public and has no read-only check.', facts: {} };
  const m = /^https:\/\/(us|eu)(\.i)?\.posthog\.com\/?$/.exec(String(host || 'https://us.posthog.com'));
  if (!m) return { ok: false, reason: 'Check it only knows PostHog Cloud (us or eu). Your values are saved; nothing was called.', facts: {} };
  const app = `${m[1]}.posthog.com`;
  const r = await attempt(fetchImpl, 'posthog', { host: app, path: '/api/users/@me/', token: personalKey });
  if (r.error) return { ok: false, reason: r.error, facts: {} };
  if (r.status === 401) return { ok: false, reason: `PostHog does not know this key on ${m[1].toUpperCase()} Cloud. If your account is on the other region, change the host.`, facts: {} };
  if (r.status === 403) return { ok: false, reason: 'The key works but lacks User: Read.', facts: {} };
  if (r.status !== 200) return { ok: false, reason: reasonFor('posthog', r), facts: {} };
  const id = r.json?.team?.id;
  const facts = { keyOk: true, projectId: id != null ? String(id) : undefined, projectName: r.json?.team?.name, region: m[1] };
  const fill = /^\d{1,12}$/.test(String(id ?? '')) ? { projectId: String(id) } : {};
  return { ok: true, summary: `Key works for ${facts.projectName || 'your project'} on ${m[1].toUpperCase()} Cloud.`, facts: pickFacts('posthog', facts), fill };
}

/** Every check by service id: the 0.5.1 three and these. */
export const CHECKS = {
  ...FIRST,
  aws: checkAws, gcp: checkGcp, azure: checkAzure, firebase: checkFirebase, stripe: checkStripe, clerk: checkClerk,
  neon: checkNeon, upstash: checkUpstash, netlify: checkNetlify, fly: checkFly, discord: checkDiscord, slack: checkSlack,
  twilio: checkTwilio, resend: checkResend, anthropic: checkAnthropic, openai: checkOpenai, sentry: checkSentry, posthog: checkPosthog,
};
