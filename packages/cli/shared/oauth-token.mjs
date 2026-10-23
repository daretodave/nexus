// The cloud loop's sign-in: the CLAUDE_CODE_OAUTH_TOKEN repo secret that `claude setup-token` mints. One check for
// the page, the server and the demo, and the made-up token the walkthrough shows.
//
// The token is the loop's sign-in, not a project secret (agents.md): it never enters the vault, the manifest or a
// session. The server hands it to `gh secret set` on stdin and keeps nothing.

export const SECRET_NAME = 'CLAUDE_CODE_OAUTH_TOKEN';

/** What every token from `claude setup-token` starts with (customization/bootstrap-automation.md: sk-ant-oat01-). */
export const TOKEN_PREFIX = 'sk-ant-oat';

/**
 * The walkthrough's token: obviously not real. Built at runtime from mask dots, which are not base64, so no secret
 * scanner or push protection can read it as a key (test/token-term.test.mjs pins that).
 */
export const FAKE_TOKEN = `${TOKEN_PREFIX}01-${'•'.repeat(40)}EXAMPLE`;

/** A real token's shape, for the test that pins FAKE_TOKEN can never look like one. */
export const REAL_TOKEN = /sk-ant-oat01-[A-Za-z0-9_-]{20,}/;

/**
 * Check a pasted value. -> { ok: true, value } (trimmed), or { ok: false, status: 400, error } for a value that cannot
 * be a token, or { ok: false, status: 422, warn: 'prefix', error } for one that does not start like a setup-token
 * token (sent again with force: true, it goes through).
 */
export function checkToken(raw, { force = false } = {}) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value || /[\r\n\0]/.test(value) || value.length < 20 || value.length > 4096) {
    return { ok: false, status: 400, error: 'Paste the whole token, on one line.' };
  }
  if (!value.startsWith(TOKEN_PREFIX) && !force) {
    return { ok: false, status: 422, warn: 'prefix', error: `This does not look like a token from claude setup-token (those start with ${TOKEN_PREFIX}). Save it anyway?` };
  }
  return { ok: true, value };
}

/** Take every copy of `value` out of `text` (a tool's output), so an answer can never carry the token back. */
export function scrub(text, value) {
  const t = String(text ?? '');
  if (!value || value.length < 4) return t;
  return t.split(value).join('[token]');
}
