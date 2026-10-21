// The claims panel's writes (spec 40 A5): claim, release, hold, unhold, assign, reassign and request, each one run of
// the repo's own claims CLI (scripts/claims.mjs, `--json`), never a second copy of its rules. A refusal is the CLI's
// own words. Request is the one call that is not the CLI: in a repo whose claims are protected, a contributor asks
// the owner through a GitHub issue (gh, injected as `ghRun` so tests never reach GitHub).
//
// The environment each run gets: the server's own, minus CLAUDECODE and every CLAUDE_CODE_* variable, plus the acting
// session's NEXUS_SESSION and NEXUS_GH_LOGIN (always set, '' when gh can't say, so the CLI never asks gh itself).
// The server is not a Claude Code session: it acts for the person at the page. A server started from inside a Claude
// Code session (a Bash call running `npx @usenexus/cli`) would otherwise hand that session's variables on, and the
// CLI would refuse `claim` for want of that session's hook marker (customization/claims.md, "No hooks, no claim"),
// or claim under that session's id. NEXUS_SESSION names the claim's owner; nothing else does.
import { execFile } from 'node:child_process';
import { CHUNK_ID, CLAIMS_SCRIPTS, findScript } from './repo.mjs';
import { run as shRun, json } from './sh.mjs';

export const VERBS = Object.freeze(['claim', 'release', 'hold', 'unhold', 'assign', 'reassign', 'request']);
/** The claims CLI's owner identity (scripts/claims-codec.mjs PRIVILEGED). */
export const PRIVILEGED = 'privileged_agent_session';
/** A GitHub login: letters, digits and single dashes, at most 39. */
export const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
/** A claims session id as the CLI tags it (no `|` or `~`). */
export const SESSION = /^[\w.-]{1,64}$/;
/** Variables a Claude Code session sets that must not reach the claims CLI from this server: CLAUDECODE and every CLAUDE_CODE_* (CLAUDE_CODE_SESSION_ID among them). */
export const STRIPPED = (k) => k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_');

/** The claims CLI's environment for one acting session. */
export function childEnv(base, { session, login = '' } = {}) {
  const env = { ...base };
  for (const k of Object.keys(env)) if (STRIPPED(k)) delete env[k];
  if (session) env.NEXUS_SESSION = String(session);
  env.NEXUS_GH_LOGIN = String(login || '');
  return env;
}

/** A person's git name for `assign --to`: printable, no `|` (the claims value's separator), at most 100. */
export function validName(name) {
  const s = String(name ?? '').trim();
  return s && s.length <= 100 && !/[|\u0000-\u001f\u007f]/.test(s) ? s : '';
}

/** node <script> ...args, no shell (a git name may hold spaces); resolves { code, stdout, stderr }. */
function runNode(repo, script, args, env, timeout = 60000) {
  return new Promise((resolve) => {
    execFile(process.execPath, [script, ...args], { cwd: repo, env, timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

/** What a claims CLI answer says went wrong, in its own words ('' when it did what was asked). */
export function refusal(verb, out, r) {
  if (out && out.ok === false && out.error) return String(out.error);
  if (out && Array.isArray(out.results) && out.results.some((x) => !x.ok)) {
    return out.results.filter((x) => !x.ok).map((x) => `${x.id}: ${x.why}`).join('; ');
  }
  if (out && Array.isArray(out.kept) && out.kept.length) return `not this session's claim: ${out.kept.join(', ')}`;
  if (r.code !== 0) return (r.stderr || r.stdout).trim().slice(0, 600) || `claims ${verb} exited ${r.code}`;
  return '';
}

/**
 * The claims CLI over one repo, for one acting session. `base` is the environment to start from (the server's own).
 * @returns {{ script: string|null, exec: (args: string[]) => Promise<{ ok: boolean, out: any, error: string }> }}
 */
export function claimsCli(repo, { session, login = '', base = process.env } = {}) {
  const script = findScript(repo, CLAIMS_SCRIPTS);
  const env = childEnv(base, { session, login });
  return {
    script,
    async exec(args) {
      if (!script) return { ok: false, out: null, error: 'No claims module in this repo yet.' };
      const r = await runNode(repo, script, [...args, '--json'], env);
      const out = json(r.stdout);
      const error = refusal(args[0], out, r);
      return { ok: !error, out, error };
    },
  };
}

/** GET /api/claims: every claim (`list --json`) and who this session is (`whoami --json`). */
export async function listClaims(repo, opts = {}) {
  const cli = claimsCli(repo, opts);
  if (!cli.script) return { available: false, rows: [], note: 'No claims module in this repo yet.' };
  const [list, me] = await Promise.all([cli.exec(['list']), cli.exec(['whoami'])]);
  if (!list.ok || !Array.isArray(list.out)) return { available: true, rows: [], error: (list.error || 'unreadable claims list').slice(0, 400), script: cli.script };
  return { available: true, rows: list.out, script: cli.script, ...(me.ok && me.out ? { me: me.out } : {}) };
}

/** The issue a protected-claims request opens, asking the owner to `assign` the chunk. */
export function requestIssue({ id, title = '', me = {}, login = '' }) {
  const who = me.who || 'a contributor';
  const tag = me.session ? `${me.session}${me.star ? `~${me.star}` : ''}` : '';
  const t = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const handle = login ? `@${login}` : '';
  return {
    title: `Claim request: ${id}${t ? ` · ${t}` : ''}`,
    body: [
      `${who}${handle ? ` (${handle})` : ''} asks to build **${id}**${t ? ` (${t})` : ''}.`,
      '',
      tag ? `Session \`${tag}\`${me.host ? ` on ${me.host}` : ''}.` : null,
      tag ? '' : null,
      'Claims are protected in this repo, so this request stands in for `claims claim`. To grant it, hold the chunk for them:',
      '',
      '```',
      `node scripts/claims.mjs assign ${id} --to "${who}" --login ${login || '<their GitHub login>'}`,
      '```',
      '',
      'Close this issue to decline. Sent from the nexus GUI.',
    ].filter((l) => l !== null).join('\n'),
  };
}

/**
 * POST /api/claims/:verb. body: { id, to?, login?, title?, owner? } (`owner: true` reassigns to the owner). ctx: { session, login, base, ghRun }.
 * @returns {Promise<{ status: number, ok: boolean, verb: string, id: string, error?: string, out?: any, issue?: object }>}
 */
export async function claimsAction(repo, verb, body = {}, ctx = {}) {
  const id = String(body.id ?? '').trim();
  const bad = (error) => ({ status: 400, ok: false, verb, id, error });
  if (!VERBS.includes(verb)) return { status: 404, ok: false, verb, id, error: 'not found' };
  if (!CHUNK_ID.test(id)) return bad('bad chunk id');
  const cli = claimsCli(repo, ctx);
  if (!cli.script) return { status: 200, ok: false, verb, id, error: 'No claims module in this repo yet.' };
  const done = (r) => ({ status: 200, ok: r.ok, verb, id, out: r.out, ...(r.error ? { error: r.error } : {}) });

  if (verb === 'claim') return done(await cli.exec(['claim', id]));

  // Who is acting decides the flags: the owner releases anyone's (--force) and holds as the owner.
  const me = await cli.exec(['whoami']);
  if (!me.ok) return done(me);
  const owner = !!me.out?.owner;

  if (verb === 'release' || verb === 'unhold') return done(await cli.exec(['release', id, ...(owner ? ['--force'] : [])]));

  if (verb === 'hold') {
    // A hold is the owner's `assign`. The owner holds for the owner (its own claims name), keyed to its login; for a
    // contributor the CLI refuses, in its own words.
    const login = String(ctx.login || '');
    if (owner && !LOGIN.test(login)) return { status: 200, ok: false, verb, id, error: 'A hold needs your GitHub login: sign gh in (gh auth login) or set NEXUS_GH_LOGIN.' };
    return done(await cli.exec(['assign', id, '--to', owner ? PRIVILEGED : (me.out.who || ''), '--login', login || '-']));
  }

  if (verb === 'reassign' && body.owner === true) {
    // The Reassign picker's owner row (spec 40 A12): to the owner, as a hold is, but over anyone's claim (--force).
    const login = String(ctx.login || '');
    if (!owner) return { status: 200, ok: false, verb, id, error: 'Only the owner reassigns a claim to the owner.' };
    if (!LOGIN.test(login)) return { status: 200, ok: false, verb, id, error: 'Reassigning to you needs your GitHub login: sign gh in (gh auth login) or set NEXUS_GH_LOGIN.' };
    return done(await cli.exec(['assign', id, '--to', PRIVILEGED, '--login', login, '--force']));
  }

  if (verb === 'assign' || verb === 'reassign') {
    const login = String(body.login ?? '').replace(/^@/, '').trim();
    if (!LOGIN.test(login)) return bad('assign needs the person\'s GitHub login');
    const to = validName(body.to) || login;
    return done(await cli.exec(['assign', id, '--to', to, '--login', login, ...(verb === 'reassign' ? ['--force'] : [])]));
  }

  // request: a GitHub issue for the owner; nothing is written to the claims branch.
  if (owner) return { status: 200, ok: false, verb, id, error: 'You own this checkout: claim it instead.' };
  const issue = requestIssue({ id, title: body.title, me: me.out || {}, login: ctx.login });
  const gh = ctx.ghRun || shRun;
  const r = await gh('gh', ['api', 'repos/{owner}/{repo}/issues', '--method', 'POST', '--input', '-'], { cwd: repo, timeout: 30000, input: JSON.stringify(issue) });
  if (!r.ok) return { status: 200, ok: false, verb, id, error: r.missing ? 'gh is not installed: ask the owner another way.' : `Couldn't open the request: ${(r.stderr || r.stdout || '').trim().slice(0, 400)}` };
  const made = json(r.stdout) || {};
  return { status: 200, ok: true, verb, id, issue: { number: made.number ?? null, url: made.html_url || made.url || '' } };
}
