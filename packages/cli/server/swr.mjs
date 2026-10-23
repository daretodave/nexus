// Stale-while-revalidate for the slow reads (git, gh, the plan and claims scripts). A screen that asks again for
// something it asked a moment ago gets the last answer at once, marked stale, while one fresh read runs behind it;
// asking with `fresh` waits for that read instead. Two screens asking at once share one read. Any write through the
// server forgets everything kept, so an answer never hides a change this server made.
//
//   const swr = createSwr();
//   const { value, stale } = await swr.get('plan', () => readPlan(repo), { fresh: false });
//   swr.forget();             // after a write: every kept answer goes, and reads already running are not kept

export const FRESH_MS = 1500;
export const KEEP_MS = 5 * 60000;

/**
 * @param {object} [o]
 * @param {() => number} [o.now]
 * @param {number} [o.freshMs]  an answer this young is served as it is, not stale (and nothing is re-read)
 * @param {number} [o.keepMs]   an answer older than this is not served stale: the read is waited for
 */
export function createSwr({ now = Date.now, freshMs = FRESH_MS, keepMs = KEEP_MS } = {}) {
  const kept = new Map();

  // A read keeps its answer only if its entry is still the one it started under: forget() drops entries, so a read
  // that was running across a write never stores what it saw before it.
  function read(key, fn) {
    const e = kept.get(key) || {};
    if (e.running) return e.running;
    const running = Promise.resolve().then(fn).then(
      (value) => {
        if (kept.get(key)?.running === running) kept.set(key, { value, at: now(), has: true });
        return value;
      },
      (err) => {
        const cur = kept.get(key);
        if (cur && cur.running === running) { delete cur.running; if (!cur.has) kept.delete(key); }
        throw err;
      },
    );
    kept.set(key, { ...e, running });
    return running;
  }

  /** The answer for `key`: kept, or read with `fn`. -> { value, stale } */
  async function get(key, fn, { fresh = false } = {}) {
    const e = kept.get(key);
    const age = e && e.has ? now() - e.at : Infinity;
    if (age < freshMs) return { value: e.value, stale: false };
    if (!fresh && age < keepMs) {
      read(key, fn).catch(() => {}); // a failed read behind a stale answer is asked again next time
      return { value: e.value, stale: true };
    }
    return { value: await read(key, fn), stale: false };
  }

  /** Forget every kept answer (or those whose key starts with `prefix`); reads running now are not kept. */
  function forget(prefix) {
    if (prefix == null) { kept.clear(); return; }
    for (const k of [...kept.keys()]) if (k.startsWith(prefix)) kept.delete(k);
  }

  return { get, forget, get size() { return kept.size; } };
}
