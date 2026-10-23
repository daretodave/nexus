// The demo's stack hand-off (`nexus --demo stack`): GET /api/stack and its writes, staged in memory with the live
// server's shapes (server/stack.mjs), so the Vault's Set up a stack walks Cloudflare, Supabase and Vercel with no
// network, no disk and no repo. A posted value is checked for its shape and dropped on the spot; only "it is set" is
// kept, through the demo vault (names only). Checks answer canned facts that move with script time: the zone turns
// active 40 s after the Cloudflare token is saved, and the domain reads Valid 15 s after the DNS records are written.
//
// Demo-safe values (obviously fake; a recorder can type them):
//   Cloudflare token     cfut_demo0000000000000000000000      (cfut_bad... answers the "not valid" reason)
//   Supabase URL         https://abcdefghijklmnopqrst.supabase.co
//   publishable key      sb_publishable_demo0000000000
//   secret key           sb_secret_demo000000000000000
//   database URL         postgresql://postgres.abcdefghijklmnopqrst:demo-pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres
//   Vercel token         vcp_demo00000000000000000000
//
// The 0.5.2 services (AWS through PostHog) take any value of the right shape; Check it answers canned facts for each
// (DEMO_CHECKS), filling the ids a real check fills. The agent guide is not written in the demo (no disk); the panel's
// preview renders it from the same registry.
import { SERVICES, ORDER, ACTIONS, CI_NAMES, valueOf, recipeFor } from '../../shared/stack/recipes.mjs';
import { checkShape, normalize } from '../../shared/stack/shapes.mjs';
import { FRAMEWORKS, frameworkById, envNamesFor } from '../../shared/stack/frameworks.mjs';
import { planVercelEnv, planVercelDomain, pickFacts } from '../stack-checks.mjs';

/** Canned answers for the 0.5.2 services: { needs (the value Check it cannot run without), summary, facts, fill }. */
export const DEMO_CHECKS = {
  aws: { needs: 'secretAccessKey', summary: 'Key works for IAM user fieldday-app in account 123456789012.', facts: { keyOk: true, account: '123456789012', arn: 'arn:aws:iam::123456789012:user/fieldday-app', principalType: 'user', keyKind: 'long-term', region: 'eu-west-2' } },
  gcp: { needs: 'key', summary: 'Key works as fieldday-app@fieldday-prod.iam.gserviceaccount.com. It can read Fieldday.', facts: { keyOk: true, clientEmail: 'fieldday-app@fieldday-prod.iam.gserviceaccount.com', projectId: 'fieldday-prod', projectOk: true, projectNumber: '412000000000', projectName: 'Fieldday', projectState: 'ACTIVE' }, fill: { projectId: 'fieldday-prod' } },
  azure: { needs: 'clientSecret', summary: 'The app signs in and can read fieldday-rg (westeurope).', facts: { tenantOk: true, resourceGroupOk: true, resourceGroupLocation: 'westeurope' } },
  firebase: { needs: 'apiKey', summary: 'Web key works for fieldday-prod.', facts: { authReady: true, projectId: 'fieldday-prod', projectMatches: true, authorizedDomains: ['localhost', 'fieldday-prod.firebaseapp.com'] } },
  stripe: { needs: 'secret', summary: 'Key works in the sandbox.', facts: { mode: 'test', keyKind: 'restricted', permissionOk: true } },
  clerk: { needs: 'secret', summary: 'Key works for the development instance (fieldday.clerk.accounts.dev).', facts: { keyOk: true, mode: 'test', frontendApi: 'fieldday.clerk.accounts.dev' } },
  neon: { needs: 'apiKey', summary: 'Key works for fieldday (aws-eu-west-2).', facts: { keyOk: true, projects: 1, projectId: 'cool-darkness-123456', projectName: 'fieldday', regionId: 'aws-eu-west-2', pgVersion: 17 }, fill: { projectId: 'cool-darkness-123456' } },
  upstash: { needs: 'restToken', summary: 'PING answered PONG from eu1-fieldday-32748.upstash.io.', facts: { pong: true, endpoint: 'eu1-fieldday-32748.upstash.io' } },
  netlify: { needs: 'token', summary: 'Token works. It can see fieldday.', facts: { siteFound: true, siteName: 'fieldday', siteUrl: 'https://fieldday.netlify.app', accountSlug: 'sam' } },
  fly: { needs: 'token', summary: 'Token works for fieldday-bot (deployed).', facts: { appFound: true, appName: 'fieldday-bot', appStatus: 'deployed', orgSlug: 'personal' } },
  discord: { needs: 'botToken', summary: 'Bot Fieldday works, in 1 server.', facts: { botOk: true, botUser: 'Fieldday', botId: '112233445566778899', applicationId: '112233445566778899', appName: 'Fieldday', publicKeyMatches: true, botPublic: false, guildCount: 1, messageContent: false }, fill: { applicationId: '112233445566778899' } },
  slack: { needs: 'botToken', summary: 'Bot fieldday works in Fieldday HQ.', facts: { botOk: true, teamId: 'T0FIELDDAY1', team: 'Fieldday HQ', botUser: 'fieldday', botId: 'B0FIELDDAY1', isBot: true, enterprise: false }, fill: { teamId: 'T0FIELDDAY1' } },
  twilio: { needs: 'apiSecret', summary: 'Key works. It sees 1 number.', facts: { keyOk: true, numbers: ['+15005550006'], numberCount: 1, smsCapable: true } },
  resend: { needs: 'apiKey', summary: 'Key works, and it can only send email: the right key for the app. Check the domain shows Verified on Resend.', facts: { keyOk: true, access: 'sending' } },
  anthropic: { needs: 'apiKey', summary: 'Key works. Newest model: claude-opus-5-5.', facts: { keyOk: true, models: ['claude-opus-5-5', 'claude-sonnet-5'], newestModel: 'claude-opus-5-5', workspaceId: 'wrkspc_demoFieldday0000000' }, fill: { workspaceId: 'wrkspc_demoFieldday0000000' } },
  openai: { needs: 'apiKey', summary: 'Key works. It can see 42 models.', facts: { keyOk: true, models: 42 } },
  sentry: { needs: 'authToken', summary: 'Token works for fieldday on sentry.io.', facts: { keyOk: true, orgSlug: 'fieldday', region: 'sentry.io' }, fill: { org: 'fieldday' } },
  posthog: { needs: 'personalKey', summary: 'Key works for Fieldday on US Cloud.', facts: { keyOk: true, projectId: '12345', projectName: 'Fieldday', region: 'us' }, fill: { projectId: '12345' } },
};

const ZONE_ID = '3f2a9d6e1b7c4a0f8e5d2c9b6a3f1c9b';
const ACCOUNT_ID = '8c41e07d9a2b5f3e6d1c0b9a8f7e6d01';
const TEAM = 'team_demoFieldday0000000000';
const PROJECTS = [{ id: 'prj_demoFielddayWeb000000000', name: 'fieldday-web' }, { id: 'prj_demoFielddayDocs00000000', name: 'fieldday-docs' }];
const NS = ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'];
const ACTIVE_AFTER = 40_000;
const VALID_AFTER = 15_000;

/**
 * @param {object} o
 * @param {() => number} o.now        wall time for stamps (the demo clock)
 * @param {() => number} o.script     script time in ms (world.elapsed), which the zone and the domain move with
 * @param {object} o.vault            server/demo/vault.mjs: store(name, body) and isSet(name)
 * @param {() => boolean} [o.owner]
 */
export function createDemoStack({ now = () => Date.now(), script = () => 0, vault, owner = () => true } = {}) {
  let st;
  const reset = () => {
    st = { picked: [], inputs: {}, app: { dir: 'apps/web', framework: 'next' }, targets: {}, checks: {}, actions: {}, ticks: {}, saved: new Set(), cfTokenAt: null, dnsAt: null, plans: {} };
  };
  reset();
  const iso = () => new Date(now()).toISOString();
  const fw = () => frameworkById(st.app.framework);
  const namesOf = (svc, key) => envNamesFor(valueOf(svc, key), fw());

  const targets = () => {
    const f = fw();
    const out = [{ id: 'vault', kind: 'vault', label: '.env (the vault)', on: true, locked: true, why: 'The vault keeps every value; pushes read it from there.' }];
    if (st.app.dir !== '.') out.push({ id: 'app', kind: 'dotenv', label: `${st.app.dir}/${f.file}`, on: st.targets.app ?? true, why: `${f.label} reads env from ${st.app.dir}` });
    out.push({ id: 'github-actions', kind: 'sink', label: 'GitHub Actions', on: st.targets['github-actions'] ?? true, why: 'The deploy names CI reads' });
    return out;
  };

  /** The live facts: the zone and the domain move with script time. */
  const refreshFacts = () => {
    const cf = st.checks.cloudflare;
    if (cf?.facts?.zone) {
      const active = st.cfTokenAt != null && script() - st.cfTokenAt >= ACTIVE_AFTER;
      cf.facts.active = active;
      cf.facts.status = active ? 'active' : 'pending';
      cf.summary = active ? `Token works. ${st.inputs.domain} is active.` : `Token works. ${st.inputs.domain} is waiting for the nameservers to change: set ${NS.join(' and ')} at your registrar.`;
    }
  };

  const status = () => {
    refreshFacts();
    const names = {};
    const values = {};
    const appOn = targets().some((t) => t.id === 'app' && t.on);
    for (const svc of ORDER.filter((x) => st.picked.includes(x))) {
      for (const v of SERVICES[svc].values) {
        const ns = namesOf(svc, v.key);
        const saved = st.saved.has(`${svc}.${v.key}`);
        values[`${svc}.${v.key}`] = { names: ns, saved };
        for (const n of ns) names[n] = { service: svc, key: v.key, vault: saved && (vault ? vault.isSet(n) : true), ...(st.app.dir !== '.' ? { app: saved && appOn } : {}), drift: false };
      }
    }
    const f = fw();
    return {
      status: 200, available: true, vaultState: 'ready', owner: !!owner(), picked: st.picked, inputs: st.inputs,
      apps: [{ dir: '.', framework: 'node', label: 'Node', prefix: '' }, { dir: 'apps/web', framework: 'next', label: 'Next.js', prefix: 'NEXT_PUBLIC_' }],
      app: { ...st.app, label: f.label, prefix: f.prefix }, fresh: false,
      targets: targets(), appNote: st.app.dir === '.' && f.file === '.env' ? `${f.label} reads .env at the root, so the vault's file is the app's file.` : null,
      names, values, checks: st.checks, actions: st.actions, ticks: st.ticks,
      guide: { path: 'docs/stack.md', exists: st.picked.length > 0, pointer: st.picked.length ? 'agents.md' : null },
    };
  };

  const refuse = () => ({ status: 403, error: 'The stack is the owner\'s to set up. Keep your own keys under Local keys.' });

  const pick = (b = {}) => {
    if (!owner()) return refuse();
    if (Array.isArray(b.picked)) st.picked = ORDER.filter((x) => b.picked.includes(x));
    if (b.inputs && 'domain' in b.inputs) {
      const raw = String(b.inputs.domain ?? '');
      if (!raw.trim()) delete st.inputs.domain;
      else {
        const r = checkShape('hostname', raw);
        if (!r.ok) return { status: 400, error: r.why };
        st.inputs.domain = normalize('hostname', raw);
      }
    }
    if (b.app && FRAMEWORKS.some((f) => f.id === b.app.framework)) st.app = { dir: String(b.app.dir || '.'), framework: b.app.framework };
    if (b.targets) for (const id of ['app', 'github-actions']) if (typeof b.targets[id] === 'boolean') st.targets[id] = b.targets[id];
    return status();
  };

  const tick = (b = {}) => {
    if (!owner()) return refuse();
    if (!Object.values(SERVICES).some((s) => s.steps.some((x) => x.id === b.step && x.tick))) return { status: 400, error: 'That step is not one you tick.' };
    if (b.on) st.ticks[b.step] = true; else delete st.ticks[b.step];
    return { status: 200, ok: true, ticks: st.ticks };
  };

  /** POST /api/stack/save: the shape is checked, each name stored through the demo vault (which drops the value). */
  const save = (b = {}) => {
    if (!owner()) return refuse();
    const v = valueOf(b.service, b.key);
    if (!v) return { status: 400, error: 'No such value in the stack.' };
    if (b.resync === true) return { status: 200, ok: true, names: namesOf(b.service, b.key), written: [], failed: [], pushed: [], notes: [] };
    const r = checkShape(v.shape, typeof b.value === 'string' ? b.value : '');
    if (!r.ok) return { status: 400, error: r.why };
    const names = namesOf(b.service, b.key);
    const pushed = [];
    for (const n of names) {
      const out = vault ? vault.store(n, { value: 'demo', declare: true, for: recipeFor(b.service, b.key), destinations: [] }) : { status: 200 };
      if (out.status !== 200) return { status: out.status, error: out.error };
      if ((st.targets['github-actions'] ?? true) && CI_NAMES.has(n)) pushed.push({ name: n, destination: 'github-actions', ok: true });
    }
    st.saved.add(`${b.service}.${b.key}`);
    if (b.service === 'cloudflare' && b.key === 'apiToken') st.cfTokenAt = script();
    if (b.service === 'supabase' && b.key === 'url') st.saved.add('supabase.ref');
    const written = [{ target: 'vault', label: '.env (the vault)' }, ...(st.app.dir !== '.' && (st.targets.app ?? true) ? [{ target: 'app', label: `${st.app.dir}/${fw().file}` }] : [])];
    return { status: 200, ok: true, names, written, failed: [], pushed, notes: r.kind === 'legacy' || r.kind === 'warn' ? [r.note] : [] };
  };

  /** POST /api/stack/check/:service: posted values are shape-checked (the demo never holds a saved one); canned facts. */
  const check = (service, b = {}) => {
    if (!SERVICES[service]) return { status: 404, error: 'No check for that service.' };
    const posted = b.values && typeof b.values === 'object' ? b.values : {};
    for (const [k, x] of Object.entries(posted)) {
      const v = valueOf(service, k);
      if (!v || typeof x !== 'string' || !x.trim()) continue;
      const r = checkShape(v.shape, x);
      if (!r.ok) return { status: 400, error: r.why };
    }
    const has = (k) => typeof posted[k] === 'string' || st.saved.has(`${service}.${k}`);
    const bad = Object.values(posted).some((x) => typeof x === 'string' && /^cfut_bad/.test(x));
    let r;
    if (service === 'cloudflare') {
      if (bad) r = { ok: false, reason: 'Cloudflare says this token is not valid. It may have been copied short or revoked.', facts: {} };
      else if (!has('apiToken')) r = { ok: false, reason: 'Paste the API token first.', facts: {} };
      else if (!st.inputs.domain) r = { ok: true, summary: 'Token works. Add your domain to see the zone.', facts: {} };
      else {
        if (st.cfTokenAt == null) st.cfTokenAt = script();
        r = { ok: true, facts: { zone: true, status: 'pending', active: false, nameServers: NS, originalNameServers: ['ns1.registrar.example', 'ns2.registrar.example'], zoneId: ZONE_ID, accountId: ACCOUNT_ID, accountName: "Sam's account" }, fill: { zoneId: ZONE_ID, accountId: ACCOUNT_ID } };
      }
    } else if (service === 'supabase') {
      if (!has('url')) r = { ok: false, reason: 'Paste the project URL first; every check starts from it.', facts: {} };
      else if (!has('publishable') && !has('secret')) r = { ok: false, reason: 'Paste the publishable key or the secret key, then check.', facts: { ref: 'abcdefghijklmnopqrst' } };
      else {
        const facts = { ref: 'abcdefghijklmnopqrst', projectName: 'fieldday-db', region: 'eu-west-2', projectStatus: 'ACTIVE_HEALTHY', ...(has('publishable') ? { authOk: true, authVersion: 'v2.170.0' } : {}), ...(has('secret') ? { secretOk: true, tables: 12 } : {}) };
        const bits = [facts.authOk ? 'Sign-in is up' : '', facts.secretOk ? 'the secret key reads 12 tables' : ''].filter(Boolean);
        r = { ok: true, summary: `Keys work for project fieldday-db (eu-west-2).${bits.length ? ` ${bits.join('; ')}.` : ''}`, facts, fill: { ref: 'abcdefghijklmnopqrst' } };
      }
    } else if (DEMO_CHECKS[service]) {
      const d = DEMO_CHECKS[service];
      const label = valueOf(service, d.needs)?.label.toLowerCase() || 'key';
      r = has(d.needs) ? { ok: true, summary: d.summary, facts: d.facts, fill: d.fill || {} } : { ok: false, reason: `Paste the ${label} first.`, facts: {} };
    } else {
      if (!has('token')) r = { ok: false, reason: 'Paste the access token first.', facts: {} };
      else {
        const projectId = st.saved.has('vercel.projectId') ? PROJECTS[0].id : null;
        const facts = { projects: PROJECTS, team: TEAM, fullAccount: false };
        let line = '';
        if (projectId && st.inputs.domain) {
          facts.domainOnProject = !!st.actions['vercel.domain']?.ok;
          facts.domainOk = st.dnsAt != null && script() - st.dnsAt >= VALID_AFTER;
          facts.configuredBy = facts.domainOk ? 'A' : null;
          facts.recommended = { a: '76.76.21.21', cname: 'd1d4fc829fe7bc7c.vercel-dns-017.com' };
          line = facts.domainOk ? ` ${st.inputs.domain} is valid on fieldday-web.` : facts.domainOnProject ? ` ${st.inputs.domain} is on fieldday-web; its records are not there yet.` : '';
        }
        r = { ok: true, summary: `Token works. It sees 2 projects${projectId ? ', fieldday-web among them' : ''}.${line}`, facts, fill: { teamId: TEAM, ...(projectId ? { projectId } : {}) } };
      }
    }
    const record = { ok: r.ok, at: iso(), ...(r.summary ? { summary: r.summary } : {}), ...(r.reason ? { reason: r.reason } : {}), facts: pickFacts(service, r.facts || {}), fill: r.fill || {} };
    st.checks[service] = record;
    refreshFacts();
    return { status: 200, ...st.checks[service] };
  };

  const ctx = () => ({
    domain: st.inputs.domain, projectName: 'fieldday-web',
    vc: st.saved.has('vercel.token') && st.saved.has('vercel.projectId') ? { token: 'demo', projectId: PROJECTS[0].id, teamId: TEAM } : {},
    entries: ['url', 'publishable', 'secret', 'dbUrl'].filter((k) => st.saved.has(`supabase.${k}`)).flatMap((k) => namesOf('supabase', k).map((n) => ({ key: n, secret: valueOf('supabase', k).secret }))),
  });

  /** POST /api/stack/apply/:action: the same plans and answers as the live server, and the state moves on. */
  const apply = async (action, b = {}) => {
    if (!ACTIONS[action]) return { status: 404, error: 'No such action.' };
    if (!owner()) return { status: 403, error: 'Actions are the owner\'s: a contributor\'s keys stay on this machine.' };
    const c = ctx();
    let plan;
    if (action === 'vercel.env') plan = await planVercelEnv(null, c);
    else if (action === 'vercel.domain') plan = await planVercelDomain(null, c);
    else if (action === 'cloudflare.dns') {
      if (!st.saved.has('cloudflare.apiToken') || !st.saved.has('cloudflare.zoneId')) plan = { ok: false, reason: 'Save the Cloudflare token and zone ID first.' };
      else if (!st.actions['vercel.domain']?.ok) plan = { ok: false, reason: `Vercel did not say which address ${st.inputs.domain || 'the domain'} should use. Add the domain to the project first.` };
      else {
        const lines = [`Create A ${st.inputs.domain} -> 76.76.21.21 (DNS only).`, `Create CNAME www.${st.inputs.domain} -> d1d4fc829fe7bc7c.vercel-dns-017.com (DNS only).`];
        plan = { ok: true, plan: { rows: [], conflicts: [], lines, count: 2, cta: 'Write 2 records', summary: lines.join(' ') } };
      }
    } else plan = { ok: false, reason: 'This domain is not registered with Vercel. Change the nameservers at your registrar.' };
    if (b.confirm !== true) {
      if (!plan.ok) return { status: 200, ok: false, reason: plan.reason };
      st.plans[action] = script();
      return { status: 200, ok: true, plan: plan.plan };
    }
    if (st.plans[action] == null) return { status: 409, error: 'Things changed; check the plan again.' };
    delete st.plans[action];
    let summary;
    if (action === 'vercel.env') summary = `${c.entries.length} values sent to fieldday-web (production, preview, development; secrets to production and preview). Redeploy to use them.`;
    else if (action === 'vercel.domain') summary = `Done. ${st.inputs.domain} and www.${st.inputs.domain} are on fieldday-web.`;
    else { summary = 'Done. 2 records written, DNS only.'; st.dnsAt = script(); }
    st.actions[action] = { ok: true, at: iso(), summary };
    return { status: 200, ...st.actions[action] };
  };

  return { status, pick, tick, save, check, apply, reset };
}
