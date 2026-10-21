// Recover a run (Recover board + RecoverLight, which only switches theme):
// load a workflow folder, read it as a timeline of agents, pick a step and
// resume from it. Deep-linkable: /recover?dir=<folder> (the fleet's Inspect).
//
// Data: GET /api/recover?dir= (useRecover; server/recover.mjs) ->
//   { run: { runId, sessionId, dir, title, summary, kind, state, fell: { at }, started, scriptPath, resumedBy? },
//     agents: [{ k, name, role, state, when, peek, pre, resume, why }],
//     resume: { hostable, why, sessionId, cwd, scriptPath, runId, prompt, command },
//     recent: [{ dir, t, d, when, kind: 'fallen'|'running'|'done' }] }
// Action: POST /api/recover/resume { dir, from } -> { id, name }: a hosted session resumes the run's own Claude Code
// session and calls the Workflow tool with { scriptPath, resumeFromRunId }. A resume always starts at the first agent
// that did not finish (the tool replays the rest), so only that row offers it. When the server cannot host it, the
// screen shows the command and prompt to paste.
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
import { defaultPick, doneCount, recoverRows } from './fleet/recoverModel.js';
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

/** The command and prompt to paste when the server cannot host the resume. */
function PasteResume({ resume }) {
  return (
    <div className="resume-note">
      <Icon name="terminal" style={{ color: 'var(--accent)', flex: 'none', marginTop: 2 }} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <b>Resume it yourself.</b> {resume.why ? `This server cannot: ${resume.why}.` : ''} Reopen the run's session, then paste the prompt.
        <pre className="t-mono-xs" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{resume.command}</pre>
        <pre className="t-mono-xs" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{resume.prompt}</pre>
      </span>
    </div>
  );
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

  const [paste, setPaste] = useState(false);

  useEffect(() => { setPathText(dir); setSel(null); setResumed(null); setPaste(false); }, [dir]);

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
    const r = await act('/api/recover/resume', { dir, from: a.name });
    if (r.ok) { setResumed({ i, id: r.data.id, name: r.data.name }); rec.reload(); return; }
    setPaste(true);
    push({ kind: 'error', title: `Couldn't resume from ${a.name}`, body: r.error });
  }

  const rows = recoverRows(agents, here, (t) => (/^\d{4}-|T\d/.test(t) ? hhmm(t) : t)).map((r, i) => ({
    ...r,
    onPick: () => { setSel(i); setResumed(null); },
    onResume: () => resumeFrom(i),
  }));
  const by = resumed || (run?.resumedBy ? { i: agents.findIndex((a) => a.resume), ...run.resumedBy } : null);
  const resume = data.resume;
  const showPaste = !!(resume && !by && agents.some((a) => a.resume) && (paste || !resume.hostable));

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

  const selName = by ? agents[by.i]?.name || 'the first unfinished step' : '';

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
              {by ? (
                <div className="resume-note">
                  <Icon name="refresh" style={{ color: 'var(--accent)', flex: 'none', marginTop: 2 }} />
                  <span><b>Resuming {run.title || 'the run'} from {selName} in {by.name}.</b> It reopens the run's own session and resumes it with the Workflow tool: the {plural(doneCount(agents), 'finished agent')} replay from the journal and keep their work, and {selName} runs again. <Link to={PATHS.cockpit(by.id)}>Open its cockpit</Link></span>
                </div>
              ) : null}
              {showPaste ? <PasteResume resume={resume} /> : null}
              <Runline rows={rows} acts />
              <span className="cap">A run resumes at its first unfinished step: steps before it replay their results, steps after it run again.</span>
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
