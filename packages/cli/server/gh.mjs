// GitHub Actions setup and live runs, through the person's own `gh` login.
// Run state is observed only (gh run list / view); nothing here infers
// progress from a clock. A run still queued after STALL_MS reads "stalled";
// a step running longer than STEP_STALL_MS reads "stalled" on its own.
// Every call that reaches gh takes `{ run }`, so tests inject a fake gh as
// a function and never rely on PATH shadowing.
import fs from 'node:fs';
import path from 'node:path';
import { run as shRun, json } from './sh.mjs';

export const STALL_MS = 2 * 60 * 1000;
export const STEP_STALL_MS = 30 * 60 * 1000;
export const POLL_MS = 8000;
export const SECRET = 'CLAUDE_CODE_OAUTH_TOKEN';
/** Workflow files that are a cloud loop (march is nexus's; nexus-loop is the design's name). */
export const LOOP_FILE = /(^|\/)(nexus-loop|loop|march)\.ya?ml$/i;
/** Repo roles that may enable, disable and dispatch a workflow. */
export const CONTROL_ROLES = ['ADMIN', 'MAINTAIN', 'WRITE'];
/** Live runs whose jobs are read per poll (a gh call each). */
const MAX_LIVE = 3;

const ID = /^[0-9]+$/;

/**
 * The gh arguments behind each Actions button. One place, so a test can
 * pin that Pause disables, Resume enables and "Run one pass now"
 * dispatches, and nothing else.
 */
export function workflowCommand(action, id) {
  if (!ID.test(String(id))) return null;
  const verb = { pause: 'disable', resume: 'enable', run: 'run' }[action];
  return verb ? ['workflow', verb, String(id)] : null;
}

/** Does a workflow file declare its own token permissions (any `permissions:` key)? */
export function declaresPermissions(yaml) {
  return /^\s*permissions\s*:/m.test(String(yaml || ''));
}

/**
 * The permission checks, least privilege first.
 * - control: the person's own role. WRITE, MAINTAIN or ADMIN may pause,
 *   resume and dispatch; READ and TRIAGE may not. A role gh could not
 *   read is unknown (ok: null), not a failure: gh says so on the click.
 * - permissions: the workflow token. A loop file that declares its own
 *   per-job `permissions:` works under the repo's read-only default,
 *   which is the least-privilege setting and the one to keep. Only a
 *   file that declares nothing needs the repo default at write.
 * @param {{ viewer?: string|null, defaultPerm?: string|null, declares?: boolean|null, file?: string|null }} o
 */
export function permissionSteps({ viewer = null, defaultPerm = null, declares = null, file = null } = {}) {
  const role = viewer ? String(viewer).toUpperCase() : null;
  const can = role ? CONTROL_ROLES.includes(role) : null;
  const name = file || 'the loop workflow';
  let tokenOk;
  let detail;
  if (declares) {
    tokenOk = true;
    detail = `${name} declares its own permissions per job; repo default: ${defaultPerm || 'unread'}${defaultPerm === 'read' ? ' (least privilege)' : ''}`;
  } else if (defaultPerm === 'write') {
    tokenOk = true;
    detail = `repo default: write${declares === false ? `; ${name} declares no permissions of its own` : ''}`;
  } else if (defaultPerm === 'read' && declares === false) {
    tokenOk = false;
    detail = `repo default: read, and ${name} declares no permissions of its own`;
  } else {
    tokenOk = null;
    detail = defaultPerm ? `repo default: ${defaultPerm}; ${name} not read` : 'could not read the workflow token default (reading it needs admin)';
  }
  return [
    {
      id: 'control',
      label: 'You can pause and run the loop',
      ok: can,
      optional: true,
      detail: role ? `your role: ${role.toLowerCase()}` : 'could not read your role on the repo',
      fix: can === false ? 'Pausing and dispatching need write (or maintain) on the repo. A fine-grained token needs Actions: read and write, nothing more.' : null,
    },
    {
      id: 'permissions',
      label: 'Workflow token has what the loop needs',
      ok: tokenOk,
      detail,
      fix: tokenOk === false ? `Add a permissions block to ${name} (contents: write, issues: write, id-token: write) and keep the repo default at read. Or set Settings -> Actions -> General -> Workflow permissions to Read and write.` : null,
    },
  ];
}

function readLocal(repo, rel) {
  if (!repo || !rel || !/^\.github\/workflows\/[\w.-]+\.ya?ml$/.test(rel)) return null;
  try { return fs.readFileSync(path.join(repo, rel), 'utf8'); } catch { return null; }
}

export async function actionsSetup(repo, { run = shRun } = {}) {
  const auth = await run('gh', ['auth', 'status'], { cwd: repo });
  if (!auth.ok) return { gh: false, note: auth.missing ? 'gh is not installed.' : 'gh is not signed in. Run `gh auth login`.' };
  const [secrets, workflows, perms, rulesets, viewer] = await Promise.all([
    run('gh', ['secret', 'list', '--json', 'name'], { cwd: repo }),
    run('gh', ['workflow', 'list', '--all', '--json', 'id,name,path,state'], { cwd: repo }),
    run('gh', ['api', 'repos/{owner}/{repo}/actions/permissions/workflow'], { cwd: repo }),
    run('gh', ['api', 'repos/{owner}/{repo}/rulesets'], { cwd: repo }),
    run('gh', ['repo', 'view', '--json', 'viewerPermission'], { cwd: repo }),
  ]);
  const names = secrets.ok ? (json(secrets.stdout) || []).map((s) => s.name) : null;
  const p = perms.ok ? json(perms.stdout) || {} : {};
  const rs = json(rulesets.stdout);
  const wfs = (json(workflows.stdout) || []).map((w) => ({ id: w.id, name: w.name, path: w.path, enabled: w.state === 'active', state: w.state }));
  const loop = wfs.find((w) => LOOP_FILE.test(w.path || ''));
  const text = loop ? readLocal(repo, loop.path) : null;
  return {
    gh: true,
    steps: [
      {
        id: 'secret',
        label: `${SECRET} repo secret`,
        // Listing secrets needs admin (or Secrets: read); without it the secret is unknown, not missing.
        ok: names ? names.includes(SECRET) : null,
        detail: names ? (names.length ? `secrets: ${names.join(', ')}` : 'no repo secrets') : 'could not list secrets (that needs admin on the repo); the loop\'s first run says if it is missing',
        fix: `Run \`claude setup-token\`, then \`gh secret set ${SECRET}\` and paste the token.`,
      },
      ...permissionSteps({
        viewer: viewer.ok ? (json(viewer.stdout) || {}).viewerPermission || null : null,
        defaultPerm: p.default_workflow_permissions || null,
        declares: text == null ? null : declaresPermissions(text),
        file: loop ? path.posix.basename(loop.path) : null,
      }),
      {
        id: 'rulesets',
        label: 'Rulesets on main and claims',
        ok: Array.isArray(rs) && rs.length > 0,
        optional: true,
        detail: Array.isArray(rs) ? (rs.length ? rs.map((r) => `${r.name} (${r.enforcement})`).join(', ') : 'none') : 'could not read rulesets',
        fix: 'Optional in owner mode. In PR mode, protect main so only pull requests land.',
      },
    ],
    workflows: wfs,
  };
}

/** Pause (enabled: false) or resume (enabled: true) one workflow. */
export async function setWorkflow(repo, id, enabled, { run = shRun } = {}) {
  const args = workflowCommand(enabled ? 'resume' : 'pause', id);
  if (!args) return { ok: false, error: 'bad workflow id' };
  const r = await run('gh', args, { cwd: repo });
  return { ok: r.ok, out: (r.stdout + r.stderr).trim() };
}

/**
 * "Run one pass now": dispatch the workflow on its default branch with its
 * default inputs. With no id, the loop workflow (LOOP_FILE) is found first.
 */
export async function dispatchWorkflow(repo, id, { run = shRun } = {}) {
  if (id == null || id === '') {
    const l = await run('gh', ['workflow', 'list', '--all', '--json', 'id,path'], { cwd: repo });
    const loop = (json(l.stdout) || []).find((w) => LOOP_FILE.test(w.path || ''));
    if (!loop) return { ok: false, status: l.ok ? 409 : 502, error: l.ok ? 'no loop workflow in this repo' : 'gh could not list workflows' };
    id = loop.id;
  }
  const args = workflowCommand('run', id);
  if (!args) return { ok: false, status: 400, error: 'bad workflow id' };
  const r = await run('gh', args, { cwd: repo });
  const out = (r.stdout + r.stderr).trim();
  return r.ok ? { ok: true, id: String(id), out } : { ok: false, status: 502, out, error: out || 'gh refused the dispatch' };
}

const when = (t) => {
  const ms = Date.parse(t || '');
  return ms > Date.UTC(2000, 0, 1) ? ms : null; // gh reports a step not yet started as 0001-01-01
};
const WAITING = new Set(['queued', 'waiting', 'pending', 'requested']);

/**
 * Per-step status of one run from `gh run view --json jobs`.
 * current: the step running now (one per running job; the first is kept).
 * stalls:  each step running longer than stepMs, and each job still waiting
 *          for a runner after queueMs (measured from `since`, the run's start,
 *          when gh gives the job no start of its own).
 */
export function stepStatus(jobs, now, { stepMs = STEP_STALL_MS, queueMs = STALL_MS, since = null } = {}) {
  const current = [];
  const stalls = [];
  for (const j of Array.isArray(jobs) ? jobs : []) {
    if (WAITING.has(j.status)) {
      const from = when(j.startedAt) ?? when(since);
      const ms = from == null ? null : now - from;
      if (ms != null && ms > queueMs) stalls.push({ kind: 'queued', job: j.name, name: 'waiting for a runner', ms });
      continue;
    }
    if (j.status !== 'in_progress') continue;
    for (const s of Array.isArray(j.steps) ? j.steps : []) {
      if (s.status !== 'in_progress') continue;
      const from = when(s.startedAt);
      const ms = from == null ? null : now - from;
      const stalled = ms != null && ms > stepMs;
      current.push({ job: j.name, name: s.name, number: s.number, ms, stalled });
      if (stalled) stalls.push({ kind: 'step', job: j.name, name: s.name, ms });
    }
  }
  return { current: current[0] || null, stalls };
}

export async function runJobs(repo, id, { run = shRun, now = Date.now(), since = null, stepMs } = {}) {
  if (!ID.test(String(id))) return { ok: false, error: 'bad run id' };
  const r = await run('gh', ['run', 'view', String(id), '--json', 'jobs'], { cwd: repo });
  if (!r.ok) return { ok: false, error: (r.stderr || '').trim().slice(0, 300) };
  const jobs = (json(r.stdout) || {}).jobs || [];
  return { ok: true, ...stepStatus(jobs, now, { since, stepMs }) };
}

export async function listRuns(repo, { run = shRun, now = Date.now(), stepMs } = {}) {
  const r = await run('gh', ['run', 'list', '-L', '20', '--json', 'databaseId,number,displayTitle,workflowName,status,conclusion,createdAt,updatedAt,url,event'], { cwd: repo });
  if (!r.ok) return { ok: false, runs: [], error: (r.stderr || '').trim().slice(0, 300) };
  const runs = (json(r.stdout) || []).map((x) => markStall(x, now));
  // Step status only for the few runs still going: a gh call each.
  const live = runs.filter((x) => x.status !== 'completed').slice(0, MAX_LIVE);
  await Promise.all(live.map(async (x) => {
    const j = await runJobs(repo, x.databaseId, { run, now, since: x.createdAt, stepMs });
    x.steps = j.ok ? { current: j.current, stalls: j.stalls } : null;
  }));
  return { ok: true, runs };
}

export function markStall(runRow, now) {
  const queuedFor = now - Date.parse(runRow.createdAt || 0);
  return { ...runRow, stalled: runRow.status === 'queued' && queuedFor > STALL_MS };
}

/**
 * Turn a fresh run list into loop beats against what was seen before.
 * `seen` maps run id -> last status. A run first seen already completed
 * is history, not news: it is recorded without a beat.
 */
export function runBeats(runs, seen) {
  const out = [];
  for (const r of runs) {
    const id = String(r.databaseId);
    const before = seen.get(id);
    const now = r.status;
    seen.set(id, now);
    if (before === now) continue;
    if (before === undefined && now === 'completed') continue;
    const name = r.workflowName || r.displayTitle || '';
    if (now === 'queued' || now === 'waiting' || now === 'requested' || now === 'pending') out.push({ k: 'loop', p: 'dispatch', id, name });
    else if (now === 'in_progress') out.push({ k: 'loop', p: 'run', id, name });
    else if (now === 'completed') out.push({ k: 'loop', p: 'conclude', id, name, conclusion: r.conclusion || 'unknown' });
  }
  return out;
}

/** After a loop run completes, how long a PR it opened may take to show its creation time. */
const PR_SLACK_MS = 2 * 60 * 1000;

/**
 * GET /api/cloud, as far as gh can say it today (41.7): the loop workflow (LOOP_FILE), whether it is paused (disabled)
 * or running a pass, and tonight's PRs opened by the loop since `since` (ms). A PR counts as the loop's when it was
 * created while one of the loop's runs was going (from its start to its end, plus PR_SLACK_MS): the loop pushes on the
 * owner's token, so the PR's author cannot tell it apart. `prs` is null when gh could not list the runs or the PRs.
 * No loop workflow: { ok: false, status: 404 } (the screens draw their empty state); gh failing: status 502.
 */
export async function cloudLoop(repo, { run = shRun, now = Date.now(), since = 0 } = {}) {
  const wl = await run('gh', ['workflow', 'list', '--all', '--json', 'id,name,path,state'], { cwd: repo });
  if (!wl.ok) return { ok: false, status: 502, error: (wl.stderr || 'gh could not list workflows').trim().slice(0, 300) };
  const loop = (json(wl.stdout) || []).find((w) => LOOP_FILE.test(w.path || ''));
  if (!loop || !ID.test(String(loop.id))) return { ok: false, status: 404, error: 'no loop workflow in this repo' };
  const [runs, prs] = await Promise.all([
    run('gh', ['run', 'list', '--workflow', String(loop.id), '-L', '50', '--json', 'databaseId,status,createdAt,updatedAt'], { cwd: repo }),
    run('gh', ['pr', 'list', '--state', 'all', '-L', '100', '--json', 'number,createdAt'], { cwd: repo }),
  ]);
  const runList = runs.ok ? json(runs.stdout) : null;
  const prList = prs.ok ? json(prs.stdout) : null;
  const windows = (Array.isArray(runList) ? runList : [])
    .map((r) => [Date.parse(r.createdAt), r.status === 'completed' ? Date.parse(r.updatedAt) + PR_SLACK_MS : now])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= since);
  const opened = Array.isArray(runList) && Array.isArray(prList)
    ? prList.filter((p) => { const t = Date.parse(p.createdAt); return t >= since && windows.some(([a, b]) => t >= a && t <= b); }).length
    : null;
  return {
    ok: true,
    live: true,
    workflow: { id: loop.id, name: loop.name, path: loop.path, enabled: loop.state === 'active', state: loop.state },
    paused: loop.state !== 'active',
    running: Array.isArray(runList) && runList.some((r) => r.status && r.status !== 'completed'),
    tonight: { since: new Date(since).toISOString(), prs: opened },
  };
}
