// The session onboarding's Plot step starts (POST /api/plot) keeps working while the person moves on, and it can stop
// on a permission or a question nobody sees (spec 47, A15). These read its live channel (useEvents(id), the same
// store the cockpit draws): what it waits on, in one line, and which session Launch's "Open the cockpit" opens.
// Pure, no React.

const MAX = 120;
const clip = (s) => (s.length > MAX ? `${s.slice(0, MAX - 1)}…` : s);

/** One line for a permission request: the command, file, pattern or url it would touch, else its reason or input. */
export function permissionLine(p) {
  if (!p) return '';
  let input = null;
  try { input = JSON.parse(p.summary || ''); } catch { /* summary is clipped at 400 chars: fall back to the raw text */ }
  const what = input && typeof input === 'object'
    ? input.command || input.file_path || input.path || input.pattern || input.url || input.description || null
    : null;
  const body = String(what || p.reason || p.summary || '').replace(/\s+/g, ' ').trim();
  return clip(p.tool ? (body ? `${p.tool}: ${body}` : p.tool) : body);
}

/**
 * What the plot session waits on, first come first: a permission (answered inline, Allow or Deny) before a question
 * (answered in the cockpit). null when it waits on nothing.
 * @returns {{ kind: 'perm', id: string, line: string } | { kind: 'ask', id: string, line: string } | null}
 */
export function pendingAsk(live) {
  const perm = live?.permissions?.[0];
  if (perm) return { kind: 'perm', id: perm.id, line: permissionLine(perm) };
  const ask = live?.asks?.[0];
  if (ask) {
    const q = ask.questions?.[0]?.question || 'a question';
    const more = (ask.questions?.length || 0) > 1 ? ` (+${ask.questions.length - 1} more)` : '';
    return { kind: 'ask', id: ask.id, line: clip(`${String(q).replace(/\s+/g, ' ').trim()}${more}`) };
  }
  return null;
}

/** The plot session is still working: running, or waiting on the person. */
export function plotWorking(live) {
  if (!live) return false;
  if (live.status?.hosted === false) return false;
  return live.status?.state === 'running' || !!pendingAsk(live);
}

/**
 * Which session Launch's "Open the cockpit" opens: the plot session while it still works (never a second session
 * beside it), the home session to adopt a new repo, else a new session.
 * @returns {{ kind: 'plot', id: string, name: string } | { kind: 'adopt' } | { kind: 'new' }}
 */
export function launchTarget({ adopted, plot, live }) {
  if (plot?.id && plotWorking(live)) return { kind: 'plot', id: plot.id, name: plot.name || '' };
  return adopted ? { kind: 'new' } : { kind: 'adopt' };
}
