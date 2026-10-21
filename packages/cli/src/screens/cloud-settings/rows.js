// The cloud loop's pure view rules: times, durations, and one gh run (or a
// /api/cloud run) as a timeline row with its chips, per-step stalls among
// them. No React, so node --test reads it directly.

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


/**
 * A live run's stalled steps as chips (the server's per-step status from
 * gh run view --json jobs): "stalled · Run /march · 34m 10s".
 */
export function stepStalls(r) {
  const stalls = r && r.steps && Array.isArray(r.steps.stalls) ? r.steps.stalls : [];
  return stalls.map((s) => ({ kind: 'parked', label: ['stalled', s.name, dur(s.ms)].filter(Boolean).join(' · ') }));
}

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
  const cur = !done && r.steps ? r.steps.current : null;
  if (!done && r.stalled) chips.push({ kind: 'plain', label: 'stalled · queued over 2 min' });
  else if (cur && !cur.stalled) chips.push({ kind: 'ci', state: 'running', label: `running · ${cur.name}` });
  else if (!done && !cur) chips.push({ kind: 'ci', state: 'running', label: r.status === 'in_progress' ? 'running' : r.status });
  if (!done && !r.stalled) for (const s of stepStalls(r)) chips.push(s);
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
