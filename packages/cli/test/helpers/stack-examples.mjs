// One example value per stack shape, for the registry and check tests. Test values only: each is obviously fake
// (most carry TESTONLY), and the token-like ones are joined at run time so no scanner mistakes this file for a leak.
import crypto from 'node:crypto';

const j = (...parts) => parts.join('');
const pad = (s, n, c = '0') => s.padEnd(n, c);

/** A throwaway RSA key and a Google service account file around it (made per run, never written to disk). */
export function fakeServiceAccount({ project = 'fieldday-test', email = `app@${project}.iam.gserviceaccount.com`, type = 'service_account' } = {}) {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().replace(/\r\n/g, '\n');
  return { type, project_id: project, private_key_id: 'ab'.repeat(20), private_key: pem, client_email: email, client_id: '1234567890' };
}

const SA_SMALL = { type: 'service_account', project_id: 'fieldday-test', private_key_id: 'ab'.repeat(20), private_key: '-----BEGIN PRIVATE KEY-----\nTESTONLY\n-----END PRIVATE KEY-----\n', client_email: 'app@fieldday-test.iam.gserviceaccount.com' };

export const EXAMPLES = {
  hostname: 'fieldday.dev',
  cloudflareToken: 'cfut_TESTONLYdemo0000000000000000',
  hex32: '0123456789abcdef0123456789abcdef',
  supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
  supabaseRef: 'abcdefghijklmnopqrst',
  supabasePublishable: 'sb_publishable_TESTONLYdemo0000',
  supabaseSecret: 'sb_secret_TESTONLYdemo00000000',
  postgresUrl: 'postgresql://postgres.abcdefghijklmnopqrst:TESTONLYpw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres',
  supabasePat: 'sbp_TESTONLYdemo0000000000000000',
  vercelToken: 'vcp_TESTONLYdemo00000000000',
  vercelTeam: 'team_TESTONLYdemo0000',
  vercelProject: 'prj_TESTONLYdemo0000',
  // 0.5.2
  awsAccessKeyId: j('AKIA', 'IOSFODNN7EXAMPLE'),
  awsSecretAccessKey: j('wJalrXUtnFEMI/K7MDENG/', 'bPxRfiCYEXAMPLEKEY'),
  awsRegion: 'eu-west-2',
  gcpServiceAccountKey: JSON.stringify(SA_SMALL, null, 2),
  gcpProjectId: 'fieldday-test',
  firebaseApiKey: j('AIza', pad('TESTONLY', 35)),
  firebaseAuthDomain: 'fieldday-test.firebaseapp.com',
  firebaseBucket: 'fieldday-test.firebasestorage.app',
  firebaseSenderId: '123456789012',
  firebaseAppId: '1:123456789012:web:abcdef0123456789',
  gaMeasurementId: 'G-TESTONLY1',
  guid: '11111111-2222-3333-4444-555555555555',
  azureClientSecret: j('abc8Q~', pad('TESTONLY', 32, 'x')),
  azureResourceGroup: 'fieldday-rg',
  discordBotToken: j(pad('TESTONLY', 24, 'x'), '.', 'GtEstX', '.', pad('TESTONLY', 30, 'y')),
  discordSnowflake: '112233445566778899',
  discordPublicKey: 'ab'.repeat(32),
  discordClientSecret: pad('TESTONLY', 32, 'z'),
  slackBotToken: j('xo', 'xb-123-456-', pad('TESTONLY', 24, 'a')),
  slackAppToken: j('xa', 'pp-1-A0TEST-123-', 'ab'.repeat(16)),
  slackSigningSecret: '0123456789abcdef0123456789abcdef',
  slackClientSecret: 'fedcba9876543210fedcba9876543210',
  slackClientId: '1234.5678',
  slackTeamId: 'T0TESTONLY',
  slackWebhookUrl: j('https://hooks.slack.com/services/', 'T0TEST/B0TEST/', pad('TESTONLY', 24, 'x')),
  twilioAccountSid: j('AC', 'ab'.repeat(16)),
  twilioApiKeySid: j('SK', 'cd'.repeat(16)),
  twilioApiKeySecret: pad('TESTONLY', 32, 'Q'),
  twilioAuthToken: '00112233445566778899aabbccddeeff',
  twilioMessagingServiceSid: j('MG', 'ef'.repeat(16)),
  e164Phone: '+14155550123',
  stripePublishable: j('pk_', 'test_', pad('TESTONLY', 24)),
  stripeSecret: j('rk_', 'test_', pad('TESTONLY', 24)),
  webhookSecret: j('whsec_', pad('TESTONLY', 24)),
  clerkPublishable: j('pk_test_', Buffer.from('fieldday.clerk.accounts.dev$').toString('base64')),
  clerkSecret: j('sk_', 'test_', pad('TESTONLY', 24)),
  anthropicKey: j('sk-ant-', 'api03-', pad('TESTONLY', 40, 'x')),
  anthropicWorkspace: 'wrkspc_TESTONLY00000000',
  openaiKey: j('sk-', 'proj-', pad('TESTONLY', 30, 'x')),
  openaiProject: 'proj_TESTONLY00000000',
  openaiOrg: 'org-TESTONLY00000000',
  resendKey: j('re_', pad('TESTONLY', 20, 'x')),
  emailFrom: 'Fieldday <hello@fieldday.dev>',
  sentryDsn: j('https://', 'ab'.repeat(16), '@o123.ingest.sentry.io/456'),
  sentryToken: j('sntrys_', Buffer.from(JSON.stringify({ iat: 1, url: 'https://sentry.io', region_url: 'https://de.sentry.io', org: 'fieldday' })).toString('base64'), '_', 'A'.repeat(43)),
  slug: 'fieldday',
  posthogProjectKey: j('phc_', pad('TESTONLY', 24, 'x')),
  posthogHost: 'https://us.i.posthog.com',
  posthogPersonalKey: j('phx_', pad('TESTONLY', 24, 'x')),
  digits: '12345',
  neonPooledUrl: 'postgresql://app:TESTONLYpw@ep-cool-darkness-123456-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require',
  neonDirectUrl: 'postgresql://app:TESTONLYpw@ep-cool-darkness-123456.eu-west-2.aws.neon.tech/neondb?sslmode=require',
  neonApiKey: j('napi_', pad('TESTONLY', 20, 'x')),
  neonProjectId: 'cool-darkness-123456',
  upstashRestUrl: 'https://eu1-fieldday-32748.upstash.io',
  upstashToken: pad('TESTONLY', 48, 'x'),
  redisUrl: 'rediss://default:TESTONLYpw@eu1-fieldday-32748.upstash.io:6379',
  netlifyToken: j('nfp_', pad('TESTONLY', 32, 'x')),
  flyToken: j('FlyV1 ', 'fm2_', pad('TESTONLY', 48, 'x')),
  flyAppName: 'fieldday-bot',
};
