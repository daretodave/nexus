// Deploy status for the change feed (feed.mjs), with no tokens spent: hosts like Vercel, Cloudflare Pages and Netlify
// report back to GitHub on the commit they built. This reads the pushed tip's GitHub deployments (and their
// statuses), its commit statuses and its check runs through the person's own `gh` (async, `gh api` with gh's own
// {owner}/{repo} from the checkout's remote), and says where the push stands:
//
//   waiting    the repo has a deploy integration, and nothing has reported on this commit yet ("not deployed yet")
//   deploying  a host has started (queued, pending, in progress)
//   deployed   a host says it is live, with the environment's name and URL when it gave them
//   failed     a host says the deploy failed
//
// A repo where no deploy integration has ever reported says nothing about deploys at all (integrationFrom), rather
// than "not deployed yet" forever. Every gh call takes an injected runner, so tests hand it canned payloads.
import { run as shRun, json } from './sh.mjs';

/** A status context, check run or app that is a deploy host. */
export const DEPLOY_RE = /\b(vercel|netlify|cloudflare|pages|deploy|deployment|render|railway|fly|amplify|heroku|firebase|surge|preview)\b/i;
export const SETTLED = new Set(['deployed', 'failed']);
/** How long a push's deploy is followed before the feed stops asking. */
export const FOLLOW_MS = 30 * 60 * 1000;
/** The waits between looks: quick first, then backing off. */
export const BACKOFF_MS = [15000, 30000, 60000, 120000, 240000, 300000];
/** How long "this repo has (or has no) deploy integration" is believed. */
export const INTEGRATION_MS = 30 * 60 * 1000;

const isDeployName = (s) => DEPLOY_RE.test(String(s || '').replace(/[-_/]/g, ' '));

/** One GitHub deployment's newest status -> a state. */
function fromDeployment(d) {
  const st = (d.statuses || [])[0] || null;
  const env = d.environment || d.original_environment || '';
  const url = (st && (st.environment_url || st.target_url)) || '';
  const s = st ? String(st.state || '').toLowerCase() : 'pending';
  const state = s === 'success' || s === 'inactive' ? 'deployed'
    : s === 'failure' || s === 'error' ? 'failed'
    : 'deploying';
  return { state, env, url, prod: !!d.production_environment || /prod/i.test(env), src: 'deployment' };
}

/** A commit status (context, state, target_url) from a deploy host -> a state. */
function fromStatus(s) {
  const st = String(s.state || '').toLowerCase();
  const state = st === 'success' ? 'deployed' : st === 'failure' || st === 'error' ? 'failed' : 'deploying';
  return { state, env: '', url: s.target_url || '', prod: /prod/i.test(s.context || ''), src: 'status', name: s.context || '' };
}

/** A check run from a deploy host -> a state, or null (skipped, cancelled: no word either way). */
function fromCheck(c) {
  if (c.status && c.status !== 'completed') return { state: 'deploying', env: '', url: c.details_url || '', prod: false, src: 'check', name: c.name || '' };
  const k = String(c.conclusion || '').toLowerCase();
  if (k === 'success' || k === 'neutral') return { state: 'deployed', env: '', url: c.details_url || '', prod: false, src: 'check', name: c.name || '' };
  if (k === 'failure' || k === 'timed_out' || k === 'action_required' || k === 'startup_failure') return { state: 'failed', env: '', url: c.details_url || '', prod: false, src: 'check', name: c.name || '' };
  return null;
}

const deployStatuses = (statuses) => (statuses || []).filter((s) => s && isDeployName(s.context));
const deployChecks = (checks) => (checks || []).filter((c) => c && (isDeployName(c.name) || isDeployName(c.app?.slug) || isDeployName(c.app?.name)));

/**
 * Where one commit's deploy stands, from what GitHub holds on it.
 * @param {{ deployments?: Array<{ environment, statuses: object[] }>, statuses?: object[], checks?: object[] }} o
 * @returns {{ state: 'waiting'|'deploying'|'deployed'|'failed', env: string, url: string }}
 */
export function deployFrom({ deployments = [], statuses = [], checks = [] } = {}) {
  const all = [
    ...deployments.map(fromDeployment),
    ...deployStatuses(statuses).map(fromStatus),
    ...deployChecks(checks).map(fromCheck).filter(Boolean),
  ];
  if (!all.length) return { state: 'waiting', env: '', url: '' };
  // Production speaks for the push when it has spoken; a preview only when nothing else has.
  const prod = all.filter((x) => x.prod);
  const pool = prod.length ? prod : all;
  const pick = (state) => pool.find((x) => x.state === state && x.url) || pool.find((x) => x.state === state);
  const hit = pick('deploying') || pick('deployed') || pick('failed');
  return { state: hit.state, env: hit.env || '', url: /^https?:\/\//.test(hit.url) ? hit.url : '' };
}

/**
 * Has any deploy integration ever reported on this repo? Any GitHub deployment at all, or a deploy host's status or
 * check run on a recent commit. With none, the feed says nothing about deploys.
 */
export function integrationFrom({ deployments = [], statuses = [], checks = [] } = {}) {
  return deployments.length > 0 || deployStatuses(statuses).length > 0 || deployChecks(checks).length > 0;
}

/** gh's JSON, or null when gh is missing, signed out, or the repo is not on GitHub. */
async function ghJson(run, repo, args) {
  const r = await run('gh', args, { cwd: repo, timeout: 15000, env: { GH_PROMPT_DISABLED: '1' } });
  return r && r.ok ? json(r.stdout) : null;
}

const SHA = /^[0-9a-f]{7,40}$/i;

/** What GitHub holds on one commit, for deployFrom and integrationFrom. Null when gh cannot say. */
export async function readCommit(repo, sha, { run = shRun } = {}) {
  if (!SHA.test(String(sha))) return null;
  const base = 'repos/{owner}/{repo}';
  const [deps, status, checks] = await Promise.all([
    ghJson(run, repo, ['api', `${base}/deployments`, '-X', 'GET', '-f', `sha=${sha}`, '-f', 'per_page=10']),
    ghJson(run, repo, ['api', `${base}/commits/${sha}/status`]),
    ghJson(run, repo, ['api', `${base}/commits/${sha}/check-runs`, '-X', 'GET', '-f', 'per_page=50']),
  ]);
  if (deps == null && status == null && checks == null) return null;
  const deployments = [];
  for (const d of (Array.isArray(deps) ? deps : []).slice(0, 4)) {
    if (!d || !/^\d+$/.test(String(d.id))) continue;
    const st = await ghJson(run, repo, ['api', `${base}/deployments/${d.id}/statuses`, '-X', 'GET', '-f', 'per_page=5']);
    deployments.push({ ...d, statuses: Array.isArray(st) ? st : [] });
  }
  return { deployments, statuses: status?.statuses || [], checks: checks?.check_runs || [] };
}

/** Does this repo have a deploy integration? Any deployment on GitHub, or a deploy host on the given commits. */
export async function readIntegration(repo, shas = [], { run = shRun } = {}) {
  const any = await ghJson(run, repo, ['api', 'repos/{owner}/{repo}/deployments', '-X', 'GET', '-f', 'per_page=1']);
  if (any == null) return null; // gh cannot say: no word on deploys
  if (Array.isArray(any) && any.length) return true;
  for (const sha of shas.filter((s) => SHA.test(String(s))).slice(0, 2)) {
    const c = await readCommit(repo, sha, { run });
    if (c && integrationFrom(c)) return true;
  }
  return false;
}

/** The wait before look number `n` (0-based) at a pending deploy. */
export const backoff = (n) => BACKOFF_MS[Math.min(n, BACKOFF_MS.length - 1)];
