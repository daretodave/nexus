// The places a value can be pushed to, by the ids the kit's sinks use (scripts/secrets-sinks.mjs SINK_DESTINATIONS):
// each one's label, what it holds, and the names-only command that confirms a push landed. Labels only, no imports,
// so the Vault's model and the change feed can name a place without loading the stack registry (moves.mjs has the
// rest: which picked service owns which place, and which values go where).

/** Every destination a value can be pushed to (the kit's SINK_DESTINATIONS), with its label and its names-only check. */
export const DESTINATIONS = {
  'github-actions': { label: 'GitHub Actions', short: 'Actions', what: 'repository secrets', verify: () => 'gh secret list' },
  vercel: { label: 'Vercel', short: 'Vercel', what: 'project environment variables', verify: () => 'vercel env ls' },
  cloudflare: { label: 'Cloudflare', short: 'Cloudflare', what: 'worker secrets', verify: () => 'npx wrangler secret list' },
  'cloudflare-pages': { label: 'Cloudflare Pages', short: 'Pages', what: 'Pages project secrets', verify: () => 'npx wrangler pages secret list' },
  netlify: { label: 'Netlify', short: 'Netlify', what: 'site environment variables', verify: () => 'the audit line (`node scripts/secrets.mjs audit`) and the site\'s Environment variables page; `netlify env:list` prints values, so a session never runs it' },
  fly: { label: 'Fly.io', short: 'Fly', what: 'app secrets', verify: () => 'fly secrets list' },
  supabase: { label: 'Supabase', short: 'Supabase', what: 'Edge Function secrets', verify: () => 'npx supabase secrets list' },
  firebase: { label: 'Firebase', short: 'Firebase', what: 'Cloud Functions secrets', verify: (n) => `npx firebase functions:secrets:get ${n}` },
  'aws-secrets-manager': { label: 'AWS Secrets Manager', short: 'AWS SM', what: 'secrets', verify: (n) => `aws secretsmanager describe-secret --secret-id ${n}` },
  'aws-ssm': { label: 'AWS Parameter Store', short: 'AWS SSM', what: 'SecureString parameters', verify: (n) => `aws ssm describe-parameters --parameter-filters Key=Name,Values=${n}` },
  'gcp-secret-manager': { label: 'Google Secret Manager', short: 'GCP SM', what: 'secrets', verify: (n) => `gcloud secrets versions list ${n}` },
  'azure-key-vault': { label: 'Azure Key Vault', short: 'Key Vault', what: 'secrets', verify: () => 'az keyvault secret list --vault-name <vault> --query "[].name"' },
};

/** The destinations in the order the Vault and the guide list them. */
export const DEST_ORDER = Object.keys(DESTINATIONS);

/** A destination's label ("Cloudflare Pages"), or the id itself for one this build does not know. */
export const destLabel = (d) => DESTINATIONS[d]?.label || String(d);

/** The push flag that picks a place's project or app, when it needs one to be told (shown in the guide's line). */
export const DEST_FLAG = { 'azure-key-vault': '--vault <vault>', fly: '--app <app>' };

