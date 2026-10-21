// One session on the fleet (Fleet + FleetKit boards): live, needs you,
// observing (terminal), fallen, resuming, resumed, resume failed; and the
// pausing / paused chips while the reboot train runs.
import { Link } from 'react-router-dom';
import {
  Tile, TileChunk, TileBar, TileEvent, TileChip, ParkedBadge, Observing, Fresh, Fell, Flag,
  MTrack, Orb, Fil, SNode, Junction, FreshMark, Icon, cx,
} from '../../ui/index.js';
import { PATHS } from '../../routes.js';
import FleetGit from './FleetGit.jsx';
import { phaseItems, bar } from './model.js';
import { hhmm, ago } from './util.js';

/** Satellite agents around the main orb, and the filament box to each (board geometry). */
const SATS = [
  { x: '24%', y: '24%', fil: { l: '24%', t: '24%', w: '26%', h: '22%', d: 'M100 100C100 50 0 50 0 0' } },
  { x: '76%', y: '26%', fil: { l: '50%', t: '26%', w: '26%', h: '20%', d: 'M0 100C0 50 100 50 100 0' } },
  { x: '28%', y: '76%', fil: { l: '28%', t: '46%', w: '22%', h: '30%', d: 'M100 0C100 50 0 50 0 100' } },
  { x: '74%', y: '74%', fil: { l: '50%', t: '46%', w: '24%', h: '28%', d: 'M0 0C0 50 100 50 100 100' } },
];
// A session waiting on its start questions seats its idle agents in a triangle,
// and a terminal session its one helper up and left (Fleet board: sirius, polaris).
const ASK_SATS = [{ x: '22%', y: '30%' }, { x: '78%', y: '30%' }, { x: '50%', y: '82%' }];
const OBS_SATS = [{ x: '30%', y: '30%', fil: { l: '30%', t: '30%', w: '20%', h: '16%', d: 'M100 100C100 50 0 50 0 0' } }];
const ACTIVE = new Set(['thinking', 'tool', 'writing']);

function SkyStage({ s }) {
  const asking = s.state === 'asking';
  const observing = s.state === 'observing';
  const main = asking ? 'blocked' : s.orb || (s.state === 'resumed' ? 'thinking' : 'tool');
  const seats = asking ? ASK_SATS : observing ? [...OBS_SATS, ...SATS.slice(1)] : SATS;
  const agents = (s.agents || []).slice(0, seats.length);
  return (
    <>
      {!asking ? agents.map((a, i) => {
        const g = seats[i].fil;
        if (a.workflow) return <Fil key={`f${i}`} l={g.l} t={g.t} w={g.w} h={g.h} d={g.d} kind="flow" />;
        const quiet = observing || a.state === 'idle';
        return <Fil key={`f${i}`} l={g.l} t={g.t} w={g.w} h={g.h} d={g.d} kind={quiet ? 'quiet' : undefined} flow={!quiet && ACTIVE.has(a.state)} />;
      }) : null}
      <SNode x="50%" y="46%">
        <Orb state={main} px={observing ? 30 : 34} main={!observing} />
        {s.state === 'resumed' ? <FreshMark style={{ left: 10, top: -20, right: 'auto' }} /> : null}
      </SNode>
      {agents.map((a, i) => (
        <SNode key={`n${i}`} x={seats[i].x} y={seats[i].y}>
          {a.workflow ? <Junction style={{ transform: 'translate(-50%, -50%) scale(.7)' }} /> : <Orb state={asking ? 'idle' : a.state || 'idle'} size="xs" />}
        </SNode>
      ))}
    </>
  );
}

const Centered = ({ children, style }) => <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', ...style }}>{children}</div>;

function chunkLine(s) {
  const c = s.chunk || {};
  if (s.state === 'observing') return c.id || '';
  const parts = [`${c.id || ''}${c.first ? ' first' : ''}`, s.mode];
  if (s.mode === 'owner' && s.parked) parts.push(`${s.parked} parked`);
  return parts.filter(Boolean).join(' · ');
}

function OwnerChip() {
  return (
    <span className="mode-chip is-owner" style={{ height: 22, fontSize: 11, padding: '0 8px 0 7px' }}>
      <Icon name="lockOne" style={{ width: 12, height: 12 }} />owner
    </span>
  );
}

const recoverHref = (s) => (s.run ? `${PATHS.recover}?dir=${encodeURIComponent(s.run)}` : PATHS.recover);

export default function SessionTile({ s, train, onResume, onLink, busy, now }) {
  const st = s.state;
  const fallen = st === 'fallen' || st === 'resume-failed';
  const toRecover = fallen || st === 'resuming';
  const href = toRecover ? recoverHref(s) : PATHS.cockpit(s.id);
  const rider = s.kind === 'local' && !fallen && st !== 'closed';
  const b = bar(s);
  const waiting = s.questions?.total ? s.questions.total - (s.questions.answered || 0) : s.parked || 0;

  let badge = null;
  if (train.active && rider) badge = <TileChip paused={train.isPaused(s)} />;
  else if (st === 'asking') badge = waiting ? <ParkedBadge>{waiting} waiting</ParkedBadge> : null;
  else if (st === 'observing') badge = <Observing />;
  else if (st === 'fallen') badge = <Flag kind="fallen">fell over</Flag>;
  else if (st === 'resume-failed') badge = <Flag kind="fallen">resume failed</Flag>;
  else if (st === 'resuming') badge = <span className="t-label c-2">resuming</span>;
  else if (st === 'resumed') badge = <Fresh />;
  else if (s.mode === 'owner') badge = <OwnerChip />;
  else if (s.parked) badge = <ParkedBadge>{s.parked} parked</ParkedBadge>;

  let stage;
  if (fallen) stage = <Centered><Orb state="fallen" size="l" /></Centered>;
  else if (st === 'resuming') stage = <Centered style={{ background: 'radial-gradient(60% 60% at 50% 50%, var(--sky-a), transparent 70%)' }}><Orb relight size="l" gap="6deg" /></Centered>;
  else stage = <SkyStage s={s} />;

  const track = <MTrack items={phaseItems(s)} />;
  const chunk = <TileChunk id={chunkLine(s)} title={s.chunk?.title} muted={st === 'observing'} />;
  const event = s.event?.text ? <TileEvent flexNone>{s.event.at ? `${hhmm(s.event.at)} ` : ''}{s.event.text}</TileEvent> : null;
  const r = s.resume || {};

  let info;
  if (st === 'asking') {
    info = <>{chunk}{track}{b ? <TileBar {...b} /> : null}<Link className="btn btn-warn btn-s" to={href} style={{ alignSelf: 'flex-start' }}>{waiting ? `Answer ${waiting} to start` : 'Answer to start'}</Link></>;
  } else if (st === 'observing') {
    // Linked, a tug or an answer from here reaches this session at its next tool call, and only this session.
    info = (
      <>
        {chunk}{track}{b ? <TileBar {...b} /> : null}
        <TileEvent flexNone>{s.linked ? 'Linked: what you send reaches its next tool call.' : 'Started in a terminal. Link it to steer it from here.'}</TileEvent>
        {onLink ? (
          <button className={cx('btn btn-s', s.linked ? 'btn-ghost' : 'btn-primary')} type="button" onClick={() => onLink(!s.linked)} disabled={busy} aria-pressed={s.linked ? 'true' : 'false'} style={{ alignSelf: 'flex-start' }}>
            {s.linked ? 'Unlink' : 'Link'}
          </button>
        ) : null}
      </>
    );
  } else if (st === 'fallen') {
    const f = s.fell || {};
    const lost = f.at || s.beat;
    info = (
      <>
        <Fell>
          <span>Fell over{f.tool ? <> at <code>{f.tool}</code></> : null}{f.chunk || s.chunk?.id ? <> in chunk <b>{f.chunk || s.chunk.id}</b></> : null}.</span>
          {lost ? <span className="t-mono-xs c-3">heartbeat lost {hhmm(lost)} · {ago(lost, now)}</span> : null}
        </Fell>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-s" type="button" onClick={onResume} disabled={busy} aria-busy={busy || undefined}><Icon name="refresh" size={14} />Resume</button>
          <Link className="btn btn-s" to={href}>Inspect</Link>
        </div>
      </>
    );
  } else if (st === 'resume-failed') {
    info = (
      <>
        <div className="err" style={{ padding: '10px 12px', gap: 8 }}><div className="err-body"><b className="c-1">Couldn't resume.</b> {r.error || 'The session did not come back from its recap.'}</div></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn btn-s" to={href}>Inspect</Link>
          <Link className="btn btn-ghost btn-s" to={PATHS.recover}>Recover from workflow folder</Link>
        </div>
      </>
    );
  } else if (st === 'resuming') {
    const total = r.total || 4;
    const done = Math.min(r.done || 0, total);
    const items = Array.from({ length: total }, (_, i) => (i < done ? 'on' : i === done ? 'cur' : ''));
    const meta = ['recap', r.steps != null ? `last ${r.steps} steps` : null, r.files != null ? `${r.files} files open` : null].filter(Boolean).join(' · ');
    info = (
      <>
        <Fell style={{ background: 'color-mix(in oklab, var(--accent) 8%, var(--well))' }}>
          <span>Relighting: a fresh session is reading the recap of {r.chunk || s.chunk?.id || 'its chunk'}.</span>
          <div className="qprog">{items.map((c, i) => <i key={i} className={c || undefined} style={c === 'cur' ? { background: 'var(--accent)' } : undefined} />)}</div>
        </Fell>
        <span className="t-mono-xs c-3">{meta}</span>
      </>
    );
  } else if (st === 'resumed') {
    info = <>{chunk}{track}<Link to={recoverHref(s)} className="t-body-s">Read the recap it started from</Link></>;
  } else {
    info = <>{chunk}{track}{b ? <TileBar {...b} /> : null}{event}</>;
  }

  const footEvent = st === 'resuming' || st === 'resumed' || st === 'resume-failed';
  const foot = footEvent
    ? <span className="tile-event">{s.event?.at ? `${hhmm(s.event.at)} ` : ''}{s.event?.text || (st === 'resuming' ? 'resume started' : '')}</span>
    : <FleetGit git={s.git} />;

  return (
    <Tile
      session={s.session}
      state={fallen ? 'fallen' : st === 'asking' ? 'asking' : st === 'observing' ? 'observing' : 'live'}
      className={st === 'asking' ? 'is-hushed' : undefined}
      href={href}
      nameStyle={{ color: 'var(--text)' }}
      repo={s.repo}
      badge={badge}
      stage={stage}
      info={info}
      foot={foot}
    />
  );
}
