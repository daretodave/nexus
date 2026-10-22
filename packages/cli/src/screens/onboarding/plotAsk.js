// The session onboarding's Plot step starts (POST /api/plot) keeps working while the person moves on, and it can stop
// on a permission or a question nobody sees (spec 47, A15). These read its live channel (useEvents(id), the same
// store the cockpit draws): what it waits on, in one line, and which session Launch's "Open the cockpit" opens.
// Pure, no React.

import { toolArgFromJson } from '../../../shared/tool-arg.mjs';

const MAX = 120;
const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const clip = (s) => (s.length > MAX ? `${s.slice(0, MAX - 1)}…` : s);

/**
 * A permission request as a cockpit tool row reads it: the tool, its one argument (a Bash command, else its
 * description; another tool's path, pattern or url) on one line and clipped, and the full argument for the tooltip.
 * The view's `args` when the server sends it, else the argument read out of its (possibly clipped) JSON summary,
 * else its reason; never the raw JSON.
 * @returns {{ tool: string, args: string, full: string }}
 */
export function permissionArgs(p) {
  if (!p) return { tool: '', args: '', full: '' };
  const tool = p.tool || '';
  const full = String(p.args || toolArgFromJson(tool, p.summary) || p.reason || '');
  return { tool, args: clip(oneLine(full)), full };
}

/** The same as one plain line: "Bash: npm test". */
export function permissionLine(p) {
  const { tool, args } = permissionArgs(p);
  return tool ? (args ? `${tool}: ${args}` : tool) : args;
}

/**
 * What the plot session waits on, first come first: a permission (answered inline, Allow or Deny) before a question
 * (answered in the cockpit). null when it waits on nothing.
 * @returns {{ kind: 'perm'|'ask', id: string, line: string, tool: string, args: string, full: string } | null}
 */
export function pendingAsk(live) {
  const perm = live?.permissions?.[0];
  if (perm) return { kind: 'perm', id: perm.id, line: permissionLine(perm), ...permissionArgs(perm) };
  const ask = live?.asks?.[0];
  if (ask) {
    const q = ask.questions?.[0]?.question || 'a question';
    const more = (ask.questions?.length || 0) > 1 ? ` (+${ask.questions.length - 1} more)` : '';
    const line = clip(`${oneLine(q)}${more}`);
    return { kind: 'ask', id: ask.id, line, tool: '', args: line, full: oneLine(q) };
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
