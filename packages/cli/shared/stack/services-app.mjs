// Registry entries for payments, sign-in, data and hosting: Stripe, Clerk, Neon, Upstash, Netlify, Fly.io. Same shape
// as SERVICES in recipes.mjs (which spreads these in). Researched 2026-10-23 against each service's own docs; the
// sources sit above each entry.

export const APP_SERVICES = {
  // Sources: docs.stripe.com keys (sandboxes, reveal once, 7-day rotation grace); keys/restricted-api-keys (None, Read,
  // Write; 403 on a missing permission); keys/permissions-reference; rate-limits; cli/api_keys (STRIPE_API_KEY).
  stripe: {
    id: 'stripe', name: 'Stripe', mono: 'ST', group: 'payments', keywords: ['payments', 'billing', 'checkout', 'subscriptions'],
    role: 'Takes payments and runs subscriptions.',
    why: 'The browser needs the publishable key to open Checkout. The server needs a restricted key to create sessions and a webhook secret to trust what Stripe tells it.',
    inputs: [{ key: 'domain', label: 'Your domain', shape: 'hostname', placeholder: 'example.com', shared: true }],
    token: {
      title: 'A restricted key, with only what the app uses',
      create: { href: 'https://dashboard.stripe.com/test/apikeys/create', label: 'Create restricted key' },
      start: 'Build in a sandbox first. Press "Create restricted key", start from no permissions, name it after the app, then set these to Read or Write. Leave everything else at None.',
      grant: [
        { group: 'Checkout', item: 'Checkout Sessions', level: 'Write', why: 'opens a payment page for each purchase' },
        { group: 'Core', item: 'Customers', level: 'Write', why: 'creates and updates the Stripe customer for each user' },
        { group: 'Products', item: 'Prices', level: 'Read', why: 'lists your plans; Check it reads one price with it' },
        { group: 'Products', item: 'Products', level: 'Read', why: 'shows plan names' },
        { group: 'Billing', item: 'Subscriptions', level: 'Read', why: 'reads a user\'s plan and status' },
        { group: 'Billing', item: 'Customer portal', level: 'Write', why: 'opens the billing portal where people change or cancel' },
      ],
      optional: [
        { group: 'Billing', item: 'Subscriptions', level: 'Write', why: 'only if the server changes plans itself rather than through the portal' },
        { group: 'Core', item: 'Payment Intents', level: 'Write', why: 'only for a custom payment flow without Checkout' },
      ],
      resources: 'This account, or this sandbox. With Connect, leave the connected account permissions at None unless you need them.',
      avoid: 'Not the standard secret key (sk_). It can do anything in your account, payouts included.',
      expiry: 'Restricted keys do not expire on their own. Rotate when someone leaves; the old key keeps working for up to 7 days.',
      once: 'Stripe shows a live key once. Paste it here before you close the dialog. Sandbox keys can be revealed again.',
    },
    steps: [
      { id: 'st.pk', text: 'Open the sandbox API keys and copy the publishable key (pk_test_...).', link: { href: 'https://dashboard.stripe.com/test/apikeys', label: 'Sandbox API keys' }, values: ['publishable'] },
      { id: 'st.rk', text: 'Create the restricted key below and paste it.', values: ['secret'] },
      { id: 'st.check', text: 'Press Check it. It reads one price with the key.', auto: 'stripe.permissionOk' },
      { id: 'st.hook', text: 'Add a webhook endpoint at https://{domain}/api/stripe/webhook (or your route). Pick only the events the app handles, then reveal and copy its signing secret.',
        link: { href: 'https://dashboard.stripe.com/test/webhooks', label: 'Webhooks' }, values: ['webhookSecret'],
        copy: ['https://{domain}/api/stripe/webhook', 'checkout.session.completed', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.payment_failed'] },
      { id: 'st.portal', text: 'Turn on the customer portal and set its return link to https://{domain}.', link: { href: 'https://dashboard.stripe.com/test/settings/billing/portal', label: 'Customer portal' }, tick: true },
      { id: 'st.live', text: 'When you go live, repeat with the live keys (pk_live_, rk_live_) and a live webhook. Live and sandbox keep separate data.', link: { href: 'https://dashboard.stripe.com/apikeys', label: 'Live API keys' }, tick: true },
    ],
    values: [
      { key: 'publishable', label: 'Publishable key', env: { public: 'STRIPE_PUBLISHABLE_KEY', server: 'STRIPE_PUBLISHABLE_KEY' }, secret: false, shape: 'stripePublishable', required: true },
      { key: 'secret', label: 'Restricted key', env: { server: 'STRIPE_SECRET_KEY' }, secret: true, shape: 'stripeSecret', required: true },
      { key: 'webhookSecret', label: 'Webhook signing secret', env: { server: 'STRIPE_WEBHOOK_SECRET' }, secret: true, shape: 'webhookSecret', required: true,
        where: { href: 'https://dashboard.stripe.com/test/webhooks', label: 'Webhooks, your endpoint, Signing secret' } },
    ],
    check: { id: 'stripe', uses: ['secret', 'publishable'], label: 'Check it', note: 'Reads one price with this key, once, from your machine. Nothing is stored but the answer.' },
    actions: [],
    gotchas: [
      'The restricted key and the webhook secret never get NEXT_PUBLIC_ or VITE_. Only the publishable key ships to the browser.',
      'Sandbox and live keys must match: pk_test_ with rk_test_, pk_live_ with rk_live_.',
      'The secret `stripe listen` prints is for local forwarding only, not the Dashboard endpoint\'s secret. Keep it out of production.',
      'A webhook route must read the raw body to check the signature. Body parsers that rewrite JSON break it.',
    ],
    guide: {
      reads: 'The Stripe SDKs read no env: `new Stripe(process.env.STRIPE_SECRET_KEY)`. A restricted key is a drop-in for a secret key under the same name. The webhook route calls `stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET)`. The browser reads the publishable key under the framework prefix.',
      run: [
        'node scripts/secrets.mjs run --only STRIPE_SECRET_KEY,STRIPE_WEBHOOK_SECRET -- npm run dev',
        'stripe listen --forward-to localhost:3000/api/stripe/webhook',
      ],
      runNote: 'The Stripe CLI reads STRIPE_API_KEY, not STRIPE_SECRET_KEY: use `stripe login` for local CLI work, or declare a separate sandbox read key as STRIPE_API_KEY. `stripe listen` prints a fresh whsec_ for the session; the owner pastes it with `node scripts/secrets.mjs set STRIPE_WEBHOOK_SECRET` in their own terminal for local work. It is not the Dashboard endpoint\'s secret.',
      runNoteIf: {
        STRIPE_API_KEY: 'The Stripe CLI reads STRIPE_API_KEY, and this repo keeps the app\'s secret key under that name: use `stripe login` for local CLI work instead of handing the CLI that name. `stripe listen` prints a fresh whsec_ for the session; the owner pastes it with `node scripts/secrets.mjs set STRIPE_WEBHOOK_SECRET` in their own terminal for local work. It is not the Dashboard endpoint\'s secret.',
      },
      fixed: { STRIPE_API_KEY: 'the Stripe CLI' },
      test: 'Sandbox keys are pk_test_, rk_test_ and sk_test_; live keys are _live_. Sandbox and live keep separate data. Use test cards such as 4242 4242 4242 4242. A session never uses a live key unless the owner says so for that task.',
      limits: '100 requests a second live and 25 in a sandbox, per account, with per-endpoint limits too. Reads have a monthly allocation: use webhooks, not polling. Back off with jitter on 429.',
      do: ['Add a permission to the restricted key only when a 403 names it.', 'Verify every webhook\'s signature against the raw body before acting on it.'],
      dont: ['Switch to an sk_ key to make an error go away.', 'Make live-mode calls (refunds, payouts, price changes) from a session.', 'Put STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET under a public prefix or in a test fixture.'],
    },
  },

  // Sources: clerk.com guides clerk-environment-variables; deployment/production (pk/sk test vs live, DNS, own OAuth);
  // reference/backend-api (GET api.clerk.com/v1/users/count, read-only); how-clerk-works/system-limits.
  clerk: {
    id: 'clerk', name: 'Clerk', mono: 'CK', group: 'auth', keywords: ['auth', 'sign-in', 'users', 'sessions', 'login'],
    role: 'Sign-in, user accounts and sessions.',
    why: 'The browser needs the publishable key to draw sign-in. The server needs the secret key to check sessions and read users. A webhook secret lets the app trust user events.',
    inputs: [{ key: 'domain', label: 'Your domain', shape: 'hostname', placeholder: 'example.com', shared: true }],
    token: {
      title: 'The secret key, from API keys',
      create: { href: 'https://dashboard.clerk.com/~/api-keys', label: 'Open API keys' },
      start: 'Clerk keys are copied, not created. Pick the instance at the top (Development first), then copy both keys from API keys.',
      grant: [{ group: 'Instance', item: 'Development', level: 'pk_test_ and sk_test_', why: 'works on localhost with Clerk\'s shared sign-in providers' }],
      optional: [{ group: 'Instance', item: 'Production', level: 'pk_live_ and sk_live_', why: 'only after you create the production instance and verify {domain}' }],
      resources: 'One instance: Development or Production. Each has its own keys, users and settings.',
      avoid: 'Do not let `clerk init` or `clerk env pull` write keys into .env.local. Paste them here so the vault holds them.',
      expiry: 'Clerk secret keys have no expiry setting. To rotate, add a new key and delete the old one.',
    },
    steps: [
      { id: 'ck.new', text: 'Create an application and pick the sign-in methods.', link: { href: 'https://dashboard.clerk.com/apps/new', label: 'New application' } },
      { id: 'ck.keys', text: 'In API keys, copy the publishable key and the secret key.', link: { href: 'https://dashboard.clerk.com/~/api-keys', label: 'API keys' }, values: ['publishable', 'secret'] },
      { id: 'ck.hook', text: 'Optional: add a webhook endpoint at https://{domain}/api/webhooks/clerk and copy its signing secret.', link: { href: 'https://dashboard.clerk.com/~/webhooks', label: 'Webhooks' }, values: ['webhookSecret'],
        copy: ['https://{domain}/api/webhooks/clerk', 'user.created', 'user.updated', 'user.deleted'] },
      { id: 'ck.prod', text: 'To go live: create the production instance, add the DNS records Clerk lists for {domain}, then copy the pk_live_ and sk_live_ keys.', link: { href: 'https://dashboard.clerk.com/~/domains', label: 'Domains' }, tick: true,
        note: 'Clerk\'s records stay DNS only (grey cloud) on Cloudflare.' },
    ],
    values: [
      { key: 'publishable', label: 'Publishable key', env: { public: 'CLERK_PUBLISHABLE_KEY', server: 'CLERK_PUBLISHABLE_KEY' }, secret: false, shape: 'clerkPublishable', required: true },
      { key: 'secret', label: 'Secret key', env: { server: 'CLERK_SECRET_KEY' }, secret: true, shape: 'clerkSecret', required: true },
      { key: 'webhookSecret', label: 'Webhook signing secret', env: { server: 'CLERK_WEBHOOK_SIGNING_SECRET' }, secret: true, shape: 'webhookSecret', required: false,
        where: { href: 'https://dashboard.clerk.com/~/webhooks', label: 'Webhooks, your endpoint, Signing Secret' } },
    ],
    check: { id: 'clerk', uses: ['secret', 'publishable'], label: 'Check it', note: 'Asks Clerk how many users the instance has (a count only, no user data), once, from your machine. Nothing is stored but the answer.' },
    actions: [],
    gotchas: [
      'The secret key never gets NEXT_PUBLIC_ or VITE_. Only the publishable key ships to the browser.',
      'Development and production are separate instances: different keys, users and settings.',
      'pk_live_ and sk_live_ only work once the production domain\'s DNS is verified, which can take up to 48 hours.',
      'Keys from different instances do not mix: a pk_test_ with an sk_live_ signs people in and then fails every server check.',
    ],
    guide: {
      reads: 'Clerk\'s framework SDKs (@clerk/nextjs, @clerk/express, @clerk/backend) read CLERK_SECRET_KEY and the prefixed publishable key with no code; `clerkMiddleware()` and `auth()` need nothing passed. `verifyWebhook(req)` reads CLERK_WEBHOOK_SIGNING_SECRET.',
      run: [
        'node scripts/secrets.mjs run --only CLERK_SECRET_KEY,CLERK_PUBLISHABLE_KEY -- npm run dev',
        'node scripts/secrets.mjs run --only CLERK_SECRET_KEY,CLERK_PUBLISHABLE_KEY -- npx clerk@latest doctor',
      ],
      test: 'pk_test_ and sk_test_ are a Development instance: localhost works and social sign-in uses shared credentials. pk_live_ and sk_live_ are Production and need the verified domain and your own OAuth apps.',
      limits: 'Backend API: 1000 requests per 10 seconds in production, 100 in development. Do not call it in a request hot path when the session token already holds the claim.',
      do: ['Let the SDK read CLERK_SECRET_KEY from env; always `await auth()` and protect routes in middleware.', 'Keep test and live pairs together, one pair per environment on the host.'],
      dont: ['Run `clerk init` keyless or `clerk env pull`: both write keys into .env.local, outside the vault.', 'Pass the secret key to client components, or verify webhooks by hand.'],
    },
  },

  // Sources: neon.com docs manage/api-keys (personal, organization, project-scoped; Bearer; no expiry);
  // connect/connection-pooling (-pooler host; direct for migrations); reference/api (base console.neon.tech/api/v2);
  // reference/api/key-concepts (700 requests a minute).
  neon: {
    id: 'neon', name: 'Neon', mono: 'NE', group: 'data', keywords: ['postgres', 'database', 'sql', 'serverless'],
    role: 'Serverless Postgres.',
    why: 'A Postgres database that scales to zero and branches like git. The app reads a pooled connection string at run time; migrations use the direct one. Both hold the password and live only on the server.',
    inputs: [],
    token: {
      optionalToken: true,
      title: 'Optional: a project-scoped API key, for this project only',
      create: { href: 'https://console.neon.tech/app/projects', label: 'Open the Neon console' },
      start: 'In your organization\'s Settings, API keys, press "Create new", pick "Project-scoped" and this project. Only organization admins can make one; anyone else makes a personal key under their account settings. A key is only needed for Check it, branching from CI, or neonctl.',
      grant: [{ group: 'Key type', item: 'Project-scoped', level: 'This project', why: 'reads the project and makes preview branches, nothing else' }],
      optional: [{ group: 'Key type', item: 'Personal', level: 'Your account', why: 'only on a personal account with no organization; it reaches all your projects' }],
      resources: 'One project.',
      avoid: 'Not an organization key. It reaches every project in the org.',
      expiry: 'Neon keys do not expire. Revoke it when the work is done, and make a new one for CI.',
      once: 'Neon shows the key once. Paste it here before you close the dialog.',
    },
    steps: [
      { id: 'ne.new', text: 'Create a project. Pick the region nearest your host (for Vercel, the same AWS region as your functions).', link: { href: 'https://console.neon.tech/app/projects', label: 'Projects' } },
      { id: 'ne.pooled', text: 'Press "Connect", turn "Connection pooling" on and copy the connection string (the host has -pooler in it).', link: { href: 'https://console.neon.tech/app/projects', label: 'Open the project, then Connect' }, values: ['dbUrl'] },
      { id: 'ne.direct', text: 'Turn "Connection pooling" off and copy the string again. That is the direct one, for migrations.', values: ['dbUrlDirect'] },
      { id: 'ne.key', text: 'Optional: create the project-scoped key below, paste it, and press Check it. It fills in the project ID.', values: ['apiKey'] },
    ],
    values: [
      { key: 'dbUrl', label: 'Database URL (pooled)', env: { server: 'DATABASE_URL' }, secret: true, shape: 'neonPooledUrl', required: true },
      { key: 'dbUrlDirect', label: 'Database URL (direct)', env: { server: 'DATABASE_URL_UNPOOLED' }, secret: true, shape: 'neonDirectUrl', required: true },
      { key: 'apiKey', label: 'API key', env: { server: 'NEON_API_KEY' }, secret: true, shape: 'neonApiKey', required: false },
      { key: 'projectId', label: 'Project ID', env: { server: 'NEON_PROJECT_ID' }, secret: false, shape: 'neonProjectId', required: false, fill: 'check' },
    ],
    check: { id: 'neon', uses: ['apiKey', 'projectId', 'dbUrl'], label: 'Check it', note: 'Calls Neon\'s API with the key, once, from your machine. The database URL is never sent. Nothing is stored but the answer.' },
    actions: [],
    gotchas: [
      'The app uses the pooled URL (-pooler in the host). Migrations, pg_dump and admin tools use the direct one.',
      'Both URLs hold the password. Neither ever gets NEXT_PUBLIC_ or VITE_.',
      'A database that scaled to zero takes a moment to wake. Set a connect timeout of 10 seconds or more.',
      'Supabase also writes DATABASE_URL. Pick one of them to own it; with both picked, the last value saved wins.',
    ],
    guide: {
      reads: 'DATABASE_URL (pooled) goes to `neon(process.env.DATABASE_URL)` from @neondatabase/serverless, pg, postgres.js or Drizzle; Prisma 7: prisma.config.ts sets `datasource.url` to `env("DATABASE_URL_UNPOOLED")` (the CLI migrates on it), and the runtime client gets the pooled DATABASE_URL through the driver adapter (@prisma/adapter-neon); schema.prisma no longer takes `url` or `directUrl`. Prisma 6 and earlier: schema.prisma reads `url = env("DATABASE_URL")` and `directUrl = env("DATABASE_URL_UNPOOLED")`. neonctl reads NEON_API_KEY.',
      run: [
        'node scripts/secrets.mjs run --only DATABASE_URL_UNPOOLED -- npx drizzle-kit migrate',
        'node scripts/secrets.mjs run --only DATABASE_URL_UNPOOLED -- sh -c \'psql "$DATABASE_URL_UNPOOLED" -c "select 1"\'',
        'node scripts/secrets.mjs run --only NEON_API_KEY,NEON_PROJECT_ID -- sh -c \'npx neonctl branches create --project-id "$NEON_PROJECT_ID" --name preview/x --output json\'',
      ],
      runNote: 'A new branch\'s connection string comes back on stdout and the runner does not know it, so it is not masked: pipe it into a script that stores it with `node scripts/secrets.mjs set NAME` (stdin), never to the terminal.',
      test: 'Neon\'s test keys are branches: a dev branch (one per preview) is a copy-on-write clone with its own URL and password. Point .env.local at a dev branch, never production, and delete preview branches when the PR closes.',
      limits: 'API: 700 requests a minute, 40 a second burst per route. Postgres: the pooler takes thousands of clients; a direct connection is capped by the compute size, so serverless code must use the pooled URL.',
      do: ['Use the pooled URL in app code and the direct URL only for migrations and admin tasks.', 'Keep sslmode=require in both URLs.'],
      dont: ['Run a migration against production from a session without saying so first: branch, migrate the branch, check, then promote.', 'Paste a URL into drizzle.config.ts or schema.prisma; read it from env.'],
    },
  },

  // Sources: upstash.com docs redis/features/restapi; redis/overall/pricing; redis/sdks/ts/getstarted (Redis.fromEnv).
  upstash: {
    id: 'upstash', name: 'Upstash Redis', mono: 'UP', group: 'data', keywords: ['redis', 'cache', 'rate limit', 'queue', 'kv'],
    role: 'A serverless Redis for cache, rate limits and queues.',
    why: 'Redis over HTTPS, so it works from serverless and edge functions where a TCP connection would not. The app needs a REST URL and a token on the server; nothing goes to the browser.',
    inputs: [],
    token: {
      title: 'The database\'s REST token, copied from the database',
      create: { href: 'https://console.upstash.com/redis', label: 'Open Redis databases' },
      start: 'Upstash tokens are copied from the database, not created. Open your database, then the REST API section.',
      grant: [{ group: 'Database', item: 'Standard token', level: 'Read and write', why: 'the app reads and writes keys' }],
      optional: [{ group: 'Database', item: 'Read-only token', level: 'Read', why: 'for code that only reads; SCAN and KEYS are blocked too' }],
      resources: 'One database. Each database has its own URL and token.',
      expiry: 'REST tokens do not expire. Reset the password in the database\'s settings to rotate; that changes the token and the Redis URL.',
    },
    steps: [
      { id: 'up.new', text: 'Create a Redis database. Pick the region next to where your app runs.', link: { href: 'https://console.upstash.com/redis', label: 'Redis databases' } },
      { id: 'up.rest', text: 'Open the database. In the REST API section, copy the URL and the token.', link: { href: 'https://console.upstash.com/redis', label: 'Open the database' }, values: ['restUrl', 'restToken'] },
      { id: 'up.tcp', text: 'Only if your code uses ioredis or node-redis: copy the TLS Redis URL (rediss://...) too.', values: ['redisUrl'] },
      { id: 'up.check', text: 'Press Check it. It sends one PING.', auto: 'upstash.pong' },
    ],
    values: [
      { key: 'restUrl', label: 'REST URL', env: { server: 'UPSTASH_REDIS_REST_URL' }, secret: false, shape: 'upstashRestUrl', required: true },
      { key: 'restToken', label: 'REST token', env: { server: 'UPSTASH_REDIS_REST_TOKEN' }, secret: true, shape: 'upstashToken', required: true },
      { key: 'readToken', label: 'Read-only REST token', env: { server: 'UPSTASH_REDIS_REST_READONLY_TOKEN' }, secret: true, shape: 'upstashToken', required: false },
      { key: 'redisUrl', label: 'Redis URL (TLS)', env: { server: 'REDIS_URL' }, secret: true, shape: 'redisUrl', required: false },
    ],
    check: { id: 'upstash', uses: ['restUrl', 'restToken'], label: 'Check it', note: 'Sends one PING to your database with this token, once, from your machine. It reads and writes no data.' },
    actions: [],
    gotchas: [
      'The REST URL and token belong together; a token from one database fails on another\'s URL.',
      'Never give the Standard token a NEXT_PUBLIC_ or VITE_ name.',
      'Billing counts commands. A PING per request, or polling in a loop, uses up the free monthly allowance fast.',
      'Resetting the password rotates the REST token and the Redis URL at once. Update both everywhere.',
    ],
    guide: {
      reads: '`Redis.fromEnv()` from @upstash/redis reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (and falls back to the old KV_REST_API_ names); @upstash/ratelimit takes that Redis instance. REDIS_URL is only for TCP clients (ioredis, node-redis, BullMQ). The read-only token is a nexus name: code passes it to `new Redis({ url, token })` itself.',
      run: [
        'node scripts/secrets.mjs run --only UPSTASH_REDIS_REST_URL,UPSTASH_REDIS_REST_TOKEN -- npm run dev',
        'node scripts/secrets.mjs run --only UPSTASH_REDIS_REST_URL,UPSTASH_REDIS_REST_TOKEN -- node scripts/flush-cache.mjs',
      ],
      test: 'No test keys. Use a separate free database for dev and preview; never point local dev at the production database.',
      limits: 'The free plan counts commands per month (pipelined commands each count) and caps request size and data. Set a TTL on cache keys so the database does not grow without bound.',
      do: ['Read both values through `Redis.fromEnv()`.', 'Pipeline bulk writes.'],
      dont: ['Run KEYS * or FLUSHALL against a shared database from a session; use SCAN with a prefix and ask before anything destructive.', 'Pass REDIS_URL to redis-cli -u: the password lands in argv.'],
    },
  },

  // Sources: docs.netlify.com api-guides/get-started-with-api; cli-guides/get-started-with-cli (NETLIFY_AUTH_TOKEN,
  // NETLIFY_SITE_ID); answers.netlify.com token format change (nfp_ personal tokens).
  netlify: {
    id: 'netlify', name: 'Netlify', mono: 'NF', group: 'hosting', keywords: ['hosting', 'deploy', 'static', 'functions'],
    role: 'Builds and hosts the app.',
    why: 'Every push builds a deploy preview, and the production branch builds the live site. The CLI deploys with a token and the project\'s ID.',
    inputs: [{ key: 'domain', label: 'Your domain', shape: 'hostname', placeholder: 'example.com', shared: true }],
    token: {
      title: 'A personal access token, with an expiry',
      create: { href: 'https://app.netlify.com/user/applications#personal-access-tokens', label: 'Open personal access tokens' },
      start: 'Press "New access token", give it a name you will recognise, and pick an expiration date.',
      scope: 'Netlify tokens have no scopes: one reaches every team and project you can. Keep the expiry short, and make a separate token for CI.',
      grant: [{ group: 'Access', item: 'Your user', level: 'All teams', why: 'Netlify offers no narrower token; it reads the project and deploys it' }],
      optional: [{ group: 'Access', item: 'Allow access to my SAML-based team', level: 'On', why: 'only if your team signs in with SAML SSO' }],
      resources: 'Every project on every team you belong to. There is no per-project token.',
      expiry: 'Pick an expiration date, for example 30 days to set up. Resetting your Netlify password revokes every token.',
      once: 'Netlify shows the token once. Paste it here before you leave the page.',
    },
    steps: [
      { id: 'nf.new', text: 'Import your git repo as a project and let the first deploy run.', link: { href: 'https://app.netlify.com/start', label: 'Import a project' } },
      { id: 'nf.token', text: 'Create the token below and paste it.', values: ['token'] },
      { id: 'nf.id', text: 'Copy the Project ID from Project configuration, General, Project information.', link: { href: 'https://app.netlify.com/', label: 'Your projects' }, values: ['siteId'] },
      { id: 'nf.check', text: 'Press Check it. It confirms the token can see this project.', auto: 'netlify.siteFound' },
      { id: 'nf.domain', text: 'Add {domain} under Domain management, then point DNS where Netlify says.', link: { href: 'https://app.netlify.com/', label: 'Your projects' }, tick: true },
    ],
    values: [
      { key: 'token', label: 'Personal access token', env: { server: 'NETLIFY_AUTH_TOKEN' }, secret: true, shape: 'netlifyToken', required: true },
      { key: 'siteId', label: 'Project ID', env: { server: 'NETLIFY_SITE_ID' }, secret: false, shape: 'guid', required: true,
        where: { href: 'https://app.netlify.com/', label: 'Project configuration, General, Project information' } },
    ],
    check: { id: 'netlify', uses: ['token', 'siteId'], label: 'Check it', note: 'Reads the project with this token, once, from your machine. Nothing is stored but the answer.' },
    actions: [],
    gotchas: [
      'A Netlify token reaches every project on every team you belong to. Give it an expiry.',
      'Without --prod, netlify deploy makes a draft deploy, not production.',
      'Deploys are limited to 3 a minute and 100 a day; a retry loop hits that fast.',
      'Env changes apply to the next build. Trigger a new deploy after changing them.',
    ],
    guide: {
      reads: 'netlify-cli reads NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID in place of `netlify login` and `netlify link`. App code never reads the token.',
      run: [
        'node scripts/secrets.mjs run --only NETLIFY_AUTH_TOKEN,NETLIFY_SITE_ID -- npx netlify deploy --dir=dist',
        'node scripts/secrets.mjs run --only NETLIFY_AUTH_TOKEN,NETLIFY_SITE_ID -- npx netlify deploy --prod --dir=dist',
        'node scripts/secrets.mjs run --only NETLIFY_AUTH_TOKEN,NETLIFY_SITE_ID -- npx netlify status',
      ],
      runNote: 'Send the app\'s values with `node scripts/secrets.mjs push NAME --to netlify`: it calls the Netlify API with NETLIFY_AUTH_TOKEN from the vault and the value in the JSON body, marked secret for production, deploy previews and branch deploys.',
      test: 'No test token. The safe step is a draft deploy (no --prod), which gets its own URL; deploy previews come from branch pushes.',
      limits: '500 API requests a minute; deploys 3 a minute and 100 a day. Read X-RateLimit-Remaining.',
      do: ['Deploy without --prod first and check the draft URL before promoting.', 'Give every token an expiry and a name that says where it lives.'],
      dont: ['Run `netlify env:set NAME value` with a secret (argv) or `netlify env:list --plain` (prints values).', 'Retry a failed deploy in a loop; read the build log.'],
    },
  },

  // Sources: docs.fly.io security/tokens; flyctl/tokens-create-deploy; machines/api working-with-machines-api and
  // apps-resource; fly.io/auth.md (the whole "FlyV1 ..." line is the credential).
  fly: {
    id: 'fly', name: 'Fly.io', mono: 'FL', group: 'hosting', keywords: ['hosting', 'containers', 'machines', 'deploy', 'docker'],
    role: 'Runs the app as machines near your users.',
    why: 'A container app on servers in the regions you pick. flyctl deploys with one app-scoped token, and Fly keeps the app\'s runtime secrets.',
    inputs: [],
    token: {
      title: 'A deploy token, for this one app',
      create: { href: 'https://fly.io/dashboard', label: 'Open the dashboard' },
      start: 'Open the app, then Tokens, and create a deploy token. Or run: fly tokens create deploy -a your-app -x 720h -n "nexus setup"',
      grant: [{ group: 'Token', item: 'Deploy (app-scoped)', level: 'This app only', why: 'deploys, reads the app and sets its secrets, and nothing else in the org' }],
      optional: [{ group: 'Token', item: 'Read-only (org-scoped)', level: 'Read', why: 'fly tokens create readonly, for dashboards or audits that never change anything' }],
      resources: 'One app.',
      avoid: 'Not the token from fly auth login, and not an org token. Those reach every app you own.',
      expiry: 'Tokens last 20 years by default. Always pass --expiry, for example 720h (30 days) to set up; make a new one for CI.',
      once: 'Fly shows the token once. Copy the whole line, "FlyV1 fm2_..." with the prefix, and paste it here.',
    },
    steps: [
      { id: 'fl.launch', text: 'Create the app: run fly launch --no-deploy in the repo, or create it on the dashboard.', link: { href: 'https://fly.io/dashboard', label: 'Dashboard' } },
      { id: 'fl.app', text: 'Type the app\'s name, as fly.toml has it.', values: ['app'] },
      { id: 'fl.token', text: 'Create a deploy token for the app with an expiry, then paste the whole line.', link: { href: 'https://fly.io/dashboard', label: 'Dashboard' }, values: ['token'] },
      { id: 'fl.check', text: 'Press Check it. It confirms the token can see the app.', auto: 'fly.appFound' },
    ],
    values: [
      { key: 'token', label: 'Deploy token', env: { server: 'FLY_API_TOKEN' }, secret: true, shape: 'flyToken', required: true },
      { key: 'app', label: 'App name', env: { server: 'FLY_APP' }, secret: false, shape: 'flyAppName', required: true },
    ],
    check: { id: 'fly', uses: ['token', 'app'], label: 'Check it', note: 'Reads the app with this token, once, from your machine. Nothing is stored but the answer.' },
    actions: [],
    gotchas: [
      'The token is the whole line, "FlyV1 fm2_..." with the space. Dropping the prefix gives a 401.',
      'Without --expiry a Fly token lasts 20 years. Set one, and revoke one-off tokens (fly tokens revoke) when done.',
      'fly secrets set NAME=value puts the value in your shell history and the process list. Pipe NAME=value lines into fly secrets import instead.',
      'The Machines API limits each action to about one request a second (bursts of 3), per machine or per app. Scripts that poll need a pause.',
    ],
    guide: {
      reads: 'flyctl and Machines API scripts read FLY_API_TOKEN (sent as `Authorization: Bearer` with the whole FlyV1 line). FLY_APP is a nexus name: pass `-a "$FLY_APP"` in scripts. Inside a machine, Fly sets FLY_APP_NAME and FLY_REGION itself, and the app\'s secrets arrive as plain env vars.',
      run: [
        'node scripts/secrets.mjs run --only FLY_API_TOKEN -- fly deploy',
        'node scripts/secrets.mjs run --only FLY_API_TOKEN,FLY_APP -- sh -c \'fly status -a "$FLY_APP"\'',
        'node scripts/secrets.mjs run --only FLY_API_TOKEN,FLY_APP -- sh -c \'fly logs -a "$FLY_APP" --no-tail\'',
      ],
      runNote: 'Send the app\'s secrets with `node scripts/secrets.mjs push NAME --to fly` (add `--app <app>` outside the app\'s folder): it runs `fly secrets import --stage` with the NAME=value line on stdin, so the next deploy picks it up.',
      test: 'No test tokens. Use a separate staging app with its own deploy token; never reuse the production token there.',
      limits: 'Machines API limits are per action and per machine or app: most actions 1 request a second with bursts of 3; Get Machine 5 a second with bursts of 10; app deletions 100 a minute. Back off on 429.',
      do: ['Create a deploy token per app with an expiry, named after where it lives.', 'Stage secret changes (--stage) and deploy once.'],
      dont: ['Run `fly secrets set NAME=value` with a real value, or `fly ssh console -C env` (prints every value).', 'Use the fly auth login token or an org token for automation.'],
    },
  },
};
