// Cloud loop (design/handoff/CloudLoop.dc.html, + Light via tokens): the
// runs timeline (.runs / .run-row) and the summary cards (.cl-side). Live
// data: the loop's workflow and secret from /api/actions, runs from
// /api/runs and the event stream; /api/cloud (schedule, next tick, PRs and
// parked questions per run) fills in the rest the day it lands.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, PauseBtn, InboxBtn, Empty, Err, cx, useShell } from '../ui/index.js';
import { CronCode } from '../ui/code.jsx';
import { server, useClaims, useInbox } from '../data/index.js';
import { PATHS } from '../routes.js';
import { useLoop, hhmm, inWords, clock, tonightStart } from './cloud-settings/loop.js';
import { Frame, LoopDot, andList } from './cloud-settings/parts.jsx';

/** A clock that ticks once a second while `on`. */
function useNow(on) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

function RunDot({ state }) {
  if (state === 'next') return <span className="run-dot is-next"><Icon name="clock" size={12} style={{ color: 'var(--accent)' }} /></span>;
  if (state === 'green') return <span className="run-dot"><span className="ci-green"><span className="ci-dot"><Icon name="check" /></span></span></span>;
  if (state === 'red') return <span className="run-dot"><span className="ci-red"><span className="ci-dot"><Icon name="x" /></span></span></span>;
  if (state === 'running') return <span className="run-dot"><span className="ci-running"><span className="ci-dot" /></span></span>;
  return <span className="run-dot is-idle"><span className="ci-dot" /></span>;
}

const DOT = { parked: 'var(--st-blocked)', done: 'var(--st-done)' };

function Chip({ k, now, startedAt }) {
  if (k.kind === 'pr') return <span className={cx('pill pill-pr', k.state === 'merged' ? 'is-merged' : 'is-open')}>{k.label || `PR ${k.num} · ${k.state}`}</span>;
  if (k.kind === 'ci') {
    const label = k.state === 'running' && startedAt ? `${k.label} · ${clock(now - Date.parse(startedAt))}` : k.label;
    return <span className={`pill pill-ci ci-${k.state}`}>{label}</span>;
  }
  const dot = DOT[k.kind] || k.dot;
  return <span className="pill">{dot ? <span className="ci-dot" style={{ width: 10, height: 10, background: dot }} /> : null}{k.label}</span>;
}

function RunRow({ u, now }) {
  const cls = cx('run-row', u.state === 'running' && 'is-running', u.state === 'next' && 'is-next', u.state === 'paused' && 'is-paused');
  return (
    <div className={cls} role="listitem">
      <span className="run-when">{u.when}<span className="d">{u.day}</span></span>
      <RunDot state={u.state === 'paused' ? 'next' : u.state} />
      <div>
        <div className="run-t">{u.n ? <span className="n">{u.n}</span> : null}{u.t}</div>
        <div className="run-d">{u.d}</div>
        <div className="run-chips">{(u.chips || []).map((k, i) => <Chip key={i} k={k} now={now} startedAt={u.startedAt} />)}</div>
      </div>
      <div className="run-meta">
        <span>{u.dur}</span>
        {u.url ? <a className="btn btn-ghost btn-s" href={u.url} target="_blank" rel="noreferrer">Logs<Icon name="external" size={14} /></a> : null}
      </div>
    </div>
  );
}

export default function CloudLoop() {
  const { repo, owner } = useShell();
  const loop = useLoop();
  const claims = useClaims();
  const inbox = useInbox();
  const [ask, setAsk] = useState(null); // { at } while a manual pass is starting
  const [runErr, setRunErr] = useState(null);

  // A manual pass is "running" from the click until gh lists a run that started after it.
  const started = ask && loop.runs.some((r) => Date.parse(r.startedAt) >= ask.at - 5000);
  useEffect(() => { if (started) setAsk(null); }, [started]);
  useEffect(() => {
    if (!ask) return undefined;
    const t = setTimeout(() => setAsk(null), 90000);
    return () => clearTimeout(t);
  }, [ask]);

  const anyRunning = !!ask || loop.runs.some((r) => r.state === 'running');
  const now = useNow(anyRunning);

  const runNow = async () => {
    if (ask) return;
    setRunErr(null);
    const at = Date.now();
    try {
      await server.dispatchWorkflow(loop.wf?.id);
      setAsk({ at });
      loop.reload();
    } catch (e) {
      setRunErr(e.status === 404 ? 'This server cannot start a run yet. Run gh workflow run from a terminal, or wait for the next tick.' : e.message);
    }
  };

  const rows = useMemo(() => {
    const out = [];
    if (ask) out.push({ id: 'ask', state: 'running', when: 'now', day: 'by you', n: '', t: 'Running one pass', d: 'Asked GitHub for a run. It joins this list as soon as it starts.', chips: [{ kind: 'ci', state: 'running', label: 'running' }], dur: '', url: '', startedAt: new Date(ask.at).toISOString() });
    if (loop.paused) {
      out.push({ id: 'next', state: 'paused', when: loop.next ? hhmm(loop.next) : '', day: 'paused', n: '', t: 'Paused', d: 'No runs until you resume. The next one would take the first chunk in line.', chips: [], dur: '' });
    } else if (loop.next) {
      out.push({ id: 'next', state: 'next', when: hhmm(loop.next), day: inWords(loop.next, now), n: '', t: 'Next run', d: loop.cloud?.nextDetail || 'Will take the next chunk in line. Skips everything local sessions hold.', chips: [], dur: '' });
    }
    return out.concat(loop.runs);
  }, [ask, loop.paused, loop.next, loop.runs, loop.cloud, now]);

  // Tonight: from 18:00 local. Counts the server gives (PRs, parked, secrets requested) or derived from the runs; a dash when unknown.
  const since = tonightStart(new Date(now)).getTime();
  const tonightRuns = loop.runs.filter((r) => Date.parse(r.startedAt) >= since);
  const t = loop.cloud?.tonight || {};
  const parkedFromInbox = inbox.status === 'ready' && Array.isArray(inbox.data) ? inbox.data.filter((q) => q.kind === 'cloud').length : null;
  const parked = t.parked ?? parkedFromInbox;
  const stat = (v) => (v == null ? '–' : String(v));
  // Red runs moved out of the grid to a line under it; the grid's fourth stat is the secrets runs asked for
  // (tonight.secrets), a dash until /api/cloud counts them.
  const red = tonightRuns.filter((r) => r.state === 'red').length;

  const held = claims.status === 'ready' ? (claims.data?.rows || []).filter((r) => !/^cloud/.test(r.session || '') && r.state !== 'stale').map((r) => r.id) : [];

  const pauseState = loop.pending && !loop.paused ? 'pausing' : loop.paused ? 'paused' : 'run';
  const pauseSub = loop.pending && !loop.paused ? `disabling ${loop.file}`
    : loop.paused ? (loop.cloud?.pausedAt ? `paused at ${hhmm(loop.cloud.pausedAt)}` : 'no runs until you resume')
      : loop.next ? `next run ${hhmm(loop.next)}` : loop.file;

  const head = (
    <div className="view-head">
      <div className="view-title">
        <h1 className="t-title-l">Cloud loop</h1>
        <span className="view-sub">{repo}{loop.file ? <> · CI workflow <code className="t-mono-s c-1">{loop.file}</code></> : null} · each run claims the next chunk, builds and checks it, commits, and parks its questions</span>
      </div>
      {loop.wf ? (
        <div className="view-acts">
          <PauseBtn state={pauseState} label={loop.paused ? 'Resume loop' : pauseState === 'pausing' ? 'Pausing' : 'Pause loop'} sub={pauseSub} onClick={() => loop.setPaused(!loop.paused)} />
          <button className="btn btn-primary btn-l" type="button" onClick={runNow} disabled={!!ask}><Icon name="play" size={14} />{ask ? 'Running…' : 'Run one pass now'}</button>
        </div>
      ) : null}
    </div>
  );

  let body;
  if (loop.status === 'loading') {
    body = null;
  } else if (loop.status === 'nogh' || loop.status === 'error') {
    body = <Err icon="offline" title={loop.note || 'gh could not read this repo'} body="nexus reads the cloud loop through your own gh login. Nothing in the loop has changed." actions={<button className="btn btn-s" type="button" onClick={loop.reload}>Check again</button>} />;
  } else if (loop.status === 'none') {
    body = <Empty sky="none" title="No cloud loop yet" body="This repo has no loop workflow. Setup adds one, and the first pass runs at its next tick." action={<Link className="btn btn-s" to={PATHS.onboarding('cloud')}>Set up the cloud loop</Link>} />;
  } else {
    body = (
      <div className="cl-wrap">
        {rows.length ? (
          <div className="runs" role="list" aria-label="Recent runs">
            {rows.map((u) => <RunRow key={u.id} u={u} now={now} />)}
          </div>
        ) : (
          <div className="runs" aria-label="Recent runs">
            <Empty sky="waiting" title="No cloud runs yet" body={loop.runsError || 'The first pass runs at the next scheduled tick, or now if you ask.'} />
          </div>
        )}
        <aside className="cl-side" aria-label="Loop summary">
          <div className="side-card">
            <span className="t-caps c-2">Tonight</span>
            <div className="stat-grid">
              <div className="stat"><b>{tonightRuns.length}</b><span>runs</span></div>
              <div className="stat"><b>{stat(t.prs)}</b><span>PRs opened</span></div>
              <div className="stat"><b>{stat(parked)}</b><span>{parked === 1 ? 'question parked' : 'questions parked'}</span></div>
              <div className="stat"><b>{stat(t.secrets)}</b><span>{t.secrets === 1 ? 'secret requested' : 'secrets requested'}</span></div>
            </div>
            <span className="t-body-s c-3">{red ? `${red} red run${red > 1 ? 's' : ''} tonight.` : 'No red runs tonight.'}</span>
            {parked ? <Link className="t-body-s" to={PATHS.inbox}>{parked} question{parked > 1 ? 's' : ''} from the loop {parked > 1 ? 'are' : 'is'} in your inbox</Link> : null}
          </div>
          <div className="side-card">
            <span className="t-caps c-2">Schedule</span>
            <div className="t-title-s">{loop.schedule?.label || loop.wf?.name}</div>
            <span className="t-body-s c-2">
              {loop.schedule?.window ? <>{loop.schedule.window} · </> : null}
              {loop.schedule?.cron ? <>cron <CronCode cron={loop.schedule.cron} words={loop.schedule.raw ? undefined : false} /></> : <>workflow <code className="t-mono-s c-1">{loop.wf?.path}</code></>}
            </span>
            {loop.paused || loop.next ? (
              <span className="t-body-s c-2" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <Icon name="clock" size={14} />
                {loop.paused ? (loop.next ? `Paused. Resume to bring back the ${hhmm(loop.next)} run.` : 'Paused. Resume to bring back the scheduled runs.') : ['Next run ' + hhmm(loop.next), inWords(loop.next, now)].filter(Boolean).join(', ')}
              </span>
            ) : null}
            <Link className="btn btn-ghost btn-s" to={PATHS.settings} style={{ alignSelf: 'flex-start' }}>Change in Settings</Link>
          </div>
          {loop.secret ? (
            <div className="side-card">
              <span className="t-caps c-2">Sign-in</span>
              <div className="secret" style={{ background: 'transparent', padding: 0 }}>
                <span className="secret-name">{loop.secret.name || 'CLAUDE_CODE_OAUTH_TOKEN'}</span>
                {loop.secret.ok
                  ? <span className="chk-state is-ok"><Icon name="check" size={14} />set</span>
                  : loop.secret.ok == null
                    ? <span className="chk-state is-wait">unknown</span>
                    : <span className="chk-state is-warn"><Icon name="warn" size={14} />missing</span>}
                <span className="secret-d">
                  {loop.secret.ok
                    ? <>The loop&apos;s own sign-in{loop.secret.added ? <>, added {loop.secret.added} with <code>claude setup-token</code></> : null}. It is not a project secret: {owner ? <>project secrets live in the <Link to={PATHS.vault}>vault</Link>.</> : 'this loop opens PRs and never deploys, so deploy keys stay with the owner.'} Runs stop and park a question if it ever expires.</>
                    : loop.secret.ok == null ? loop.secret.detail : loop.secret.fix}
                </span>
              </div>
            </div>
          ) : null}
          <div className="side-card">
            <span className="t-caps c-2">Claims</span>
            <span className="t-body-s c-2">Runs never touch a chunk a local session holds.{held.length ? ` Right now that keeps them off ${andList(held)}.` : ''}</span>
          </div>
        </aside>
      </div>
    );
  }

  return (
    <Frame current="cloud" title="Cloud loop" sub={repo} end={<><LoopDot loop={loop} /><InboxBtn /></>}>
      {head}
      {loop.error || runErr ? <Err title={loop.error ? 'gh did not change the loop' : 'The pass did not start'} body={loop.error || runErr} /> : null}
      {body}
    </Frame>
  );
}
