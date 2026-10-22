// The Cloud step's writes wait for the server. Adding the workflow and saving the schedule commit to the repo, and
// the commit runs the repo's own checks (its gate before commit), which can take minutes: the step shows that it is
// working, moves on only once the call answered, and an error keeps the person on the step with the server's words.

export const BUSY_NOTE = 'Committing: your repo\'s checks are running...';

/**
 * Run `call`, then advance. busy() at once; done(result) and go() only after it answered; failed(message) on an
 * error, and no go. Answers whether it went.
 */
export async function landThenGo(call, { busy, done, failed, go } = {}) {
  busy?.();
  let r;
  try {
    r = await call();
  } catch (e) {
    failed?.(e?.message || 'the server did not answer');
    return false;
  }
  done?.(r);
  go?.();
  return true;
}

/**
 * Turn on the cloud loop: save the schedule (it lands per owner mode), then switch the loop workflow on when GitHub
 * lists it switched off (a disabled workflow neither runs on schedule nor takes Run one pass). A workflow not listed
 * yet was just added and starts on; a schedule waiting in a pull request has nothing to switch on until it merges.
 * Throws with the reason when the switch is refused, so the step stays put.
 * -> { ...the schedule's answer, enabled: whether it switched the workflow on }
 */
export async function turnOnCloud({ setSchedule, setWorkflow }, { sched, cron, wf }) {
  const r = await setSchedule(sched, cron);
  if (!wf || wf.enabled || r?.pr) return { ...r, enabled: false };
  const e = await setWorkflow(wf.id, true);
  if (e && e.ok === false) throw new Error(`The schedule is saved, but GitHub could not switch the loop workflow on: ${e.out || e.error || 'no reason given'}`);
  return { ...r, enabled: true };
}
