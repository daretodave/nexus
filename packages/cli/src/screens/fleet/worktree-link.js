// Where a worktree row on the git panel opens (GitPanel board's per-row
// "open" link). A session's worktree opens its cockpit, or Recover when the
// session fell over. A worktree no session holds (orphaned: git lists it and
// its folder is gone; or idle) opens the panel's /tidy dry run for that
// branch, which says whether /tidy would close it and why. Closing it stays
// /tidy's job, in a terminal.
import { PATHS } from '../../routes.js';

const DETACHED = '(detached)';

export function wtHref(w) {
  if (w.sessionId) {
    if (w.flag === 'fallen') return w.run ? `${PATHS.recover}?dir=${encodeURIComponent(w.run)}` : PATHS.recover;
    return PATHS.cockpit(w.sessionId);
  }
  const b = w.branch && w.branch !== DETACHED ? w.branch : '1';
  return `${PATHS.git}?tidy=${encodeURIComponent(b)}`;
}

/**
 * What the dry run (GET /api/git/tidy) does with the branch a link named:
 * { go, text }, or null when no branch was named or the plan is not read yet.
 */
export function tidyVerdict(plan, branch) {
  if (!plan || !branch || branch === '1') return null;
  const go = (plan.worktrees || []).find((w) => w.branch === branch);
  if (go) return { go: true, text: `${branch} would go: ${go.why || 'nothing holds it.'}` };
  if ((plan.holds || []).some((w) => w.branch === branch)) return { go: false, text: `${branch} stays: it holds work, so /tidy asks before closing it.` };
  return { go: false, text: `${branch} stays: a session, an open pull request, a live lock or uncommitted work keeps it.` };
}
