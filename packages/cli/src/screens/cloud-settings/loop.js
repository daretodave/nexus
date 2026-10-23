// The cloud loop, read from what the server serves today: GET /api/cloud
// when it lands (schedule, next tick, runs with PRs and parked questions),
// else GET /api/actions (the loop's workflow, its enabled state, the
// secret) and GET /api/runs (gh run list), plus the live `runs` pushed on
// the event stream while a tab watches. Nothing here invents a time, a
// count or a sentence the server did not give.
import { useCallback, useMemo, useState } from 'react';
import { useActions, useRuns, useCloudLoop, server } from '../../data/index.js';
import { useShell } from '../../ui/index.js';
import { toRow } from './rows.js';

export * from './rows.js';

/** Workflow files that are a cloud loop (march is nexus's; nexus-loop is the design's name). */
const LOOP_FILE = /(^|\/)(nexus-loop|loop|march)\.ya?ml$/i;
const SECRET = 'CLAUDE_CODE_OAUTH_TOKEN';

const baseName = (p) => String(p || '').split('/').pop();
/** Places with no GitHub repo for the loop yet (server/place.mjs NO_ORIGIN, as /api/actions reports them). */
const NOREPO = new Set(['none', 'refused', 'local', 'unpushed']);

/**
 * Everything the Cloud loop and Settings screens show about the loop.
 * status: 'loading' | 'norepo' (not on GitHub yet: no repo, or no origin) | 'nogh' | 'none' (no loop workflow) | 'ready'.
 */
export function useLoop() {
  const { live } = useShell();
  const cloud = useCloudLoop();
  const actions = useActions();
  const runsRes = useRuns(8000);
  const [override, setOverride] = useState(null); // optimistic paused flag
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const c = cloud.status === 'ready' ? cloud.data || {} : null;
  const a = actions.status === 'ready' ? actions.data || {} : null;

  const wf = useMemo(() => {
    if (c?.workflow) return c.workflow;
    const list = a?.workflows || [];
    return list.find((w) => LOOP_FILE.test(w.path || '')) || null;
  }, [c, a]);

  const secret = useMemo(() => {
    if (c?.secret) return c.secret;
    const s = (a?.steps || []).find((x) => x.id === 'secret');
    // ok: null when gh could not list secrets (least privilege): unknown, not missing.
    return s ? { name: SECRET, ok: s.ok == null ? null : !!s.ok, detail: s.detail, fix: s.fix } : null;
  }, [c, a]);

  const serverPaused = c && typeof c.paused === 'boolean' ? c.paused : wf ? !wf.enabled : null;
  const paused = override ?? serverPaused;

  const status = c ? 'ready'
    : actions.status === 'loading' || cloud.status === 'loading' ? 'loading'
      : a && NOREPO.has(a.place) ? 'norepo'
        : a && a.gh === false ? 'nogh'
        : !wf ? (actions.status === 'error' ? 'error' : 'none')
          : 'ready';

  const runs = useMemo(() => {
    if (c?.runs) return c.runs.map((r) => toRow(r));
    const pushed = live?.runs && live.runs.length ? live.runs : null;
    const all = pushed || runsRes.data?.runs || [];
    const names = wf ? new Set([wf.name]) : null;
    return all.filter((r) => !names || names.has(r.workflowName)).map((r) => toRow(r));
  }, [c, live?.runs, runsRes.data, wf]);

  const setPaused = useCallback(async (on) => {
    if (!wf || pending) return;
    setPending(true);
    setError(null);
    setOverride(on);
    try {
      const r = await server.setWorkflow(wf.id, !on);
      if (r && r.ok === false) throw new Error(r.out || r.error || 'gh refused');
      await actions.reload();
      cloud.reload();
      setOverride(null);
    } catch (e) {
      setOverride(null);
      setError(e.message);
    } finally {
      setPending(false);
    }
  }, [wf, pending, actions, cloud]);

  return {
    status,
    note: a?.note || actions.error || null,
    cloud: c,
    wf,
    file: baseName(wf?.path) || null,
    secret,
    paused,
    pending,
    error,
    next: c?.next || null, // ISO time of the next tick, only from /api/cloud
    schedule: c?.schedule || null, // { label, window, cron }, only from /api/cloud
    runs,
    runsError: runsRes.data && runsRes.data.ok === false ? runsRes.data.error || runsRes.data.note || null : null,
    // For the sign-in walkthrough (TokenGuide): the repo, the place, gh and the person's role on the repo.
    repoSlug: a?.slug || null,
    place: a?.place || null,
    gh: a ? a.gh : undefined,
    viewer: a?.viewer ?? null,
    reloadActions: () => actions.reload(),
    setPaused,
    reload: () => { actions.reload(); runsRes.reload(); cloud.reload(); },
  };
}
