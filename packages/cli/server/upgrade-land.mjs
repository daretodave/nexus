// `nexus upgrade --land`, the first-tick watch and `--rollback` (spec 58, A8).
//
// --write leaves one commit on a branch (upgrade.mjs). --land carries it to the default branch:
//
//   owner  wait for an idle window (no queued or running march run, the next cron at least IDLE_GAP_MIN away), pause
//          march (gh workflow disable), wait out a run that slipped in, set NEXUS_LOOP_MODE=owner when the v1 loop
//          pushed the default branch, push the commit, resume march (always, once paused, whatever failed), dispatch
//          one tick and watch it: its jobs, its conclusion, the commits it pushed. A tick that pushed nothing where
//          the report predicted work (or that failed) prints the --rollback line.
//   pr     push the branch and open a pull request whose body is the report; its merge is the cut-over.
//
// --rollback reverts the upgrade commit on a fresh fetch of origin in one commit (the lock pinned back to v1.0.0) on
// nexus/rollback-v2; with --land it reaches the default branch the same way (no dispatch: the v1 cron carries on).
//
// Every gh call goes through an injected `gh(args, { cwd, input })` (tests stub it; nothing infers state from a
// clock but the cron gap), and every wait through injected `now` and `sleep`.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { run as shRun, json } from './sh.mjs';
import { COMMIT_SUBJECT, detect, freshWorktree, gitIn, loopModeOf, redactUrl } from './upgrade.mjs';

export const MARCH = 'march.yml';
export const ROLLBACK_SUBJECT = 'plan: roll back the nexus v2 upgrade';
export const ROLLBACK_BRANCH = 'nexus/rollback-v2';
export const V1_LOCK = 'kit: nexus\nversion: 1.0.0\nref: v1.0.0\nshape: phases\n';
/** The next cron must be at least this many minutes away before the push (measured live gaps: 2-5 h). */
export const IDLE_GAP_MIN = 10;
/** A run in one of these states is a tick that could push while the upgrade does. */
export const BUSY = Object.freeze(['in_progress', 'queued', 'waiting', 'requested', 'pending']);
/** The line a no-op or failed first tick prints. */
export const ROLLBACK_LINE = 'npx @usenexus/cli upgrade --rollback --land owner';

const defaultGh = (args, { cwd, input } = {}) => shRun('gh', args, { cwd, input, timeout: 120000 });
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (sha) => String(sha || '').slice(0, 7);
const ghErr = (r) => redactUrl(`${r.stderr || ''}${r.stdout || ''}`.trim().split(/\r?\n/).slice(-3).join(' '));

async function ghJson(gh, args, cwd) {
  const r = await gh(args, { cwd });
  if (!r.ok) throw new Error(`gh ${args.slice(0, 2).join(' ')} failed: ${ghErr(r)}`);
  return json(r.stdout) ?? null;
}

/** The kit's cron reader (scripts/cloud/cadence.mjs, in the kit the CLI carries): { cronsOf, parseCron, cronFires }, or null. */
export async function cronTools(kitRoot) {
  try {
    const m = await import(pathToFileURL(path.join(kitRoot, 'scripts', 'cloud', 'cadence.mjs')).href);
    return m.cronsOf && m.parseCron && m.cronFires ? { cronsOf: m.cronsOf, parseCron: m.parseCron, cronFires: m.cronFires } : null;
  } catch { return null; }
}

/** The next minute (ms, UTC) any of `crons` fires after `fromMs`, within eight days; null for no schedule. */
export function nextFire(crons, fromMs, lib) {
  if (!lib || !crons?.length) return null;
  const parsed = crons.map((c) => lib.parseCron(c));
  const start = Math.floor(fromMs / 60000) * 60000 + 60000;
  for (let t = start; t < start + 8 * 24 * 3600000; t += 60000) {
    const d = new Date(t);
    if (parsed.some((c) => lib.cronFires(c, d))) return t;
  }
  return null;
}

/**
 * Wait for an idle window: no march run in a BUSY state, and the next cron at least `gapMin` minutes away.
 * { ok, next } or { ok: false, why } once `waitMs` has passed. `log` gets one line per wait.
 */
export async function waitIdle({ gh = defaultGh, cwd, crons = [], lib = null, now = Date.now, sleep = defaultSleep, waitMs, pollMs, gapMin = IDLE_GAP_MIN, log = () => {} }) {
  const end = now() + waitMs;
  for (;;) {
    const runs = await ghJson(gh, ['run', 'list', '--workflow', MARCH, '--json', 'databaseId,status,event,createdAt', '--limit', '20'], cwd) || [];
    const busy = runs.filter((r) => BUSY.includes(r.status));
    const t = now();
    const next = gapMin > 0 ? nextFire(crons, t, lib) : null;
    const gap = next == null ? Infinity : (next - t) / 60000;
    if (!busy.length && gap >= gapMin) return { ok: true, next };
    const why = busy.length
      ? `march run ${busy.map((r) => r.databaseId).join(', ')} is ${busy[0].status}`
      : `the next cron fires in ${Math.ceil(gap)} min (under ${gapMin})`;
    if (t + pollMs > end) return { ok: false, why };
    log(`waiting for an idle window: ${why}`);
    await sleep(pollMs);
  }
}

/**
 * Watch the tick dispatched at `since` (ms): the newest workflow_dispatch march run created since then (two minutes
 * of clock skew allowed), until it completes or `watchMs` passes. Then its jobs that ran and the commits it pushed on
 * `base` past `sha`. { ok, run: { id, url, conclusion }, jobs, commits } or { ok: false, run, why }.
 */
export async function watchTick({ gh = defaultGh, repo, base, sha, since, now = Date.now, sleep = defaultSleep, watchMs, pollMs, log = () => {} }) {
  const end = now() + watchMs;
  let run = null;
  for (;;) {
    const runs = await ghJson(gh, ['run', 'list', '--workflow', MARCH, '--event', 'workflow_dispatch', '--json', 'databaseId,status,conclusion,createdAt,url', '--limit', '10'], repo) || [];
    run = runs.filter((r) => Date.parse(r.createdAt) >= since - 120000).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] || null;
    if (run?.status === 'completed') break;
    if (now() + pollMs > end) return { ok: false, run: run && { id: run.databaseId, url: run.url, conclusion: null }, why: run ? `run ${run.databaseId} is still ${run.status}` : 'the dispatched run never showed up' };
    log(run ? `watching run ${run.databaseId}: ${run.status}` : 'waiting for the dispatched run to start');
    await sleep(pollMs);
  }
  const view = await ghJson(gh, ['run', 'view', String(run.databaseId), '--json', 'jobs'], repo).catch(() => null);
  const jobs = (view?.jobs || []).filter((j) => j.conclusion !== 'skipped').map((j) => `${j.name}${j.conclusion ? ` (${j.conclusion})` : ''}`);
  gitIn(repo, ['fetch', '--quiet', 'origin', `+refs/heads/${base}:refs/remotes/origin/${base}`]);
  const log1 = gitIn(repo, ['log', '--format=%h %s', `${sha}..refs/remotes/origin/${base}`]);
  const commits = log1.ok && log1.out ? log1.out.split(/\r?\n/) : [];
  return { ok: true, run: { id: run.databaseId, url: run.url, conclusion: run.conclusion }, jobs, commits };
}

/**
 * Land the commit `sha` (on local branch `branch`) onto origin's `base`. `how` owner | pr (above). `loopMode` owner
 * sets NEXUS_LOOP_MODE=owner before the push; `predicted` (the report's dispatch) tells a no-op first tick; `crons`
 * are the live march.yml's (`lib` reads them). Returns { ok, how, steps: [line], error?, pr?, tick?, noop? }.
 */
export async function land({
  repo, sha, branch, base, how, loopMode = null, predicted = null, crons = [], lib = null,
  gh = defaultGh, now = Date.now, sleep = defaultSleep, pause = true, dispatch = true, watch = true,
  waitMs = 3 * 3600000, pollMs = 30000, watchMs = 2 * 3600000, gapMin = IDLE_GAP_MIN, log = () => {},
  title = COMMIT_SUBJECT, body = '', rollback = ROLLBACK_LINE,
}) {
  const steps = [];
  const fail = (error, extra = {}) => ({ ok: false, how, steps, error, ...extra });
  if (how === 'pr') {
    const p = gitIn(repo, ['push', '--quiet', 'origin', `${sha}:refs/heads/${branch}`]);
    if (!p.ok) return fail(`git push origin ${branch} failed: ${redactUrl(p.err)}`);
    steps.push(`pushed ${branch} (${short(sha)})`);
    const r = await gh(['api', 'repos/{owner}/{repo}/pulls', '--method', 'POST', '--input', '-'], { cwd: repo, input: JSON.stringify({ title, head: branch, base, body }) });
    if (!r.ok) return fail(`opening the pull request failed: ${ghErr(r)}`);
    const pr = json(r.stdout) || {};
    steps.push(`opened pull request #${pr.number ?? '?'}${pr.html_url ? ` ${pr.html_url}` : ''}: its merge is the cut-over`);
    return { ok: true, how, steps, pr: { number: pr.number ?? null, url: pr.html_url ?? null } };
  }

  let idle;
  try { idle = await waitIdle({ gh, cwd: repo, crons, lib, now, sleep, waitMs, pollMs, gapMin, log }); } catch (e) { return fail(e.message); }
  if (!idle.ok) return fail(`no idle window within ${Math.round(waitMs / 60000)} min (${idle.why}): nothing paused, nothing pushed; run it again later`);
  steps.push(`idle window: no march run queued or running${idle.next ? `, the next cron at ${new Date(idle.next).toISOString().slice(11, 16)} UTC` : (lib && crons.length ? '' : ', no cron read')}`);

  let paused = false;
  let error = null;
  try {
    if (pause) {
      const d = await gh(['workflow', 'disable', MARCH], { cwd: repo });
      if (!d.ok) throw new Error(`gh workflow disable ${MARCH} failed: ${ghErr(d)}`);
      paused = true;
      steps.push(`paused march (gh workflow disable ${MARCH})`);
      // A run that started between the idle check and the pause still pushes: wait it out (the cron no longer fires).
      const drain = await waitIdle({ gh, cwd: repo, now, sleep, waitMs, pollMs, gapMin: 0, log });
      if (!drain.ok) throw new Error(`a march run is still going after ${Math.round(waitMs / 60000)} min (${drain.why})`);
    }
    if (loopMode === 'owner') {
      const v = await gh(['variable', 'set', 'NEXUS_LOOP_MODE', '--body', 'owner'], { cwd: repo });
      if (!v.ok) throw new Error(`gh variable set NEXUS_LOOP_MODE failed: ${ghErr(v)}`);
      steps.push('set NEXUS_LOOP_MODE=owner (the v1 loop pushed the default branch)');
    }
    const p = gitIn(repo, ['push', '--quiet', 'origin', `${sha}:refs/heads/${base}`]);
    if (!p.ok) throw new Error(`git push origin ${base} was refused (origin/${base} moved since the fetch? run the upgrade again): ${redactUrl(p.err)}`);
    steps.push(`pushed ${short(sha)} to ${base}`);
  } catch (e) {
    error = e.message;
  } finally {
    if (paused) {
      const en = await gh(['workflow', 'enable', MARCH], { cwd: repo }).catch((e) => ({ ok: false, stderr: e.message }));
      if (en.ok) steps.push(`resumed march (gh workflow enable ${MARCH})`);
      else error = `${error ? `${error}; ` : ''}march is still paused: gh workflow enable ${MARCH} failed (${ghErr(en)}); run it by hand`;
    }
  }
  if (error) return fail(error);
  if (!dispatch) return { ok: true, how, steps };

  const since = now();
  const r = await gh(['workflow', 'run', MARCH, '--ref', base], { cwd: repo });
  if (!r.ok) return fail(`gh workflow run ${MARCH} failed: ${ghErr(r)} (the upgrade is landed; the next cron runs the first v2 tick)`);
  steps.push(`dispatched the first v2 tick (gh workflow run ${MARCH})`);
  if (!watch) return { ok: true, how, steps };

  let tick;
  try { tick = await watchTick({ gh, repo, base, sha, since, now, sleep, watchMs, pollMs, log }); } catch (e) { tick = { ok: false, why: e.message }; }
  if (!tick.ok) { steps.push(`stopped watching: ${tick.why}${tick.run?.url ? ` (${tick.run.url})` : ''}`); return { ok: true, how, steps, tick }; }
  const worked = predicted && !predicted.idle;
  const noop = tick.run.conclusion !== 'success' || (worked && !tick.commits.length);
  return { ok: true, how, steps, tick, noop, ...(noop ? { rollback } : {}) };
}

/** The land result as the terminal reads it. */
export function renderLand(res, { predicted = null, red = (s) => s } = {}) {
  const out = ['', `land (${res.how})`];
  for (const s of res.steps) out.push(`  ${s}`);
  if (res.error) out.push(`  ${red(res.error)}`);
  const t = res.tick;
  if (t?.ok) {
    out.push('', 'first v2 tick');
    out.push(`  run       ${t.run.id} ${t.run.conclusion}${t.run.url ? `  ${t.run.url}` : ''}`);
    out.push(`  dispatch  ${t.jobs.length ? t.jobs.join(', ') : '(no job ran)'}`);
    out.push(`  commit    ${t.commits.length ? t.commits.join('; ') : '(none: the tick pushed nothing)'}`);
    if (predicted) out.push(`  predicted ${predicted.text}`);
    if (res.noop) {
      out.push(`  ${red(t.run.conclusion !== 'success' ? `the tick ended ${t.run.conclusion}` : 'the tick pushed nothing where the report predicted work')}: roll back with`);
      out.push(`  ${res.rollback}`);
    }
  }
  return out;
}

/** A plan/nexus.lock text pinned back to v1: version 1.0.0, ref v1.0.0, shape phases (lines added when missing). */
export function v1Lock(text) {
  if (!text) return V1_LOCK;
  let t = text.replace(/\r\n/g, '\n');
  for (const [k, v] of [['version', '1.0.0'], ['ref', 'v1.0.0'], ['shape', 'phases']]) {
    const re = new RegExp(`^${k}:.*$`, 'm');
    t = re.test(t) ? t.replace(re, `${k}: ${v}`) : `${t.replace(/\n*$/, '\n')}${k}: ${v}\n`;
  }
  return t;
}

/**
 * The rollback commit, from a fresh fetch of origin: the newest `plan: upgrade to nexus v2 (specs + chunks)` commit on
 * the default branch reverted, and plan/nexus.lock pinned back to v1.0.0, in one commit on nexus/rollback-v2. The
 * local checkout's files are untouched. { code, report }: 0 committed (or already rolled back), 1 the revert
 * conflicts with later work (nothing committed), 2 no upgrade commit or no origin.
 */
export function rollbackCommit({ repo }) {
  const top = gitIn(repo, ['rev-parse', '--show-toplevel']);
  if (!top.ok) return { code: 2, report: { error: `${repo} is not a git repository` } };
  const root = path.resolve(top.out);
  let wt;
  try { wt = freshWorktree(root); } catch (e) { return { code: e.code || 2, report: { error: e.message } }; }
  const report = { repo: root, origin: { url: wt.url, branch: wt.branch, sha: wt.sha }, rollback: true, commit: null };
  try {
    const found = gitIn(wt.dir, ['log', '--format=%H%x09%s', '-F', `--grep=${COMMIT_SUBJECT}`, 'HEAD']);
    const target = (found.ok ? found.out.split(/\r?\n/) : []).map((l) => l.split('\t')).find(([, s]) => s === COMMIT_SUBJECT)?.[0];
    if (!target) return { code: 2, report: { ...report, error: `no "${COMMIT_SUBJECT}" commit on origin/${wt.branch}: nothing to roll back` } };
    report.target = target;
    const done = gitIn(wt.dir, ['log', '--format=%H', '-F', `--grep=Reverts ${target}`, `${target}..HEAD`]);
    if (done.ok && done.out) return { code: 0, report: { ...report, message: `already rolled back by ${short(done.out.split(/\r?\n/)[0])}` } };
    const co = gitIn(wt.dir, ['checkout', '-q', '-B', ROLLBACK_BRANCH]);
    if (!co.ok) return { code: 1, report: { ...report, error: `git checkout failed: ${co.err}` } };
    const rv = gitIn(wt.dir, ['revert', '--no-commit', target]);
    if (!rv.ok) {
      const conflicts = gitIn(wt.dir, ['diff', '--name-only', '--diff-filter=U']).out.split(/\r?\n/).filter(Boolean);
      gitIn(wt.dir, ['revert', '--abort']);
      return { code: 1, report: { ...report, error: `the revert of ${short(target)} conflicts with later work${conflicts.length ? ` in ${conflicts.join(', ')}` : ''}: nothing committed; revert it by hand` } };
    }
    const lockAbs = path.join(wt.dir, 'plan', 'nexus.lock');
    const before = fs.existsSync(lockAbs) ? fs.readFileSync(lockAbs, 'utf8') : null;
    fs.mkdirSync(path.dirname(lockAbs), { recursive: true });
    fs.writeFileSync(lockAbs, v1Lock(before));
    const add = gitIn(wt.dir, ['add', '-A']);
    if (!add.ok) return { code: 1, report: { ...report, error: `git add failed: ${add.err}` } };
    const body = `Reverts ${target} (${COMMIT_SUBJECT}): the v1 plan, skills and workflow come back, and plan/nexus.lock pins v1.0.0, which the kit's v1.0.0 tag still matches.`;
    const c = gitIn(wt.dir, ['commit', '-q', '-m', ROLLBACK_SUBJECT, '-m', body]);
    if (!c.ok) return { code: 1, report: { ...report, error: `git commit failed: ${c.err}` } };
    report.commit = { sha: gitIn(wt.dir, ['rev-parse', 'HEAD']).out, branch: ROLLBACK_BRANCH, subject: ROLLBACK_SUBJECT };
    report.shape = detect(wt.dir).shape;
    report.loop = { ...loopModeOf(wt.dir, target), branch: wt.branch };
    return { code: 0, report };
  } finally {
    wt.remove();
  }
}

/** The rollback report as the terminal reads it. */
export function renderRollback(report) {
  const out = ['nexus upgrade --rollback (one revert commit on a branch; the local checkout\'s files are not touched)'];
  if (report.repo) out.push(`  repo     ${report.repo}`);
  if (report.origin) out.push(`  origin   ${report.origin.url} ${report.origin.branch} @ ${short(report.origin.sha)} (fetched now)`);
  if (report.error) { out.push('', `nexus upgrade: ${report.error}`); return out.join('\n'); }
  if (report.message) { out.push('', `${report.message}. Nothing to roll back.`); return out.join('\n'); }
  out.push('', `reverted ${short(report.target)} (${COMMIT_SUBJECT}); plan/nexus.lock pins v1.0.0 (shape: ${report.shape === 'v1' ? 'phases' : report.shape})`);
  out.push(`committed ${short(report.commit.sha)} on ${report.commit.branch}: ${report.commit.subject}`);
  return out.join('\n');
}
