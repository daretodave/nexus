// Talking to the local server: the launch token, JSON calls, and the one
// SSE stream the whole app reduces from.
import { useEffect, useReducer, useRef } from 'react';
import { reduce, replay, initialState } from '../shared/beats.mjs';

function readToken() {
  const url = new URL(window.location.href);
  const t = url.searchParams.get('t');
  if (t) {
    try { sessionStorage.setItem('nexus-token', t); } catch {}
    url.searchParams.delete('t');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    return t;
  }
  try { return sessionStorage.getItem('nexus-token') || ''; } catch { return ''; }
}

export const TOKEN = readToken();

export async function api(path, body) {
  const init = body === undefined
    ? { headers: { 'x-nexus-token': TOKEN } }
    : { method: 'POST', headers: { 'x-nexus-token': TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(body) };
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

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

/** The live store: reconnects on drop, and a reconnect replays from hello. */
export function useEvents() {
  const [state, dispatch] = useReducer(storeReducer, EMPTY);
  const es = useRef(null);
  useEffect(() => {
    let closed = false;
    let retry = null;
    const open = () => {
      const src = new EventSource(`/api/events?t=${encodeURIComponent(TOKEN)}`);
      es.current = src;
      for (const type of ['hello', 'beat', 'tx', 'status', 'asks', 'permissions', 'runs', 'reset']) {
        src.addEventListener(type, (e) => dispatch([type, JSON.parse(e.data)]));
      }
      src.onerror = () => {
        dispatch(['down']);
        src.close();
        if (!closed) retry = setTimeout(open, 2000);
      };
    };
    open();
    return () => { closed = true; clearTimeout(retry); es.current?.close(); };
  }, []);
  return state;
}
