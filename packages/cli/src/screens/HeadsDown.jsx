// Heads-down: the terminal view of one session (HeadsDown + HeadsDownLight
// boards). A 120-column box in JetBrains Mono: header, git line, the phase
// track, now / queue / parked / agents / context, the tape, a prompt and the
// key footer. Rows are built by headsModel.js from live data; the keys work
// (c cockpit, i inbox, b plan, f fleet, p pause, / command, esc leave) and
// typing steers the session. Themes come from tokens only. With no session to
// show (none named, or it is gone), it asks what to start: a spec, or infinite.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Tui, useShell } from '../ui/index.js';
import { api, server, useClaims, useCloudLoop, useEvents, useInbox, useLocalSettings, usePlan, useSession, useSessions } from '../data/index.js';
import { PATHS, lastSession } from '../routes.js';
import { headsRows } from './headsdown-inbox/headsModel.js';
import { renderRows } from './headsdown-inbox/tuiCanvas.jsx';
import { phaseBudget } from '../../shared/times.mjs';
import StartPick from './fleet/StartPick.jsx';
import { norm } from './fleet/model.js';

const SKY = {
  boxSizing: 'border-box',
  height: '100vh',
  minHeight: 0,
  // The board's canvas is 1440 wide. Below ~760px the 120 columns (at the type's 10px floor) outgrow the window:
  // centred with overflow hidden, both ends were cut and the left one unreachable. Safe centring keeps the frame's
  // start in view and the rest scrolls.
  overflow: 'auto',
  justifyContent: 'safe center',
  alignItems: 'safe center',
  background: 'radial-gradient(64% 42% at 50% -4%, var(--sky-a), transparent 72%), radial-gradient(40% 30% at 92% 104%, var(--sky-b), transparent 70%), var(--bg)',
};

const HIDDEN = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

const sessName = (s) => (typeof s === 'string' ? s : s?.name || null);

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** Times for transcript items that arrive while this page is open (a replay has none). */
function useSeenAt(live) {
  const base = useRef(null);
  const seen = useRef({});
  if (live.connected && base.current == null) base.current = live.transcript.length;
  if (base.current != null) {
    for (let i = base.current; i < live.transcript.length; i += 1) if (seen.current[i] == null) seen.current[i] = Date.now();
  }
  return seen.current;
}

function chunkTitles(plan) {
  const out = {};
  if (plan.status !== 'ready' || !plan.data) return out;
  for (const sp of plan.data.specs || []) for (const c of sp.chunks || []) if (c.id) out[c.id] = c.title || c.summary || '';
  return out;
}

/** No session to show: choose a spec or infinite, and the started (or already running) one opens here. */
function HeadsDownStart({ plan }) {
  const nav = useNavigate();
  const sessions = useSessions();
  const [error, setError] = useState(null);
  const list = (Array.isArray(sessions.data) ? sessions.data : sessions.data?.sessions || []).map(norm).filter((s) => s.state !== 'closed');
  return (
    <div className="tui-wrap" style={SKY}>
      <div className="sp-card">
        <div className="t-title-s">Start heads-down</div>
        <div className="t-body-s c-2">Choose what it works on: a spec, or infinite (loop /next, the next chunk in line, forever). It asks its questions first, then builds without stopping.</div>
        <StartPick plan={plan.data} sessions={list} open={(sid) => nav(PATHS.headsFor(sid))} onError={(title, body) => setError(`${title}: ${body}`)} />
        {error ? <div className="t-body-s c-2" role="alert">{error}</div> : null}
      </div>
    </div>
  );
}

export default function HeadsDown() {
  const shell = useShell();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const id = params.get('s') || lastSession();
  const ledgerRes = useSession(id);
  const ledger = ledgerRes.status === 'ready' ? ledgerRes.data : null;
  const claimsRes = useClaims(30000);
  const inbox = useInbox();
  const cloudRes = useCloudLoop();
  const local = useLocalSettings();
  const plan = usePlan();
  // This session's own channel (/api/events?session=<id>); with no session named, the home session's.
  const live = useEvents(id || undefined);
  const now = useNow();
  const seenAt = useSeenAt(live);
  const info = shell.app?.data?.info || {};
  const name = ledger?.name || 'session';

  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pausedAt, setPausedAt] = useState(null);
  const [note, setNote] = useState('');
  const input = useRef(null);

  useEffect(() => {
    if (ledger && typeof ledger.paused === 'boolean') setPaused(ledger.paused);
    else if (ledger?.hosted) setPaused(ledger.state === 'paused' || ledger.state === 'pausing');
  }, [ledger?.paused, ledger?.hosted, ledger?.state]);
  useEffect(() => { if (!note) return undefined; const t = setTimeout(() => setNote(''), 6000); return () => clearTimeout(t); }, [note]);

  const cockpit = id ? PATHS.cockpit(id) : PATHS.fleet;
  const links = useMemo(() => ({
    inbox: PATHS.inbox,
    cockpitW: { to: cockpit, label: 'Open the cockpit' },
    inboxW: { to: PATHS.inbox, label: 'Open the oversight inbox' },
    planW: { to: PATHS.board, label: 'Open the plan' },
    fleetW: { to: PATHS.fleet, label: 'Open the fleet' },
  }), [cockpit]);

  const togglePause = useCallback(async () => {
    const next = !paused;
    if (!id) { setNote('no session to pause: open heads-down from a session'); return; }
    try {
      await api(`/api/sessions/${encodeURIComponent(id)}/${next ? 'pause' : 'resume'}`, {});
      setPaused(next);
      setPausedAt(next ? Date.now() : null);
    } catch (e) {
      setNote(e.status === 404 ? 'pausing a session is not served yet: needs POST /api/sessions/:id/pause' : `could not ${next ? 'pause' : 'resume'}: ${e.message}`);
    }
  }, [id, paused]);

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    try {
      await server.send(text, id || undefined);
      setDraft('');
    } catch (e) {
      setNote(`not sent: ${e.message}`);
    }
  }, [draft]);

  // the footer keys, when the prompt is not taking text
  useEffect(() => {
    const onKey = (e) => {
      if (focused || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      // a focused link or button keeps Enter and Space for itself
      if (t && t.closest && t.closest('a, button') && (e.key === 'Enter' || e.key === ' ')) return;
      const go = { c: cockpit, i: PATHS.inbox, b: PATHS.board, f: PATHS.fleet }[e.key];
      if (go) { e.preventDefault(); nav(go); return; }
      if (e.key === 'Escape') { e.preventDefault(); nav(cockpit); return; }
      if (e.key === 'p') { e.preventDefault(); togglePause(); return; }
      if (e.key === '/' || (e.key.length === 1 && /\S/.test(e.key))) {
        e.preventDefault();
        setDraft((d) => d + e.key);
        input.current?.focus();
      } else if (e.key === 'Enter') {
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focused, cockpit, nav, togglePause]);

  const mineClaims = useMemo(() => {
    const rows = claimsRes.status === 'ready' ? claimsRes.data?.rows || [] : [];
    if (ledger?.claimsSession) return rows.filter((r) => r.session === ledger.claimsSession);
    if (ledger?.claimed) return rows.filter((r) => ledger.claimed.includes(r.id));
    return rows.filter((r) => r.mine);
  }, [claimsRes.status, claimsRes.data, ledger]);

  const waiting = useMemo(() => {
    if (inbox.status === 'ready' && Array.isArray(inbox.data?.items || inbox.data)) {
      const items = (inbox.data.items || inbox.data).filter((x) => !x.settled);
      const elsewhere = items.filter((x) => x.kind === 'now' && sessName(x.session) !== ledger?.name);
      const names = [...new Set(elsewhere.map((x) => sessName(x.session)).filter(Boolean))];
      return { count: elsewhere.length, who: names.length === 1 ? names[0] : null, total: items.length };
    }
    const n = shell.inbox || 0;
    return { count: n, who: null, total: n };
  }, [inbox.status, inbox.data, shell.inbox, ledger?.name]);

  const rows = headsRows({
    ledger,
    info,
    live,
    claims: mineClaims,
    waiting,
    cloud: cloudRes.status === 'ready' ? cloudRes.data : null,
    // The Working phase's length as Settings saved it ("3–4h"), not its key.
    budget: (typeof ledger?.budget === 'object' ? ledger?.budget?.label : ledger?.budget) || (local.status === 'ready' && phaseBudget(local.data?.phase)?.label) || null,
    titles: chunkTitles(plan),
    now,
    seenAt,
    ui: { draft, focused, paused, pausedAt, note, links, onPause: togglePause },
  });

  if (!id || ledgerRes.status === 'missing' || ledger?.state === 'closed') return <HeadsDownStart plan={plan} />;

  const focusPrompt = (e) => {
    if (e.target.closest('a, button, input')) return;
    input.current?.focus();
  };

  return (
    <div className="tui-wrap" style={SKY} onClick={focusPrompt}>
      {/* the prompt line's real input: the canvas draws what it holds */}
      <input
        ref={input}
        style={HIDDEN}
        aria-label={`Steer ${name}: type a note, or / for a command`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          if (e.key === 'Escape') { e.preventDefault(); if (draft) setDraft(''); else e.currentTarget.blur(); }
        }}
      />
      <Tui label={`Heads-down view of the ${name} session`} style={{ whiteSpace: 'normal' }}>
        {renderRows(rows)}
      </Tui>
    </div>
  );
}
