// Whether this tab still reaches the nexus it was opened from, for the stale-tab bar (src/ui/StaleBar.jsx).
//
// The live channel going down for more than DOWN_MS shows the bar ("nexus stopped"); meanwhile the tab asks the
// tokenless GET /api/hello every POLL_MS (never hammering /api/events). When it answers again:
//   - the same server (its `started` unchanged): the bar clears
//   - a new server (an upgrade, a restart): this tab's token is the old launch's. A tab the new launch opened on
//     this origin hands its token over on the `nexus-launch` BroadcastChannel; this tab takes it (sessionStorage),
//     reconnects, and the bar says "nexus updated to <v> · Reload for the new screens" (or clears when the version is
//     the same). With no such tab, the bar says to use the link the terminal printed.
// Only pages on this origin hear the channel, and such a page can already reach the server: nothing is exposed, and
// no token is written anywhere it is not already (server.json holds it, owner-only).
export const DOWN_MS = 5000;
export const POLL_MS = 2000;
export const CHANNEL = 'nexus-launch';

/** The bar's state: 'ok' | 'down' | 'restarted' (needs the new link) | 'updated' (reconnected to a newer version). */
let state = { status: 'ok', version: null, started: null, was: null };
const subs = new Set();
const set = (patch) => {
  state = { ...state, ...patch };
  for (const fn of subs) fn(state);
};
export const healthNow = () => state;
export function subscribeHealth(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** What the bar says for a state: { text, action: 'reload' | null } or null when nothing is wrong. */
export function healthWords(s) {
  if (!s || s.status === 'ok') return null;
  if (s.status === 'down') return { text: 'nexus stopped. Launch it again (npx @usenexus/cli) and this tab reconnects.', action: null };
  if (s.status === 'restarted') return { text: 'nexus restarted since this tab opened. Use the link it printed in the terminal.', action: null };
  if (s.status === 'updated') return { text: `nexus updated to ${s.version} · Reload for the new screens.`, action: 'reload' };
  return null;
}

/**
 * The watcher for one page: `token()` reads the current token, `adopt(t)` takes a handed-over one. `fetchImpl` and
 * `channel` are seams for tests. Returns { down(), up(), stop(), hello() }: the live channel calls down() on an error
 * and up() on its hello.
 */
export function createHealth({ token, adopt, fetchImpl = (...a) => fetch(...a), channel = makeChannel(), now = () => Date.now(), timers = BROWSER_TIMERS } = {}) {
  let downAt = null;
  let downTimer = null;
  let poll = null;
  let known = null; // { started, version } of the server this tab's token belongs to

  async function hello() {
    try {
      const r = await fetchImpl('/api/hello', { cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.nexus ? j : null;
    } catch {
      return null;
    }
  }

  async function tokenWorks() {
    try {
      const r = await fetchImpl('/api/server', { headers: { 'x-nexus-token': token() }, cache: 'no-store' });
      return r.ok;
    } catch {
      return false;
    }
  }

  function stopPoll() { if (poll) { timers.clearInterval(poll); poll = null; } }

  async function look() {
    const h = await hello();
    if (!h) return;
    if (known && h.started === known.started) { stopPoll(); downAt = null; set({ status: 'ok' }); return; }
    // A new server: the old token may still work (a test, a dev reload); else wait for a hand-over.
    if (await tokenWorks()) { settle(h); return; }
    set({ status: 'restarted', version: h.version, started: h.started });
    channel?.post({ ask: true, started: h.started });
  }

  /** Reconnected to server `h` with a working token. */
  function settle(h) {
    stopPoll();
    downAt = null;
    const was = known;
    known = { started: h.started, version: h.version };
    if (was && was.version && h.version && was.version !== h.version) set({ status: 'updated', version: h.version, started: h.started, was: was.version });
    else set({ status: 'ok', version: h.version, started: h.started });
  }

  channel?.listen(async (m) => {
    if (!m || typeof m !== 'object') return;
    // Another tab asks for the token of the server it found: answer when this tab holds that server's working token.
    if (m.ask && known && m.started === known.started && token()) { channel.post({ token: token(), started: known.started, version: known.version }); return; }
    if (typeof m.token !== 'string' || !m.token || m.token === token()) return;
    if (state.status === 'ok' && known && m.started === known.started) return;
    const h = await hello();
    if (!h || h.started !== m.started) return; // a hand-over for some other server
    adopt(m.token);
    if (await tokenWorks()) settle(h);
  });

  // The server this tab starts on, when its token works there: a tab opened from a launch link announces its token
  // for older tabs. A tab reloaded with an older launch's token (an upgrade) asks the other tabs for the new one.
  hello().then(async (h) => {
    if (!h) return;
    if (token() && await tokenWorks()) {
      known = { started: h.started, version: h.version };
      channel?.post({ token: token(), started: h.started, version: h.version });
      return;
    }
    set({ status: 'restarted', version: h.version, started: h.started });
    channel?.post({ ask: true, started: h.started });
  });

  return {
    down() {
      if (downAt == null) downAt = now();
      if (downTimer || state.status !== 'ok') return;
      downTimer = timers.setTimeout(() => {
        downTimer = null;
        if (downAt == null) return;
        set({ status: 'down' });
        if (!poll) poll = timers.setInterval(look, POLL_MS);
      }, DOWN_MS);
    },
    up() {
      downAt = null;
      if (downTimer) { timers.clearTimeout(downTimer); downTimer = null; }
      if (state.status === 'down') { stopPoll(); set({ status: 'ok' }); }
    },
    stop() { stopPoll(); if (downTimer) timers.clearTimeout(downTimer); channel?.close(); },
    look,
    get known() { return known; },
  };
}

// Called bare: a browser refuses window.setTimeout called as another object's method ("Illegal invocation").
const BROWSER_TIMERS = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (t) => clearTimeout(t),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (t) => clearInterval(t),
};

function makeChannel() {
  if (typeof BroadcastChannel !== 'function') return null;
  try {
    const bc = new BroadcastChannel(CHANNEL);
    // Never what keeps a process alive (Node has BroadcastChannel too: the tests that render the app).
    bc.unref?.();
    return {
      post: (m) => { try { bc.postMessage(m); } catch { /* closed */ } },
      listen: (fn) => { bc.onmessage = (e) => fn(e.data); },
      close: () => bc.close(),
    };
  } catch {
    return null;
  }
}
