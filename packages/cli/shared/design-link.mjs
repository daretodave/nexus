// A Claude Design artifact link, checked before anything is sent: the GUI's "Hand off a design" (spec 43, A7) and the
// server's POST /api/design/handoff both use it, so a link reaches a session's prompt only in this one shape:
//
//   https://claude.ai/artifact/<id>
//   https://claude.ai/code/artifact/<uuid>
//
// The scheme may be left off and a trailing slash is dropped; anything else (another host, a query, a second word) is
// refused, so the link can never carry more than a link into `/design ingest <link>`.

const LINK = /^(?:https:\/\/)?(?:www\.)?claude\.ai\/(code\/)?artifact\/([A-Za-z0-9_-]{1,128})\/?$/;

/** -> { ok: true, link } with the link in its one canonical form, or { ok: false, error }. */
export function artifactLink(text) {
  const t = String(text ?? '').trim();
  if (!t) return { ok: false, error: 'Paste the artifact link Claude Design shared.' };
  const m = LINK.exec(t);
  if (!m) return { ok: false, error: 'That is not an artifact link: want https://claude.ai/artifact/<id> or https://claude.ai/code/artifact/<id>.' };
  return { ok: true, link: `https://claude.ai/${m[1] || ''}artifact/${m[2]}` };
}

/** The skill line a session runs for a link, or null for a link that does not pass. */
export function ingestCommand(text) {
  const r = artifactLink(text);
  return r.ok ? `/design ingest ${r.link}` : null;
}
