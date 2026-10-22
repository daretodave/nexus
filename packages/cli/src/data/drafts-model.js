// The draft saver (spec 51, A1), pure: no DOM, no fetch, timers injected, so test/drafts.test.mjs drives it.
// An answer being typed saves debounced (`delay`, 400 ms) and at once on blur; leaving the page flushes what is
// left in one body (`beacon`: a keepalive request or navigator.sendBeacon, fire and forget); a sent answer clears
// its draft. Each key's state: '' (nothing typed) | 'unsaved' | 'saving' | 'saved' | 'sending' | 'sent'.

/**
 * @param {object} o
 * @param {(patch: Record<string, string|null>) => Promise<unknown>} o.put  saves a patch (PUT /api/drafts)
 * @param {(patch: Record<string, string|null>) => boolean} [o.beacon]    sends a patch as the page goes; true if sent
 * @param {number} [o.delay]
 * @param {(key: string, state: string) => void} [o.onState]
 */
export function createDraftSaver({ put, beacon, delay = 400, setTimer = setTimeout, clearTimer = clearTimeout, onState = () => {} }) {
  const pending = new Map(); // key -> text not yet saved
  const timers = new Map();
  const states = new Map();
  const inflight = new Set();
  const mark = (key, s) => { if (states.get(key) !== s) { states.set(key, s); onState(key, s); } };
  const stop = (key) => { if (timers.has(key)) { clearTimer(timers.get(key)); timers.delete(key); } };

  async function save(keys) {
    const patch = {};
    for (const k of keys) {
      stop(k);
      if (!pending.has(k)) continue;
      patch[k] = pending.get(k);
      pending.delete(k);
      mark(k, 'saving');
    }
    const ks = Object.keys(patch);
    if (!ks.length) return false;
    const p = (async () => {
      try {
        await put(patch);
        for (const k of ks) if (!pending.has(k) && states.get(k) === 'saving') mark(k, 'saved');
      } catch {
        // Not saved: it waits for the next save or the flush as the page goes, unless something newer was typed.
        for (const k of ks) if (!pending.has(k)) { pending.set(k, patch[k]); mark(k, 'unsaved'); }
      }
    })();
    inflight.add(p);
    await p;
    inflight.delete(p);
    return true;
  }

  return {
    /** Typed: saved `delay` after the last keystroke. */
    change(key, text) {
      pending.set(key, text);
      mark(key, 'unsaved');
      stop(key);
      timers.set(key, setTimer(() => { timers.delete(key); save([key]); }, delay));
    },
    /** Left the field: saved now. */
    blur: (key) => save([key]),
    /**
     * Save everything not yet saved. `beacon` (the page is going): one body through o.beacon, synchronously, and true
     * if it went; else (or if the beacon could not go) a save, as a promise. False when there is nothing to save.
     */
    flush({ beacon: going = false } = {}) {
      for (const k of [...timers.keys()]) stop(k);
      if (!pending.size) return false;
      if (going && beacon) {
        const patch = Object.fromEntries(pending);
        if (beacon(patch)) {
          for (const k of Object.keys(patch)) { pending.delete(k); mark(k, 'saved'); }
          return true;
        }
      }
      return save([...pending.keys()]);
    },
    /** The answer is on its way (the draft stays until it is sent). */
    sending(key) { stop(key); mark(key, 'sending'); },
    /** The answer was sent: its draft clears. */
    async sent(key) {
      stop(key);
      pending.delete(key);
      mark(key, 'sent');
      try { await put({ [key]: null }); } catch { /* the server clears an ask's drafts itself; a plan one stays a draft */ }
    },
    /** Dropped without sending (an answer reopened, a typed answer kept elsewhere): the draft clears, quietly. */
    async clear(key) {
      stop(key);
      pending.delete(key);
      mark(key, '');
      try { await put({ [key]: null }); } catch { /* left behind, it is only a draft */ }
    },
    /** The answer did not go: the draft is still what was typed. */
    failed(key) { mark(key, pending.has(key) ? 'unsaved' : 'saved'); },
    state: (key) => states.get(key) || '',
    /** Every save in flight, settled. */
    idle: () => Promise.all([...inflight]),
  };
}
