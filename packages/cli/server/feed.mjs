// The change feed (0.5.1): one central bus of things that HAPPENED, not agent chatter. v1 has one kind of event, a
// push landing on main (feed-push.mjs), from any source: a session here, a terminal, the owner elsewhere. Each push
// gets one plain sentence (feed-line.mjs: Claude Haiku when the AI helpers are on, the cleaned commit subject when
// not) and, when the repo has a deploy integration, a deploy state that moves "not deployed yet" -> "Deploying" ->
// "Deployed" (or "Deploy failed") from what the host reports back to GitHub (feed-deploy.mjs, no tokens).
//
// The bus: append-only, persisted to .nexus/feed/feed.jsonl in the primary checkout (one JSON snapshot per line; a
// later line for the same id wins; bounded to MAX_EVENTS, compacted when the file grows past twice that), read with
// GET /api/feed and sent on every live channel as the `feed` event (server.mjs).
//
// On by default; prefs.changeFeed false (Settings, "Change feed") stops everything: no watch, no fetch, no gh, no
// model. Turned back on, it starts from main as it is then.
import fs from 'node:fs';
import path from 'node:path';
import { createPushWatch } from './feed-push.mjs';
import { askLine, fallbackLine } from './feed-line.mjs';
import { backoff, deployFrom, FOLLOW_MS, INTEGRATION_MS, readCommit, readIntegration, SETTLED } from './feed-deploy.mjs';
import { run as shRun } from './sh.mjs';

export const MAX_EVENTS = 500;
export const LIVE_EVENTS = 40;
export const FEED_DIR = path.join('.nexus', 'feed');
export const FEED_FILE = path.join(FEED_DIR, 'feed.jsonl');
export const STATE_FILE = path.join(FEED_DIR, 'state.json');

/** Lines of the feed file -> the events, oldest first: a later snapshot of an id wins, and only the last `max` stay. */
export function foldLines(text, max = MAX_EVENTS) {
  const byId = new Map();
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; } // a half-written last line
    if (!ev || typeof ev.id !== 'string') continue;
    byId.set(ev.id, byId.has(ev.id) ? { ...byId.get(ev.id), ...ev } : ev);
  }
  return [...byId.values()].slice(-max);
}

/**
 * The bus. `onChange(ev)` after every append or update.
 * @param {object} o
 * @param {string|null} o.file   the JSONL file (null: memory only)
 */
export function createBus({ file = null, max = MAX_EVENTS, onChange = () => {} } = {}) {
  let events = [];
  const index = new Map();
  let lines = 0;

  function persist(ev) {
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const ignore = path.join(path.dirname(file), '.gitignore');
      if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '# nexus change feed: local only\n*\n');
      fs.appendFileSync(file, `${JSON.stringify(ev)}\n`);
      lines += 1;
      if (lines > max * 2) compact();
    } catch { /* the feed in memory still serves */ }
  }

  function compact() {
    if (!file) return;
    try {
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : ''));
      fs.renameSync(tmp, file);
      lines = events.length;
    } catch { /* kept as it was */ }
  }

  function trim() {
    if (events.length <= max) return;
    for (const e of events.splice(0, events.length - max)) index.delete(e.id);
  }

  const bus = {
    /** Read the file again (start-up). */
    load() {
      events = [];
      index.clear();
      let text = '';
      try { text = file ? fs.readFileSync(file, 'utf8') : ''; } catch { text = ''; }
      lines = text ? text.split(/\r?\n/).filter((l) => l.trim()).length : 0;
      events = foldLines(text, max);
      for (const e of events) index.set(e.id, e);
      if (lines > max * 2) compact();
      return bus;
    },
    has: (id) => index.has(id),
    get: (id) => index.get(id) || null,
    /** Add an event; one whose id is already there is not added again (null). */
    append(ev) {
      if (!ev || typeof ev.id !== 'string' || index.has(ev.id)) return null;
      const e = { ...ev };
      events.push(e);
      index.set(e.id, e);
      trim();
      persist(e);
      onChange(e);
      return e;
    },
    /** Merge `patch` into an event and keep the new snapshot. */
    update(id, patch) {
      const e = index.get(id);
      if (!e) return null;
      Object.assign(e, patch);
      persist(e);
      onChange(e);
      return e;
    },
    /** Newest first, at most `limit`. */
    list(limit = max) {
      return events.slice(-Math.max(0, limit)).reverse();
    },
    get size() { return events.length; },
  };
  return bus;
}

/** An event as a tab gets it: the newest first, paths and commits trimmed for the live channel. */
export function liveEvent(e, { paths = 12, commits = 8 } = {}) {
  return { ...e, paths: (e.paths || []).slice(0, paths), morePaths: (e.morePaths || 0) + Math.max(0, (e.paths || []).length - paths), commits: (e.commits || []).slice(0, commits) };
}

/**
 * The change feed: the bus, the push watch, the adapter and the deploy follow-up, under one switch.
 * @param {object} o
 * @param {string} o.repo                 the checkout (git runs here)
 * @param {string} [o.root]               the primary checkout (the feed lives in its .nexus/feed); default repo
 * @param {() => boolean} o.enabled       prefs.changeFeed !== false
 * @param {() => boolean} [o.helpers]     prefs.aiSummaries !== false: Haiku writes the line
 * @param {Function|null} [o.query]       the SDK's query() (undefined: loaded lazily; null/false: never)
 * @param {Function} [o.gh]               (cmd, args, opts) => Promise<{ ok, stdout }> for every gh call
 * @param {Function} [o.git]              the push watch's git runner (tests)
 * @param {(commits) => Promise<object|null>} [o.whoFor]  the session here that made it
 * @param {() => boolean} [o.active]      a tab is watching
 * @param {(view) => void} [o.onChange]   the feed changed: send it to the tabs
 * @param {boolean} [o.watch=true]        fs.watch and timers (tests drive check() by hand)
 */
export function createChangeFeed({ repo, root = repo, enabled = () => true, helpers = () => true, query, gh = shRun, git, whoFor, active = () => true, onChange = () => {}, watch = true, followMs = FOLLOW_MS, wait = backoff, now = () => Date.now() }) {
  const bus = createBus({ file: path.join(root, FEED_FILE), onChange: () => onChange(view()) });
  bus.load();
  const follows = new Map(); // event id -> timer
  const asking = new Set();
  let integration = null; // { value: true|false|null, at }
  let on = false;
  let closed = false;
  let wasOff = false; // off at some point in this run: turned on, it starts from main as it is then

  const pushes = createPushWatch({
    repo, stateFile: path.join(root, STATE_FILE), git, whoFor, active, watch,
    onPush: (ev) => { add(ev); },
  });

  function view(limit = LIVE_EVENTS) {
    return { on, at: now(), events: on ? bus.list(limit).map((e) => liveEvent(e)) : [] };
  }

  /** A push from the watch: on the bus at once with its plain fallback line, then the model's line and the deploy. */
  function add(ev) {
    if (!on || bus.has(ev.id)) return null;
    const e = bus.append({ ...ev, line: fallbackLine(ev.commits), ai: false, deploy: null });
    if (!e) return null;
    describe(e);
    deploys(e);
    return e;
  }

  async function describe(e) {
    if (!helpers() || query === null || query === false || asking.has(e.id)) return;
    asking.add(e.id);
    try {
      const r = await askLine(e, { query, repo });
      if (r.line && on && !closed) bus.update(e.id, { line: r.line, ai: true });
    } finally {
      asking.delete(e.id);
    }
  }

  async function hasIntegration(e) {
    if (integration && now() - integration.at < INTEGRATION_MS) return integration.value;
    const shas = [e.from, ...(e.commits || []).slice(1).map((c) => c.sha)].filter(Boolean);
    const value = await readIntegration(repo, shas, { run: gh }).catch(() => null);
    integration = { value, at: now() };
    return value;
  }

  async function deploys(e) {
    if (!(await hasIntegration(e)) || !on || closed) return;
    if (!e.deploy) bus.update(e.id, { deploy: { state: 'waiting', env: '', url: '', at: new Date(now()).toISOString() } });
    follow(e.id, 0);
  }

  /** Look at one push's deploy again after a backing-off wait, until it settles or FOLLOW_MS has passed. */
  function follow(id, n) {
    clearTimeout(follows.get(id));
    const t = setTimeout(async () => {
      follows.delete(id);
      const e = bus.get(id);
      if (!e || !on || closed || !e.deploy || SETTLED.has(e.deploy.state)) return;
      const c = await readCommit(repo, e.to, { run: gh }).catch(() => null);
      if (c) {
        const d = deployFrom(c);
        if (d.state !== e.deploy.state || d.url !== e.deploy.url || d.env !== e.deploy.env) bus.update(id, { deploy: { ...d, at: new Date(now()).toISOString() } });
      }
      const age = now() - Date.parse(e.at || 0);
      if (!SETTLED.has(bus.get(id)?.deploy?.state) && age < followMs) follow(id, n + 1);
    }, wait(n));
    t.unref?.();
    follows.set(id, t);
  }

  function start() {
    if (on || closed) return;
    on = true;
    if (wasOff) pushes.reset(); // turned (back) on: from main as it is now, not a backlog
    pushes.start().catch(() => null);
    // A deploy still unsettled from before a restart is followed again while it is young.
    for (const e of bus.list(20)) {
      if (e.deploy && !SETTLED.has(e.deploy.state) && now() - Date.parse(e.at || 0) < followMs) follow(e.id, 0);
    }
    onChange(view());
  }

  function stop() {
    wasOff = true;
    if (!on) return;
    on = false;
    pushes.stop();
    for (const t of follows.values()) clearTimeout(t);
    follows.clear();
    onChange(view());
  }

  const api = {
    bus,
    pushes,
    view,
    add,
    get on() { return on; },
    /** Follow the switch: on starts the watch, off stops everything. */
    sync() { if (enabled()) start(); else stop(); return on; },
    /** GET /api/feed. */
    list(limit = 200) { return { on, at: now(), events: on ? bus.list(Math.min(Math.max(1, limit), MAX_EVENTS)) : [] }; },
    close() { stop(); closed = true; },
  };
  return api;
}
