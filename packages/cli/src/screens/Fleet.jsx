// The fleet, home of the app (Fleet, FleetTrain, FleetKit boards and their
// Light variants, which differ only by theme tokens): every session as a
// tile, a filter row, "start another session", and Pause all (the reboot
// train) docked over the grid while it runs.
//
// Data: GET /api/sessions (useSessions), GET /api/claims (claim holders no tile stands for: one line in the head).
// "This machine" is the default; terminals nobody linked and sessions that fell over or stopped are a chip away.
// Actions: POST /api/sessions (start, once a spec or infinite is chosen: StartPick),
// POST /api/sessions/:id/resume (a hosted one resumes; a fallen one is taken
// by a new hosted session on /reboot-resume <star>), POST /api/train
// { action: pause|cancel|resume }. An action the server does not serve yet
// says plainly that it is not wired up; nothing is invented.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AppFrame, Topbar, Wordmark, TbSep, TbTitle, TbSpacer, InboxBtn, ViewHead, ChoiceButtons,
  TileNew, TrainDock, Train, ToastHost, Err, Icon, cx, useShell,
} from '../ui/index.js';
import { useSessions, usePlan, useClaims } from '../data/index.js';
import { PATHS } from '../routes.js';
import LoopLine from './fleet/LoopLine.jsx';
import StartPick from './fleet/StartPick.jsx';
import SessionTile from './fleet/SessionTile.jsx';
import { norm, FILTERS, counts, summary, trainOf, claimHolders, chunkTitle } from './fleet/model.js';
import { nextInLine, putAwayToast } from './fleet/alive.js';
import '../styles/fleet-honest.css';
import '../styles/tile-bar-fit.css';
import { act, hhmm } from './fleet/util.js';
import { useToasts } from './fleet/toasts.js';
import { SkelTiles } from '../ui/loading.jsx';

const PLAY = 'M8 5.5v13l10-6.5z';
const PAUSE = 'M9 6v12M15 6v12';

// The train dock floats over the grid's foot (FleetTrain board). The board's view clips; the app's grid scrolls, so
// while the dock is up the grid gets room under its last row to scroll clear of it.
function useDockRoom(active) {
  const ref = useRef(null);
  const [room, setRoom] = useState(0);
  useLayoutEffect(() => {
    const dock = active ? ref.current?.querySelector('.train-dock') : null;
    if (!dock) { setRoom(0); return undefined; }
    const measure = () => setRoom(dock.offsetHeight + (parseFloat(getComputedStyle(dock).bottom) || 0));
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    ro?.observe(dock);
    return () => ro?.disconnect();
  }, [active]);
  return [ref, room];
}

function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

function PauseAll({ train, onClick }) {
  const label = !train.active ? 'Pause all' : train.all ? 'Resume all' : 'Pausing';
  const sub = !train.active ? 'reboot train' : train.all ? `all ${train.total} paused` : `${train.paused} of ${train.total} paused`;
  return (
    <button className={cx('pause-btn', train.all && 'is-paused')} type="button" onClick={onClick} aria-pressed={train.active ? 'true' : 'false'} disabled={!train.active && !train.total}>
      <span className="pb-ic"><Icon d={train.all ? PLAY : PAUSE} /></span>
      <span className="pb-text">{label}<span className="pb-sub tb-long">{sub}</span></span>
    </button>
  );
}

/** The start tile's line: what heads-down would take first, from the plan's order, or what choosing means. */
function StartLine({ plan }) {
  const next = [].concat(plan?.next || [])[0];
  const line = nextInLine(plan, next ? chunkTitle(plan, next.id) : '');
  if (!line) return <div className="tn-line">Choose what it works on: a spec, which asks its questions first, or infinite, where march picks each pass or the next loop builds the plan chunk by chunk without stopping to ask.</div>;
  return <div className="tn-line">Choose a spec, which asks its questions first, or infinite, which runs on its own: march picks each pass, the next loop builds in plan order. Next up: <b>{line.id}</b>{line.rest ? ` ${line.rest}` : ''}.</div>;
}

export default function Fleet() {
  const { repo } = useShell();
  const now = useNow();
  const sessions = useSessions();
  const plan = usePlan();
  const claims = useClaims(15000);
  const { toasts, push } = useToasts();
  // ?show=<filter> picks the chip (the top bar's fell-over chip lands on Fell over, where Resume and Clear are).
  // Keyed on the visit, not the URL: the same chip clicked again after a hand-picked filter still lands there.
  const [params] = useSearchParams();
  const visit = useLocation().key;
  const shown0 = params.get('show');
  const [filter, setFilter] = useState(() => (FILTERS.some((f) => f.value === shown0) ? shown0 : 'here'));
  useEffect(() => { if (FILTERS.some((f) => f.value === shown0)) setFilter(shown0); }, [shown0, visit]);
  const [trainOn, setTrainOn] = useState(false);
  const [resuming, setResuming] = useState({});
  // Sessions put away from here leave at once, before the next poll agrees.
  const [gone, setGone] = useState({});
  const loc = useLocation();
  const navigate = useNavigate();

  const list = useMemo(() => {
    const raw = sessions.status === 'ready' && Array.isArray(sessions.data) ? sessions.data : sessions.data?.sessions || [];
    return raw.map(norm).filter((s) => s.state !== 'closed' && !gone[s.id]).map((s) => (resuming[s.id] && s.state === 'fallen' ? { ...s, state: 'resuming' } : s));
  }, [sessions.status, sessions.data, resuming, gone]);

  // A session put away from its cockpit lands here with a word on what happened (router state, read once).
  useEffect(() => {
    const t = loc.state?.toast;
    if (!t) return;
    push(t);
    navigate(loc.pathname + loc.search, { replace: true, state: null });
  }, [loc.state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Every claim holder no tile stands for: matched against every session the server lists, closed or not.
  const holders = useMemo(() => {
    const rows = claims.status === 'ready' && Array.isArray(claims.data?.rows) ? claims.data.rows : [];
    const all = sessions.status === 'ready' && Array.isArray(sessions.data) ? sessions.data : [];
    return claimHolders(rows, all);
  }, [claims.status, claims.data, sessions.status, sessions.data]);
  const c = counts(list);
  const shown = list.filter(FILTERS.find((f) => f.value === filter)?.test || (() => true));
  const train = trainOf(list, trainOn);
  const [viewRef, dockRoom] = useDockRoom(train.active);
  const repos = [...new Set(list.map((s) => s.repo).filter(Boolean))];
  const where = (repos.length ? repos : [repo].filter(Boolean)).join(' and ');

  const notYet = (what) => push({ kind: 'error', title: `${what} is not wired up yet`, body: 'This server does not run sessions yet. Start /heads-down in a terminal; it shows up here as it starts.' });

  async function resume(s) {
    setResuming((m) => ({ ...m, [s.id]: true }));
    const r = await act(`/api/sessions/${encodeURIComponent(s.id)}/resume`, {});
    if (!r.ok) {
      setResuming((m) => { const n = { ...m }; delete n[s.id]; return n; });
      if (r.missing) notYet('Resume');
      else push({ kind: 'error', title: `Couldn't resume ${s.name}`, body: r.error });
      return;
    }
    // A fallen session is picked up by a new one on /reboot-resume; one this server runs just resumes.
    if (r.data?.resumes) push({ kind: 'info', title: `Resuming ${s.name} as ${r.data.name}`, body: `${r.data.name} runs ${r.data.prompt}: it takes the ledger, the claims and the worktree, and restarts the loop.` });
    sessions.reload();
  }

  // Clear a session that stopped when the server restarted: its star frees and its empty worktree closes.
  async function close(s) {
    setResuming((m) => ({ ...m, [s.id]: true }));
    const r = await act(`/api/sessions/${encodeURIComponent(s.id)}/close`, {});
    setResuming((m) => { const n = { ...m }; delete n[s.id]; return n; });
    if (!r.ok) push({ kind: 'error', title: `Couldn't clear ${s.name}`, body: r.error });
    else if (r.data?.worktree && !r.data.worktree.closed) push({ kind: 'info', title: `Cleared ${s.name}`, body: `Its star is free. Its worktree stays: ${r.data.worktree.note}` });
    else push({ kind: 'info', title: `Cleared ${s.name}`, body: 'Its star is free and its empty worktree is gone.' });
    sessions.reload();
  }

  // Put away a session that finished its job (fleet/PutAway.jsx made the call): its tile leaves, and says what stayed.
  function putAway(s, r) {
    setGone((m) => ({ ...m, [s.id]: true }));
    push(putAwayToast(s.name, r));
    sessions.reload();
  }

  // Link a terminal session: from then on a tug or an answer aimed at it lands at its next tool call (the steer hook).
  async function link(s, on) {
    const r = await act(`/api/sessions/${encodeURIComponent(s.id)}/link`, { on });
    if (!r.ok) push({ kind: 'error', title: `Couldn't ${on ? 'link' : 'unlink'} ${s.name}`, body: r.error });
    sessions.reload();
  }

  async function trainAct(action) {
    const r = await act('/api/train', { action });
    if (!r.ok) {
      if (r.missing) notYet('Pause all');
      else push({ kind: 'error', title: 'The reboot train did not move', body: r.error });
      return;
    }
    setTrainOn(action === 'pause');
    sessions.reload();
  }

  const onPause = () => (!train.active ? trainAct('pause') : trainAct(train.all ? 'resume' : 'cancel'));

  const topbar = (
    <Topbar>
      <Wordmark />
      <TbSep />
      <TbTitle title="Fleet" sub={summary(list)} />
      <TbSpacer />
      <InboxBtn />
      <LoopLine />
      <PauseAll train={train} onClick={onPause} />
    </Topbar>
  );

  // Terminals and fell-over sessions are a chip away, and the chip shows only while it holds something.
  const options = FILTERS.filter((f) => !f.optional || c[f.value] || filter === f.value).map((f) => ({ value: f.value, label: `${f.label} ${c[f.value]}` }));

  return (
    <AppFrame topbar={topbar} current="fleet">
      <main className="view" aria-label="Fleet" ref={viewRef}>
        <ViewHead style={{ alignItems: 'center' }}>
          <ChoiceButtons label="Show sessions" options={options} value={filter} onChange={setFilter} />
          <span className="view-sub" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon name="clock" size={14} />{[where, hhmm(now), 'tiles stay where you left them'].filter(Boolean).join(' · ')}
          </span>
          {holders.length ? (
            <span className="view-sub">
              {holders.length} {holders.length === 1 ? 'claim holder' : 'claim holders'} outside these sessions · <Link to={PATHS.board}>See them on the Plan board</Link>
            </span>
          ) : null}
        </ViewHead>
        {sessions.status === 'error' && !sessions.data ? (
          <Err title="Couldn't read the sessions" body="The tiles come back on their own once the server answers again." detail={sessions.error} actions={<button className="btn btn-s" type="button" onClick={sessions.reload}>Try again</button>} />
        ) : null}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', margin: '-8px -28px 0', padding: `8px 28px ${24 + dockRoom}px` }}>
          <div className="fleet-grid">
            {sessions.status === 'loading' ? <SkelTiles /> : null}
            {shown.map((s) => <SessionTile key={s.id} s={s} train={train} now={now} busy={!!resuming[s.id]} title={chunkTitle(plan.data, s.chunk?.id)} onPutAway={(r) => putAway(s, r)} onResume={() => resume(s)} onClose={s.ended ? () => close(s) : undefined} onLink={s.kind === 'terminal' ? (on) => link(s, on) : undefined} />)}
            {sessions.status !== 'loading' && filter === 'here' ? (
              <TileNew>
                <span className="cstar is-neutral" />
                <div className="t-title-s">Start another session</div>
                <StartLine plan={plan.data} />
                <StartPick compact plan={plan.data} sessions={list} onError={(title, body) => push({ kind: 'error', title, body })} />
                <span className="cap">Two or three at once is normal. Each one gets its own worktree, color and star.</span>
              </TileNew>
            ) : null}
          </div>
        </div>
        {train.active ? (
          <TrainDock sub="Every session stops at its next safe step, so you can restart this machine and pick up where each one was.">
            <Train cars={train.cars} bare />
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span className="t-body-s c-1">{train.text}</span>
              <TbSpacer />
              <button className="btn btn-s" type="button" onClick={() => trainAct('cancel')}>Cancel</button>
              <button className="btn btn-s btn-primary" type="button" disabled={!train.all} onClick={() => trainAct('resume')}>Resume all</button>
            </div>
          </TrainDock>
        ) : null}
      </main>
      <ToastHost toasts={toasts} />
    </AppFrame>
  );
}
