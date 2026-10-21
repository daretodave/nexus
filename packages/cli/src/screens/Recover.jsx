// Recover a run (Recover board + RecoverLight, which only switches theme):
// load a workflow folder, read it as a timeline of agents, pick a step and
// resume from it. Deep-linkable: /recover?dir=<folder> (the fleet's Inspect).
//
// Data: GET /api/recover?dir= (useRecover) ->
//   { run: { session: { name, kind }, chunk, title, kind, state, fell: { at }, started,
//            worktree: { branch, uncommitted }, runId, scriptPath },
//     agents: [{ k, name, role, state, when, peek, pre, after }],
//     recent: [{ dir, t, d, when, kind: 'fallen'|'running'|'done' }] }
// Action: POST /api/recover/resume { dir, from, runId, scriptPath }.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AppFrame, Topbar, Wordmark, TbSep, TbTitle, TbSpacer, Icon, Dropzone, Runline, SessTag, Flag,
  ToastHost, Err, cx, useShell,
} from '../ui/index.js';
import { useRecover } from '../data/index.js';
import { PATHS } from '../routes.js';
import LoopLine from './fleet/LoopLine.jsx';
import { act, hhmm, plural } from './fleet/util.js';
import { useToasts } from './fleet/toasts.js';

const URG = { fallen: 'urg is-parked', running: 'urg is-cloud', done: 'urg is-done' };

function NoRun() {
  return (
    <div className="empty" style={{ paddingTop: 90 }}>
      <div className="empty-art" aria-hidden="true">
        <i style={{ left: 10, top: 40 }} /><i style={{ left: 44, top: 18 }} /><i className="lit" style={{ left: 78, top: 34 }} /><i style={{ left: 112, top: 12 }} />
      </div>
      <div className="empty-title">No run loaded</div>
      <div className="empty-body">Pick a folder on the left, or one of the recent runs. Nothing runs until you choose a step to resume from.</div>
    </div>
  );
}

/** The step a resume most likely wants: the first that failed, else the first not done. */
function defaultPick(agents) {
  const i = agents.findIndex((a) => a.state === 'failed');
  if (i >= 0) return i;
  const j = agents.findIndex((a) => a.state !== 'done' && a.state !== 'never');
  return j >= 0 ? j : Math.max(0, agents.length - 1);
}

function RunCard({ run, agents }) {
  const n = (st) => agents.filter((a) => a.state === st).length;
  const wt = run.worktree || {};
  const title = [run.chunk, run.title].filter(Boolean).join(' ') + (run.kind ? ` · ${run.kind}` : '');
  let flag = null;
  if (run.fell) flag = <Flag kind="fallen">fell over{run.fell.at ? ` ${hhmm(run.fell.at)}` : ''}</Flag>;
  else if (run.state === 'running') flag = <Flag kind="active">running</Flag>;
  else if (run.state) flag = <Flag kind="idle">{run.state}</Flag>;
  return (
    <div className="run-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {run.session?.name ? <SessTag session={{ kind: 'local', ...run.session }} /> : null}
        <span className="t-title-s">{title}</span>
      </div>
      {flag || <span />}
      <div className="meta">
        {run.started ? <span>started <b>{hhmm(run.started)}</b></span> : null}
        <span><b>{agents.length}</b> agents</span>
        <span><b>{n('done')}</b> done</span>
        {n('failed') ? <span><b>{n('failed')}</b> failed</span> : null}
        {n('never') ? <span><b>{n('never')}</b> never started</span> : null}
        {wt.branch ? <span>worktree <b>{wt.branch}</b>{wt.uncommitted ? `, ${plural(wt.uncommitted, 'file')} uncommitted` : ''}</span> : null}
      </div>
    </div>
  );
}

export default function Recover() {
  const { repo } = useShell();
  const [params, setParams] = useSearchParams();
  const dir = params.get('dir') || '';
  const rec = useRecover(dir);
  const { toasts, push } = useToasts();
  const [pathText, setPathText] = useState(dir);
  const [over, setOver] = useState(false);
  const [sel, setSel] = useState(null);
  const [resumed, setResumed] = useState(null);
  const field = useRef(null);

  useEffect(() => { setPathText(dir); setSel(null); setResumed(null); }, [dir]);

  const data = rec.status === 'ready' ? rec.data || {} : {};
  const run = dir ? data.run : null;
  const agents = useMemo(() => (run ? data.agents || [] : []), [run, data.agents]);
  const recent = data.recent || [];
  const loaded = !!(dir && run);
  const here = sel ?? defaultPick(agents);

  const load = (p = pathText) => {
    const v = (p || '').trim();
    if (!v) { field.current?.focus(); return; }
    setParams({ dir: v });
  };
  const clear = () => { setParams({}); setPathText(''); };

  async function resumeFrom(i) {
    const a = agents[i];
    setSel(i);
    const r = await act('/api/recover/resume', { dir, from: a.k || a.name, runId: run.runId, scriptPath: run.scriptPath });
    if (r.ok) { setResumed(i); return; }
    if (r.missing) push({ kind: 'error', title: 'Resuming a run is not wired up yet', body: 'This server reads runs but cannot resume one yet. Resume it from a terminal with /reboot-resume.' });
    else push({ kind: 'error', title: `Couldn't resume from ${a.name}`, body: r.error });
  }

  const blocker = agents.find((a) => a.state === 'failed') || agents[here];
  const rows = agents.map((a, i) => ({
    name: a.name,
    role: a.role,
    state: a.state,
    peek: a.peek,
    pre: a.pre,
    when: a.when && /^\d{4}-|T\d/.test(a.when) ? hhmm(a.when) : a.when,
    here: i === here,
    never: a.state === 'never',
    canResume: a.state !== 'never',
    cantWhy: `starts after ${a.after || blocker?.name || 'the step before'}`,
    onPick: () => { setSel(i); setResumed(null); },
    onResume: () => resumeFrom(i),
  }));

  const onDrop = (e) => {
    e.preventDefault();
    setOver(false);
    const dt = e.dataTransfer;
    const text = dt.getData('text/plain') || dt.getData('text/uri-list');
    const name = text || dt.files?.[0]?.path || dt.files?.[0]?.name || '';
    if (!name) return;
    setPathText(name.replace(/^file:\/\//, ''));
    field.current?.focus();
  };

  const topbar = (
    <Topbar>
      <Wordmark />
      <TbSep />
      <TbTitle title="Recover" sub={repo} />
      <TbSpacer />
      <LoopLine />
      <Link className="btn btn-s" to={PATHS.fleet}><Icon name="fleet" size={14} />Fleet</Link>
    </Topbar>
  );

  const selName = resumed != null ? agents[resumed]?.name : '';

  return (
    <AppFrame topbar={topbar} current="fleet">
      <main className="view" aria-label="Recover a run">
        <div className="view-head">
          <div className="view-title">
            <h1 className="t-title-l">Recover a run</h1>
            <span className="view-sub">Load a workflow folder to see where a run stopped, what each agent left behind, and resume from any step.</span>
          </div>
          <div className="view-acts"><Link className="btn" to={PATHS.git}><Icon name="git" size={14} />Repo git panel</Link></div>
        </div>
        <div className="rec-wrap">
          <aside className="rec-side" aria-label="Load a run">
            {loaded ? (
              <div className="dropzone" style={{ minHeight: 0, padding: 14, flexDirection: 'row', justifyContent: 'flex-start', textAlign: 'left' }}>
                <Icon name="fileOne" style={{ color: 'var(--accent)', flex: 'none' }} />
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                  <span className="t-label c-1">Loaded</span>
                  <span className="t-mono-xs c-2" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={dir}>{dir}</span>
                </span>
                <button className="btn btn-ghost btn-s" type="button" onClick={clear}>Clear</button>
              </div>
            ) : (
              <Dropzone
                over={over}
                onPick={() => field.current?.focus()}
                onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={onDrop}
              />
            )}
            <form className="field" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 6px 0 12px' }} onSubmit={(e) => { e.preventDefault(); load(); }}>
              <span className="t-mono-xs c-3">path</span>
              <input
                ref={field}
                type="text"
                aria-label="Workflow folder path"
                value={pathText}
                onChange={(e) => setPathText(e.target.value)}
                spellCheck={false}
                style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', outline: 'none', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}
              />
              <button className="btn btn-s" type="submit">Load</button>
            </form>
            <div className="side-card" style={{ gap: 2, padding: '10px 8px' }}>
              <span className="t-caps c-2" style={{ padding: '4px 8px 6px' }}>Recent runs</span>
              {recent.map((r) => (
                <button key={r.dir} className={cx('rec-pick', loaded && r.dir === dir && 'is-current')} type="button" onClick={() => load(r.dir)}>
                  <span className={URG[r.kind] || 'urg is-done'} />
                  <span style={{ minWidth: 0 }}>{r.t}<span className="d">{r.d || r.dir}</span></span>
                  <span className="t-mono-xs c-3">{r.when && /^\d{4}-|T\d/.test(r.when) ? hhmm(r.when) : r.when}</span>
                </button>
              ))}
              {!recent.length ? <span className="t-body-s c-3" style={{ padding: '4px 8px 6px' }}>{rec.status === 'loading' ? 'Reading runs…' : 'No recent runs yet.'}</span> : null}
            </div>
          </aside>
          {loaded ? (
            <div className="rec-main">
              <RunCard run={run} agents={agents} />
              {resumed != null ? (
                <div className="resume-note">
                  <Icon name="refresh" style={{ color: 'var(--accent)', flex: 'none', marginTop: 2 }} />
                  <span><b>Resuming {run.session?.name || 'the run'} from {selName}.</b> A fresh session reads the recap of steps 1 to {resumed}, keeps their work, and starts at {selName}. Watch it relight in the fleet. <Link to={PATHS.fleet}>Open the fleet</Link></span>
                </div>
              ) : null}
              <Runline rows={rows} acts />
              <span className="cap">Hover a step to resume from it. Steps before it keep their results; steps after it run again.</span>
            </div>
          ) : dir && rec.status === 'error' ? (
            <div className="rec-main">
              <Err title="Couldn't read that folder" body="Check the path points at a workflow run folder (it holds journal.jsonl). Nothing was changed." detail={rec.error} actions={<button className="btn btn-s" type="button" onClick={clear}>Clear</button>} />
            </div>
          ) : <NoRun />}
        </div>
      </main>
      <ToastHost toasts={toasts} />
    </AppFrame>
  );
}
