// The repo git panel (GitPanel board + GitPanelLight, theme only): every
// worktree with its session, the root checkout, main's recent commits,
// open pull requests with CI, and the /tidy dry run as a popover.
//
// Data: GET /api/git (useGitRepo) ->
//   { repo, root: { path, branch, up, down, dirty, pulled },
//     worktrees: [{ sessionId, session: { name, kind } | null, who, branch, path, act, age,
//                   flag: 'active'|'idle'|'orphaned'|'fallen', dirty, pr: { num, ci }, run }],
//     main: { ahead, behind, commits: [{ sha, m, w }] },
//     prs: [{ num, title, desc, ci: 'green'|'red'|'running'|'queued' }] }
// Actions: POST /api/git/fetch, GET /api/git/tidy (dry run) ->
//   { worktrees: [{ branch, why }], branches: [..], prune, keep, keepNote }, POST /api/git/tidy.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AppFrame, Topbar, Wordmark, TbSep, TbTitle, TbSpacer, Icon, WtHead, Wt, Commit, CiPill,
  Empty, Err, ToastHost, cx, useShell,
} from '../ui/index.js';
import { api, useGitRepo } from '../data/index.js';
import { PATHS } from '../routes.js';
import LoopLine from './fleet/LoopLine.jsx';
import { act, hhmm, plural, prNum } from './fleet/util.js';
import { useToasts } from './fleet/toasts.js';

// Ages and commit times may come as display strings ("2h 19m", "03:15") or as
// timestamps; a timestamp is drawn the way the board writes it.
const isStamp = (v) => typeof v === 'number' || /^\d{4}-\d\d-\d\dT/.test(String(v || ''));
function age(v, now = Date.now()) {
  if (!isStamp(v)) return v;
  const m = Math.max(0, Math.floor((now - new Date(v).getTime()) / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}d`;
}
const when = (v) => (isStamp(v) ? hhmm(v) : v);

const FLAG = { active: 'active', idle: 'idle', orphaned: 'orphan', orphan: 'orphan', fallen: 'fallen' };

function wtHref(w) {
  if (!w.sessionId) return undefined;
  if (w.flag === 'fallen') return w.run ? `${PATHS.recover}?dir=${encodeURIComponent(w.run)}` : PATHS.recover;
  return PATHS.cockpit(w.sessionId);
}

function syncText(main = {}) {
  if (main.behind) return `main ${main.behind} behind origin`;
  if (main.ahead) return `main ${main.ahead} ahead of origin`;
  return 'main in sync with origin';
}

const Codes = ({ list }) => list.map((b, i) => <span key={b}>{i ? ', ' : ''}<code>{b}</code></span>);

function TidyPop({ plan, done, onRun, onClose, running }) {
  const missing = plan?.missing;
  const p = plan?.data || {};
  const wts = p.worktrees || [];
  const brs = p.branches || [];
  const nothing = !missing && plan?.data && !wts.length && !brs.length && !p.prune;
  return (
    <div className="tidy-pop" role="dialog" aria-label="Tidy, dry run">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="t-title-s">Tidy · dry run</span><TbSpacer /><span className="cap">nothing changes yet</span>
      </div>
      <div className="tidy-list">
        {!plan ? <div className="tidy-item"><span className="spin" style={{ width: 14, height: 14 }} /><span>Working out what would go…</span></div> : null}
        {missing ? <div className="tidy-item"><Icon name="info" size={14} style={{ color: 'var(--text-3)' }} /><span><b>This server can't run the dry run yet.</b> Run <code>/tidy</code> in a terminal to see it.</span></div> : null}
        {plan?.error ? <div className="tidy-item"><Icon name="x" size={14} style={{ color: 'var(--st-failed)' }} /><span><b>The dry run failed.</b> {plan.error}</span></div> : null}
        {wts.length ? (
          <div className="tidy-item"><Icon name="trash" size={14} style={{ color: 'var(--st-blocked)' }} /><span><b>Would remove {plural(wts.length, 'worktree')}:</b> <Codes list={wts.map((w) => w.branch)} />.{wts.length === 1 && wts[0].why ? ` ${wts[0].why}` : ''}</span></div>
        ) : null}
        {brs.length ? (
          <div className="tidy-item"><Icon name="git" size={14} style={{ color: 'var(--st-blocked)' }} /><span><b>Would delete {plural(brs.length, 'merged branch', 'merged branches')}:</b> <Codes list={brs} />.</span></div>
        ) : null}
        {p.prune ? <div className="tidy-item"><Icon name="refresh" size={14} style={{ color: 'var(--text-3)' }} /><span><b>Would prune {plural(p.prune, 'stale remote ref')}</b> left by deleted PR branches.</span></div> : null}
        {nothing ? <div className="tidy-item"><Icon name="check" size={14} style={{ color: 'var(--st-done)' }} /><span><b>Nothing to tidy.</b></span></div> : null}
        {p.keep ? <div className="tidy-item"><Icon name="check" size={14} style={{ color: 'var(--st-done)' }} /><span><b>Keeps {plural(p.keep, 'worktree')}</b> with a live session, an open PR or uncommitted work.{p.keepNote ? ` ${p.keepNote}` : ''}</span></div> : null}
        <div className="tidy-item"><Icon name="lockOne" size={14} style={{ color: 'var(--text-3)' }} /><span><b>Never touches the root checkout.</b></span></div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-primary btn-s" type="button" onClick={onRun} disabled={!plan?.data || nothing || running || !!done} aria-busy={running || undefined}>Tidy now</button>
        <button className="btn btn-ghost btn-s" type="button" onClick={onClose}>Close</button>
        <span className="t-body-s c-3">{done || 'Shows exactly what would go.'}</span>
      </div>
    </div>
  );
}

export default function GitPanel() {
  const { repo } = useShell();
  const git = useGitRepo();
  const { toasts, push } = useToasts();
  const [tidyOpen, setTidyOpen] = useState(false);
  const [plan, setPlan] = useState(null);
  const [done, setDone] = useState('');
  const [running, setRunning] = useState(false);
  const [fetching, setFetching] = useState(false);

  const d = git.status === 'ready' ? git.data || {} : null;
  const name = d?.repo || repo;
  const wts = d?.worktrees || [];
  const prs = d?.prs || [];
  const tidyBranches = new Set((plan?.data?.worktrees || []).map((w) => w.branch));

  async function openTidy() {
    if (tidyOpen) { setTidyOpen(false); return; }
    setTidyOpen(true);
    setPlan(null);
    setDone('');
    try { setPlan({ data: await api('/api/git/tidy') }); } catch (e) { setPlan(e.status === 404 ? { missing: true } : { error: e.message }); }
  }

  async function runTidy() {
    setRunning(true);
    const r = await act('/api/git/tidy', {});
    setRunning(false);
    if (!r.ok) { push({ kind: 'error', title: r.missing ? 'Tidy is not wired up yet' : "Tidy didn't run", body: r.missing ? 'Run /tidy in a terminal.' : r.error }); return; }
    const w = r.data?.removed?.worktrees ?? (plan?.data?.worktrees || []).length;
    const b = r.data?.removed?.branches ?? (plan?.data?.branches || []).length;
    setDone(`Done. ${plural(w, 'worktree')} and ${plural(b, 'branch', 'branches')} removed.`);
    git.reload();
  }

  async function fetchNow() {
    setFetching(true);
    const r = await act('/api/git/fetch', {});
    setFetching(false);
    if (!r.ok) { push({ kind: 'error', title: r.missing ? 'Fetch is not wired up yet' : "Fetch didn't finish", body: r.missing ? 'Run git fetch in a terminal; this panel reads the result.' : r.error }); return; }
    git.reload();
  }

  const topbar = (
    <Topbar>
      <Wordmark />
      <TbSep />
      <TbTitle title="Git" sub={name} />
      <TbSpacer />
      <LoopLine />
      <Link className="btn btn-s" to={PATHS.recover}><Icon name="refresh" size={14} />Recover a run</Link>
    </Topbar>
  );

  const sub = d
    ? [name, plural(wts.length, 'worktree'), syncText(d.main), plural(prs.length, 'open pull request')].filter(Boolean).join(' · ')
    : name;
  const root = d?.root || {};

  return (
    <AppFrame topbar={topbar} current="git">
      <main className="view" aria-label="Repo git panel">
        <div className="view-head">
          <div className="view-title">
            <h1 className="t-title-l">Git</h1>
            {sub ? <span className="view-sub">{sub}</span> : null}
          </div>
          <div className="view-acts">
            <button className="btn btn-ghost" type="button" onClick={fetchNow} disabled={fetching} aria-busy={fetching || undefined}><Icon name="refresh" size={14} />Fetch</button>
            <button className="btn" type="button" onClick={openTidy} aria-expanded={tidyOpen ? 'true' : 'false'}><Icon name="trash" size={14} />Tidy (dry run)</button>
          </div>
        </div>
        {git.status === 'loading' ? null : git.status === 'missing' ? (
          <Empty sky="none" title="No worktrees to show yet" body="Every session's worktree, recent main commits and open pull requests arrive with the git panel." />
        ) : git.status === 'error' && !git.data ? (
          <Err title="Couldn't read git" body="Nothing was changed. The panel reads git again when you retry." detail={git.error} actions={<button className="btn btn-s" type="button" onClick={git.reload}>Try again</button>} />
        ) : (
          <div className="gp-wrap" style={{ overflowY: 'auto' }}>
            <div className="gp-col">
              <div className="gp-card">
                <div className="gp-card-h"><span className="t-caps c-2">Worktrees</span><span className="n">{wts.length}</span><TbSpacer /><span className="cap">one per session, next to the root checkout</span></div>
                <WtHead />
                {wts.map((w) => (
                  <Wt
                    key={w.path || w.branch}
                    session={w.session || null}
                    who={w.session ? w.who : (w.who || 'no session')}
                    branch={w.branch}
                    path={w.path}
                    act={w.act}
                    age={age(w.age)}
                    flag={w.flag ? { kind: FLAG[w.flag] || w.flag, text: w.flag } : null}
                    dirty={w.dirty}
                    pr={w.pr ? { num: prNum(w.pr.num), ci: w.pr.ci } : null}
                    href={wtHref(w)}
                    tidy={tidyOpen && tidyBranches.has(w.branch)}
                  />
                ))}
                {!wts.length ? <span className="t-body-s c-3" style={{ padding: '8px 8px 6px' }}>No worktrees yet. Each session makes one when it starts.</span> : null}
              </div>
              <div className="root-card">
                <Icon name="lockOne" style={{ color: 'var(--text-3)' }} />
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span className="t-title-s">Root checkout</span>
                  <span className="t-mono-xs c-3">{root.path}</span>
                </div>
                <span className="git">
                  <span><Icon name="git" /><span className="br">{root.branch || 'main'}</span></span>
                  <span className="ab"><span className="up">↑{root.up ?? 0}</span> <span className={cx('dn', root.down > 0 && 'is-behind')}>↓{root.down ?? 0}</span></span>
                  <span aria-label={root.dirty ? 'uncommitted changes' : 'clean'}><i className={cx('dirty', !root.dirty && 'is-clean')} /></span>
                  {root.pulled ? <span className="c-3">pulled {hhmm(root.pulled)}</span> : null}
                </span>
                <div className="root-note"><Icon name="info" size={14} style={{ flex: 'none' }} /><span><b>root is never built in; pulled on main only.</b> Sessions build in their own worktrees, so the root stays a clean copy of main.</span></div>
              </div>
            </div>
            <div className="gp-col">
              <div className="gp-card">
                <div className="gp-card-h"><span className="t-caps c-2">main · recent commits</span><TbSpacer /><span className="cap">origin/main</span></div>
                {(d?.main?.commits || []).map((c) => <Commit key={c.sha} sha={c.sha} m={c.m} w={when(c.w)} />)}
              </div>
              <div className="gp-card">
                <div className="gp-card-h"><span className="t-caps c-2">Open pull requests</span><span className="n">{prs.length}</span></div>
                {prs.map((p) => (
                  <div className="pr-row" key={p.num}>
                    <span className="num">{prNum(p.num)}</span>
                    <span className="t"><b>{p.title}</b>{p.desc ? <span>{p.desc}</span> : null}</span>
                    <CiPill state={p.ci || 'queued'} />
                  </div>
                ))}
                {!prs.length ? <span className="t-body-s c-3" style={{ padding: '4px 8px 6px' }}>No open pull requests.</span> : null}
              </div>
            </div>
          </div>
        )}
        {tidyOpen ? <TidyPop plan={plan} done={done} running={running} onRun={runTidy} onClose={() => setTidyOpen(false)} /> : null}
      </main>
      <ToastHost toasts={toasts} />
    </AppFrame>
  );
}
