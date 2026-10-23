// The Cloud step's writes wait for the server. Adding the workflow and saving the schedule commit to the repo, and
// the commit runs the repo's own checks (its gate before commit), which can take minutes: the step shows that it is
// working, moves on only once the call answered, and an error keeps the person on the step with the server's words.

export const BUSY_NOTE = 'Committing: your repo\'s checks are running...';

/**
 * Whether the cloud steps can run here, from the folder's place (server/place.mjs): 'ready' | 'repo' (put it on
 * GitHub first: RepoStart as step 0) | 'other' (not GitHub, or not this folder's own repo: guidance only). An unknown
 * place (an older server) reads 'ready', today's behaviour.
 */
export function cloudGate(place) {
  if (place === 'none' || place === 'local' || place === 'unpushed') return 'repo';
  if (place === 'other' || place === 'nested' || place === 'refused') return 'other';
  return 'ready';
}

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
 * Throws with the reason when the switch is refused, so the step stays put. `keep` (the schedule the person found
 * is the one picked) skips the schedule call: it may still switch the workflow on.
 * -> { ...the schedule's answer, enabled: whether it switched the workflow on }
 */
export async function turnOnCloud({ setSchedule, setWorkflow }, { sched, cron, wf, keep = false }) {
  // Keeping the schedule the workflow has (49.1) writes nothing: no schedule call, no commit.
  const r = keep ? { written: false, kept: true } : await setSchedule(sched, cron);
  if (!wf || wf.enabled || r?.pr) return { ...r, enabled: false };
  const e = await setWorkflow(wf.id, true);
  if (e && e.ok === false) throw new Error(`The schedule is saved, but GitHub could not switch the loop workflow on: ${e.out || e.error || 'no reason given'}`);
  return { ...r, enabled: true };
}

/**
 * The schedule option the step selects (49.1). What the person picked stands; until they pick, a loop workflow that
 * has a schedule selects 'current' (the cron it has), one with none selects 'demand', and a repo with no loop
 * workflow yet starts at 'night'. `found` is GET /api/actions' `schedule` (null: no loop workflow at origin).
 */
export function pickSched(picked, found) {
  const hasCron = !!found?.crons?.length;
  if (picked === 'current') return hasCron ? 'current' : found ? 'demand' : 'night';
  if (picked) return picked;
  return hasCron ? 'current' : found ? 'demand' : 'night';
}

/** Whether Turn on keeps what the workflow has: the current cron, or on demand when that is what it is. */
export function keepsSchedule(sched, found) {
  if (!found) return false;
  return sched === 'current' ? !!found.crons?.length : sched === 'demand' && !found.crons?.length;
}

const pad2 = (n) => String(n).padStart(2, '0');
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A next run in the person's own time: "14:00 today", "02:00 tomorrow", "Mon 02:00"; '' when there is none. */
export function nextLocal(iso, now = new Date()) {
  const t = new Date(iso || NaN);
  if (Number.isNaN(t.getTime())) return '';
  const at = `${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(t) - day(new Date(now))) / 86400000);
  if (diff === 0) return `${at} today`;
  if (diff === 1) return `${at} tomorrow`;
  return `${DAYS[t.getDay()]} ${at}`;
}
