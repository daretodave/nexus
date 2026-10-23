// Where a stack's values go once they are in the vault, and how a session moves one there: the destinations the
// repo's own sinks know (destinations.mjs, re-exported here: each one's label and the names-only command that confirms
// a push landed); which picked services own a place values can go; and which values an app reads at run time (so a
// host gets them) as against a tool's or a host's own token (so it does not).
//
// Pure data and helpers, shared by the guide (guide.mjs, "Moving values"), the server (stack.mjs: the Vercel send,
// secrets.mjs: a request's card) and the stack panel. Names only: nothing here takes a value.
import { SERVICES, ORDER, CI_NAMES, aliasesOf } from './recipes.mjs';
import { DESTINATIONS, DEST_ORDER, DEST_FLAG, destLabel } from './destinations.mjs';

export { DESTINATIONS, DEST_ORDER, DEST_FLAG, destLabel };

/** The places each service owns: where a value goes when that service is picked (its host, or its secret store). */
export const SERVICE_DESTS = {
  vercel: ['vercel'],
  netlify: ['netlify'],
  fly: ['fly'],
  cloudflare: ['cloudflare', 'cloudflare-pages'],
  supabase: ['supabase'],
  firebase: ['firebase'],
  aws: ['aws-secrets-manager', 'aws-ssm'],
  gcp: ['gcp-secret-manager'],
  azure: ['azure-key-vault'],
};

/**
 * Values a tool or an admin reads, never the running app: they stay in the vault (and CI, for a CI name), and no host
 * gets them from a Send or a save.
 */
export const TOOL_ONLY = new Set([
  'supabase.pat', 'supabase.ref', 'neon.apiKey', 'neon.projectId', 'posthog.personalKey', 'posthog.projectId',
  'anthropic.workspaceId', 'azure.resourceGroup',
]);

/** Whether the running app reads a value (so the host it runs on gets it): not a hosting service's own, not tool-only. */
export function appReads(service, key) {
  const s = SERVICES[service];
  if (!s || !s.values.some((v) => v.key === key)) return false;
  return s.group !== 'hosting' && !TOOL_ONLY.has(`${service}.${key}`);
}

/** The hosts the app runs on among the picks: the places a value the app reads goes. */
export function hostDests(picked = []) {
  const out = [];
  for (const id of ORDER.filter((x) => picked.includes(x) && SERVICES[x].group === 'hosting')) {
    for (const d of SERVICE_DESTS[id] || []) if (d !== 'cloudflare-pages') out.push(d);
  }
  return out;
}

/** The secret stores among the picks (AWS, Google Cloud, Azure, Firebase, Supabase): a value can go there too. */
export function storeDests(picked = []) {
  return ORDER.filter((x) => picked.includes(x) && SERVICES[x].group !== 'hosting').flatMap((id) => SERVICE_DESTS[id] || []);
}

/**
 * Where one value of a picked service goes, from the picks: an app value to each host (and, when none is picked, the
 * picked secret stores); a CI name to GitHub Actions; a hosting service's own token nowhere but CI.
 */
export function placesFor(service, key, name, picked = []) {
  const out = [];
  if (appReads(service, key)) {
    const hosts = hostDests(picked);
    out.push(...(hosts.length ? hosts : storeDests(picked)));
  }
  if (CI_NAMES.has(name)) out.push('github-actions');
  return [...new Set(out)];
}

/** The service and key a recipe writes this env name for (a framework's prefix ignored), or null. */
export function recipeOfName(name, prefixes = ['NEXT_PUBLIC_', 'VITE_', 'PUBLIC_', 'EXPO_PUBLIC_', 'REACT_APP_', 'NUXT_PUBLIC_']) {
  const n = String(name || '');
  for (const id of ORDER) {
    for (const v of SERVICES[id].values) {
      const names = [v.env?.server, v.env?.public, ...(v.env?.public ? prefixes.map((p) => `${p}${v.env.public}`) : [])].filter(Boolean);
      if (names.includes(n) || names.some((x) => aliasesOf(x).includes(n))) return { service: id, key: v.key };
    }
  }
  return null;
}
