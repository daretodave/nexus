// POST /api/cloud/secret { value, force? }: set the cloud loop's sign-in, the CLAUDE_CODE_OAUTH_TOKEN repo secret, the
// way the kit's own sink does (templates/scripts/secrets-sinks.mjs): `gh secret set NAME --app actions --repo O/R`
// with the value on stdin, never in argv, a URL or an environment variable. Then it checks with `gh secret list`.
//
// The value is the loop's sign-in, not a project secret: it never enters the vault, the manifest or a session. It is
// never logged, every gh output that comes back has it scrubbed out, and no answer carries it.
import { run as shRun, json, SAFE_ARG } from './sh.mjs';
import { gitRun } from './repo-start.mjs';
import { repoPlace } from './place.mjs';
import { SECRET_NAME, checkToken, scrub } from '../shared/oauth-token.mjs';

const FRESH_MS = 5 * 60 * 1000;

/** The gh args that set the secret on `slug` (O/R). The value is never one of them. */
export function secretArgs(slug) {
  return ['secret', 'set', SECRET_NAME, '--app', 'actions', '--repo', slug];
}

/** The repo secrets list for `slug`, as gh gives it: [{ name, updatedAt }], or null when gh could not list (admin). */
async function listSecrets(cwd, run, slug) {
  const r = await run('gh', ['secret', 'list', '--app', 'actions', '--repo', slug, '--json', 'name,updatedAt'], { cwd, timeout: 20000 });
  const rows = r.ok ? json(r.stdout) : null;
  return Array.isArray(rows) ? rows : null;
}

/** One setter with its own lock. deps: { run, git, now }. */
export function createLoopSecret({ repo, run = shRun, git = gitRun, now = () => Date.now() } = {}) {
  let busy = false;

  async function set(body = {}) {
    const raw = body && typeof body.value === 'string' ? body.value : '';
    const out = (status, answer) => {
      // The last line of defence: whatever is answered, the value is not in it.
      const text = JSON.stringify(answer);
      return raw && raw.trim().length >= 4 && text.includes(raw.trim()) ? { status: 500, error: 'refused to answer with the token in it' } : { status, ...answer };
    };
    const where = await repoPlace(repo, { git });
    if (where.place !== 'github') return out(409, { error: 'This folder is not on GitHub yet: put it there first (Cloud setup, step 0).', place: where.place });
    const slug = `${where.remote.owner}/${where.remote.name}`;
    if (!SAFE_ARG.test(slug)) return out(409, { error: `origin's owner/name (${slug}) has characters gh cannot take here.` });
    const tok = checkToken(raw, { force: body.force === true });
    if (!tok.ok) return out(tok.status, { error: tok.error, ...(tok.warn ? { warn: tok.warn } : {}) });
    if (busy) return out(409, { error: 'already working on it' });
    busy = true;
    try {
      const auth = await run('gh', ['auth', 'status'], { cwd: repo, timeout: 15000 });
      if (auth.missing) return out(409, { error: 'gh is not installed, so nexus cannot set the secret. Use your terminal or GitHub instead.', why: 'gh-missing' });
      if (!auth.ok) return out(409, { error: 'gh is not signed in. Run gh auth login, then try again.', why: 'gh-signed-out' });
      const r = await run('gh', secretArgs(slug), { cwd: repo, input: tok.value, timeout: 30000 });
      if (!r.ok) {
        const said = scrub(`${r.stderr || ''}\n${r.stdout || ''}`, tok.value).trim().slice(0, 400);
        return out(502, { error: said ? `gh did not set it: ${said}` : 'gh did not set it.', repo: slug });
      }
      const list = await listSecrets(repo, run, slug);
      const row = list ? list.find((s) => s?.name === SECRET_NAME) : null;
      const at = row ? Date.parse(row.updatedAt || '') : NaN;
      const verified = list == null ? null : !!row && Number.isFinite(at) && now() - at < FRESH_MS;
      return out(200, {
        ok: true,
        name: SECRET_NAME,
        repo: slug,
        verified,
        ...(row?.updatedAt ? { updatedAt: row.updatedAt } : {}),
        ...(verified == null ? { note: 'gh says it is set. Listing secrets needs admin, so nexus could not double-check; the first run will tell.' } : {}),
      });
    } finally {
      busy = false;
    }
  }

  return { set };
}
