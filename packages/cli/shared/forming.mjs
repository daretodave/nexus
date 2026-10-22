// A GUI session's worktree, made behind an open cockpit (spec 47, A4). POST /api/sessions answers at once with the
// session's id and star; the worktree forms after it, and the session's own channel carries where that stands as
// `status.form`. The cockpit draws it on the agent stage and holds the composer until the worktree is ready.
//
//   forming   the worktree is being made: { branch, worktree, root, why, line, at, attempt }
//   ready     the session works in it (the composer opens; held prompts go)
//   failed    git refused: { error }; Retry forms it again in the same place
//
// One pure step function, used by the server (server/fleet.mjs formPlace) and read by the cockpit.

export const FORM_STATES = Object.freeze(['forming', 'ready', 'failed']);

/** Why the worktree root was picked (server/fleet.mjs worktreeRoot), in words for the stage. */
export const ROOT_WHY = Object.freeze({
  config: 'the worktreeRoot in .nexus/local.json',
  convention: "where this repo's worktrees already live",
  kit: "the kit's default, beside the repo",
});

/** A form starting: the place it forms in. */
export function formStart({ branch = '', worktree = '', root = '', why = '' } = {}, now = Date.now()) {
  return { state: 'forming', branch, worktree, root, why, line: '', error: null, at: now, attempt: 1 };
}

/**
 * The next form for an event, or the same object when the event does not apply in this state.
 *   { type: 'progress', line }   forming -> forming, the latest line git (or a hook under it) printed
 *   { type: 'ready' }            forming -> ready
 *   { type: 'fail', error }      forming -> failed
 *   { type: 'retry' }            failed  -> forming, the next attempt
 */
export function formNext(form, ev, now = Date.now()) {
  if (!form || !ev) return form;
  const s = form.state;
  if (s === 'forming' && ev.type === 'progress') {
    const line = lastLine(ev.line);
    return line ? { ...form, line } : form;
  }
  if (s === 'forming' && ev.type === 'ready') return { ...form, state: 'ready', line: '', error: null, readyAt: now };
  if (s === 'forming' && ev.type === 'fail') return { ...form, state: 'failed', error: lastLine(ev.error) || 'git worktree add failed', failedAt: now };
  if (s === 'failed' && ev.type === 'retry') return { ...form, state: 'forming', line: '', error: null, at: now, attempt: (form.attempt || 1) + 1 };
  return form;
}

/** Whether a session can take a prompt now: no form, or a ready one. */
export const formReady = (form) => !form || form.state === 'ready';

/** The last non-empty line of what a program printed (git's progress rewrites its line with \r). */
export function lastLine(text) {
  const lines = String(text || '').split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
  return (lines[lines.length - 1] || '').slice(0, 200);
}

/** The words the stage shows for a form: { title, sub }, or null when there is nothing to show. */
export function formWords(form, now = Date.now()) {
  if (!form || form.state === 'ready') return null;
  const where = form.branch ? `checking out ${form.branch}` : 'making its worktree';
  if (form.state === 'failed') return { title: 'The star did not form', sub: form.error || 'git could not make the worktree' };
  const secs = form.at != null ? Math.max(0, Math.floor((now - form.at) / 1000)) : 0;
  return { title: 'A star is forming', sub: `${where}...${secs >= 5 ? ` ${secs}s` : ''}` };
}
