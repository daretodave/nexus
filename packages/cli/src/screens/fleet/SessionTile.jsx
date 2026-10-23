// One session on the fleet (Fleet + FleetKit boards): live, needs you,
// observing (terminal), fallen, resuming, resumed, resume failed; and the
// pausing / paused chips while the reboot train runs. Spec 47 (A10): idle
// reads idle, the stage carries the session's last word or tool row, and a
// GUI session that died with its server and left nothing reads "stopped"
// with a Clear. Terminal, fallen and stopped tiles show under their own
// fleet chips, never by default (fleet/model.js aside). 0.5.1: each tile
// reads its state by colour (fleet/alive.js tone): working cyan and moving,
// needs you amber, done green with a check and an offer to put it away.
// Recovery: a session that stopped with nexus (a restart, an upgrade) reads calm,
// "stopped with nexus", on This machine, with Pick up (the same star, worktree
// and conversation) and Put away where nothing is mid-flight.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Tile, TileChunk, TileBar, TileEvent, TileChip, ParkedBadge, Fresh, Fell, Flag,
  MTrack, Orb, Fil, SNode, Junction, FreshMark, Icon, Markdown, ToolArgs, cx,
} from '../../ui/index.js';
import { PATHS } from '../../routes.js';
import FleetGit from './FleetGit.jsx';
import { phaseItems, bar, idleLine, lastLine } from './model.js';
import { hhmm, ago } from './util.js';
import { QUADS, seatsFor, filFor } from './sky.js';
import { finishedJob, tone, mainOrb, agentOrb, doneTrack, doneTitle, jobTitle, fellParts, keptAlready, rememberKeep, viewerStore } from './alive.js';
import PutAway from './PutAway.jsx';
import { badgeText } from '../../../shared/models.mjs';
import '../../styles/model.css';
import '../../styles/fleet-alive.css';

// A session waiting on its start questions seats its idle agents in a triangle,
// and a terminal session its one helper up and left (Fleet board: sirius, polaris).
const ASK_SATS = [{ x: '22%', y: '30%' }, { x: '78%', y: '30%' }, { x: '50%', y: '82%' }];
const OBS_SATS = [{ x: '30%', y: '30%', fil: { l: '30%', t: '30%', w: '20%', h: '16%', d: 'M100 100C100 50 0 50 0 0' } }];

function SkyStage({ s, t }) {
  const asking = s.state === 'asking';
  const observing = s.state === 'observing';
  const main = mainOrb(s, t);
  const seats = asking ? ASK_SATS : observing ? [...OBS_SATS, ...QUADS.slice(1)] : seatsFor(s.name);
  const agents = (s.agents || []).slice(0, seats.length);
  // A finished session's agents rest: no flow on its filaments (their states say done, not working).
  const resting = t === 'done' || t === 'idle';
  return (
    <>
      {!asking ? agents.map((a, i) => {
        // Each star's own seats; a known idle agent draws its idle curve (Fleet board: deneb).
        const f = filFor(seats[i], resting ? { state: 'idle' } : a, { observing });
        return <Fil key={`f${i}`} l={f.l} t={f.t} w={f.w} h={f.h} d={f.d} kind={f.kind} flow={f.flow || undefined} />;
      }) : null}
      <SNode x="50%" y="46%">
        <Orb state={main} px={observing ? 30 : 34} main={!observing} />
        {s.state === 'resumed' ? <FreshMark style={{ left: 10, top: -20, right: 'auto' }} /> : null}
      </SNode>
      {agents.map((a, i) => (
        <SNode key={`n${i}`} x={seats[i].x} y={seats[i].y}>
          {a.workflow && !resting ? <Junction style={{ transform: 'translate(-50%, -50%) scale(.7)' }} /> : <Orb state={agentOrb(a, t)} size="xs" />}
        </SNode>
      ))}
    </>
  );
}

/** Where a session fell, coloured: the tool's name, then its command or path as a tool row draws it. */
function FellAt({ tool }) {
  const p = fellParts(tool);
  if (!p) return null;
  return <code className="fell-at">{p.tool ? <span className="fa-tool">{p.tool}</span> : null}{p.tool && p.arg ? ' ' : null}{p.arg ? <ToolArgs tool={p.tool} args={p.arg} /> : null}</code>;
}

/** The done chip: a green check and the word. */
function DoneChip() {
  return <span className="done-chip"><Icon name="check" size={12} />done</span>;
}

const Centered = ({ children, style }) => <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', ...style }}>{children}</div>;

/** The stage's foot: the session's last word (inline markdown, one line) or its last tool row. */
function TileLast({ s }) {
  const l = lastLine(s);
  if (!l) return null;
  return (
    <div className="tile-last" title={l.kind === 'tool' ? `${l.tool} ${l.arg}` : l.text}>
      {l.kind === 'tool'
        ? <><span className="tool">{l.tool}</span>{l.arg ? <span className="arg">{l.arg}</span> : null}</>
        : <Markdown text={l.text} inline />}
    </div>
  );
}

function chunkLine(s) {
  const c = s.chunk || {};
  if (s.state === 'observing') return c.id || '';
  if (!c.id && s.idle) return s.mode === 'owner' ? 'owner' : '';
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

/** What a session that stopped with nexus says on its tile: why it stopped, and what Pick up does. */
export function stoppedWords(s) {
  const st = s.stop || {};
  const lines = [];
  if (st.note) lines.push('The last pick-up did not finish.');
  // An older nexus (0.5.1) never said how it stopped: no crash to report, only that it stopped.
  else if (!st.clean && st.legacy) lines.push('Stopped when the older nexus closed. Its work is on disk; pick up to carry on.');
  else if (!st.clean) lines.push('nexus closed without saying goodbye. Its work is on disk; pick up to carry on.');
  else if (st.train) lines.push('Parked by its reboot train before nexus closed. Pick up resumes the loop.');
  else if (st.turn === 'forming') lines.push('Stopped while its worktree was being made. Pick up to finish it and send your message.');
  else if (st.turn === 'working') lines.push('Stopped mid-step when nexus restarted. Pick up to finish the step.');
  else if (st.turn === 'asking') lines.push('Stopped while it asked you something. Answer it to pick up.');
  else if (st.paused) lines.push('Paused when nexus restarted. Its conversation and worktree are kept; Pick up resumes it.');
  else lines.push('Stopped when nexus restarted. Its conversation and worktree are kept.');
  if (st.queued > 0) lines.push(`${st.queued} ${st.queued === 1 ? 'message' : 'messages'} waiting to send.`);
  if (s.git?.missing && !s.git?.branchGone) lines.push('Its worktree folder is gone; Pick up brings it back from its branch.');
  else if (s.git?.missing) lines.push('Its worktree and branch are gone; nothing on disk to keep.');
  // Put away is offered where nothing is mid-flight: not mid-step, not while its worktree forms, not after a failed pick-up.
  const away = !st.note && st.turn !== 'working' && st.turn !== 'forming';
  return { lines, away };
}

export default function SessionTile({ s, train, onResume, onPickup, onLink, onClose, onPutAway, busy, now, title }) {
  const st = s.state;
  const stopped = st === 'stopped' && !s.ended;
  const [away, setAway] = useState(false);
  const done = finishedJob(s);
  const t = tone(s, done);
  // Keep it: remembered in this browser for this job only; a later job that finishes asks again.
  const [, setKeptTick] = useState(0);
  const kept = done ? keptAlready(s, viewerStore()) : false;
  const keep = () => { rememberKeep(s, viewerStore()); setKeptTick((n) => n + 1); };
  const fallen = !s.ended && (st === 'fallen' || st === 'resume-failed');
  // A session the GUI started opens its own cockpit (its saved conversation), never an empty Recover.
  const toRecover = (fallen || st === 'resuming') && !s.gui;
  const href = toRecover || (s.ended && !s.gui) ? recoverHref(s) : PATHS.cockpit(s.id);
  const rider = s.kind === 'local' && !fallen && st !== 'closed';
  const b = bar(s);
  const waiting = s.questions?.total ? s.questions.total - (s.questions.answered || 0) : s.parked || 0;

  let badge = null;
  if (s.ended) badge = <span className="t-label c-2">stopped</span>;
  else if (stopped) badge = <span className="t-label c-2">stopped with nexus</span>;
  else if (train.active && rider) badge = <TileChip paused={train.isPaused(s)} />;
  else if (st === 'asking') badge = waiting ? <ParkedBadge>{waiting} waiting</ParkedBadge> : null;
  else if (st === 'observing') badge = <span className="observing"><Icon name="observe" size={12} />in a terminal</span>;
  else if (st === 'fallen') badge = <Flag kind="fallen">fell over</Flag>;
  else if (st === 'resume-failed') badge = <Flag kind="fallen">resume failed</Flag>;
  else if (st === 'resuming') badge = <span className="t-label c-2">resuming</span>;
  else if (st === 'resumed') badge = <Fresh />;
  else if (done) badge = s.mode === 'owner' ? <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><OwnerChip /><DoneChip /></span> : <DoneChip />;
  else if (s.idle) badge = <span className="t-label c-2">idle</span>;
  else if (s.mode === 'owner') badge = <OwnerChip />;
  else if (s.parked) badge = <ParkedBadge>{s.parked} parked</ParkedBadge>;

  let stage;
  if (s.ended) stage = <Centered><Orb state="idle" size="l" /></Centered>;
  else if (stopped) stage = <><Centered><Orb state="idle" size="l" /></Centered><TileLast s={s} /></>;
  else if (fallen) stage = <Centered><Orb state="fallen" size="l" /></Centered>;
  else if (st === 'resuming') stage = <Centered style={{ background: 'radial-gradient(60% 60% at 50% 50%, var(--sky-a), transparent 70%)' }}><Orb relight size="l" gap="6deg" /></Centered>;
  else stage = <><SkyStage s={s} t={t} /><TileLast s={s} /></>;

  const track = <MTrack items={done ? doneTrack(phaseItems(s)) : phaseItems(s)} />;
  const cl = chunkLine(s);
  const head = s.chunk?.title || title || (done ? doneTitle(done) : t === 'working' ? jobTitle(s) : '');
  const chunk = cl || head ? <TileChunk id={cl} title={head} muted={st === 'observing'} /> : null;
  const event = done ? <TileEvent flexNone>{s.last?.at ? `${hhmm(s.last.at)} ` : ''}Done · {done.text}</TileEvent>
    : s.idle ? <TileEvent flexNone>{idleLine(s)}</TileEvent>
    : s.event?.text ? <TileEvent flexNone>{s.event.at ? `${hhmm(s.event.at)} ` : ''}{s.event.text}</TileEvent> : null;
  const r = s.resume || {};

  let info;
  if (s.ended) {
    // A session the GUI started that stopped with its server and left nothing: no commits, no changes, no claims.
    info = (
      <>
        {chunk}
        <Fell>
          <span>Stopped when this server restarted. It left no commits, changes or claims, so clearing it loses nothing.</span>
          {s.beat ? <span className="t-mono-xs c-3">last beat {hhmm(s.beat)} · {ago(s.beat, now)}</span> : null}
        </Fell>
        {onClose ? (
          <button className="btn btn-s" type="button" onClick={onClose} disabled={busy} aria-busy={busy || undefined} title="Frees its star and removes its empty worktree" style={{ alignSelf: 'flex-start' }}>
            <Icon name="x" size={14} />Clear
          </button>
        ) : null}
      </>
    );
  } else if (stopped) {
    // Stopped with nexus (a restart, an upgrade): calm, kept, one click from carrying on where it left off.
    const w = stoppedWords(s);
    info = (
      <>
        {chunk}
        <Fell style={{ background: 'var(--well)' }}>
          {w.lines.map((l) => <span key={l}>{l}</span>)}
          {s.stop?.at ? <span className="t-mono-xs c-3">stopped {hhmm(s.stop.at)} · {ago(s.stop.at, now)}</span> : null}
        </Fell>
        {away && onPutAway ? <PutAway s={s} compact onGone={onPutAway} onKeep={() => setAway(false)} /> : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {onPickup ? <button className="btn btn-primary btn-s" type="button" onClick={onPickup} disabled={busy} aria-busy={busy || undefined} title="The same star, worktree and conversation, carried on"><Icon name="refresh" size={14} />Pick up</button> : null}
            {w.away && onPutAway ? <button className="btn btn-ghost btn-s" type="button" onClick={() => setAway(true)} disabled={busy}>Put away</button> : null}
          </div>
        )}
      </>
    );
  } else if (st === 'asking') {
    const word = s.stop ? 'pick up' : 'start';
    info = <>{chunk}{track}{b ? <TileBar {...b} /> : null}<Link className="btn btn-warn btn-s" to={href} style={{ alignSelf: 'flex-start' }}>{waiting ? `Answer ${waiting} to ${word}` : `Answer to ${word}`}</Link></>;
  } else if (st === 'observing') {
    // Linked, a tug or an answer from here reaches this session at its next tool call, and only this session.
    info = (
      <>
        {chunk}{track}{b ? <TileBar {...b} /> : null}
        {s.idle ? event : null}
        <TileEvent flexNone>{s.linked ? 'Linked: what you send reaches its next tool call.' : 'Running in another terminal. Link it to steer it from here.'}</TileEvent>
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
          <span>Fell over{f.tool ? <> at <FellAt tool={f.tool} /></> : null}{f.chunk || s.chunk?.id ? <> in chunk <b>{f.chunk || s.chunk.id}</b></> : null}.</span>
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
  } else if (done) {
    info = (
      <>
        {chunk}{track}{event}
        {!kept && onPutAway && !s.home ? <PutAway s={s} done={done} compact onGone={onPutAway} onKeep={keep} /> : null}
      </>
    );
  } else {
    info = <>{chunk}{track}{b ? <TileBar {...b} /> : null}{event}</>;
  }

  const footEvent = st === 'resuming' || st === 'resumed' || st === 'resume-failed';
  const foot = footEvent
    ? <span className="tile-event">{s.event?.at ? `${hhmm(s.event.at)} ` : ''}{s.event?.text || (st === 'resuming' ? 'resume started' : '')}</span>
    : <FleetGit git={s.git} />;
  // A hosted session's model and effort, small (spec 54): what the SDK's init said, "model: starting…" before it.
  const model = 'model' in s && !s.ended && !fallen && !stopped ? <span className="tile-model" title={s.model || undefined}>{badgeText(s)}</span> : null;

  return (
    <Tile
      session={s.session}
      state={fallen ? 'fallen' : st === 'asking' ? 'asking' : st === 'observing' ? 'observing' : 'live'}
      className={cx(st === 'asking' && 'is-hushed', (s.idle || stopped) && 'is-idle', s.ended && 'is-ended', `tone-${t}`)}
      href={href}
      nameStyle={{ color: 'var(--text)' }}
      repo={s.repo}
      badge={badge}
      stage={stage}
      info={info}
      foot={<>{foot}{model}</>}
    />
  );
}
