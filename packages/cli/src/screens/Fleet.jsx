// The fleet, home of the app (Fleet, FleetTrain, FleetKit boards and their
// Light variants, which differ only by theme tokens): every session as a
// tile, a filter row, "start another session", and Pause all (the reboot
// train) docked over the grid while it runs.
//
// Data: GET /api/sessions (useSessions). Actions: POST /api/sessions (start),
// POST /api/sessions/:id/resume (a hosted one resumes; a fallen one is taken
// by a new hosted session on /reboot-resume <star>), POST /api/train
// { action: pause|cancel|resume }. An action the server does not serve yet
// says plainly that it is not wired up; nothing is invented.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AppFrame, Topbar, Wordmark, TbSep, TbTitle, TbSpacer, InboxBtn, ViewHead, ChoiceButtons,
  TileNew, TrainDock, Train, ToastHost, Err, Icon, cx, useShell,
} from '../ui/index.js';
import { useSessions, usePlan } from '../data/index.js';
import { PATHS } from '../routes.js';
import LoopLine from './fleet/LoopLine.jsx';
import SessionTile from './fleet/SessionTile.jsx';
import { norm, FILTERS, counts, summary, trainOf } from './fleet/model.js';
import { act, hhmm } from './fleet/util.js';
import { useToasts } from './fleet/toasts.js';

const PLAY = 'M8 5.5v13l10-6.5z';
const PAUSE = 'M9 6v12M15 6v12';

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

function NextChunk({ next }) {
  if (!next?.id) return <>nexus claims the next chunk in line and asks its questions first.</>;
  const tail = [next.size ? `size ${next.size}` : null, next.lane ? `from the ${next.lane} lane` : null].filter(Boolean).join(', ');
  return <>nexus claims the next chunk in line and asks its questions first: <code className="t-mono-s c-1">{next.id}</code> {next.title}{tail ? `, ${tail}` : ''}.</>;
}

export default function Fleet() {
  const { repo } = useShell();
  const navigate = useNavigate();
  const now = useNow();
  const sessions = useSessions();
  const plan = usePlan();
  const { toasts, push } = useToasts();
  const [filter, setFilter] = useState('all');
  const [trainOn, setTrainOn] = useState(false);
  const [resuming, setResuming] = useState({});
  const [starting, setStarting] = useState(false);

  const list = useMemo(() => {
    const raw = sessions.status === 'ready' && Array.isArray(sessions.data) ? sessions.data : sessions.data?.sessions || [];
    return raw.map(norm).filter((s) => s.state !== 'closed').map((s) => (resuming[s.id] && s.state === 'fallen' ? { ...s, state: 'resuming' } : s));
  }, [sessions.status, sessions.data, resuming]);

  const c = counts(list);
  const shown = list.filter(FILTERS.find((f) => f.value === filter)?.test || (() => true));
  const train = trainOf(list, trainOn);
  const repos = [...new Set(list.map((s) => s.repo).filter(Boolean))];
  const where = (repos.length ? repos : [repo].filter(Boolean)).join(' and ');

  const notYet = (what) => push({ kind: 'error', title: `${what} is not wired up yet`, body: 'This server does not run sessions yet. Start /heads-down in a terminal; it shows up here as it starts.' });

  async function start() {
    setStarting(true);
    const r = await act('/api/sessions', {});
    setStarting(false);
    if (r.ok && r.data?.id) { navigate(PATHS.cockpit(r.data.id)); return; }
    if (r.missing) notYet('Starting a session from here');
    else push({ kind: 'error', title: "Couldn't start a session", body: r.error });
  }

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

  const options = FILTERS.map((f) => ({ value: f.value, label: `${f.label} ${c[f.value]}` }));

  return (
    <AppFrame topbar={topbar} current="fleet">
      <main className="view" aria-label="Fleet">
        <ViewHead style={{ alignItems: 'center' }}>
          <ChoiceButtons label="Show sessions" options={options} value={filter} onChange={setFilter} />
          <span className="view-sub" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon name="clock" size={14} />{[where, hhmm(now), 'tiles stay where you left them'].filter(Boolean).join(' · ')}
          </span>
        </ViewHead>
        {sessions.status === 'error' && !sessions.data ? (
          <Err title="Couldn't read the sessions" body="The tiles come back on their own once the server answers again." detail={sessions.error} actions={<button className="btn btn-s" type="button" onClick={sessions.reload}>Try again</button>} />
        ) : null}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', margin: '-8px -28px 0', padding: '8px 28px 24px' }}>
          <div className="fleet-grid">
            {shown.map((s) => <SessionTile key={s.id} s={s} train={train} now={now} busy={!!resuming[s.id]} onResume={() => resume(s)} onLink={s.kind === 'terminal' ? (on) => link(s, on) : undefined} />)}
            {sessions.status !== 'loading' && filter === 'all' ? (
              <TileNew>
                <span className="cstar is-neutral" />
                <div className="t-title-s">Start another session</div>
                <div className="t-body-s c-2"><NextChunk next={[].concat(plan.data?.next || [])[0]} /></div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-primary btn-s" type="button" onClick={start} disabled={starting} aria-busy={starting || undefined}><Icon name="plus" size={14} />Start heads-down</button>
                  <Link className="btn btn-ghost btn-s" to={PATHS.board}>Pick a chunk</Link>
                </div>
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
