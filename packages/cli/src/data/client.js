// Talking to the local server: the launch token, JSON calls, and the one
// SSE stream the whole app reduces from. Every screen goes through here;
// nothing else calls fetch.
import { useEffect, useReducer, useRef } from 'react';
import { reduce, replay, initialState } from '../../shared/beats.mjs';

function readToken() {
  const url = new URL(window.location.href);
  const t = url.searchParams.get('t');
  if (t) {
    try { sessionStorage.setItem('nexus-token', t); } catch { /* the token stays in memory for this page */ }
    url.searchParams.delete('t');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    return t;
  }
  try { return sessionStorage.getItem('nexus-token') || ''; } catch { return ''; }
}

export const TOKEN = readToken();

/** An error that carries the HTTP status, so callers can tell "not built yet" (404) from "broke", and the answer's body. */
export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/** GET when body is undefined, POST JSON otherwise. Throws ApiError. */
export async function api(path, body) {
  const init = body === undefined
    ? { headers: { 'x-nexus-token': TOKEN } }
    : { method: 'POST', headers: { 'x-nexus-token': TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(body) };
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `HTTP ${res.status}`, res.status, data);
  return data;
}

/** The server's calls, by name. One place to see the whole surface. */
export const server = {
  state: () => api('/api/state'),
  preflight: () => api('/api/preflight'),
  prompts: () => api('/api/prompts'),
  setPrefs: (patch) => api('/api/prefs', patch),
  setOwner: (on) => api('/api/owner', { on }),
  // `session` names a session this server runs (id, Claude Code session id or star); none is the home session.
  send: (text, session, attachments) => api('/api/send', { text, ...(session ? { session } : {}), ...(attachments && attachments.length ? { attachments } : {}) }),
  adopt: () => api('/api/adopt', {}),
  interrupt: (session) => api('/api/interrupt', session ? { session } : {}),
  stop: (session) => api('/api/stop', session ? { session } : {}),
  fresh: (session) => api('/api/fresh', session ? { session } : {}),
  /** POST /api/sessions { name?, worktree?, prompt? } -> { id, name, cwd, worktree, branch, form?, note? }, at once: the worktree forms after (shared/forming.mjs) */
  startSession: (body = {}) => api('/api/sessions', body),
  /** POST /api/sessions/:id/(pause|resume|close|retry): pause after this step, resume, close (its worktree stays), retry a worktree that failed to form. */
  sessionAction: (id, action) => api(`/api/sessions/${encodeURIComponent(id)}/${action}`, {}),
  serverInfo: () => api('/api/server'),
  answerAsk: (id, answers) => api(`/api/ask/${encodeURIComponent(id)}`, { answers }),
  answerPermission: (id, allow, always = false) => api(`/api/permission/${encodeURIComponent(id)}`, { allow, always }),
  oversight: () => api('/api/oversight'),
  answerDurable: (answers) => api('/api/oversight/answer', { answers }),
  announce: (text) => api('/api/announce', { text }),
  claims: () => api('/api/claims'),
  releaseClaim: (id) => api('/api/claims/release', { id }),
  /** POST /api/claims/(claim|release|hold|unhold|assign|reassign|request) { id, session?, to?, login?, title? }: the repo's claims CLI as the acting session. */
  claimAction: (verb, body) => api(`/api/claims/${verb}`, body),
  progress: (spec) => api(`/api/progress${spec ? `?spec=${encodeURIComponent(spec)}` : ''}`),
  actions: () => api('/api/actions'),
  setWorkflow: (id, enabled) => api('/api/actions/workflow', { id, enabled }),
  /** "Run one pass now": gh workflow run on the loop workflow (its id, or the loop file the server finds). */
  dispatchWorkflow: (id) => api('/api/cloud/run', id == null ? {} : { id }),
  runs: () => api('/api/runs'),
  /** POST /api/design/handoff { link, session?: 'new' }: /design ingest <link> in the home session, or a new one. */
  designHandoff: (link, session) => api('/api/design/handoff', { link, ...(session ? { session } : {}) }),
  // The vault (spec 42): a value goes only in these POST bodies, browser -> local server -> vault and sinks. Never in
  // a URL, a log, browser storage or an SSE frame; no answer carries one back.
  /** POST /api/secrets/:name { value, destinations?, declare?, for?, local? } -> { stored, ring, pushed: [{ destination, ok, error? }] } */
  storeSecret: (name, body) => api(`/api/secrets/${encodeURIComponent(name)}`, body),
  /** POST /api/secrets/:name/push { destinations }: push the stored value again (Sync, Retry). */
  pushSecret: (name, destinations) => api(`/api/secrets/${encodeURIComponent(name)}/push`, { destinations }),
  /** POST /api/secrets/import { text | file, confirm?, names?, destinations? }: a names-only preview, or the store. */
  importSecrets: (body) => api('/api/secrets/import', body),
  /** POST /api/secrets/manifest { fromEnv?, names? }: an empty manifest (onboarding's Start empty), or the root .env's names (all, or those listed: the Vault's Declare) when it is already the vault; one that exists stays. */
  startManifest: (body = {}) => api('/api/secrets/manifest', body),
  /** POST /api/secrets/setup: land the vault's scripts per owner mode -> { ok, landed: 'main' | 'branch', here?, pr?, branch?, note }. */
  setupVault: () => api('/api/secrets/setup', {}),
};

const EMPTY = { connected: false, stage: initialState(), transcript: [], status: { state: 'idle' }, asks: [], permissions: [], runs: [] };

function merge(transcript, item) {
  if (item.kind !== 'delta') return [...transcript, item];
  const last = transcript[transcript.length - 1];
  if (last && last.kind === 'text' && last.id === item.id) return [...transcript.slice(0, -1), { ...last, text: last.text + item.text }];
  return [...transcript, { kind: 'text', id: item.id, agent: item.agent, text: item.text }];
}

function storeReducer(s, [type, data]) {
  switch (type) {
    case 'hello':
      return { ...s, connected: true, stage: replay(data.beats || []), transcript: data.transcript || [], status: data.status || s.status, asks: data.asks || [], permissions: data.permissions || [], runs: data.runs || [] };
    case 'beat': return { ...s, stage: reduce(s.stage, data) };
    case 'tx': return { ...s, transcript: merge(s.transcript, data) };
    case 'status': return { ...s, status: data };
    case 'asks': return { ...s, asks: data };
    case 'permissions': return { ...s, permissions: data };
    case 'runs': return { ...s, runs: data };
    case 'reset': return { ...s, stage: initialState(), transcript: [] };
    case 'down': return { ...s, connected: false };
    default: return s;
  }
}

const EVENT_TYPES = ['hello', 'beat', 'tx', 'status', 'asks', 'permissions', 'runs', 'reset'];

/**
 * The live store for one SSE channel: reconnects on drop, and a reconnect
 * replays from hello. `session` selects a session's own channel
 * (/api/events?session=<id>); none is the home session's. A session the
 * server does not run (a terminal one) gets a quiet channel whose status
 * says hosted: false, never another session's stream. `off` opens no
 * channel at all (a screen that follows a session only once it has one).
 */
export function useEvents(session, { off = false } = {}) {
  const [state, dispatch] = useReducer(storeReducer, EMPTY);
  const es = useRef(null);
  useEffect(() => {
    if (off) return undefined;
    let closed = false;
    let retry = null;
    const open = () => {
      const q = new URLSearchParams({ t: TOKEN });
      if (session) q.set('session', session);
      const src = new EventSource(`/api/events?${q}`);
      es.current = src;
      for (const type of EVENT_TYPES) src.addEventListener(type, (e) => dispatch([type, JSON.parse(e.data)]));
      src.onerror = () => {
        dispatch(['down']);
        src.close();
        if (!closed) retry = setTimeout(open, 2000);
      };
    };
    open();
    return () => { closed = true; clearTimeout(retry); es.current?.close(); };
  }, [session, off]);
  return state;
}
