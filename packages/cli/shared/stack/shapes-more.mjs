// The shapes of the values the 0.5.2 services ask for (AWS through Fly.io), in the same form as shapes.mjs's SHAPES
// and spread into it. Kept apart only so each file stays readable. A shape says what a value should look like, never
// what it is: no hint, note or reason here holds a piece of a value. Formats a service does not publish are kept
// loose and say so in a comment.

const HEX32 = /^[a-f0-9]{32}$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MORE_SHAPES = {
  // ---- AWS -------------------------------------------------------------------------------------------------------
  awsAccessKeyId: {
    re: /^AKIA[A-Z2-7]{16}$/,
    hint: 'An access key ID is 20 characters and starts AKIA.',
    legacy: { re: /^ASIA[A-Z2-7]{16}$/, note: 'This is a temporary key. It stops working within hours and needs a session token. An IAM user\'s AKIA key is the one to keep here.' },
    reject: [
      { re: /^(AIDA|AROA|AGPA|ANPA|AIPA)[A-Z2-7]{16,}$/, why: 'That is a user or role ID, not an access key ID.' },
      { re: /^[A-Za-z0-9/+]{40}$/, why: 'That looks like the secret access key. It goes in the field below.' },
    ],
  },
  awsSecretAccessKey: {
    re: /^[A-Za-z0-9/+]{40}$/,
    hint: 'A secret access key is 40 letters, digits, slashes and plus signs.',
    reject: [{ re: /^A(KIA|SIA)[A-Z2-7]{16}$/, why: 'That is the access key ID. It goes in the field above.' }],
  },
  awsRegion: {
    re: /^[a-z]{2,4}(-[a-z]+)+-\d{1,2}$/,
    hint: 'A region like us-east-1 or eu-west-2.',
    reject: [{ re: /^[a-z]{2,4}(-[a-z]+)+-\d{1,2}[a-z]$/, why: 'That is an availability zone. Drop the last letter.' }],
  },

  // ---- Google Cloud and Firebase ----------------------------------------------------------------------------------
  gcpServiceAccountKey: {
    // Stored minified (normalize parses and re-writes it before any check), so the regex runs on one line.
    compact: 'json',
    re: /^\{(?=.*"type":"service_account")(?=.*"private_key":"-----BEGIN PRIVATE KEY-----\\n[A-Za-z0-9+/=\\n]+-----END PRIVATE KEY-----\\n")(?=.*"client_email":"[a-z0-9-]+@[a-z0-9.-]+\.gserviceaccount\.com")(?=.*"project_id":"[a-z][a-z0-9-]{4,28}[a-z0-9]").*\}$/,
    hint: 'Paste the whole JSON key file: it starts with { and has "type": "service_account".',
    reject: [
      { re: /"type":"authorized_user"/, why: 'That is your own gcloud sign-in, not a service account key.' },
      { re: /"type":"external_account"/, why: 'That is a Workload Identity Federation config. It holds no secret and belongs in CI, not the vault.' },
      { re: /^-----BEGIN/, why: 'Paste the whole JSON file, not just the private key.' },
    ],
    warn: [{ re: /"client_email":"\d+-compute@developer\.gserviceaccount\.com"/, note: 'This is the default compute service account, which has Editor on the project. Make one just for this app.' }],
  },
  gcpProjectId: {
    re: /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/,
    hint: 'A project ID is 6 to 30 lower-case letters, digits and hyphens, like my-app-prod.',
    reject: [{ re: /^\d+$/, why: 'That is the project number. Use the project ID.' }],
  },
  firebaseApiKey: {
    re: /^AIza[0-9A-Za-z_-]{35}$/,
    hint: 'A Firebase web API key starts AIza and is 39 characters.',
  },
  firebaseAuthDomain: {
    re: /^[a-z][a-z0-9-]{4,28}[a-z0-9]\.(firebaseapp\.com|web\.app)$/,
    hint: 'The auth domain looks like <project>.firebaseapp.com.',
    other: { re: /^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,}$/, note: 'A custom auth domain works if it serves /__/auth/ for this project.' },
  },
  firebaseBucket: {
    re: /^[a-z0-9][a-z0-9._-]{1,220}\.(firebasestorage\.app|appspot\.com)$/,
    hint: 'The storage bucket looks like <project>.firebasestorage.app.',
    reject: [{ re: /^gs:\/\//, why: 'Leave off gs://; paste the bucket name only.' }],
  },
  firebaseSenderId: { re: /^\d{6,20}$/, hint: 'The sender ID is a number.' },
  firebaseAppId: {
    re: /^1:\d{6,20}:web:[a-f0-9]{8,}$/,
    hint: 'A web app ID looks like 1:<number>:web:<hex>.',
    reject: [{ re: /^1:\d+:(android|ios):/, why: 'That is a mobile app ID. Pick the web app under Your apps.' }],
  },
  gaMeasurementId: { re: /^G-[A-Z0-9]{6,12}$/, hint: 'A measurement ID starts G-.' },

  // ---- Azure -----------------------------------------------------------------------------------------------------
  guid: {
    re: GUID,
    hint: 'An ID like 00000000-0000-0000-0000-000000000000.',
  },
  azureClientSecret: {
    // Current Entra secrets carry "Q~" after a digit near the start. Observed, not documented: hence the legacy branch.
    re: /^[A-Za-z0-9_~.-]{3}\dQ~[A-Za-z0-9_~.-]{31,34}$/,
    hint: 'Paste the secret\'s Value (about 40 characters), not its Secret ID.',
    legacy: { re: /^[A-Za-z0-9_~.\-+/=[\]:@?*]{32,44}$/, note: 'An older secret format; it still works until it expires.' },
    reject: [{ re: GUID, why: 'That is the Secret ID. Copy the Value column next to it.' }],
  },
  azureResourceGroup: {
    re: /^[\p{L}\p{N}._()-]{0,89}[\p{L}\p{N}_()-]$/u,
    hint: 'A resource group name: up to 90 letters, digits, dots, underscores, hyphens and brackets, not ending in a dot.',
  },

  // ---- Discord ---------------------------------------------------------------------------------------------------
  discordBotToken: {
    re: /^[A-Za-z0-9_-]{23,30}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,45}$/,
    hint: 'A bot token is three parts joined by dots, about 70 characters, from the Bot page.',
    reject: [{ re: /^[a-f0-9]{64}$/, why: 'That is the public key. It goes in the Public key field.' }],
  },
  discordSnowflake: { re: /^[0-9]{17,20}$/, hint: 'A Discord ID is 17 to 20 digits.' },
  discordPublicKey: { re: /^[a-f0-9]{64}$/, hint: 'The public key is 64 characters of digits and the letters a to f.' },
  discordClientSecret: { re: /^[A-Za-z0-9_-]{32}$/, hint: 'The client secret is 32 letters, digits, - and _, from the OAuth2 page.' },

  // ---- Slack -----------------------------------------------------------------------------------------------------
  slackBotToken: {
    re: /^xoxb-[0-9]+-[0-9]+-[A-Za-z0-9]{20,}$/,
    hint: 'The bot token starts xoxb-.',
    reject: [
      { re: /^xoxp-/, why: 'That is a user token. Use the Bot User OAuth Token (xoxb-).' },
      { re: /^(xoxe\.)?xapp-/, why: 'That is an app-level token. It goes in the App-level token field.' },
      { re: /^xoxe/, why: 'That is a rotating token. Turn token rotation off; the vault keeps one fixed value.' },
    ],
  },
  slackAppToken: {
    re: /^xapp-[0-9]-[A-Z0-9]+-[0-9]+-[a-f0-9]{32,}$/,
    hint: 'The app-level token starts xapp-.',
    reject: [{ re: /^xox[bp]-/, why: 'That is a bot or user token. It goes in the Bot token field.' }],
  },
  slackSigningSecret: {
    re: HEX32,
    hint: 'The signing secret is 32 characters of digits and the letters a to f.',
    reject: [{ re: /^xox|^xapp-/, why: 'That is a token. The signing secret is on Basic Information, under App Credentials.' }],
  },
  slackClientSecret: { re: HEX32, hint: 'The client secret is 32 characters of digits and the letters a to f.' },
  slackClientId: { re: /^[0-9]+\.[0-9]+$/, hint: 'A Slack client ID is two numbers joined by a dot.' },
  slackTeamId: { re: /^[TE][A-Z0-9]{8,12}$/, hint: 'A workspace ID starts with T.' },
  slackWebhookUrl: {
    re: /^https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]{24}$/,
    hint: 'A webhook URL looks like https://hooks.slack.com/services/T.../B.../....',
  },

  // ---- Twilio ----------------------------------------------------------------------------------------------------
  twilioAccountSid: {
    re: /^AC[0-9a-f]{32}$/,
    hint: 'The Account SID is AC and 32 characters of digits and a to f.',
    reject: [{ re: /^SK/i, why: 'That is an API key SID. It goes in the API key SID field.' }],
  },
  twilioApiKeySid: {
    re: /^SK[0-9a-fA-F]{32}$/,
    hint: 'An API key SID is SK and 32 characters of digits and a to f.',
    reject: [{ re: /^AC/, why: 'That is the Account SID. It goes in the field above.' }],
  },
  twilioApiKeySecret: {
    re: /^[A-Za-z0-9]{32}$/,
    hint: 'The API key secret is 32 letters and digits, shown once when the key is made.',
    reject: [{ re: /^(AC|SK)[0-9a-fA-F]{32}$/, why: 'That is a SID, not the secret.' }],
  },
  twilioAuthToken: { re: HEX32, hint: 'The auth token is 32 characters of digits and the letters a to f.' },
  twilioMessagingServiceSid: { re: /^MG[0-9a-f]{32}$/, hint: 'A messaging service SID is MG and 32 characters of digits and a to f.' },
  e164Phone: {
    re: /^\+[1-9][0-9]{6,14}$/,
    hint: 'A phone number in full international form, like +14155550123.',
    reject: [{ re: /[\s()-]/, why: 'Leave out spaces, dashes and brackets: +14155550123.' }],
    tip: [{ re: /^\+1500555/, note: 'A Twilio test number: it only works with test credentials.' }],
  },

  // ---- Stripe, Clerk and webhook secrets ---------------------------------------------------------------------------
  stripePublishable: {
    re: /^pk_(test|live)_[A-Za-z0-9]{20,}$/,
    hint: 'The publishable key starts pk_test_ or pk_live_.',
    reject: [
      { re: /^(sk|rk)_(test|live)_/, why: 'That is a server key. It goes in the secret field, never in a public name.' },
      { re: /^sk_org_/, why: 'That is an organization key. Use this account\'s restricted key instead.' },
    ],
    tip: [{ re: /^pk_live_/, note: 'A live key. Use the sandbox key (pk_test_) while you build.' }],
  },
  stripeSecret: {
    re: /^rk_(test|live)_[A-Za-z0-9]{20,}$/,
    hint: 'A restricted key starts rk_test_ or rk_live_.',
    other: { re: /^sk_(test|live)_[A-Za-z0-9]{20,}$/, note: 'This is an unrestricted secret key. It works, but a restricted key (rk_) can only do what you allow.' },
    reject: [
      { re: /^pk_(test|live)_/, why: 'That is the publishable key. It goes in the field above.' },
      { re: /^whsec_/, why: 'That is a webhook signing secret. It goes in the webhook field.' },
    ],
    tip: [{ re: /^rk_live_/, note: 'A live key: real money. Build with the sandbox key (rk_test_) first.' }],
  },
  webhookSecret: {
    // Stripe, Clerk and Resend (Svix) all sign webhooks with a whsec_ secret.
    re: /^whsec_[A-Za-z0-9+/=_-]{20,}$/,
    hint: 'A webhook signing secret starts whsec_.',
    reject: [{ re: /^(sk|rk|pk)_(test|live)_/, why: 'That is an API key, not the webhook\'s signing secret.' }],
  },
  clerkPublishable: {
    re: /^pk_(test|live)_[A-Za-z0-9+/=]{20,}$/,
    hint: 'The Clerk publishable key starts pk_test_ or pk_live_.',
    reject: [{ re: /^sk_(test|live)_/, why: 'That is the secret key. It goes in the field below, never in a public name.' }],
  },
  clerkSecret: {
    re: /^sk_(test|live)_[A-Za-z0-9]{20,}$/,
    hint: 'The Clerk secret key starts sk_test_ or sk_live_.',
    reject: [{ re: /^pk_(test|live)_/, why: 'That is the publishable key. It goes in the field above.' }],
    tip: [{ re: /^sk_live_/, note: 'A production key. It only works once the production instance\'s domain is verified.' }],
  },

  // ---- Anthropic, OpenAI -------------------------------------------------------------------------------------------
  anthropicKey: {
    re: /^sk-ant-api\d{2}-[A-Za-z0-9_-]{32,}$/,
    hint: 'An Anthropic API key starts sk-ant-api03-.',
    reject: [
      { re: /^sk-ant-admin\d{2}-/, why: 'That is an Admin key. It manages the whole organization; the app needs a plain API key.' },
      { re: /^sk-ant-oat\d{2}-/, why: 'That is a sign-in token from a Claude login, not an API key. Create a key in the Console.' },
    ],
  },
  anthropicWorkspace: { re: /^wrkspc_[A-Za-z0-9]{16,40}$/, hint: 'A workspace ID starts wrkspc_.' },
  openaiKey: {
    // OpenAI publishes no key format; the prefixes are what the platform hands out today, so the shape stays loose.
    re: /^sk-(proj|svcacct)-[A-Za-z0-9_-]{20,}$/,
    hint: 'An OpenAI key starts sk-proj- (or sk-svcacct- for a service account).',
    legacy: { re: /^sk-(None-)?[A-Za-z0-9_-]{40,}$/, note: 'An older user key, not tied to a project. It works; a project key is easier to limit.' },
    reject: [{ re: /^sk-admin-/, why: 'That is an Admin key. It manages the organization; the app needs a project key.' }],
  },
  openaiProject: { re: /^proj_[A-Za-z0-9]{16,40}$/, hint: 'A project ID starts proj_.' },
  openaiOrg: { re: /^org-[A-Za-z0-9]{16,40}$/, hint: 'An organization ID starts org-.' },

  // ---- Resend ----------------------------------------------------------------------------------------------------
  resendKey: { re: /^re_[A-Za-z0-9_-]{16,}$/, hint: 'A Resend API key starts re_.' },
  emailFrom: {
    re: /^(?:[^<>\r\n"]{1,80}\s<[^\s@<>]+@[a-z0-9.-]+\.[a-z]{2,}>|[^\s@<>]+@[a-z0-9.-]+\.[a-z]{2,})$/i,
    hint: 'An address like hello@example.com, or Name <hello@example.com>.',
    warn: [{ re: /@resend\.dev>?$/i, note: 'onboarding@resend.dev only sends to your own address. Verify your domain to send to anyone.' }],
  },

  // ---- Sentry, PostHog -------------------------------------------------------------------------------------------
  sentryDsn: {
    re: /^https:\/\/[a-f0-9]{32}@o\d+\.ingest(\.[a-z]+)?\.sentry\.io\/\d+$/,
    hint: 'A DSN looks like https://<32 hex>@o123.ingest.sentry.io/456.',
    other: { re: /^https?:\/\/[a-f0-9]{32}@[^/\s]+\/\d+$/, note: 'A self-hosted DSN. It works, but Check it only knows sentry.io.' },
    reject: [{ re: /^sntry[su]_/, why: 'That is an auth token. It goes in the token field, never in a public name.' }],
  },
  sentryToken: {
    re: /^sntrys_[A-Za-z0-9+/=]+_[A-Za-z0-9+/]{43}$/,
    hint: 'An organization token starts sntrys_.',
    legacy: { re: /^(sntryu_)?[a-f0-9]{64}$/, note: 'A personal or older token. It works, but it acts as you; an org token is better for CI.' },
    reject: [{ re: /^https?:\/\//, why: 'That is the DSN. It goes in the DSN field.' }],
  },
  slug: { re: /^[a-z0-9][a-z0-9_-]{0,49}$/, hint: 'A slug is lower-case letters, digits, - and _, as it appears in the URL.' },
  posthogProjectKey: {
    re: /^phc_[A-Za-z0-9]{20,}$/,
    hint: 'The project API key starts phc_.',
    reject: [{ re: /^ph[xs]_/, why: 'That is a private key. It goes in the personal key field, never in a public name.' }],
  },
  posthogHost: {
    re: /^https:\/\/(us|eu)(\.i)?\.posthog\.com\/?$/,
    hint: 'The host is https://us.i.posthog.com or https://eu.i.posthog.com, or your proxy.',
    tip: [{ re: /^https:\/\/(us|eu)\.posthog\.com/, note: 'That is the app host. Events usually go to the .i. host (us.i.posthog.com); both work for the JS SDK.' }],
    other: { re: /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[\w/-]*)?$/, note: 'A proxy or self-hosted host works, but Check it only knows posthog.com.' },
  },
  posthogPersonalKey: {
    re: /^phx_[A-Za-z0-9]{20,}$/,
    hint: 'A personal API key starts phx_.',
    reject: [{ re: /^phc_/, why: 'That is the project key. It goes in the field above.' }],
  },
  digits: { re: /^\d{1,12}$/, hint: 'A number, like 12345.' },

  // ---- Neon, Upstash ---------------------------------------------------------------------------------------------
  neonPooledUrl: {
    re: /^postgres(ql)?:\/\/[^:\s]+:[^@\s]+@ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech(:5432)?\/[A-Za-z0-9_-]+(\?\S*)?$/,
    hint: 'A Neon connection string like postgresql://user:password@ep-...-pooler.<region>.aws.neon.tech/neondb?sslmode=require.',
    warn: [
      { re: /^[^@]+@ep-[a-z0-9-]+(?<!-pooler)\.[a-z0-9.-]+\.neon\.tech/, note: 'This is the direct URL (no -pooler). The app should use the pooled one; turn Connection pooling on in Connect.' },
      { re: /^(?!.*[?&]sslmode=(require|verify-full)).*$/, note: 'Neon needs TLS. Add ?sslmode=require.' },
    ],
  },
  neonDirectUrl: {
    re: /^postgres(ql)?:\/\/[^:\s]+:[^@\s]+@ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech(:5432)?\/[A-Za-z0-9_-]+(\?\S*)?$/,
    hint: 'A Neon connection string with Connection pooling off: the host has no -pooler.',
    warn: [
      { re: /@ep-[a-z0-9-]+-pooler\./, note: 'This is the pooled URL. Migrations need the direct one; turn Connection pooling off in Connect.' },
      { re: /^(?!.*[?&]sslmode=(require|verify-full)).*$/, note: 'Neon needs TLS. Add ?sslmode=require.' },
    ],
  },
  neonApiKey: {
    // Neon's docs show napi_ (CLI) and neon_*_key_ (API) prefixes; both are taken.
    re: /^(napi_|neon_(api|org|project)_key_)[A-Za-z0-9_]{16,}$/,
    hint: 'A Neon API key starts napi_.',
    legacy: { re: /^[A-Za-z0-9]{40,80}$/, note: 'An older key format; it still works.' },
    reject: [{ re: /^postgres/, why: 'That is a connection string. It goes in a database URL field.' }],
  },
  neonProjectId: { re: /^[a-z]+(-[a-z]+)*-\d{6,8}$/, hint: 'A project ID is words and digits, like cool-darkness-123456 (Settings, General).' },
  upstashRestUrl: {
    re: /^https:\/\/[a-z0-9-]+\.upstash\.io\/?$/,
    hint: 'The REST URL looks like https://<name>.upstash.io.',
    reject: [{ re: /^rediss?:\/\//, why: 'That is the Redis URL. It goes in the Redis URL field; this one starts https://.' }],
  },
  upstashToken: {
    // Upstash documents no prefix, so this stays loose.
    re: /^[A-Za-z0-9_-]{40,}={0,2}$/,
    hint: 'The REST token is a long string of letters and digits from the REST section.',
    reject: [{ re: /^https?:\/\//, why: 'That is the REST URL. It goes in the field above.' }],
  },
  redisUrl: {
    re: /^rediss:\/\/[^:\s]*:[^@\s]+@[a-z0-9.-]+:\d{2,5}\/?\d*$/,
    hint: 'A TLS Redis URL like rediss://default:password@host:6379.',
    reject: [{ re: /^redis:\/\//, why: 'redis:// is not encrypted. Upstash wants rediss://.' }],
  },

  // ---- Netlify, Fly.io -------------------------------------------------------------------------------------------
  netlifyToken: {
    re: /^nfp_[A-Za-z0-9]{30,}$/,
    hint: 'A Netlify personal access token starts nfp_.',
    legacy: { re: /^(?!nf[a-z]_)[A-Za-z0-9_-]{40,64}$/, note: 'An older token format; it still works.' },
    other: { re: /^nf[cou]_[A-Za-z0-9]{30,}$/, note: 'This is a CLI or OAuth token, not a personal access token. It works, but a personal one with an expiry is easier to rotate.' },
    reject: [{ re: /^nfb_/, why: 'That is a build token. It only lives inside a Netlify build.' }],
  },
  flyToken: {
    re: /^FlyV1 fm[12]_[A-Za-z0-9+/=_,-]{40,}$/,
    hint: 'A Fly.io token starts "FlyV1 fm2_". Paste the whole line, FlyV1 and the space included.',
    reject: [{ re: /^fm[12]_/, why: 'The "FlyV1 " prefix is missing. flyctl and the API want the whole line; add it back.' }],
    legacy: { re: /^fo1_[A-Za-z0-9_-]{20,}$/, note: 'This is a personal auth token from fly auth login. It reaches every app you own; a deploy token is safer.' },
  },
  flyAppName: { re: /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, hint: 'A Fly app name: lower-case letters, digits and dashes.' },
};
