// Answers saved as they are typed (spec 51, A1): one draft store for the app, on the server (GET/PUT
// /api/drafts, server/drafts.mjs), so a reload, another tab or a closed window keeps what was typed. The saver
// (drafts-model.js) debounces while typing and saves on blur; leaving (a route change unmounts the field and saves
// it; the tab hidden or the page going flushes the rest in one keepalive request, else a beacon) loses nothing.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createDraftSaver } from './drafts-model.js';

// client.js reads the page's URL as it loads; it comes in on first use, so ui/ (which draws a draft field) stays
// importable where there is no page (the node tests that render it).
// The token is read at each save: a newer launch's tab can hand this tab a new one (data/health.js).
let mod = null;
const tok = () => (mod ? mod.getToken() : '');
const client = () => import('./client.js').then((c) => { mod = c; return c; });

const values = new Map(); // key -> text, as typed here or restored from the server
const touched = new Set(); // keys typed here since load: the server's copy does not overwrite them
const listeners = new Set();
let version = 0;
let loaded = null;
let ready = false;
const emit = () => { version++; for (const l of listeners) l(); };

const PATH = '/api/drafts';
const put = async (patch) => {
  await client();
  const res = await fetch(PATH, { method: 'PUT', headers: { 'x-nexus-token': tok(), 'content-type': 'application/json' }, body: JSON.stringify({ drafts: patch }) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
};
/** The page is going: a keepalive request (headers and all), else navigator.sendBeacon (POST, text/plain, ?t=). */
const beacon = (patch) => {
  const body = JSON.stringify({ drafts: patch });
  try {
    fetch(PATH, { method: 'PUT', keepalive: true, headers: { 'x-nexus-token': tok(), 'content-type': 'application/json' }, body });
    return true;
  } catch {
    try { return !!navigator.sendBeacon?.(`${PATH}?t=${encodeURIComponent(tok())}`, body); } catch { return false; }
  }
};

const saver = createDraftSaver({ put, beacon, onState: emit });

function load() {
  if (loaded) return loaded;
  loaded = client().then((c) => c.api(PATH)).then((r) => {
    for (const [k, v] of Object.entries(r?.drafts || {})) if (!touched.has(k) && v && typeof v.text === 'string') values.set(k, v.text);
    ready = true;
    emit();
  }).catch(() => { ready = true; emit(); /* no drafts served (an older server, the demo): typing works, it is not kept */ });
  if (typeof window !== 'undefined') {
    const going = () => saver.flush({ beacon: true });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') going(); });
    window.addEventListener('pagehide', going);
  }
  return loaded;
}

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const snap = () => version;

/** The draft at `key`: { value, set(text), blur(), state }. No key: a plain field that keeps nothing. */
export function useDraft(key) {
  useSyncExternalStore(subscribe, snap, snap);
  const [local, setLocal] = useState('');
  useEffect(() => { if (key) load(); }, [key]);
  // Leaving the screen (a route change) saves what is left of this one.
  useEffect(() => () => { if (key) saver.blur(key); }, [key]);
  return {
    value: key ? values.get(key) || '' : local,
    state: key ? saver.state(key) : '',
    set(text) {
      if (!key) { setLocal(text); return; }
      values.set(key, text);
      touched.add(key);
      saver.change(key, text);
      emit();
    },
    blur() { if (key) saver.blur(key); },
  };
}

/**
 * Every draft, for a screen that keeps more than typed text (a live ask's picked answers, `<askId>:<i>:pick`, kept
 * until Send): { get(key), save(key, text) at once, clear(key) }.
 */
export function useDrafts() {
  useSyncExternalStore(subscribe, snap, snap);
  useEffect(() => { load(); }, []);
  return {
    ready,
    get: (key) => values.get(key) || '',
    save(key, text) {
      values.set(key, text);
      touched.add(key);
      saver.change(key, text);
      saver.blur(key);
      emit();
    },
    clear(key) {
      values.delete(key);
      touched.add(key);
      saver.clear(key);
      emit();
    },
  };
}

/** An answer at `key` is on its way. */
export function draftSending(key) { if (key) saver.sending(key); }

/** It was sent: the field empties and its draft clears. */
export function draftSent(key) {
  if (!key) return;
  values.delete(key);
  touched.add(key);
  saver.sent(key);
  emit();
}

/** It did not go: the field keeps what was typed. */
export function draftFailed(key) { if (key) saver.failed(key); }

/** The quiet word a field shows under its answer: saving, saved, sending, sent. */
export const DRAFT_WORDS = { unsaved: '', saving: 'saving', saved: 'saved', sending: 'sending', sent: 'sent' };
