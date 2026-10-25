// Step 6 · Cloud loop, optional (boards CloudSetup, CloudSetupLight). Four
// steps read from GET /api/actions and GET /api/runs: the loop workflow,
// the one secret, one real pass, and a schedule: one of the five cadence
// presets (spec 55) or overnight. Add it writes the kit's march.yml (POST
// /api/cloud/workflow), Run one pass dispatches it (POST /api/cloud/run) and
// Turn on saves the schedule (POST /api/cloud/schedule: a preset writes its
// cron and sets NEXUS_CADENCE);
// each lands per owner mode (owner: committed to the default branch;
// contributor: a pull request), and nothing claims to be done that is not.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, useShell, stepCount, stepAfter, stepBefore, stepNo } from '../../ui/index.js';
import { server, useActions, useRuns } from '../../data/index.js';
import { PATHS } from '../../routes.js';
import { ObFrame, Back } from './frame.jsx';
import { useDraft } from './draft.js';
import { onboardingCalls } from './calls.js';
import { landThenGo, turnOnCloud, pickSched, keepsSchedule, nextLocal, cloudGate, cronFor, cadenceSub, CADENCES, BUSY_NOTE } from './cloudFlow.js';
import RepoStart, { useRepoStart, Cmds } from './RepoStart.jsx';
import TokenGuide from './TokenGuide.jsx';
import { repoCalls } from './calls.js';
import '../../styles/cloud-current.css';
import '../../styles/repo-start.css';
import { usePlotLive, PlotAskStrip } from './PlotAsk.jsx';

const LOOP_FILE = /(?:^|\/)(nexus-loop|march)\.ya?ml$/;
const NIGHT_HOURS = [1, 2, 3, 4, 5, 6];

function ranges(hours) {
  const out = [];
  for (const h of hours) {
    const last = out[out.length - 1];
    if (last && h === last[1] + 1) last[1] = h; else out.push([h, h]);
  }
  return out.map(([a, b]) => (a === b ? `${a}` : b === a + 1 ? `${a},${b}` : `${a}-${b}`)).join(',');
}

/** GitHub cron runs in UTC: 01:30 to 06:30 here, converted. */
function nightCron(now = new Date()) {
  const off = now.getTimezoneOffset();
  const mins = NIGHT_HOURS.map((h) => (((h * 60 + 30 + off) % 1440) + 1440) % 1440);
  const m = mins[0] % 60;
  const hours = [...new Set(mins.map((x) => Math.floor(x / 60)))].sort((a, b) => a - b);
  return `${m} ${ranges(hours)} * * *`;
}

function nextNight(now = new Date()) {
  const t = now.getHours() * 60 + now.getMinutes();
  const slot = NIGHT_HOURS.find((h) => h * 60 + 30 > t);
  if (slot == null || t < 90) return 'tonight at 01:30';
  return `at ${String(slot).padStart(2, '0')}:30`;
}

/**
 * The options (spec 55, A9): the schedule the workflow has first when it has one (49.1), the five cadence presets,
 * then overnight, a custom cron outside them. Off says so when no schedule is what the workflow has.
 */
export function schedOptions(found) {
  const out = [];
  if (found?.crons?.length) {
    out.push(['current', {
      label: found.raw ? <>Current: <code>{found.crons.join(', ')}</code> UTC</> : `Current: ${found.human}`,
      sub: `as ${found.path} has it; Turn on keeps it`,
      now: true,
    }]);
  }
  for (const [k, c] of Object.entries(CADENCES)) {
    const sub = found && !found.crons?.length && k === 'off' ? 'current: no schedule; Turn on keeps it' : cadenceSub(k);
    out.push([k, { label: c.label, sub, preset: true }]);
  }
  out.push(['night', { label: 'Overnight', sub: 'custom: every hour at :30, 01:30 to 06:30' }]);
  return out;
}

/** The line under the options: when the picked one next runs, its cron, and the variable a preset sets. */
export function nextLine(k, found) {
  if (k === 'current') {
    const at = nextLocal(found?.next);
    return `${at ? `Next run ${at}, your time` : 'No next run read'} · cron ${found?.crons?.join(', ')} UTC, as it is in ${found?.path}`;
  }
  if (k === 'night') return `Next run ${nextNight()} · cron ${nightCron()}, converted from your time zone`;
  const c = CADENCES[k];
  if (!c) return '';
  const sets = `sets NEXUS_CADENCE to ${k}`;
  if (!c.cron) return `No schedule. It runs when you press Run one pass, here or in Cloud loop · ${sets}`;
  return `Every ${c.every} hours at :17 UTC, off the busy top of the hour · cron ${c.cron} · ${sets}`;
}

/** Step 4's picker: one radio per option, and the line for the picked one. Rendered alone by the screen tests. */
export function SchedulePicker({ options, sched, found, onPick }) {
  return (
    <>
      <div className="sched" role="radiogroup" aria-label="Schedule">
        {options.map(([k, s]) => [
          <input key={`i-${k}`} type="radio" name="sched" id={`sc-${k}`} checked={sched === k} onChange={() => onPick(k)} />,
          <label key={`l-${k}`} htmlFor={`sc-${k}`} className={s.now ? 'sched-now' : undefined}><b>{s.label}</b><span>{s.sub}</span></label>,
        ])}
      </div>
      <div className="run-line"><Icon name="clock" size={14} /><span>{nextLine(sched, found)}</span></div>
    </>
  );
}

function dur(a, b) {
  const s = Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}

function clock(since) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(since)) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function CloudSetup() {
  const actions = useActions();
  const runs = useRuns(8000);
  const [d, patch] = useDraft();
  const plot = usePlotLive(d);
  const [preview, setPreview] = useState(false);
  const [pending, setPending] = useState({}); // action -> 'busy' | error text
  const [added, setAdded] = useState(null); // POST /api/cloud/workflow's answer: { path, sha, written, branch, pr? }
  const { owner } = useShell();
  const ownerLands = !!owner && d.ownerMode !== false;
  const [, tick] = useState(0);

  // Where the folder stands (server/place.mjs): the cloud loop needs a GitHub repo with main pushed. Until then a
  // step 0 (RepoStart) sits above the four, which wait under it, dimmed.
  const start = useRepoStart();
  const [startNow, setStartNow] = useState(null);
  const a = actions.data;
  const place = startNow?.place ?? start.data?.place ?? a?.place;
  const gate = cloudGate(place);
  const waiting = gate !== 'ready';
  // Until the place is known (both reads still loading) nothing can be turned on: a plain folder would only 409.
  const settling = place == null && (start.status === 'loading' || actions.status === 'loading');
  const onRepo = (s) => {
    setStartNow(s);
    if (s?.next === 'done') { actions.reload(); runs.reload(); }
  };
  const recheckScope = async () => { try { setStartNow(await repoCalls.start({ fresh: true })); } catch { /* the line stays */ } };
  const scopeFix = (startNow || start.data)?.guide?.['workflow-scope'] || null;
  const ghOk = a?.gh === true && !waiting;
  const wf = ghOk ? (a.workflows || []).find((w) => LOOP_FILE.test(w.path || '')) : null;
  const file = wf ? wf.path.split('/').pop() : 'march.yml';
  const secret = ghOk ? (a.steps || []).find((s) => s.id === 'secret') : null;
  const loopRuns = (runs.data?.runs || []).filter((r) => wf && (r.workflowName === wf.name));
  const last = loopRuns[0];
  const running = last && last.status !== 'completed';
  const green = last && last.status === 'completed' && last.conclusion === 'success';
  const red = last && last.status === 'completed' && !green;

  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const nav = useNavigate();
  const set = (key, v) => setPending((p) => ({ ...p, [key]: v }));
  const act = (key, fn, after, go) => landThenGo(fn, {
    busy: () => set(key, 'busy'),
    done: (r) => { set(key, null); after?.(r); },
    failed: (m) => set(key, m),
    go,
  });

  // The schedule the loop workflow has at origin (49.1): selected until the person picks another, and kept by Turn on.
  const found = a?.schedule ?? null;
  const sched = pickSched(d.sched, found);
  const pick = (k) => patch({ sched: k });
  const cron = cronFor(sched, { night: nightCron(), found });
  const keep = keepsSchedule(sched, found, d.sched);
  const options = schedOptions(found);

  // Saving the schedule commits (the repo's checks run): Launch comes only once it landed; an error stays here.
  const turnOn = () => act('sched', () => turnOnCloud({ setSchedule: onboardingCalls.setSchedule, setWorkflow: server.setWorkflow }, { sched, cron, wf, keep }), (r) => patch({ cloud: 'on', cloudSaved: true, sched, schedLabel: sched === 'current' ? found.label : null, cadenceSet: r?.cadence ? r.cadence.variable != null : null }), () => nav(PATHS.onboarding(stepAfter('cloud'))));
  // Until the repo is read, Turn on waits: it must not save the default over a schedule it has not seen yet.
  const busy = Object.values(pending).includes('busy') || actions.status === 'loading';
  const skip = () => patch({ cloud: 'skipped' });

  const note = (key) => {
    const v = pending[key];
    if (v === 'busy') return key === 'run' ? null : <span className="t-body-s c-3" role="status">{BUSY_NOTE}</span>;
    if (v) return <span className="t-body-s" role="alert" style={{ color: 'var(--st-blocked)', whiteSpace: 'pre-line' }}>{v}</span>;
    return null;
  };

  const foot = (
    <>
      <Back to={stepBefore('cloud')} />
      <span className="ob-count">{stepCount('cloud')} · optional</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {note('sched')}
        <Link className="btn btn-ghost" to={PATHS.onboarding(stepAfter('cloud'))} onClick={skip}>Skip</Link>
        {waiting ? <span className="t-body-s c-3">First, a home on GitHub.</span> : null}
        <button className="btn btn-primary btn-l" type="button" disabled={busy || waiting || settling} aria-busy={pending.sched === 'busy' || undefined} onClick={turnOn}>{pending.sched === 'busy' ? (keep ? 'Turning on' : 'Committing') : 'Turn on the cloud loop'}<Icon name="arrowRight" size={14} /></button>
      </div>
    </>
  );

  return (
    <ObFrame step="cloud" foot={foot} notice={<PlotAskStrip session={d.plotSession} live={plot.live} />}>
      <div className="cloud-grid">
        <div className="ob-copy">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="kicker">step {stepNo('cloud')} · cloud loop · optional</span>
            <h1 className="t-display-s">Let it run while you sleep</h1>
          </div>
          <p className="t-body-l ob-lede">A CI workflow wakes nexus on a schedule. Each run claims the next chunk, builds it, checks it and commits, then parks any question for the morning. Same loop, minus your laptop.</p>
          <div className="explain" style={{ maxWidth: 460 }}>
            <ul style={{ marginTop: 0 }}>
              <li><Icon name="check" size={14} /><span>Runs skip any chunk a local session has claimed.</span></li>
              <li><Icon name="check" size={14} /><span>Questions from cloud runs land in your oversight inbox.</span></li>
              <li><Icon name="check" size={14} /><span>Pause it any time from the top bar or Settings.</span></li>
            </ul>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 4 }}>
            <Link className="btn btn-l" to={PATHS.onboarding(stepAfter('cloud'))} onClick={skip}><Icon name="moonNight" />Skip, I'll run it locally</Link>
            <span className="t-body-s c-3">You can set it up later from Cloud loop.</span>
          </div>
        </div>

        <div className={`panel cl-steps${waiting ? ' is-waiting' : ''}`} aria-label="Cloud loop setup" aria-busy={actions.status === 'loading' || undefined}>
          {waiting || startNow?.next === 'done' ? (
            <div className="cl-step cl-step-zero">
              <span className={waiting ? 'cl-num is-now' : 'cl-num is-done'}>{waiting ? <span>0</span> : <Icon name="check" />}</span>
              <div>
                <div className="cl-h">A home on GitHub</div>
                {!waiting ? (
                  <div className="cl-d">On GitHub at <b>{(startNow?.repo?.remote?.web || '').replace(/^https:\/\//, '')}</b>.</div>
                ) : place === 'refused' ? (
                  <RepoStart where="cloud" compact res={start} onChange={onRepo} />
                ) : gate === 'other' ? (
                  <div className="cl-d">{a?.note || (place === 'nested' ? 'This folder is inside another repo: start nexus at that repo\'s root.' : 'origin is not on GitHub. The cloud loop runs on GitHub Actions; this repo cannot use it.')} Skip is the way on.</div>
                ) : (
                  <>
                    <div className="cl-d">The cloud loop is a GitHub Actions workflow, so this folder needs a GitHub repo first. Two minutes, and you see every command before it runs.</div>
                    <RepoStart where="cloud" compact res={start} onChange={onRepo} />
                  </>
                )}
              </div>
            </div>
          ) : null}
          <div className="cl-step" aria-disabled={waiting || undefined} inert={waiting || undefined}>
            <span className={wf ? 'cl-num is-done' : 'cl-num is-now'}>{wf ? <Icon name="check" /> : <span>1</span>}</span>
            <div>
              <div className="cl-h">
                Add the workflow <span className="file-tag">{file}</span>
                <span style={{ flex: 1 }} />
                <button className="btn btn-ghost btn-s" type="button" onClick={() => setPreview(!preview)} aria-expanded={preview}>{preview ? 'Hide' : 'Preview'}</button>
              </div>
              <div className="cl-d">
                {waiting ? 'nexus writes it to your CI folder once this folder is on GitHub.'
                  : actions.status === 'loading' ? 'Looking at this repo’s CI…'
                  : !a ? (actions.error || 'Could not read this repo’s CI.')
                    : !ghOk ? <>{a.note} The cloud loop is set up through <code>gh</code>.</>
                      : wf ? <>It is in your CI folder at <code>{wf.path}</code>{wf.enabled ? '.' : ', switched off.'}</>
                        : added?.pr ? <>Written to <code>{added.path}</code> in a pull request: <a href={added.pr} target="_blank" rel="noreferrer">review and merge it</a> to switch it on.</>
                          : added ? <>Committed to {added.branch || 'main'} at <code>{added.path}</code>; GitHub lists it in a moment.</>
                            : ownerLands ? <>nexus writes it to your CI folder and commits it to the default branch.</>
                              : <>nexus writes it to your CI folder and opens a pull request with it.</>}
              </div>
              {waiting ? <div className="cl-wait">Waits for a GitHub repo.</div> : null}
              {ghOk && !wf && !added && scopeFix ? (
                <div className="chk-fix rs-guide">
                  <span className="t-body-s c-1" style={{ fontWeight: 600 }}>Adding a workflow file needs gh&apos;s workflow scope:</span>
                  <Cmds cmds={scopeFix} />
                  <div><button className="btn btn-s btn-warn" type="button" onClick={recheckScope}><Icon name="refresh" size={14} />Check again</button></div>
                </div>
              ) : null}
              {ghOk && !wf && !added ? (
                <div className="cl-body">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn btn-s" type="button" disabled={busy} onClick={() => act('wf', onboardingCalls.addWorkflow, (r) => { setAdded(r); actions.reload(); })}><Icon name="plus" size={14} />{pending.wf === 'busy' ? 'Committing' : 'Add it'}</button>
                    {note('wf')}
                  </div>
                </div>
              ) : null}
              {preview ? (
                <div className="cl-body">
                  <div className="code" style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--well)' }}>
                    <div><span className="p">on</span>:</div>
                    <div><span className="p">  schedule</span>:</div>
                    <div>    - <span className="p">cron</span>: <span className="s">"{cron || 'none'}"</span><span className="c">   # {sched === 'off' ? 'schedule removed' : sched === 'current' ? 'kept as it is, UTC' : sched === 'night' ? 'your time zone, converted' : `the ${sched} cadence, UTC`}</span></div>
                    <div><span className="p">  workflow_dispatch</span>:</div>
                    <div><span className="p">jobs</span>:</div>
                    <div><span className="p">  owner</span>:</div>
                    <div><span className="p">    steps</span>:</div>
                    <div>      - <span className="p">uses</span>: <span className="v">anthropics/claude-code-action@v1</span><span className="c">   # one /march tick</span></div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="cl-step" aria-disabled={waiting || undefined} inert={waiting || undefined}>
            <span className={secret?.ok ? 'cl-num is-done' : wf ? 'cl-num is-now' : 'cl-num'}>{secret?.ok ? <Icon name="check" /> : <span>2</span>}</span>
            <div>
              <div className="cl-h">Give the loop its sign-in</div>
              {waiting ? <div className="cl-wait">Waits for a GitHub repo.</div> : null}
              <div className="cl-body">
                <div className="secret">
                  <span className="secret-name">CLAUDE_CODE_OAUTH_TOKEN</span>
                  {secret
                    ? (secret.ok
                      ? <span className="chk-state is-ok"><Icon name="check" size={14} />set</span>
                      : secret.ok == null ? <span className="chk-state is-wait">unknown</span> : <span className="chk-state is-warn">not set</span>)
                    : <span className="chk-state is-wait">{ghOk || actions.status === 'loading' ? 'checking' : 'unknown'}</span>}
                  <span className="secret-d">{secret?.ok ? 'GitHub lists it. Each run signs in with it.' : secret && secret.ok == null ? secret.detail : 'One token from your Claude subscription, kept in the repo\'s secrets.'}</span>
                </div>
                {waiting ? null : (
                  <TokenGuide
                    slug={a?.slug}
                    place={place}
                    gh={a ? a.gh : undefined}
                    viewer={a?.viewer ?? null}
                    open={!!wf && secret?.ok === false}
                    onSaved={() => actions.reload()}
                    onCheck={actions.reload}
                  />
                )}
                {wf && !waiting ? <span className="t-body-s c-3">If the first run says Claude Code is not installed on this repository, add the Claude GitHub App: <a href="https://github.com/apps/claude" target="_blank" rel="noreferrer">github.com/apps/claude</a>.</span> : null}
              </div>
            </div>
          </div>

          <div className="cl-step" aria-disabled={waiting || undefined} inert={waiting || undefined}>
            <span className={green ? 'cl-num is-done' : 'cl-num is-now'}>{green ? <Icon name="check" /> : <span>3</span>}</span>
            <div>
              <div className="cl-h">Run one pass now</div>
              {waiting ? <div className="cl-wait">Waits for a GitHub repo.</div> : null}
              <div className="cl-body">
                {green ? (
                  <div className="run-line"><span className="pill pill-ci ci-green"><span className="ci-dot"><Icon name="check" /></span>green · {dur(last.createdAt, last.updatedAt)}</span><span>{last.displayTitle}</span></div>
                ) : running ? (
                  <div className="run-line"><span className="pill pill-ci ci-running"><span className="ci-dot" />running · {clock(last.createdAt)}</span><span>{last.displayTitle}</span></div>
                ) : red ? (
                  <div className="run-line"><span className="pill pill-ci ci-red"><span className="ci-dot" />{last.conclusion || 'failed'} · {dur(last.createdAt, last.updatedAt)}</span><span>{last.displayTitle}</span></div>
                ) : (
                  <div className="run-line"><span>One real pass on CI, so you see it work before you schedule it.</span></div>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="btn btn-s" type="button" onClick={() => act('run', () => server.dispatchWorkflow(wf?.id), runs.reload)} disabled={!wf || running || pending.run === 'busy'}>
                    <Icon name="play" size={14} />{running ? 'Running' : last ? 'Run again' : 'Run one pass'}
                  </button>
                  {last?.url
                    ? <a className="btn btn-ghost btn-s" href={last.url} target="_blank" rel="noreferrer">Open the run log<Icon name="arrowRight" size={14} /></a>
                    : <Link className="btn btn-ghost btn-s" to={PATHS.cloud}>Open the run log<Icon name="arrowRight" size={14} /></Link>}
                  {note('run')}
                </div>
              </div>
            </div>
          </div>

          <div className="cl-step" aria-disabled={waiting || undefined} inert={waiting || undefined}>
            <span className="cl-num is-now">4</span>
            <div>
              <div className="cl-h">Pick a schedule</div>
              {waiting ? <div className="cl-wait">Waits for a GitHub repo.</div> : null}
              <div className="cl-body">
                <SchedulePicker options={options} sched={sched} found={found} onPick={pick} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </ObFrame>
  );
}
