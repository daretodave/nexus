// Registry entries for chat, messages, AI and observability: Discord, Slack, Twilio, Resend, Anthropic, OpenAI,
// Sentry, PostHog. Same shape as SERVICES in recipes.mjs (which spreads these in). Researched 2026-10-23 against each
// service's own docs; the sources sit above each entry.

export const TALK_SERVICES = {
  // Sources: docs.discord.com developers quick-start (Application ID, Public Key, Reset Token shown once); reference
  // (Authorization: Bot, api/v10, User-Agent DiscordBot); resources/application (GET /applications/@me); rate-limits.
  discord: {
    id: 'discord', name: 'Discord', mono: 'DC', group: 'chat', keywords: ['bot', 'chat', 'slash commands', 'community'],
    role: 'A bot in your Discord server.',
    why: 'The app talks to Discord as a bot user: it posts messages, answers slash commands and can listen on the gateway. It needs the bot token on the server, and the application ID and public key to register commands and check that an interaction came from Discord.',
    inputs: [],
    token: {
      title: 'The bot token, from the app\'s Bot page',
      create: { href: 'https://discord.com/developers/applications', label: 'Open your applications' },
      start: 'Open the app, go to Bot, press "Reset Token" and copy it. Then set what the bot may do on the Installation page.',
      // A bot token is the bot: least privilege lives in the install scopes and the bot role's permissions.
      grant: [
        { group: 'Install scopes', item: 'bot', level: 'Added', why: 'puts the bot user in the server' },
        { group: 'Install scopes', item: 'applications.commands', level: 'Added', why: 'lets the app register slash commands' },
        { group: 'Permissions', item: 'View Channels', level: 'Allowed', why: 'sees the channels it should post in' },
        { group: 'Permissions', item: 'Send Messages', level: 'Allowed', why: 'posts its replies and notices' },
      ],
      optional: [
        { group: 'Permissions', item: 'Embed Links', level: 'Allowed', why: 'only if it posts rich embeds' },
        { group: 'Privileged intents', item: 'Message Content', level: 'On', why: 'only if it must read ordinary messages (slash commands do not need it)' },
      ],
      avoid: 'Never Administrator. Leave the Server Members and Presence intents off unless the bot truly needs them.',
      resources: 'The servers you install it into. Turn "Public Bot" off on the Bot page while you build, so only you can add it.',
      expiry: 'A bot token does not expire. It stops working when you reset it.',
      once: 'Discord shows the token once. Paste it here before you leave the page; a lost token means a new reset.',
    },
    steps: [
      { id: 'dc.new', text: 'Create an application and give it a name.', link: { href: 'https://discord.com/developers/applications', label: 'New application' } },
      { id: 'dc.ids', text: 'On General Information, copy the Application ID and the Public Key.', link: { href: 'https://discord.com/developers/applications', label: 'Your applications' }, values: ['applicationId', 'publicKey'] },
      { id: 'dc.token', text: 'On Bot, turn "Public Bot" off, press "Reset Token" and paste the token below.', values: ['botToken'] },
      { id: 'dc.install', text: 'On Installation, pick Guild Install, add the bot and applications.commands scopes, then View Channels and Send Messages.', tick: true },
      { id: 'dc.add', text: 'Open the install link, add the bot to your test server, and paste the server\'s ID.', values: ['guildId'], note: 'Turn on Developer Mode in Discord (Settings, Advanced), then right-click the server for its ID.' },
      { id: 'dc.check', text: 'Press Check it. It confirms the token and that the public key matches.', auto: 'discord.botOk' },
    ],
    values: [
      { key: 'botToken', label: 'Bot token', env: { server: 'DISCORD_TOKEN' }, secret: true, shape: 'discordBotToken', required: true },
      { key: 'applicationId', label: 'Application ID', env: { server: 'DISCORD_APPLICATION_ID' }, secret: false, shape: 'discordSnowflake', required: true, fill: 'check',
        where: { href: 'https://discord.com/developers/applications', label: 'General Information, Application ID' } },
      { key: 'publicKey', label: 'Public key', env: { server: 'DISCORD_PUBLIC_KEY' }, secret: false, shape: 'discordPublicKey', required: true,
        where: { href: 'https://discord.com/developers/applications', label: 'General Information, Public Key' } },
      { key: 'guildId', label: 'Test server ID', env: { server: 'DISCORD_GUILD_ID' }, secret: false, shape: 'discordSnowflake', required: false },
      { key: 'clientSecret', label: 'OAuth2 client secret', env: { server: 'DISCORD_CLIENT_SECRET' }, secret: true, shape: 'discordClientSecret', required: false,
        where: { href: 'https://discord.com/developers/applications', label: 'OAuth2, Client Secret (only for "Sign in with Discord")' } },
    ],
    check: { id: 'discord', uses: ['botToken', 'publicKey'], label: 'Check it', note: 'Asks Discord who this bot is, once, from your machine. Nothing is stored but the answer.' },
    actions: [],
    gotchas: [
      'Discord resets a bot token it finds posted in public, a GitHub commit included. If the bot goes quiet, look for a reset email.',
      'An HTTP interactions endpoint must answer within 3 seconds and check each request\'s signature with the public key.',
      'Register slash commands to your test server while you build; switch to global commands when you ship.',
      'Reading message text needs the Message Content intent. Past 100 servers, privileged intents need Discord\'s review.',
    ],
    guide: {
      reads: 'discord.js: `client.login()` reads DISCORD_TOKEN when no token is passed. Other libraries, the interactions handler and command-registration scripts read DISCORD_ names by hand. The REST header is `Authorization: Bot <token>`, not Bearer. DISCORD_PUBLIC_KEY checks interaction signatures (Ed25519).',
      run: [
        'node scripts/secrets.mjs run --only DISCORD_TOKEN,DISCORD_APPLICATION_ID,DISCORD_GUILD_ID -- node scripts/register-commands.mjs',
        'node scripts/secrets.mjs run --only DISCORD_TOKEN -- npm run bot',
      ],
      test: 'No test keys. Make a second application ("MyBot Dev") with its own token, installed only in a private test server, and register commands there (DISCORD_GUILD_ID).',
      limits: '50 requests a second per bot plus per-route limits; read X-RateLimit headers and retry_after on a 429. 10,000 invalid requests (401, 403, 429) in 10 minutes gets the machine\'s IP blocked for a while.',
      do: ['Check every interaction\'s signature and answer within 3 seconds: defer, then follow up.', 'Ask only for the permissions and intents the bot uses.'],
      dont: ['Retry a 401 in a loop: stop and tell the owner the token needs a reset.', 'Log client options or REST headers, or put the token in a test fixture.'],
    },
  },

  // Sources: docs.slack.dev authentication/tokens (xoxb, xoxp, xapp; rotation opt-in); reference/methods/auth.test
  // (no scope; 200 with ok:false on failure); verifying-requests-from-slack; using-socket-mode; web-api/rate-limits.
  slack: {
    id: 'slack', name: 'Slack', mono: 'SL', group: 'chat', keywords: ['bot', 'chat', 'workspace', 'notifications', 'bolt'],
    role: 'An app and bot in your Slack workspace.',
    why: 'The app posts to channels and answers commands and events as its own bot user. It needs the bot token to call Slack and the signing secret to prove a request came from Slack. With no public URL it uses Socket Mode and an app-level token.',
    inputs: [],
    token: {
      title: 'The Bot User OAuth Token, after you install the app',
      create: { href: 'https://api.slack.com/apps?new_app=1', label: 'Create a Slack app' },
      start: 'Create the app "From scratch" in your workspace. Under OAuth & Permissions, add the bot scopes below, then press "Install to Workspace".',
      grant: [{ group: 'Bot token scopes', item: 'chat:write', level: 'Added', why: 'posts messages in channels the bot is in' }],
      optional: [
        { group: 'Bot token scopes', item: 'app_mentions:read', level: 'Added', why: 'only if it answers when someone mentions it' },
        { group: 'Bot token scopes', item: 'commands', level: 'Added', why: 'only if it has slash commands' },
        { group: 'Bot token scopes', item: 'chat:write.public', level: 'Added', why: 'only if it must post in channels it was never invited to' },
        { group: 'App-level tokens', item: 'connections:write', level: 'Added', why: 'only for Socket Mode (no public URL)' },
      ],
      avoid: 'No user token (xoxp-) and no user scopes. A bot token keeps working when the person who installed it leaves.',
      resources: 'The one workspace you install it into.',
      expiry: 'A bot token does not expire unless you turn on token rotation; leave rotation off for a single-workspace app.',
      once: 'The bot token stays on the OAuth & Permissions page. An app-level token is shown when you make it; copy it then.',
    },
    steps: [
      { id: 'sl.new', text: 'Create an app "From scratch" and pick your workspace.', link: { href: 'https://api.slack.com/apps?new_app=1', label: 'New app' } },
      { id: 'sl.secret', text: 'On Basic Information, show and copy the Signing Secret.', link: { href: 'https://api.slack.com/apps', label: 'Your apps' }, values: ['signingSecret'] },
      { id: 'sl.scopes', text: 'On OAuth & Permissions, add the chat:write bot scope (and any optional ones you need).', link: { href: 'https://api.slack.com/apps', label: 'Your apps' }, tick: true },
      { id: 'sl.install', text: 'Press "Install to Workspace", allow it, then copy the Bot User OAuth Token (xoxb-...).', values: ['botToken'] },
      { id: 'sl.check', text: 'Press Check it. It fills in the workspace for you.', auto: 'slack.botOk' },
      { id: 'sl.socket', text: 'No public URL yet? Turn on Socket Mode and make an app-level token with connections:write.', link: { href: 'https://api.slack.com/apps', label: 'Your apps' }, values: ['appToken'], note: 'Skip this when Slack can reach https://{domain}.' },
      { id: 'sl.invite', text: 'In Slack, invite the bot to each channel it posts in: /invite @your-app.', tick: true },
    ],
    values: [
      { key: 'botToken', label: 'Bot token', env: { server: 'SLACK_BOT_TOKEN' }, secret: true, shape: 'slackBotToken', required: true },
      { key: 'signingSecret', label: 'Signing secret', env: { server: 'SLACK_SIGNING_SECRET' }, secret: true, shape: 'slackSigningSecret', required: true,
        where: { href: 'https://api.slack.com/apps', label: 'Basic Information, App Credentials' } },
      { key: 'appToken', label: 'App-level token (Socket Mode)', env: { server: 'SLACK_APP_TOKEN' }, secret: true, shape: 'slackAppToken', required: false,
        where: { href: 'https://api.slack.com/apps', label: 'Basic Information, App-Level Tokens' } },
      { key: 'teamId', label: 'Workspace ID', env: { server: 'SLACK_TEAM_ID' }, secret: false, shape: 'slackTeamId', required: false, fill: 'check' },
      { key: 'webhookUrl', label: 'Incoming webhook URL', env: { server: 'SLACK_WEBHOOK_URL' }, secret: true, shape: 'slackWebhookUrl', required: false,
        where: { href: 'https://api.slack.com/apps', label: 'Incoming Webhooks (only for one-channel notices)' } },
    ],
    check: { id: 'slack', uses: ['botToken'], label: 'Check it', note: 'Asks Slack which workspace this token belongs to, once, from your machine. Nothing is stored but the answer.' },
    actions: [],
    gotchas: [
      'A bot posts only in channels it was invited to, unless it has chat:write.public.',
      'After adding a scope, reinstall the app; the new scope does nothing until you do.',
      'Slack retries an event it does not get a 200 for within 3 seconds. Answer first, then do the work.',
      'An app shared outside the Slack Marketplace has tight limits on reading history; an internal app keeps the normal ones.',
    ],
    guide: {
      reads: 'Bolt for Python\'s `App()` reads SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET when no arguments are passed. Bolt for JS takes `token`, `signingSecret` (and `appToken`, `socketMode: true`) from process.env. `new WebClient(process.env.SLACK_BOT_TOKEN)` for the Web API. The slack CLI signs in with its own `slack login` and does not read these names.',
      run: [
        'node scripts/secrets.mjs run --only SLACK_BOT_TOKEN,SLACK_SIGNING_SECRET -- npm run dev',
        'node scripts/secrets.mjs run --only SLACK_BOT_TOKEN,SLACK_APP_TOKEN -- python app.py',
      ],
      test: 'No test keys. Use a free dev workspace (or a developer sandbox) with its own install of the app. Socket Mode lets a local session receive events without a tunnel.',
      limits: 'Each method has a tier, counted per method, workspace and app; chat.postMessage allows about one message a second per channel. A 429 carries Retry-After. auth.test answers HTTP 200 even when it fails, so read "ok".',
      do: ['Check the signature on every HTTP request: raw body, reject anything older than 5 minutes, constant-time compare.', 'Tell the owner to reinstall the app after a scope change; that step happens in the browser.'],
      dont: ['Use a user token (xoxp-) or turn on token rotation for a single-workspace app.', 'Print the WebClient config or the full request when debugging.'],
    },
  },

  // Sources: twilio.com docs iam/api-keys (Standard keys cannot reach /Accounts or /Keys); keys-in-console;
  // usage/requests-to-twilio (Basic auth with the key SID and secret); twilio-cli profiles (env beats the profile);
  // incomingphonenumber-resource; webhooks-security (X-Twilio-Signature with the auth token); test-credentials.
  twilio: {
    id: 'twilio', name: 'Twilio', mono: 'TW', group: 'email', keywords: ['sms', 'text', 'phone', 'voice', 'otp'],
    role: 'Sends texts and makes calls.',
    why: 'The app sends SMS (sign-in codes, alerts) or places calls through Twilio. It needs the account SID and an API key and secret on the server, and the number or messaging service it sends from. The auth token is only for checking that a webhook came from Twilio.',
    inputs: [],
    token: {
      title: 'A Standard API key, not the auth token',
      create: { href: 'https://console.twilio.com/us1/account/keys-credentials/api-keys', label: 'Open API keys' },
      start: 'Pick your region, press "Create API key", give it a name and pick a key type.',
      scope: 'Key type: Standard. It reaches everything except the account itself and other keys. Restricted is narrower if you know exactly what the app calls.',
      grant: [{ group: 'Key type', item: 'Standard', level: 'Selected', why: 'sends messages and calls, reads your numbers; cannot manage the account or make keys' }],
      optional: [{ group: 'Key type', item: 'Restricted', level: 'Selected', why: 'narrower: only the Messaging or Voice permissions you send with, plus Phone Numbers read so Check it works' }],
      avoid: 'Not a Main key, and not the account auth token for the app\'s own calls: both can run the whole account.',
      resources: 'One region (US1 unless you chose another). A key works only in the region it was made in.',
      expiry: 'An API key does not expire. Delete it in the console to revoke it.',
      once: 'Twilio shows the secret once. Paste it here before you press "Got it!".',
    },
    steps: [
      { id: 'tw.sid', text: 'On the console home, copy the Account SID (AC...).', link: { href: 'https://console.twilio.com/', label: 'Console home' }, values: ['accountSid'] },
      { id: 'tw.key', text: 'Create a Standard API key and paste its SID (SK...) and secret.', link: { href: 'https://console.twilio.com/us1/account/keys-credentials/api-keys', label: 'API keys' }, values: ['apiKey', 'apiSecret'] },
      { id: 'tw.number', text: 'Buy or pick a number to send from (or a messaging service).', link: { href: 'https://console.twilio.com/us1/develop/phone-numbers/manage/incoming', label: 'Active numbers' }, values: ['phoneNumber'] },
      { id: 'tw.check', text: 'Press Check it. It lists the numbers this key can see.', auto: 'twilio.keyOk' },
      { id: 'tw.10dlc', text: 'Texting US numbers from a 10-digit number? Register the brand and campaign (A2P 10DLC) first.', link: { href: 'https://console.twilio.com/us1/develop/sms/regulatory-compliance/a2p-10dlc-overview', label: 'A2P 10DLC' }, tick: true, note: 'Unregistered US traffic is blocked. Approval can take days; start it early.' },
      { id: 'tw.hook', text: 'If Twilio calls the app back, set the number\'s webhook to https://{domain}/api/twilio and paste the auth token for signature checks.', values: ['authToken'], copy: ['https://{domain}/api/twilio'] },
    ],
    values: [
      { key: 'accountSid', label: 'Account SID', env: { server: 'TWILIO_ACCOUNT_SID' }, secret: false, shape: 'twilioAccountSid', required: true },
      { key: 'apiKey', label: 'API key SID', env: { server: 'TWILIO_API_KEY' }, secret: false, shape: 'twilioApiKeySid', required: true },
      { key: 'apiSecret', label: 'API key secret', env: { server: 'TWILIO_API_SECRET' }, secret: true, shape: 'twilioApiKeySecret', required: true },
      { key: 'phoneNumber', label: 'From number', env: { server: 'TWILIO_PHONE_NUMBER' }, secret: false, shape: 'e164Phone', required: false },
      { key: 'messagingServiceSid', label: 'Messaging service SID', env: { server: 'TWILIO_MESSAGING_SERVICE_SID' }, secret: false, shape: 'twilioMessagingServiceSid', required: false,
        where: { href: 'https://console.twilio.com/us1/develop/sms/services', label: 'Messaging, Services' } },
      { key: 'authToken', label: 'Auth token (webhook checks only)', env: { server: 'TWILIO_AUTH_TOKEN' }, secret: true, shape: 'twilioAuthToken', required: false,
        where: { href: 'https://console.twilio.com/', label: 'Console home, Account Info, Auth Token' } },
    ],
    check: { id: 'twilio', uses: ['accountSid', 'apiKey', 'apiSecret', 'phoneNumber'], label: 'Check it', note: 'Asks Twilio which numbers this key can see, once, from your machine. It sends nothing. Nothing is stored but the answer.' },
    actions: [],
    gotchas: [
      'A trial account only texts and calls numbers you have verified, and every message starts with a trial notice.',
      'Texting US numbers from a 10-digit number needs A2P 10DLC registration; unregistered messages are blocked.',
      'Webhook signatures are checked with the auth token, not the API key. Rotating the auth token breaks those checks until the app has the new one.',
      'Test credentials only work for sending, calling, buying a number and Lookup; use +15005550006 as the From number with them.',
    ],
    guide: {
      reads: 'The Twilio CLI reads TWILIO_ACCOUNT_SID, TWILIO_API_KEY and TWILIO_API_SECRET, and they beat the active profile. The helper libraries do not pick up the key by themselves: Node `twilio(process.env.TWILIO_API_KEY, process.env.TWILIO_API_SECRET, { accountSid: process.env.TWILIO_ACCOUNT_SID })`. Webhooks: `twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, signature, url, params)`.',
      run: [
        'node scripts/secrets.mjs run --only TWILIO_ACCOUNT_SID,TWILIO_API_KEY,TWILIO_API_SECRET -- twilio api:core:incoming-phone-numbers:list',
        'node scripts/secrets.mjs run --only TWILIO_ACCOUNT_SID,TWILIO_API_KEY,TWILIO_API_SECRET,TWILIO_PHONE_NUMBER -- node scripts/send-test-sms.mjs',
      ],
      test: 'Test credentials are a separate test Account SID and auth token: free, they reach no real phone, and +15005550006 is a valid From number. Keep them under separate names (TWILIO_TEST_ACCOUNT_SID, TWILIO_TEST_AUTH_TOKEN) so a test run can never send real texts.',
      limits: 'Every live message and call costs money. Too many parallel requests get a 429 (Twilio error 20429). A single US 10-digit number sends slowly; a messaging service spreads the load.',
      do: ['Use a Standard or Restricted API key for the app; keep the auth token for webhook checks.', 'Check X-Twilio-Signature on every webhook with the exact public URL Twilio called.'],
      dont: ['Send live texts from a test, a seed script or a loop without asking the owner first.', 'Put a real customer\'s phone number in a fixture, log or commit.'],
    },
  },

  // Sources: resend.com docs api-keys/create-api-key (full_access or sending_access, domain restriction); domains/
  // list-domains; errors (401 restricted_api_key on a sending-only key); rate-limit; send-test-emails; resend-node.
  resend: {
    id: 'resend', name: 'Resend', mono: 'RS', group: 'email', keywords: ['email', 'mail', 'smtp', 'transactional'],
    role: 'Sends your app\'s email.',
    why: 'Sign-in links, receipts and notices go out through Resend from an address on your domain. The app needs a send-only key on the server, and your domain needs a few DNS records so mail lands in inboxes.',
    inputs: [{ key: 'domain', label: 'Your domain', shape: 'hostname', placeholder: 'example.com', shared: true }],
    token: {
      title: 'A sending-only API key, for your domain',
      create: { href: 'https://resend.com/api-keys', label: 'Open API keys' },
      start: 'Press "Create API key", name it after the app, set Permission to Sending access, and pick {domain} under Domain.',
      grant: [
        { group: 'Permission', item: 'Sending access', level: 'Sending access', why: 'sends email and nothing else: cannot read or delete domains, contacts or other keys' },
        { group: 'Domain', item: '{domain}', level: 'This domain only', why: 'the key can only send from addresses on your domain' },
      ],
      optional: [{ group: 'Permission', item: 'Full access', level: 'Full access', why: 'only for a separate setup key that manages domains; never the app\'s key' }],
      resources: 'Domain: {domain} (verify the domain first so it shows in the list)',
      avoid: 'Not Full access for the app. A leaked full-access key can delete your domains and read your contacts.',
      once: 'Resend shows the key once. Paste it here before you close the dialog.',
    },
    steps: [
      { id: 'rs.domain', text: 'Add {domain} as a sending domain. Pick the region nearest your users.', link: { href: 'https://resend.com/domains', label: 'Domains' }, tick: true },
      { id: 'rs.dns', text: 'Add the records Resend shows (MX and TXT for SPF on the send subdomain, TXT for DKIM) where your DNS lives, then press Verify.', link: { href: 'https://resend.com/domains', label: 'Domains' }, tick: true,
        note: 'If Cloudflare holds DNS, keep these records DNS only (grey cloud). Verification can take minutes to hours.' },
      { id: 'rs.key', text: 'Create the sending-only key below and paste it.', values: ['apiKey'] },
      { id: 'rs.from', text: 'Pick the address mail comes from, on {domain}, like App <hello@{domain}>.', values: ['from'] },
      { id: 'rs.hook', text: 'Optional: if the app listens for delivery events, add a webhook and copy its signing secret.', link: { href: 'https://resend.com/webhooks', label: 'Webhooks' }, values: ['webhookSecret'] },
    ],
    values: [
      { key: 'apiKey', label: 'API key', env: { server: 'RESEND_API_KEY' }, secret: true, shape: 'resendKey', required: true },
      { key: 'from', label: 'From address', env: { server: 'RESEND_FROM' }, secret: false, shape: 'emailFrom', required: true },
      { key: 'webhookSecret', label: 'Webhook signing secret', env: { server: 'RESEND_WEBHOOK_SECRET' }, secret: true, shape: 'webhookSecret', required: false },
    ],
    check: { id: 'resend', uses: ['apiKey', 'domain'], label: 'Check it', note: 'Asks Resend about your domains with this key, once, from your machine. It sends no email. Nothing is stored but the answer.' },
    actions: [],
    gotchas: [
      'The key is server only. Email is sent from your server or an edge function, never from the browser.',
      'Until the domain shows Verified, you can only send from onboarding@resend.dev, and only to your own address.',
      'Your DNS must not already have a second SPF record on the same name. Merge them into one; two SPF records break both.',
      'Rate limit: 10 requests a second for the whole team, shared by every key.',
    ],
    guide: {
      reads: '`new Resend()` from the Node SDK reads RESEND_API_KEY and throws if it is missing. RESEND_FROM is this stack\'s name for the sender; code reads it itself (`from: process.env.RESEND_FROM`). RESEND_WEBHOOK_SECRET goes to the webhook route\'s signature check (a whsec_ secret).',
      run: [
        'node scripts/secrets.mjs run --only RESEND_API_KEY,RESEND_FROM -- node scripts/send-test-email.mjs',
      ],
      test: 'No test-mode key: every key sends real mail. Send to Resend\'s test inboxes (delivered@resend.dev, bounced@resend.dev, complained@resend.dev); they never reach a person but count against your quota.',
      limits: '10 requests a second per team, shared by every key; 429 rate_limit_exceeded with retry-after. The free plan has a daily quota that resets at midnight UTC. Use the batch endpoint for bulk mail and queue sends.',
      do: ['Give the app a Sending access key tied to its domain.', 'Verify the webhook signature before trusting an event.'],
      dont: ['Run `resend login` in a session: it writes the key to ~/.config, outside the vault.', 'Send to real addresses from fixture data, or add a second SPF record.'],
    },
  },

  // Sources: platform.claude.com docs api/overview (anthropic-version, response headers); manage-claude/authentication
  // (key types, workspace scope, expiry); api/models-list (the check); api/rate-limits.
  anthropic: {
    id: 'anthropic', name: 'Anthropic', mono: 'AN', group: 'ai', keywords: ['claude', 'llm', 'ai', 'api'],
    role: 'Claude, from your server.',
    why: 'The app calls Claude through the Claude API. It needs one API key on the server, never in the browser. A key tied to one workspace keeps this app\'s spend and limits apart from everything else.',
    inputs: [],
    token: {
      title: 'An API key, tied to one workspace',
      create: { href: 'https://platform.claude.com/settings/keys', label: 'Open API keys' },
      start: 'Make a workspace for this app first (Workspaces, Create). Then press "Create key", name it after the app, and pick that workspace.',
      grant: [
        { group: 'Linked account', item: 'You, or a service account', level: 'Service account for anything deployed', why: 'a personal key stops working when you leave the organization; a service account key belongs to the app' },
        { group: 'Workspace', item: 'This app\'s workspace', level: 'One workspace', why: 'calls need no workspace header, and the key cannot reach other workspaces' },
      ],
      optional: [{ group: 'Workspace limits', item: 'Spend limit and rate limits', level: 'Set on the workspace', why: 'caps what a leaked or runaway key can spend' }],
      resources: 'Workspace: this app\'s own, not Default (the Default Workspace cannot take a spend limit).',
      avoid: 'Not an Admin key (sk-ant-admin...).',
      expiry: 'Pick 30 days to set up, or Never for a key you rotate yourself. Expiry is fixed when the key is made.',
      once: 'The Console shows the key once. Paste it here before you close the dialog.',
    },
    steps: [
      { id: 'an.ws', text: 'Create a workspace for this app and give it a spend limit.', link: { href: 'https://platform.claude.com/settings/workspaces', label: 'Workspaces' }, tick: true },
      { id: 'an.billing', text: 'Make sure the organization has credit or a payment method. A new organization starts on low limits.', link: { href: 'https://platform.claude.com/settings/billing', label: 'Billing' }, tick: true },
      { id: 'an.key', text: 'Create the API key below, tied to that workspace, and paste it.', values: ['apiKey'] },
      { id: 'an.check', text: 'Press Check it. It lists the models the key can use and fills in the workspace.', auto: 'anthropic.keyOk' },
    ],
    values: [
      { key: 'apiKey', label: 'API key', env: { server: 'ANTHROPIC_API_KEY' }, secret: true, shape: 'anthropicKey', required: true },
      { key: 'workspaceId', label: 'Workspace ID', env: { server: 'ANTHROPIC_WORKSPACE_ID' }, secret: false, shape: 'anthropicWorkspace', required: false, fill: 'check',
        where: { href: 'https://platform.claude.com/settings/workspaces', label: 'Workspaces, ID column' } },
    ],
    check: { id: 'anthropic', uses: ['apiKey', 'workspaceId'], label: 'Check it', note: 'Asks Anthropic which models this key can use, once, from your machine. It costs nothing. Nothing is stored but the answer.' },
    actions: [],
    gotchas: [
      'The key is server only. It never gets NEXT_PUBLIC_ or VITE_; the SDK also refuses to run in a browser unless told to.',
      'A key not tied to a workspace needs the anthropic-workspace-id header on every call. Tie the key to a workspace, or save ANTHROPIC_WORKSPACE_ID and send it.',
      'An expired key answers 401 and cannot be turned back on. Make a new one and paste it again.',
      'There is no test mode. Every call is billed; use a workspace with a low spend limit while you build.',
    ],
    guide: {
      reads: 'The official SDKs (TypeScript @anthropic-ai/sdk, Python anthropic, Go, Java and others) read ANTHROPIC_API_KEY when you write `new Anthropic()` with no key. The SDKs do not read ANTHROPIC_WORKSPACE_ID: with a key not tied to a workspace, pass `defaultHeaders: { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID }`.',
      run: [
        'node scripts/secrets.mjs run --only ANTHROPIC_API_KEY -- node scripts/try-claude.mjs',
      ],
      test: 'No test mode or test key: every call costs money. Use a separate workspace with a low spend limit. In tests prefer recorded responses or a mock client; GET /v1/models and count_tokens are cheap ways to prove the key works.',
      limits: 'Per organization by tier (requests, input and output tokens per minute). A 429 with retry-after means wait that long; the SDKs retry on their own. A 429 for the monthly spend cap has no retry-after: stop retrying.',
      do: ['Read the key on the server only, and keep model ids in one config constant.', 'Log the request-id response header when a call fails, never the request headers.'],
      dont: ['Give the key a public prefix or call the API from browser code.', 'Put an Admin key, or a Claude sign-in token, in the app.'],
    },
  },

  // Sources: developers.openai.com api reference overview (auth and project headers); models list (the check); rbac
  // guide (List models: Read, Model capabilities: Request); production best practices; openai-node client env names.
  openai: {
    id: 'openai', name: 'OpenAI', mono: 'OA', group: 'ai', keywords: ['gpt', 'llm', 'ai', 'api', 'embeddings'],
    role: 'GPT models, from your server.',
    why: 'The app calls OpenAI with a project key on the server. A project of its own gives the app its own budget and limits, and a restricted key can only do what the app does.',
    inputs: [],
    token: {
      title: 'A restricted project key, for this app\'s project',
      create: { href: 'https://platform.openai.com/api-keys', label: 'Open API keys' },
      start: 'Make a project for this app first. Then press "Create new secret key", pick that project, choose a service account for anything deployed, and set Permissions to Restricted.',
      grant: [
        { group: 'Permissions', item: 'List models', level: 'Read', why: 'lets Check it confirm the key' },
        { group: 'Permissions', item: 'Model capabilities', level: 'Request', why: 'chat, embeddings, images and audio; without it every model call fails with a missing scope' },
      ],
      optional: [
        { group: 'Permissions', item: 'Responses API', level: 'Write', why: 'only if the app uses the Responses API' },
        { group: 'Permissions', item: 'Files, Vector Stores, Batch', level: 'Read or Write', why: 'only the ones the app uses' },
      ],
      resources: 'Project: this app\'s own, not the Default project.',
      avoid: 'Not an Admin key (sk-admin-), and not the "All" permission when the app only calls models.',
      expiry: 'Set an expiry on the key if your organization allows it, and rotate it.',
      once: 'OpenAI shows the key once. Paste it here before you close the dialog.',
    },
    steps: [
      { id: 'oa.project', text: 'Create a project for this app. Keep staging and production in separate projects.', link: { href: 'https://platform.openai.com/settings/organization/projects', label: 'Projects' }, tick: true },
      { id: 'oa.limits', text: 'In the project\'s Limits, set a monthly budget and the models it may use.', link: { href: 'https://platform.openai.com/settings/organization/limits', label: 'Limits' }, tick: true },
      { id: 'oa.key', text: 'Create the restricted key below and paste it.', values: ['apiKey'] },
      { id: 'oa.check', text: 'Press Check it.', auto: 'openai.keyOk' },
    ],
    values: [
      { key: 'apiKey', label: 'API key', env: { server: 'OPENAI_API_KEY' }, secret: true, shape: 'openaiKey', required: true },
      { key: 'projectId', label: 'Project ID', env: { server: 'OPENAI_PROJECT_ID' }, secret: false, shape: 'openaiProject', required: false,
        where: { href: 'https://platform.openai.com/settings/organization/projects', label: 'Projects, the project, General' } },
      { key: 'orgId', label: 'Organization ID', env: { server: 'OPENAI_ORG_ID' }, secret: false, shape: 'openaiOrg', required: false,
        where: { href: 'https://platform.openai.com/settings/organization/general', label: 'Settings, Organization, General' } },
    ],
    check: { id: 'openai', uses: ['apiKey', 'projectId', 'orgId'], label: 'Check it', note: 'Asks OpenAI which models this key can see, once, from your machine. It costs nothing. Nothing is stored but the answer.' },
    actions: [],
    gotchas: [
      'The key is server only. It never gets NEXT_PUBLIC_ or VITE_; the SDK refuses to run in a browser unless told to.',
      'A restricted key with Model capabilities left at None fails every call with a missing model.request scope.',
      'A project key already belongs to its project. The project and organization IDs are only for older user keys.',
      'There is no test mode. Every call is billed; give the build project a small budget.',
    ],
    guide: {
      reads: '`new OpenAI()` (Node and Python SDKs) reads OPENAI_API_KEY, and OPENAI_PROJECT_ID and OPENAI_ORG_ID when set. A sk-proj- or sk-svcacct- key already carries its project. OPENAI_BASE_URL only for a proxy or gateway.',
      run: [
        'node scripts/secrets.mjs run --only OPENAI_API_KEY -- node scripts/try-openai.mjs',
      ],
      test: 'No test mode. Use a separate staging project with a small budget and a short list of allowed models; production gets its own project and key. Mock the client or record responses in unit tests.',
      limits: 'Per organization and project, by tier, in requests and tokens per minute (x-ratelimit-remaining-* headers). The SDK retries 429s with backoff. Log x-request-id when a call fails.',
      do: ['Use a restricted key: List models Read, Model capabilities Request, plus only the endpoints the app uses.', 'Keep staging and production in separate projects with separate keys and budgets.'],
      dont: ['Use `dangerouslyAllowBrowser: true` or give the key a public prefix.', 'Leave OPENAI_LOG=debug on: debug logs can carry request details the runner does not know to mask.'],
    },
  },

  // Sources: docs.sentry.io account/auth-tokens (org vs personal tokens); security token-formats (sntrys_, the DSN is
  // not a secret); api/permissions; cli/configuration (SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT, SENTRY_URL).
  sentry: {
    id: 'sentry', name: 'Sentry', mono: 'SN', group: 'observe', keywords: ['errors', 'monitoring', 'tracing', 'source maps'],
    role: 'Catches errors and slow pages.',
    why: 'The SDK sends crashes from the browser and the server to one project. The browser needs the DSN, which is public. The build needs a secret token to upload source maps, so stack traces show your code.',
    inputs: [],
    token: {
      title: 'An organization token, for CI and source maps',
      create: { href: 'https://sentry.io/orgredirect/organizations/:orgslug/settings/auth-tokens/', label: 'Open organization tokens' },
      start: 'Press "Create New Token" and name it after this app. There are no permissions to pick: Sentry fixes them for CI.',
      grant: [{ group: 'Organization token', item: 'CI (org:ci)', level: 'Fixed', why: 'uploads source maps and creates releases, nothing more' }],
      optional: [{ group: 'Personal token', item: 'Project', level: 'Read and Write', why: 'only if you cannot make an org token; it stops working when you leave the org' }],
      resources: 'Every project in the organization (org tokens cannot be narrowed to one project).',
      avoid: 'Not a personal token with Admin scopes. It acts as you, across every org you belong to.',
      expiry: 'Org tokens do not expire. Revoke it when you no longer need it.',
      once: 'Sentry shows the token once. Paste it here before you close the page.',
    },
    steps: [
      { id: 'sn.new', text: 'Create a project for this app and pick its platform. The org and project slugs are in its URL.', link: { href: 'https://sentry.io/orgredirect/organizations/:orgslug/projects/new/', label: 'New project' }, values: ['project'] },
      { id: 'sn.dsn', text: 'Open the project\'s Client Keys (DSN) and copy the DSN.', link: { href: 'https://sentry.io/orgredirect/organizations/:orgslug/settings/projects/', label: 'Projects, then Client Keys' }, values: ['dsn'] },
      { id: 'sn.token', text: 'Create the organization token below and paste it.', values: ['authToken'] },
      { id: 'sn.check', text: 'Press Check it. It confirms the token and fills in the org slug.', values: ['org'] },
    ],
    values: [
      { key: 'dsn', label: 'DSN', env: { public: 'SENTRY_DSN', server: 'SENTRY_DSN' }, secret: false, shape: 'sentryDsn', required: true },
      { key: 'authToken', label: 'Organization token', env: { server: 'SENTRY_AUTH_TOKEN' }, secret: true, shape: 'sentryToken', required: true },
      { key: 'org', label: 'Organization slug', env: { server: 'SENTRY_ORG' }, secret: false, shape: 'slug', required: true, fill: 'check' },
      { key: 'project', label: 'Project slug', env: { server: 'SENTRY_PROJECT' }, secret: false, shape: 'slug', required: true },
    ],
    check: { id: 'sentry', uses: ['authToken', 'org'], label: 'Check it', note: 'Calls Sentry with this token, once, from your machine. Nothing is stored but the answer.' },
    actions: [],
    gotchas: [
      'The DSN is safe in the browser; the auth token is not. It never gets NEXT_PUBLIC_ or VITE_.',
      'Without the token at build time, source maps do not upload and stack traces show minified code. Add SENTRY_AUTH_TOKEN wherever the build runs.',
      'EU orgs live on de.sentry.io. Set SENTRY_URL=https://de.sentry.io/ for sentry-cli if the token does not carry its region.',
      'Sentry has no test keys. Use a separate project, or set environment to "development" and filter it out.',
    ],
    guide: {
      reads: '@sentry/node and the server side of @sentry/nextjs read SENTRY_DSN when `dsn` is not passed; browser SDKs need `Sentry.init({ dsn })` with the prefixed name. sentry-cli, @sentry/vite-plugin, @sentry/webpack-plugin and `withSentryConfig` read SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT at build time only.',
      run: [
        'node scripts/secrets.mjs run --only SENTRY_AUTH_TOKEN,SENTRY_ORG,SENTRY_PROJECT -- npx @sentry/cli info',
        'node scripts/secrets.mjs run --only SENTRY_AUTH_TOKEN,SENTRY_ORG,SENTRY_PROJECT -- npm run build',
      ],
      test: 'No test keys. Leave the DSN unset locally (the SDK then sends nothing) or point at a dev project; set environment to "development" and keep tracesSampleRate low outside production.',
      limits: 'API calls are rate limited per token (X-Sentry-Rate-Limit-Remaining). Ingest is held to the plan\'s quota and a crash loop can burn it in an hour: set spike protection on the project.',
      do: ['Keep the DSN public and the auth token build-only (CI and the host\'s build env).', 'Use an organization token for CI.'],
      dont: ['Commit .sentryclirc with a token line or .env.sentry-build-plugin (the wizard writes one): move the value into the vault and gitignore the file.', 'Pass --auth-token on a command line, or turn on sendDefaultPii without a privacy notice that covers it.'],
    },
  },

  // Sources: posthog.com docs api (private vs public endpoints, hosts per region, rate limits); api/personal-api-keys
  // (Bearer header, shown once, scopes, ten keys a user).
  posthog: {
    id: 'posthog', name: 'PostHog', mono: 'PH', group: 'observe', keywords: ['analytics', 'feature flags', 'session replay', 'events'],
    role: 'Product analytics, feature flags and session replay.',
    why: 'The browser sends events with the project key, which is public by design. A personal API key on the server reads data and evaluates flags locally; you only need it if the server does those things.',
    inputs: [],
    token: {
      optionalToken: true,
      title: 'Optional: a personal API key, for this project, read only',
      create: { href: 'https://us.posthog.com/settings/user-api-keys', label: 'Open personal API keys' },
      start: 'Press "Create personal API key". Under access, pick this one project, then tick only the scopes below. On EU Cloud use eu.posthog.com.',
      grant: [
        { group: 'Scopes', item: 'User', level: 'Read', why: 'lets Check it confirm the key and find the project' },
        { group: 'Scopes', item: 'Project', level: 'Read', why: 'reads the project\'s ID and name' },
      ],
      optional: [
        { group: 'Scopes', item: 'Feature flag', level: 'Read', why: 'only if the server evaluates flags locally' },
        { group: 'Scopes', item: 'Query', level: 'Read', why: 'only if the server runs HogQL queries' },
      ],
      resources: 'Access: this project only.',
      avoid: 'Not "All access". That key can delete projects and read every org you belong to.',
      once: 'PostHog shows the key once. Paste it here before you refresh the page.',
    },
    steps: [
      { id: 'ph.key', text: 'In Project settings, copy the project API key (phc_...) and the host it names. Note whether you are on US or EU Cloud.', link: { href: 'https://us.posthog.com/settings/project', label: 'Project settings' }, values: ['projectKey', 'host'] },
      { id: 'ph.pat', text: 'Only if the server reads data or evaluates flags: create the personal API key below, paste it, and press Check it. It fills in the project ID.', values: ['personalKey'] },
    ],
    values: [
      { key: 'projectKey', label: 'Project API key', env: { public: 'POSTHOG_KEY', server: 'POSTHOG_KEY' }, secret: false, shape: 'posthogProjectKey', required: true },
      { key: 'host', label: 'Ingest host', env: { public: 'POSTHOG_HOST', server: 'POSTHOG_HOST' }, secret: false, shape: 'posthogHost', required: true },
      { key: 'personalKey', label: 'Personal API key', env: { server: 'POSTHOG_PERSONAL_API_KEY' }, secret: true, shape: 'posthogPersonalKey', required: false },
      { key: 'projectId', label: 'Project ID', env: { server: 'POSTHOG_PROJECT_ID' }, secret: false, shape: 'digits', required: false, fill: 'check' },
    ],
    check: { id: 'posthog', uses: ['personalKey', 'host'], label: 'Check it', note: 'Calls PostHog with the personal key, once, from your machine. Nothing is stored but the answer.' },
    actions: [],
    gotchas: [
      'Two hosts: events go to us.i.posthog.com (or eu.i.), the API and the app are us.posthog.com. Mixing them up gives 401s or silent drops.',
      'The project key (phc_) is public; the personal key (phx_) never gets NEXT_PUBLIC_ or VITE_.',
      'Ad blockers drop requests to posthog.com. A reverse proxy on your own domain fixes it; then the host is your proxy URL.',
      'There are no test keys. Use a second project for development, or turn capturing off locally.',
    ],
    guide: {
      reads: 'The browser passes the prefixed key and host to `posthog.init(key, { api_host })`; the SDK reads no env itself. posthog-node: `new PostHog(process.env.POSTHOG_KEY, { host: process.env.POSTHOG_HOST, personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY })`. REST paths use POSTHOG_PROJECT_ID.',
      run: [
        'node scripts/secrets.mjs run --only POSTHOG_PERSONAL_API_KEY,POSTHOG_PROJECT_ID -- node scripts/ph-query.mjs',
      ],
      runNote: 'Server code that captures events in a short-lived process (a serverless function, a script) must `await posthog.shutdown()` before it exits, or queued events are lost.',
      test: 'No test mode. Give .env.local a dev project\'s phc_ key and the production key to the host only, or set opt_out_capturing_by_default in development.',
      limits: 'Private API, per personal key: analytics 240 a minute, query 2400 an hour, flag local evaluation 600 a minute, other calls 480 a minute. Capture and flags endpoints have no request limit. Back off on 429.',
      do: ['Send events to the .i. ingest host (or your proxy) and API calls to the app host, in the account\'s region.', 'Scope a personal key to one project and read scopes.'],
      dont: ['Give the personal key a public prefix or put it in client code.', 'Put personal data in event properties unless the privacy notice covers it; identify with an internal id.'],
    },
  },
};
