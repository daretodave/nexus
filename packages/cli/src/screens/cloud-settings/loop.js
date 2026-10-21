// The cloud loop, read from what the server serves today: GET /api/cloud
// when it lands (schedule, next tick, runs with PRs and parked questions),
// else GET /api/actions (the loop's workflow, its enabled state, the
// secret) and GET /api/runs (gh run list), plus the live `runs` pushed on
// the event stream while a tab watches. Nothing here invents a time, a
// count or a sentence the server did not give.
import { useCallback, useMemo, useState } from 'react';
import { useActions, useRuns, useCloudLoop, server } from '../../data/index.js';
import { useShell } from '../../ui/index.js';

/** Workflow files that are a cloud loop (march is nexus's; nexus-loop is the design's name). */
const LOOP_FILE = /(^|\/)(nexus-loop|loop|march)\.ya?ml$/i;
const SECRET = 'CLAUDE_CODE_OAUTH_TOKEN';

export const pad2 = (n) => String(n).padStart(2, '0');

/** 03:30, local time. */
export function hhmm(t) {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 6m 12s, 41s. */
export function dur(ms) {
  if (!(ms >= 0)) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${pad2(s % 60)}s`;
  return `${Math.floor(m / 60)}h ${pad2(m % 60)}m`;
}

/** m:ss for a running clock. */
export function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

/** The start of "tonight": 18:00 local, today if it has passed, else yesterday. */
export function tonightStart(now = new Date()) {
  const d = new Date(now);
  d.setHours(18, 0, 0, 0);
  if (d > now) d.setDate(d.getDate() - 1);
  return d;
}

/** The board's day words: tonight, yesterday, else a short date. */
export function dayWord(t, now = new Date()) {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '';
  if (d >= tonightStart(now)) return 'tonight';
  const y = new Date(now); y.setHours(0, 0, 0, 0);
  if (d >= y) return 'today';
  y.setDate(y.getDate() - 1);
  if (d >= y) return 'yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "in 12 min" / "in 2 h". */
export function inWords(t, now = Date.now()) {
  const m = Math.round((new Date(t).getTime() - now) / 60000);
  if (!(m >= 0)) return '';
  if (m < 1) return 'in under a minute';
  if (m < 90) return `in ${m} min`;
  return `in ${Math.round(m / 60)} h`;
}

const baseName = (p) => String(p || '').split('/').pop();

/**
 * One gh run (or a /api/cloud run) as a timeline row:
 * { id, state: green|red|running|idle, when, day, n, t, d, chips, dur, url, startedAt }.
 * chips: [{ kind: 'pr'|'ci'|'parked'|'plain'|'done', label, num, state }].
 */
export function toRow(r, now = new Date()) {
  if (r.t || r.title) {
    // /api/cloud already speaks the board's language.
    return {
      id: String(r.id), state: r.state || 'idle', when: r.when || hhmm(r.at), day: r.day || dayWord(r.at, now),
      n: r.n || (r.number ? `#${r.number}` : ''), t: r.t || r.title, d: r.d || r.detail || '', chips: r.chips || [],
      dur: r.dur || '', url: r.url || '', startedAt: r.at,
    };
  }
  const done = r.status === 'completed';
  const state = !done ? 'running' : r.conclusion === 'success' ? 'green' : r.conclusion === 'failure' || r.conclusion === 'timed_out' ? 'red' : 'idle';
  const chips = [];
  if (!done && r.stalled) chips.push({ kind: 'plain', label: 'stalled · queued over 2 min' });
  else if (!done) chips.push({ kind: 'ci', state: 'running', label: r.status === 'in_progress' ? 'running' : r.status });
  else if (state === 'red') chips.push({ kind: 'ci', state: 'red', label: r.conclusion === 'timed_out' ? 'timed out' : 'failed' });
  else if (state === 'idle' && r.conclusion) chips.push({ kind: 'plain', label: r.conclusion });
  const how = r.event === 'schedule' ? 'scheduled tick' : r.event === 'workflow_dispatch' ? 'run by hand' : r.event || '';
  return {
    id: String(r.databaseId),
    state,
    when: hhmm(r.createdAt),
    day: dayWord(r.createdAt, now),
    n: r.number ? `#${r.number}` : '',
    t: r.displayTitle || r.workflowName || 'Run',
    d: [r.displayTitle && r.displayTitle !== r.workflowName ? r.workflowName : '', how].filter(Boolean).join(' · '),
    chips,
    dur: done ? dur(Date.parse(r.updatedAt) - Date.parse(r.createdAt)) : '',
    url: r.url || '',
    startedAt: r.createdAt,
  };
}

/**
 * Everything the Cloud loop and Settings screens show about the loop.
 * status: 'loading' | 'nogh' | 'none' (no loop workflow) | 'ready'.
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
    return s ? { name: SECRET, ok: !!s.ok, detail: s.detail, fix: s.fix } : null;
  }, [c, a]);

  const serverPaused = c && typeof c.paused === 'boolean' ? c.paused : wf ? !wf.enabled : null;
  const paused = override ?? serverPaused;

  const status = c ? 'ready'
    : actions.status === 'loading' || cloud.status === 'loading' ? 'loading'
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
    runsError: runsRes.data && runsRes.data.ok === false ? runsRes.data.error : null,
    setPaused,
    reload: () => { actions.reload(); runsRes.reload(); cloud.reload(); },
  };
}
