// GitHub Actions setup and live runs, through the person's own `gh` login.
// Run state is observed only (gh run list / view); nothing here infers
// progress from a clock. A run still queued after STALL_MS reads "stalled".
import { run, json } from './sh.mjs';

export const STALL_MS = 2 * 60 * 1000;
export const POLL_MS = 8000;
export const SECRET = 'CLAUDE_CODE_OAUTH_TOKEN';

export async function actionsSetup(repo) {
  const auth = await run('gh', ['auth', 'status'], { cwd: repo });
  if (!auth.ok) return { gh: false, note: auth.missing ? 'gh is not installed.' : 'gh is not signed in. Run `gh auth login`.' };
  const [secrets, workflows, perms, rulesets] = await Promise.all([
    run('gh', ['secret', 'list', '--json', 'name'], { cwd: repo }),
    run('gh', ['workflow', 'list', '--all', '--json', 'id,name,path,state'], { cwd: repo }),
    run('gh', ['api', 'repos/{owner}/{repo}/actions/permissions/workflow'], { cwd: repo }),
    run('gh', ['api', 'repos/{owner}/{repo}/rulesets'], { cwd: repo }),
  ]);
  const names = (json(secrets.stdout) || []).map((s) => s.name);
  const p = json(perms.stdout) || {};
  const rs = json(rulesets.stdout);
  return {
    gh: true,
    steps: [
      {
        id: 'secret',
        label: `${SECRET} repo secret`,
        ok: names.includes(SECRET),
        detail: secrets.ok ? (names.length ? `secrets: ${names.join(', ')}` : 'no repo secrets') : 'could not list secrets (needs admin on the repo)',
        fix: `Run \`claude setup-token\`, then \`gh secret set ${SECRET}\` and paste the token.`,
      },
      {
        id: 'permissions',
        label: 'Workflow token can write',
        ok: p.default_workflow_permissions === 'write',
        detail: perms.ok ? `default: ${p.default_workflow_permissions || 'unknown'}; may approve PRs: ${p.can_approve_pull_request_reviews ? 'yes' : 'no'}` : 'could not read workflow permissions',
        fix: 'Settings -> Actions -> General -> Workflow permissions: Read and write.',
      },
      {
        id: 'rulesets',
        label: 'Rulesets on main and claims',
        ok: Array.isArray(rs) && rs.length > 0,
        optional: true,
        detail: Array.isArray(rs) ? (rs.length ? rs.map((r) => `${r.name} (${r.enforcement})`).join(', ') : 'none') : 'could not read rulesets',
        fix: 'Optional in owner mode. In PR mode, protect main so only pull requests land.',
      },
    ],
    workflows: (json(workflows.stdout) || []).map((w) => ({ id: w.id, name: w.name, path: w.path, enabled: w.state === 'active', state: w.state })),
  };
}

export async function setWorkflow(repo, id, enabled) {
  if (!/^[0-9]+$/.test(String(id))) return { ok: false, error: 'bad workflow id' };
  const r = await run('gh', ['workflow', enabled ? 'enable' : 'disable', String(id)], { cwd: repo });
  return { ok: r.ok, out: (r.stdout + r.stderr).trim() };
}

export async function listRuns(repo) {
  const r = await run('gh', ['run', 'list', '-L', '20', '--json', 'databaseId,number,displayTitle,workflowName,status,conclusion,createdAt,updatedAt,url,event'], { cwd: repo });
  if (!r.ok) return { ok: false, runs: [], error: (r.stderr || '').trim().slice(0, 300) };
  return { ok: true, runs: (json(r.stdout) || []).map((x) => markStall(x, Date.now())) };
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
