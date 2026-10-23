// The stack hand-off's recipe registry (design section 2): the services an app runs on, each with what it is for, the
// steps with deep links to the right console page, the exact token and permissions to create, and every value to
// copy with its env names, shape and secret flag. Pure data plus tiny helpers; the server and the client both read it.
// A new service slots in by adding an entry here (and its check in server/stack-checks.mjs when it has one).
//
// 0.5.2 adds eighteen services (services-cloud.mjs, services-app.mjs, services-talk.mjs), spread into SERVICES below,
// each with a group for the picker and a `guide`: what the agent guide (guide.mjs, docs/stack.md in the app's repo)
// tells every session about using it with values from the vault.
//
// Templates: {domain}, {ref}, {team}, {project} and {port} in text and hrefs are filled from the inputs and the last
// check's facts by fillTemplate; the recipe holds the plain template.

import { CLOUD_SERVICES } from './services-cloud.mjs';
import { APP_SERVICES } from './services-app.mjs';
import { TALK_SERVICES } from './services-talk.mjs';

export const STACK_VERSION = 1;

/** The console hosts a step link may point at, per service. */
export const CONSOLE_HOSTS = {
  cloudflare: ['dash.cloudflare.com'],
  supabase: ['supabase.com'],
  vercel: ['vercel.com'],
  aws: ['console.aws.amazon.com'],
  gcp: ['console.cloud.google.com'],
  azure: ['portal.azure.com', 'entra.microsoft.com'],
  firebase: ['console.firebase.google.com', 'console.cloud.google.com'],
  stripe: ['dashboard.stripe.com'],
  clerk: ['dashboard.clerk.com'],
  neon: ['console.neon.tech'],
  upstash: ['console.upstash.com'],
  netlify: ['app.netlify.com'],
  fly: ['fly.io'],
  discord: ['discord.com'],
  slack: ['api.slack.com'],
  twilio: ['console.twilio.com'],
  resend: ['resend.com'],
  anthropic: ['platform.claude.com'],
  openai: ['platform.openai.com'],
  sentry: ['sentry.io'],
  posthog: ['us.posthog.com', 'eu.posthog.com'],
};

/** The picker's groups, in the order they draw. Every service names one. */
export const GROUPS = [
  { id: 'hosting', label: 'Hosting and DNS' },
  { id: 'data', label: 'Data' },
  { id: 'auth', label: 'Auth' },
  { id: 'payments', label: 'Payments' },
  { id: 'ai', label: 'AI' },
  { id: 'chat', label: 'Messaging and chat' },
  { id: 'email', label: 'Email and SMS' },
  { id: 'observe', label: 'Observability' },
  { id: 'cloud', label: 'Cloud' },
];

export const SERVICES = {
  cloudflare: {
    id: 'cloudflare', name: 'Cloudflare', mono: 'CF', group: 'hosting', keywords: ['dns', 'domain', 'cdn', 'workers'],
    role: 'Holds your domain and its DNS.',
    why: 'Your registrar points at Cloudflare\'s nameservers. Cloudflare then holds the records that send the domain to Vercel.',
    inputs: [{ key: 'domain', label: 'Your domain', shape: 'hostname', placeholder: 'example.com', shared: true }],
    token: {
      title: 'A custom API token, for this one zone',
      create: { href: 'https://dash.cloudflare.com/profile/api-tokens', label: 'Open API tokens' },
      start: 'Press "Create Token", pick the "Edit zone DNS" template, then add one more permission.',
      grant: [
        { group: 'Zone', item: 'Zone', level: 'Read', why: 'reads the nameservers and whether the zone is active' },
        { group: 'Zone', item: 'DNS', level: 'Edit', why: 'writes the records Vercel asks for' },
      ],
      optional: [{ group: 'Zone', item: 'SSL and Certificates', level: 'Edit', why: 'only if you proxy through Cloudflare (we do not by default)' }],
      resources: 'Zone Resources: Include, Specific zone, {domain}',
      expiry: 'Set a TTL, for example 90 days, and note it.',
      once: 'Cloudflare shows the token once. Paste it here before you close the page.',
    },
    steps: [
      { id: 'cf.add', text: 'Add {domain} as a site on Cloudflare. The Free plan is fine.', link: { href: 'https://dash.cloudflare.com/?to=/:account/add-site', label: 'Add a site' }, auto: 'cloudflare.zone' },
      { id: 'cf.dnssec', text: 'If DNSSEC is on at your registrar, turn it off first.', tick: true },
      { id: 'cf.ns', text: 'At your registrar, replace the nameservers with the two Cloudflare shows.', auto: 'cloudflare.active', note: 'This is the slow step. Start it first; the rest can go on while it spreads.' },
      { id: 'cf.token', text: 'Create the API token below and paste it.', values: ['apiToken'] },
      { id: 'cf.ids', text: 'Press Check it. It fills in the zone and account IDs for you.', values: ['zoneId'] },
    ],
    values: [
      { key: 'apiToken', label: 'API token', env: { server: 'CLOUDFLARE_API_TOKEN' }, secret: true, shape: 'cloudflareToken', required: true },
      { key: 'zoneId', label: 'Zone ID', env: { server: 'CLOUDFLARE_ZONE_ID' }, secret: false, shape: 'hex32', required: true, fill: 'check',
        where: { href: 'https://dash.cloudflare.com/?to=/:account/:zone', label: 'Overview, API section, bottom right' } },
      { key: 'accountId', label: 'Account ID', env: { server: 'CLOUDFLARE_ACCOUNT_ID' }, secret: false, shape: 'hex32', required: false, fill: 'check',
        where: { href: 'https://dash.cloudflare.com/?to=/:account/workers-and-pages', label: 'Workers & Pages, Account details' } },
    ],
    check: { id: 'cloudflare', uses: ['apiToken', 'domain'], label: 'Check it', note: 'Calls Cloudflare with this token, once, from your machine. Nothing is stored but the answer.' },
    actions: ['cloudflare.dns'],
    gotchas: [
      'Records for Vercel stay DNS only (grey cloud). Proxying adds a second cache and breaks Vercel\'s bot protection.',
      'If you have a CAA record, it must allow letsencrypt.org.',
      'Check email records (MX, SPF, DKIM) after the import; the scan can miss them.',
    ],
    guide: {
      reads: 'wrangler and the Cloudflare API read CLOUDFLARE_API_TOKEN (and CLOUDFLARE_ACCOUNT_ID); the token goes in an `Authorization: Bearer` header. CLOUDFLARE_ZONE_ID names the zone in API paths.',
      run: [
        'node scripts/secrets.mjs run --only CLOUDFLARE_API_TOKEN,CLOUDFLARE_ACCOUNT_ID -- npx wrangler whoami',
        'node scripts/secrets.mjs run --only CLOUDFLARE_API_TOKEN,CLOUDFLARE_ZONE_ID -- node scripts/dns-list.mjs',
      ],
      test: 'No test tokens. Make a second token scoped to a test zone for experiments; the app\'s token stays on its one zone.',
      limits: '1200 API requests per five minutes per user. DNS changes reach the edge in seconds, but a nameserver change can take hours.',
      do: ['Keep records for Vercel DNS only (grey cloud).', 'Scope each token to one zone and give it a TTL.'],
      dont: ['Turn on proxying for a host that manages its own certificates.', 'Use the Global API Key: it reaches the whole account.'],
    },
  },
  supabase: {
    id: 'supabase', name: 'Supabase', mono: 'SB', group: 'data', keywords: ['postgres', 'database', 'auth', 'storage'],
    role: 'Your database and sign-in.',
    why: 'Postgres, Auth and Storage. The app needs a URL and a public key in the browser, and a secret key and a database URL on the server, here and on Vercel.',
    inputs: [],
    token: {
      optionalToken: true,
      title: 'Optional: a scoped access token, for this project only',
      create: { href: 'https://supabase.com/dashboard/account/tokens', label: 'Open access tokens' },
      start: 'Supabase keys are copied from the project, not created. This token only lets Check it confirm the project.',
      grant: [
        { group: 'Project', item: 'Project Settings', level: 'Read', why: 'confirms the project name, region and status' },
      ],
      resources: 'Selected project: {ref}',
      avoid: 'Not a classic token. Those reach your whole account.',
    },
    steps: [
      { id: 'sb.new', text: 'Create a project. Save the database password somewhere safe.', link: { href: 'https://supabase.com/dashboard/new', label: 'New project' }, values: ['url'] },
      { id: 'sb.connect', text: 'Open "Connect". Copy the project URL and the publishable key.', link: { href: 'https://supabase.com/dashboard/project/_?showConnect=true', label: 'Open Connect' }, values: ['url', 'publishable'] },
      { id: 'sb.keys', text: 'Copy the secret key (sb_secret_...).', link: { href: 'https://supabase.com/dashboard/project/_/settings/api-keys', label: 'API keys' }, values: ['secret'] },
      { id: 'sb.db', text: 'In "Connect", pick "Transaction pooler" and copy the URI. Put your password in place of [YOUR-PASSWORD].', link: { href: 'https://supabase.com/dashboard/project/_?showConnect=true', label: 'Open Connect' }, values: ['dbUrl'] },
      { id: 'sb.auth', text: 'Set the Site URL to https://{domain} and add the redirect URLs.', link: { href: 'https://supabase.com/dashboard/project/_/auth/url-configuration', label: 'URL configuration' }, tick: true, after: 'dns',
        copy: ['https://{domain}/**', 'http://localhost:{port}/**', 'https://*-{team}.vercel.app/**'] },
    ],
    values: [
      { key: 'url', label: 'Project URL', env: { public: 'SUPABASE_URL', server: 'SUPABASE_URL' }, secret: false, shape: 'supabaseUrl', required: true },
      { key: 'publishable', label: 'Publishable key', env: { public: 'SUPABASE_PUBLISHABLE_KEY', server: 'SUPABASE_PUBLISHABLE_KEY' }, secret: false, shape: 'supabasePublishable', required: true },
      { key: 'secret', label: 'Secret key', env: { server: 'SUPABASE_SECRET_KEY' }, secret: true, shape: 'supabaseSecret', required: true },
      { key: 'dbUrl', label: 'Database URL (pooler)', env: { server: 'DATABASE_URL' }, secret: true, shape: 'postgresUrl', required: true },
      { key: 'ref', label: 'Project ref', env: { server: 'SUPABASE_PROJECT_REF' }, secret: false, shape: 'supabaseRef', required: false, fill: 'url' },
      { key: 'pat', label: 'Access token', env: { server: 'SUPABASE_ACCESS_TOKEN' }, secret: true, shape: 'supabasePat', required: false },
    ],
    check: { id: 'supabase', uses: ['url', 'publishable', 'secret', 'pat'], label: 'Check it', note: 'Calls your Supabase project with these keys, once, from your machine. Nothing is stored but the answer.' },
    actions: [],
    gotchas: [
      'The secret key and the database URL never get NEXT_PUBLIC_ or VITE_. Anything with that prefix ships to every visitor.',
      'On Vercel, use the transaction pooler (port 6543), pool size 1, prepared statements off.',
      'Percent-encode @ # ? & and spaces in the password.',
      'Forgetting the Site URL breaks sign-up emails and password resets.',
    ],
    guide: {
      reads: '@supabase/supabase-js and @supabase/ssr take the URL and a key from code: the URL and the publishable key (prefixed) in the browser, the secret key only on the server. Postgres clients and ORMs read DATABASE_URL. The supabase CLI reads SUPABASE_ACCESS_TOKEN.',
      run: [
        'node scripts/secrets.mjs run --only SUPABASE_ACCESS_TOKEN,SUPABASE_PROJECT_REF -- sh -c \'npx supabase link --project-ref "$SUPABASE_PROJECT_REF"\'',
        'node scripts/secrets.mjs run --only DATABASE_URL -- npx drizzle-kit migrate',
      ],
      test: 'No test keys. Use a second project for staging, or `npx supabase start` for a local stack with its own keys. Never point tests at the production database.',
      limits: 'Auth endpoints are rate limited per IP and per project (sign-up emails especially). The transaction pooler takes many clients; a direct connection is capped by the compute size.',
      do: ['Turn on row level security on every table the browser can reach.', 'Use the transaction pooler (6543) from serverless code.'],
      dont: ['Give the secret key or DATABASE_URL a public prefix.', 'Use the secret key in browser code: it bypasses row level security.'],
    },
  },
  vercel: {
    id: 'vercel', name: 'Vercel', mono: 'VC', group: 'hosting', keywords: ['hosting', 'deploy', 'next.js', 'preview'],
    role: 'Builds and hosts the app.',
    why: 'Every push builds a preview, and main builds production. Vercel serves your domain and keeps the app\'s env, so the values the app reads go here too.',
    inputs: [{ key: 'domain', label: 'Your domain', shape: 'hostname', placeholder: 'example.com', shared: true }],
    token: {
      title: 'An access token for your team',
      create: { href: 'https://vercel.com/account/tokens', label: 'Open tokens' },
      start: 'Press "Create Token" and set the scope to your team.',
      scope: 'Scope: your team (All projects). A project-only token is narrower but cannot add the domain.',
      grant: [{ group: 'Scope', item: 'Your team', level: 'All projects', why: 'adds the domain and sets the project\'s env' }],
      expiry: '30 days is plenty to set up; make a new one for CI later.',
      once: 'Vercel shows the token once. Paste it here before you close the page.',
    },
    steps: [
      { id: 'vc.new', text: 'Import your git repo as a project and let the first build run.', link: { href: 'https://vercel.com/new', label: 'New project' }, auto: 'vercel.projects', note: 'The first deploy has to finish before Vercel accepts a domain.' },
      { id: 'vc.token', text: 'Create the token below and paste it.', values: ['token'] },
      { id: 'vc.ids', text: 'Press Check it, then pick this app\'s project.', values: ['projectId', 'teamId'] },
      { id: 'vc.env', text: 'Send the values the app reads (every picked service\'s) to the project.', action: 'vercel.env' },
      { id: 'vc.domain', text: 'Add {domain} and www.{domain} to the project.', action: 'vercel.domain', link: { href: 'https://vercel.com/d?to=%2F%5Bteam%5D%2F%5Bproject%5D%2Fsettings%2Fdomains', label: 'Domains' } },
      { id: 'vc.ready', text: 'Wait for the domain to show Valid.', auto: 'vercel.domainOk' },
    ],
    values: [
      { key: 'token', label: 'Access token', env: { server: 'VERCEL_TOKEN' }, secret: true, shape: 'vercelToken', required: true },
      { key: 'teamId', label: 'Team ID', env: { server: 'VERCEL_ORG_ID' }, secret: false, shape: 'vercelTeam', required: true, fill: 'check' },
      { key: 'projectId', label: 'Project ID', env: { server: 'VERCEL_PROJECT_ID' }, secret: false, shape: 'vercelProject', required: true, fill: 'check' },
    ],
    check: { id: 'vercel', uses: ['token', 'projectId', 'teamId'], label: 'Check it', note: 'Calls Vercel with this token, once, from your machine. Nothing is stored but the answer.' },
    actions: ['vercel.env', 'vercel.domain', 'vercel.nameservers'],
    gotchas: [
      'Env changes apply to the next deploy. Redeploy after sending them.',
      'Secret values go to Vercel as Sensitive. You cannot read them back there, so the vault keeps the copy.',
      'Do not switch the domain to Vercel\'s nameservers in this stack; Cloudflare holds DNS.',
    ],
    guide: {
      reads: 'The vercel CLI reads VERCEL_TOKEN, VERCEL_ORG_ID and VERCEL_PROJECT_ID in place of `vercel login` and `vercel link`. App code never reads them.',
      run: [
        'node scripts/secrets.mjs run --only VERCEL_TOKEN,VERCEL_ORG_ID,VERCEL_PROJECT_ID -- npx vercel pull --yes',
        'node scripts/secrets.mjs run --only VERCEL_TOKEN,VERCEL_ORG_ID,VERCEL_PROJECT_ID -- npx vercel deploy',
      ],
      runNote: 'Send values to the project with `node scripts/secrets.mjs push NAME --to vercel` (stdin, never argv), or the stack card\'s Send to Vercel.',
      test: 'Every push builds a preview with its own URL; preview env is separate from production. A deploy without --prod is never production.',
      limits: 'Deployments and API calls are limited per plan; a 429 carries a reset time. Do not redeploy in a loop.',
      do: ['Redeploy after changing env; changes apply to the next build.', 'Keep secret values Sensitive on Vercel; the vault keeps the readable copy.'],
      dont: ['Run `vercel env pull` into a tracked file, or `vercel env add` with a secret on the command line.', 'Deploy to production from a session without saying so first.'],
    },
  },
  ...CLOUD_SERVICES,
  ...APP_SERVICES,
  ...TALK_SERVICES,
};

/** The order cards draw in (each service's first milestone). */
export const ORDER = [
  'cloudflare', 'supabase', 'vercel',
  'netlify', 'fly', 'neon', 'upstash', 'firebase', 'clerk', 'stripe', 'anthropic', 'openai',
  'discord', 'slack', 'resend', 'twilio', 'sentry', 'posthog', 'aws', 'gcp', 'azure',
];

/** The presets above the picker. */
export const PRESETS = [
  { id: 'trinity', label: 'Supabase + Vercel + Cloudflare', picked: ['cloudflare', 'supabase', 'vercel'] },
  { id: 'sv', label: 'Supabase + Vercel', picked: ['supabase', 'vercel'] },
  { id: 'saas', label: 'Next.js SaaS', picked: ['vercel', 'neon', 'clerk', 'stripe', 'resend', 'sentry'] },
  { id: 'ai', label: 'AI app', picked: ['anthropic', 'vercel', 'supabase', 'posthog'] },
  { id: 'discord', label: 'Discord bot', picked: ['discord', 'fly', 'upstash'] },
  { id: 'slack', label: 'Slack app', picked: ['slack', 'fly', 'neon'] },
];

/**
 * The names CI needs (vercel pull/build/deploy, wrangler, netlify deploy, fly deploy, the Sentry source map upload):
 * pushed to GitHub Actions when that target is ticked. Cloud keys stay out: CI should use OIDC for AWS, Google Cloud
 * and Azure instead of a stored key.
 */
export const CI_NAMES = new Set([
  'VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID',
  'NETLIFY_AUTH_TOKEN', 'NETLIFY_SITE_ID', 'FLY_API_TOKEN', 'SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT',
]);

/** What each action does, for the plan's head and the rail's button. */
export const ACTIONS = {
  'cloudflare.dns': { service: 'cloudflare', label: 'Point {domain} at Vercel', cta: 'Write the records', needs: ['cloudflare', 'vercel'] },
  'vercel.domain': { service: 'vercel', label: 'Add {domain} to the project', cta: 'Add the domain', needs: ['vercel'] },
  'vercel.env': { service: 'vercel', label: 'Send the app\'s values to Vercel', cta: 'Send to Vercel', needs: ['vercel'] },
  'vercel.nameservers': { service: 'vercel', label: 'Set the nameservers at Vercel', cta: 'Set the nameservers', needs: ['vercel', 'cloudflare'] },
};

/**
 * The trinity's order. `done`: `values:<svc>` (every required value saved), `action:<id>` (its last result ok),
 * `tick:<step>` (ticked by the person), `<check>.<fact>` (a fact from the last check). `wait`: a slow outside thing;
 * while it is false the milestone waits without blocking ones that do not depend on it.
 */
export const MILESTONES = [
  { id: 'zone', service: 'cloudflare', label: 'Domain on Cloudflare', done: 'cloudflare.zone', wait: 'cloudflare.active', waitLabel: 'nameservers', after: [] },
  { id: 'db', service: 'supabase', label: 'Supabase keys saved', done: 'values:supabase', after: [] },
  { id: 'host', service: 'vercel', label: 'Vercel project linked', done: 'values:vercel', after: [] },
  { id: 'env', service: 'vercel', label: 'Keys sent to Vercel', done: 'action:vercel.env', after: ['db', 'host'] },
  { id: 'domain', service: 'vercel', label: 'Domain on the project', done: 'action:vercel.domain', after: ['host', 'zone'] },
  { id: 'dns', service: 'cloudflare', label: 'DNS points at Vercel', done: 'action:cloudflare.dns', after: ['domain'] },
  { id: 'auth', service: 'supabase', label: 'Sign-in knows the domain', done: 'tick:sb.auth', after: ['dns'], fallbackAfter: ['host'] },
  { id: 'live', service: 'vercel', label: 'Live on {domain}', done: 'vercel.domainOk', wait: 'cloudflare.active', waitLabel: 'nameservers', after: ['dns'] },
  // Every other service: one milestone, its required values saved. They depend on nothing, so any order works.
  ...ORDER.filter((id) => !['cloudflare', 'supabase', 'vercel'].includes(id)).map((id) => ({
    id, service: id, label: `${SERVICES[id].name} ${SERVICES[id].values.filter((v) => v.required).length === 1 ? 'key' : 'keys'} saved`, done: `values:${id}`, after: [],
  })),
];

/**
 * Names a repo may already read in place of a recipe name. When the repo uses the alias and not the new name, the
 * save writes the alias (design 5.4).
 */
export function aliasesOf(name) {
  const n = String(name);
  if (n === 'SUPABASE_SECRET_KEY') return ['SUPABASE_SERVICE_ROLE_KEY'];
  if (n === 'DATABASE_URL') return ['POSTGRES_URL'];
  if (/SUPABASE_PUBLISHABLE_KEY$/.test(n)) return [n.replace(/SUPABASE_PUBLISHABLE_KEY$/, 'SUPABASE_ANON_KEY')];
  return ALIASES[n] || [];
}

/** The 0.5.2 services' legacy names. Never an alias to GOOGLE_APPLICATION_CREDENTIALS: that name holds a file path. */
const ALIASES = {
  AWS_REGION: ['AWS_DEFAULT_REGION'],
  GCP_SERVICE_ACCOUNT_KEY: ['GOOGLE_CREDENTIALS', 'GCP_SA_KEY'],
  GOOGLE_CLOUD_PROJECT: ['GCLOUD_PROJECT', 'GCP_PROJECT_ID'],
  AZURE_TENANT_ID: ['ARM_TENANT_ID'],
  AZURE_CLIENT_ID: ['ARM_CLIENT_ID'],
  AZURE_CLIENT_SECRET: ['ARM_CLIENT_SECRET'],
  AZURE_SUBSCRIPTION_ID: ['ARM_SUBSCRIPTION_ID'],
  DISCORD_TOKEN: ['DISCORD_BOT_TOKEN'],
  DISCORD_APPLICATION_ID: ['DISCORD_CLIENT_ID'],
  TWILIO_API_SECRET: ['TWILIO_API_KEY_SECRET'],
  TWILIO_API_KEY: ['TWILIO_API_KEY_SID'],
  TWILIO_PHONE_NUMBER: ['TWILIO_FROM_NUMBER'],
  STRIPE_SECRET_KEY: ['STRIPE_API_KEY'],
  CLERK_WEBHOOK_SIGNING_SECRET: ['CLERK_WEBHOOK_SECRET'],
  FIREBASE_SERVICE_ACCOUNT_KEY: ['FIREBASE_SERVICE_ACCOUNT'],
  OPENAI_ORG_ID: ['OPENAI_ORGANIZATION'],
  UPSTASH_REDIS_REST_URL: ['KV_REST_API_URL'],
  UPSTASH_REDIS_REST_TOKEN: ['KV_REST_API_TOKEN'],
};

/** One recipe value: SERVICES[service].values[key], or null. */
export function valueOf(service, key) {
  return SERVICES[service]?.values.find((v) => v.key === key) || null;
}

/** The manifest's short `for` line for a value. */
export function recipeFor(service, key) {
  const s = SERVICES[service];
  const v = valueOf(service, key);
  if (!s || !v) return 'Added by the stack hand-off.';
  return `${s.name} ${v.label.toLowerCase()} (${v.secret ? 'server only' : 'not secret'}). Set up a stack.`;
}

/** The registry's services in card order, limited to those picked (all when none given). */
export function servicesIn(picked) {
  const want = Array.isArray(picked) ? picked : ORDER;
  return ORDER.filter((id) => want.includes(id)).map((id) => SERVICES[id]);
}

/** Fill {domain}, {ref}, {team}, {project}, {port} from a context; an unknown or empty one reads as a plain word. */
export function fillTemplate(text, ctx = {}) {
  const words = { domain: 'your domain', ref: 'your project', team: 'your-team', project: 'your project', port: '3000' };
  return String(text ?? '').replace(/\{(\w+)\}/g, (m, k) => {
    const v = ctx[k];
    if (typeof v === 'string' && v) return v;
    if (typeof v === 'number') return String(v);
    return k in words ? words[k] : m;
  });
}

/** The template keys in a text the context leaves empty (the filled text then holds a stand-in word, not a value). */
export function unfilledKeys(text, ctx = {}) {
  const out = [];
  for (const [, k] of String(text ?? '').matchAll(/\{(\w+)\}/g)) {
    const v = ctx[k];
    if (!((typeof v === 'string' && v) || typeof v === 'number')) out.push(k);
  }
  return out;
}

/** The milestones for a set of picked services: those whose services are not all picked drop out. */
export function milestonesFor(picked) {
  const has = new Set(picked || []);
  const kept = MILESTONES.filter((m) => {
    if (!has.has(m.service)) return false;
    // Keys go to Vercel when it hosts and some picked service holds values the app reads (anything not a host).
    if (m.id === 'env') return has.has('vercel') && [...has].some((id) => SERVICES[id] && SERVICES[id].group !== 'hosting');
    if (m.id === 'domain' || m.id === 'dns' || m.id === 'live') return has.has('vercel') && has.has('cloudflare');
    return true;
  });
  const ids = new Set(kept.map((m) => m.id));
  return kept.map((m) => {
    let after = m.after.filter((a) => ids.has(a));
    if (m.fallbackAfter && m.after.some((a) => !ids.has(a))) after = m.fallbackAfter.filter((a) => ids.has(a));
    return { ...m, after };
  });
}

/** The services a picker query matches: by name, role, group label or keyword, case-insensitive; all for an empty one. */
export function searchServices(query, ids = ORDER) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [...ids];
  const words = q.split(/\s+/);
  return ids.filter((id) => {
    const s = SERVICES[id];
    const hay = [s.id, s.name, s.role, GROUPS.find((g) => g.id === s.group)?.label, ...(s.keywords || [])].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** The picker's groups with their services, limited to ids (a search's hits); a group with none drops out. */
export function groupedServices(ids = ORDER) {
  const want = new Set(ids);
  return GROUPS.map((g) => ({ ...g, services: ORDER.filter((id) => want.has(id) && SERVICES[id].group === g.id) })).filter((g) => g.services.length);
}

/** Picked services that write the same env name (Supabase and Neon both write DATABASE_URL): [{ name, services }]. */
export function nameClashes(picked) {
  const by = new Map();
  for (const id of ORDER.filter((x) => (picked || []).includes(x))) {
    for (const v of SERVICES[id].values) {
      for (const n of new Set([v.env?.server, v.env?.public].filter(Boolean))) {
        if (!by.has(n)) by.set(n, new Set());
        by.get(n).add(id);
      }
    }
  }
  return [...by].filter(([, set]) => set.size > 1).map(([name, set]) => ({ name, services: [...set] }));
}
