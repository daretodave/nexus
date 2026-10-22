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
