// Step 6 · Cloud loop, optional (boards CloudSetup, CloudSetupLight). Four
// steps read from GET /api/actions and GET /api/runs: the loop workflow,
// the one secret, one real pass, and a schedule. Writing the workflow,
// dispatching a pass and saving the schedule are not served yet; each says
// so where it would act, and nothing claims to be done that is not.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, stepCount, stepAfter, stepBefore, stepNo } from '../../ui/index.js';
import { server, useActions, useRuns } from '../../data/index.js';
import { PATHS } from '../../routes.js';
import { ObFrame, Back, useCopy, CopyFace } from './frame.jsx';
import { useDraft } from './draft.js';
import { onboardingCalls, notServed } from './calls.js';

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

const SCHED = {
  night: { label: 'Overnight', sub: 'every hour at :30, 01:30 to 06:30' },
  two: { label: 'Every 2 hours', sub: 'all day, on the hour' },
  demand: { label: 'Only on demand', sub: 'when you press Run one pass' },
};

function cronFor(k) {
  return k === 'night' ? nightCron() : k === 'two' ? '0 */2 * * *' : '';
}

function nextLine(k) {
  if (k === 'night') return `Next run ${nextNight()} · cron ${nightCron()}, converted from your time zone`;
  if (k === 'two') return 'Next run at the top of the next even hour · cron 0 */2 * * *';
  return 'No schedule. It runs when you press Run one pass, here or in Cloud loop.';
}

function dur(a, b) {
  const s = Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}

function clock(since) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(since)) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The note shown where an action is not served yet. */
function NotYet({ children }) {
  return <span className="t-body-s c-3">{children}</span>;
}

export default function CloudSetup() {
  const actions = useActions();
  const runs = useRuns(8000);
  const [d, patch] = useDraft();
  const [preview, setPreview] = useState(false);
  const [copied, copy] = useCopy();
  const [pending, setPending] = useState({}); // action -> 'busy' | 'missing' | error text
  const [, tick] = useState(0);

  const a = actions.data;
  const ghOk = a?.gh === true;
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

  const act = async (key, fn, after) => {
    setPending((p) => ({ ...p, [key]: 'busy' }));
    try {
      await fn();
      setPending((p) => ({ ...p, [key]: null }));
      after?.();
    } catch (e) {
      setPending((p) => ({ ...p, [key]: notServed(e) ? 'missing' : e.message }));
    }
  };

  const sched = d.sched || 'night';
  const pick = (k) => patch({ sched: k });
  const cron = cronFor(sched);

  const turnOn = () => {
    patch({ cloud: 'on', cloudSaved: null });
    // Not served yet: Launch says the schedule still needs saving in Cloud loop.
    onboardingCalls.setSchedule(sched, cron).then(() => patch({ cloudSaved: true }), () => patch({ cloudSaved: false }));
  };
  const skip = () => patch({ cloud: 'skipped' });

  const note = (key, text) => {
    const v = pending[key];
    if (v === 'missing') return <NotYet>{text}</NotYet>;
    if (v && v !== 'busy') return <span className="t-body-s" style={{ color: 'var(--st-blocked)' }}>{v}</span>;
    return null;
  };

  const foot = (
    <>
      <Back to={stepBefore('cloud')} />
      <span className="ob-count">{stepCount('cloud')} · optional</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link className="btn btn-ghost" to={PATHS.onboarding(stepAfter('cloud'))} onClick={skip}>Skip</Link>
        <Link className="btn btn-primary btn-l" to={PATHS.onboarding(stepAfter('cloud'))} onClick={turnOn}>Turn on the cloud loop<Icon name="arrowRight" size={14} /></Link>
      </div>
    </>
  );

  return (
    <ObFrame step="cloud" foot={foot}>
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

        <div className="panel cl-steps" aria-label="Cloud loop setup" aria-busy={actions.status === 'loading' || undefined}>
          <div className="cl-step">
            <span className={wf ? 'cl-num is-done' : 'cl-num is-now'}>{wf ? <Icon name="check" /> : <span>1</span>}</span>
            <div>
              <div className="cl-h">
                Add the workflow <span className="file-tag">{file}</span>
                <span style={{ flex: 1 }} />
                <button className="btn btn-ghost btn-s" type="button" onClick={() => setPreview(!preview)} aria-expanded={preview}>{preview ? 'Hide' : 'Preview'}</button>
              </div>
              <div className="cl-d">
                {actions.status === 'loading' ? 'Looking at this repo’s CI…'
                  : !a ? (actions.error || 'Could not read this repo’s CI.')
                    : !ghOk ? <>{a.note} The cloud loop is set up through <code>gh</code>.</>
                      : wf ? <>It is in your CI folder at <code>{wf.path}</code>{wf.enabled ? '.' : ', switched off.'}</>
                        : <>nexus writes it to your CI folder and commits it to main.</>}
              </div>
              {ghOk && !wf ? (
                <div className="cl-body">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn btn-s" type="button" disabled={pending.wf === 'busy'} onClick={() => act('wf', onboardingCalls.addWorkflow, actions.reload)}><Icon name="plus" size={14} />Add it</button>
                    {note('wf', 'This server cannot write it yet. Copy march.yml from the nexus templates into .github/workflows/.')}
                  </div>
                </div>
              ) : null}
              {preview ? (
                <div className="cl-body">
                  <div className="code" style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--well)' }}>
                    <div><span className="p">on</span>:</div>
                    <div><span className="p">  schedule</span>:</div>
                    <div>    - <span className="p">cron</span>: <span className="s">"{cron || 'none'}"</span><span className="c">   # {sched === 'demand' ? 'schedule removed' : 'your time zone, converted'}</span></div>
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

          <div className="cl-step">
            <span className={secret?.ok ? 'cl-num is-done' : wf ? 'cl-num is-now' : 'cl-num'}>{secret?.ok ? <Icon name="check" /> : <span>2</span>}</span>
            <div>
              <div className="cl-h">Add one secret</div>
              <div className="cl-body">
                <div className="secret">
                  <span className="secret-name">CLAUDE_CODE_OAUTH_TOKEN</span>
                  {secret
                    ? (secret.ok
                      ? <span className="chk-state is-ok"><Icon name="check" size={14} />set</span>
                      : secret.ok == null ? <span className="chk-state is-wait">unknown</span> : <span className="chk-state is-warn">not set</span>)
                    : <span className="chk-state is-wait">{ghOk || actions.status === 'loading' ? 'checking' : 'unknown'}</span>}
                  <span className="secret-d">Run <code>claude setup-token</code> on this machine. It prints a long-lived token for CI; store it in the repo's secrets under this name. It never passes through nexus.</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-s" type="button" onClick={() => copy(1, 'claude setup-token')}>
                    <CopyFace copied={copied === 1} doneColor={false}>Copy <code>claude setup-token</code></CopyFace>
                  </button>
                  <button className="btn btn-s" type="button" onClick={() => copy(2, 'gh secret set CLAUDE_CODE_OAUTH_TOKEN')}>
                    <CopyFace copied={copied === 2} icon="terminal" doneColor={false}>Or set it with <code>gh secret set</code></CopyFace>
                  </button>
                  {secret && secret.ok === false ? <button className="btn btn-s btn-ghost" type="button" onClick={actions.reload}><Icon name="refresh" size={14} />Check again</button> : null}
                </div>
              </div>
            </div>
          </div>

          <div className="cl-step">
            <span className={green ? 'cl-num is-done' : 'cl-num is-now'}>{green ? <Icon name="check" /> : <span>3</span>}</span>
            <div>
              <div className="cl-h">Run one pass now</div>
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
                  {note('run', 'This server cannot start a pass yet. Use Run workflow on the workflow’s Actions page.')}
                </div>
              </div>
            </div>
          </div>

          <div className="cl-step">
            <span className="cl-num is-now">4</span>
            <div>
              <div className="cl-h">Pick a schedule</div>
              <div className="cl-body">
                <div className="sched" role="radiogroup" aria-label="Schedule">
                  {Object.entries(SCHED).map(([k, s]) => [
                    <input key={`i-${k}`} type="radio" name="sched" id={`sc-${k}`} checked={sched === k} onChange={() => pick(k)} />,
                    <label key={`l-${k}`} htmlFor={`sc-${k}`}><b>{s.label}</b><span>{s.sub}</span></label>,
                  ])}
                </div>
                <div className="run-line"><Icon name="clock" size={14} /><span>{nextLine(sched)}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ObFrame>
  );
}
