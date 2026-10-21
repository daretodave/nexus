// Settings' Secrets section (design/handoff Settings.dc.html and, revision 3,
// SettingsContributor.dc.html): the counts it draws from GET /api/secrets
// (secrets.mjs status --json). Until the server serves it the counts are
// unknown (null) and the section shows its words without a number.

/** nexus's manifest of secret names (customization/secrets.md). */
export const MANIFEST = 'nexus.secrets.json';

/**
 * { names, localKeys }: the owner's declared names and a contributor's local
 * keys, each a count or null when the endpoint does not answer.
 */
export function secretCounts(data) {
  if (!data || typeof data !== 'object') return { names: null, localKeys: null };
  const names = Array.isArray(data.secrets) ? data.secrets.filter((r) => r && r.declared !== false).length : null;
  const localKeys = Array.isArray(data.localKeys) ? data.localKeys.length : null;
  return { names, localKeys };
}

/** "6 names", "1 name"; null when unknown. */
export function namesLabel(n) {
  return n == null ? null : `${n} name${n === 1 ? '' : 's'}`;
}

/** "2 local keys", "1 local key"; "Local keys" when unknown. */
export function localKeysLabel(n) {
  return n == null ? 'Local keys' : `${n} local key${n === 1 ? '' : 's'}`;
}
