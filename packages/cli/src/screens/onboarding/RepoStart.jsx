// A folder that is not a repo yet: one panel for Detect (under the git row) and Cloud setup (step 0). It reads where
// the folder stands (GET /api/repo/start) and offers one step at a time, each a click: start the repo, the first
// commit, put it on GitHub (behind the confirm card, RepoConfirm.jsx), done. When the identity or a tool is missing
// it shows the exact commands instead, copyable, with Check again. Nothing runs without a click; the commands come
// from the server, the page never puts one together.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, TickBox } from '../../ui/index.js';
import { server, useResource } from '../../data/index.js';
import { SynRuns } from '../../ui/markdown.jsx';
import { tokenizeShell } from '../../ui/shell-syntax.js';
import { PATHS } from '../../routes.js';
import { useCopy, CopyFace } from './frame.jsx';
import { repoCalls } from './calls.js';
import RepoConfirm from './RepoConfirm.jsx';
import {
  BLOCKING, commitSummary, gitignoreLine, guideCopy, heading, identityLine, nameLine, ownerChoices, repoSteps,
} from './repoStart.js';
import '../../styles/repo-start.css';

/** GET /api/repo/start as a Resource (404 on an older server or a demo that does not stage it: status 'missing'). */
export const useRepoStart = (opts) => useResource('/api/repo/start', opts);

/** Commands as cmd-line rows, each with Copy; `all` adds one Copy for the whole block. */
export function Cmds({ cmds, all = false, label = 'command' }) {
  const [copied, copy] = useCopy();
  if (!cmds?.length) return null;
  return (
    <div className="rs-cmds">
      {cmds.map((c, i) => (
        <div className="cmd-line" key={i}>
          <span className="p">$</span><span className="rs-cmd"><SynRuns tokens={tokenizeShell(c)} /></span><span className="tb-spacer" />
          {all ? null : (
            <button className="btn btn-s btn-ghost" type="button" onClick={() => copy(i, c)} aria-label={`Copy the ${label}: ${c}`}>
              <CopyFace copied={copied === i}>Copy</CopyFace>
            </button>
          )}
        </div>
      ))}
      {all ? (
        <button className="btn btn-s" type="button" style={{ alignSelf: 'flex-start' }} onClick={() => copy('all', cmds.join('\n'))}>
          <CopyFace copied={copied === 'all'}>Copy all</CopyFace>
        </button>
      ) : null}
    </div>
  );
}

/** A guidance panel: the reason, the commands, Check again. */
function Guide({ why, start, cmds, onRecheck, checking, children }) {
  return (
    <div className="chk-fix rs-guide">
      <span className="t-body-s c-1" style={{ fontWeight: 600 }}>{guideCopy(why, start)}</span>
      {children}
      <Cmds cmds={cmds ?? start?.guide?.[why]} />
      {onRecheck ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-s btn-warn" type="button" onClick={onRecheck} disabled={checking} aria-busy={checking || undefined}><Icon name="refresh" size={14} />Check again</button>
          <span className="t-body-s c-3">Nothing runs on its own.</span>
        </div>
      ) : null}
    </div>
  );
}

function Step({ n, state, title, children }) {
  return (
    <div className={`cl-step rs-step is-${state}`}>
      <span className={state === 'done' ? 'cl-num is-done' : state === 'now' ? 'cl-num is-now' : 'cl-num'}>{state === 'done' ? <Icon name="check" /> : <span>{n}</span>}</span>
      <div>
        <div className="cl-h">{title}</div>
        {children}
      </div>
    </div>
  );
}

/** The one-line pointer other screens can drop in: "lantern is not a git repo yet · Make it one". */
export function RepoPointer({ name, place }) {
  if (place && place !== 'none') return null;
  return (
    <div className="rs-pointer" role="note">
      <Icon name="git" size={14} />
      <span><b>{name || 'This folder'}</b> is not a git repo yet</span>
      <Link className="btn btn-ghost btn-s" to={PATHS.onboarding('detect')}>Make it one<Icon name="arrowRight" size={14} /></Link>
    </div>
  );
}

/**
 * @param {object} p
 * @param {'detect'|'cloud'} [p.where]
 * @param {boolean} [p.compact]            the identity line and only the steps still open (Cloud setup)
 * @param {object} [p.res]                 a GET /api/repo/start Resource the parent already holds
 * @param {(start) => void} [p.onChange]   after every step and every check, with the new answer
 */
export default function RepoStart({ where = 'detect', compact = false, res: given, onChange }) {
  const own = useRepoStart({ skip: !!given });
  const res = given || own;
  const [live, setLive] = useState(null);
  const s = live || res.data;
  useEffect(() => { setLive(null); }, [res.data]);
  const [busy, setBusy] = useState(null); // a step id while its call runs
  const [err, setErr] = useState(null); // { step, error, why?, guide? }
  const [done, setDone] = useState({}); // step -> its answer (init's gitignore, commit's head)
  const [checking, setChecking] = useState(false);
  const [keep, setKeep] = useState(() => new Set()); // flagged files the person unticked: they go in
  const [manual, setManual] = useState(false);
  const notify = useRef(onChange);
  notify.current = onChange;

  const take = useCallback((start) => { if (start) { setLive(start); notify.current?.(start); } }, []);
  const recheck = async () => {
    setChecking(true);
    try { take(await repoCalls.start({ fresh: true })); setErr(null); } catch (e) { setErr({ step: 'check', error: e.message }); } finally { setChecking(false); }
  };
  const act = async (step, call, after) => {
    setBusy(step);
    setErr(null);
    try {
      const r = await call();
      setDone((d) => ({ ...d, [step]: r }));
      take(r.start);
      after?.(r);
      return r;
    } catch (e) {
      setErr({ step, error: e.message, ...(e.data || {}) });
      if (e.data?.start) take(e.data.start);
      return null;
    } finally {
      setBusy(null);
    }
  };

  // ---- step 3's fields and the live name check (the server's dry run gives the exact plan the card shows) --------
  const owners = useMemo(() => ownerChoices(s), [s]);
  const [owner, setOwner] = useState('');
  const [name, setName] = useState('');
  const [vis, setVis] = useState('private');
  const [check, setCheck] = useState(null); // { key, free, plan }
  const ownerNow = owner || owners[0] || '';
  const nameNow = name || s?.folder?.slug || '';
  const key = `${ownerNow}/${nameNow}/${vis}`;
  useEffect(() => {
    if (!s || s.next !== 'remote' || !ownerNow || !nameNow || !s.gh?.signedIn) return undefined;
    let gone = false;
    setCheck((c) => (c?.key === key ? c : { key, free: 'checking', plan: null }));
    const t = setTimeout(async () => {
      try {
        const r = await repoCalls.start({ owner: ownerNow, name: nameNow, visibility: vis });
        if (!gone) setCheck({ key, free: r.nameFree ?? null, plan: r.plan, guide: r.guide });
      } catch { if (!gone) setCheck({ key, free: null, plan: null }); }
    }, 400);
    return () => { gone = true; clearTimeout(t); };
  }, [s?.next, s?.gh?.signedIn, ownerNow, nameNow, vis, key]);

  const [confirm, setConfirm] = useState(false);
  const [phase, setPhase] = useState(null);
  const [created, setCreated] = useState(false);
  const [ownerMode, setOwnerMode] = useState(null);
  const ownerTick = ownerMode ?? (!!s?.gh?.login && ownerNow.toLowerCase() === String(s.gh.login).toLowerCase());

  if (res.status === 'missing') return null;
  if (!s) {
    return res.status === 'error'
      ? <div className="rs"><span className="t-body-s c-3">Could not read this folder: {res.error}</span></div>
      : <div className="rs" aria-busy="true"><span className="t-body-s c-3">Looking at this folder...</span></div>;
  }

  const id = identityLine(s);
  const head = heading(s);
  const steps = repoSteps(s);
  const blocked = s.next === 'blocked' && BLOCKING.has(s.why);
  const flagged = s.preview?.flagged || [];
  const leaveOut = flagged.map((f) => f.path).filter((p) => !keep.has(p));
  const large = (s.preview?.large || []).filter((f) => !leaveOut.includes(f.path));
  const blocks = large.filter((f) => f.blocks);
  const noIdentity = !s.git?.user;
  const ghReady = !!s.gh?.signedIn;
  const counts = { branch: s.repo?.branch || 'main', commits: s.repo?.commits || 1, files: done.commit?.files };
  const errFor = (step) => (err && err.step === step ? err : null);

  const createAndPush = async () => {
    if (!created) {
      setPhase('creating');
      const r = await act('remote', () => repoCalls.remote(ownerNow, nameNow, vis));
      if (!r) { setPhase(null); return; }
      setCreated(true);
    }
    setPhase('pushing');
    const p = await act('push', () => repoCalls.push());
    setPhase(null);
    if (!p) return;
    setConfirm(false);
    if (ownerTick) await server.setOwner(true).catch(() => null);
  };

  const pushOnly = async () => {
    setPhase('pushing');
    const p = await act('push', () => repoCalls.push());
    setPhase(null);
    if (p) setConfirm(false);
  };

  const identityRow = (
    <div className="rs-id">
      <Icon name="git" size={14} />
      {id.name ? <span>As <b>{id.name}</b> <span className="c-3">&lt;{id.email}&gt;</span></span> : null}
      {id.login ? <span>{id.name ? '· ' : ''}GitHub <b>{id.login}</b></span> : null}
      {id.missing.length ? <span className="rs-missing">{id.missing.join(' · ')}</span> : null}
    </div>
  );

  // Blocked: guidance only (git missing, inside another repo, home or a system folder, another host, dubious).
  if (blocked) {
    return (
      <div className={`rs is-${where}`}>
        {compact ? null : <div className="rs-head"><span className="kicker">{head.kicker}</span><span className="t-title-s">{head.title}</span></div>}
        <Guide why={s.why} start={s} onRecheck={s.why === 'other-remote' ? null : recheck} checking={checking} />
      </div>
    );
  }

  const show = (st) => !compact || st.state !== 'done' || st.id === 'done';
  const commitLine = done.commit?.head ? <>First commit <code>{done.commit.head}</code> on {counts.branch}.</> : s.repo?.head ? <>First commit <code>{s.repo.head}</code> on {counts.branch}.</> : null;
  const web = s.repo?.remote?.web || done.push?.web || done.remote?.web;

  return (
    <div className={`rs is-${where}${compact ? ' is-compact' : ''}`}>
      {compact ? null : (
        <div className="rs-head">
          <span className="kicker">{head.kicker}</span>
          <span className="t-title-s">{head.title}</span>
          {s.next === 'init' ? <span className="t-body-s c-2">nexus works on git repos. Start one here: it stays on this machine until you choose to put it on GitHub.</span> : null}
        </div>
      )}
      {identityRow}
      <div className="rs-steps">
        {show(steps[0]) ? (
          <Step n={1} state={steps[0].state} title="Start the repo">
            <div className="cl-d">{steps[0].state === 'done' ? gitignoreLine(done.init?.gitignore) : 'git init on main, plus a .gitignore that keeps .env and .nexus/ out.'}</div>
            {steps[0].state === 'now' ? (
              <div className="cl-body">
                <div className="rs-acts">
                  <button className="btn btn-s btn-primary" type="button" disabled={!!busy} aria-busy={busy === 'init' || undefined} onClick={() => act('init', () => repoCalls.init(noIdentity && ghReady ? 'gh' : undefined))}>
                    <Icon name="git" size={14} />{busy === 'init' ? 'Starting...' : 'Start the repo'}
                  </button>
                  {s.preview ? <span className="t-body-s c-3">{s.preview.capped ? `${s.preview.files.toLocaleString('en-US')}+` : s.preview.files} file{s.preview.files === 1 ? '' : 's'} here. Nothing leaves this machine.</span> : null}
                </div>
                {noIdentity && ghReady ? <span className="t-body-s c-3">git does not know who you are yet: this also sets your GitHub name for this repo only.</span> : null}
                {errFor('init') ? <ErrLine e={errFor('init')} start={s} /> : null}
              </div>
            ) : null}
          </Step>
        ) : null}

        {show(steps[1]) ? (
          <Step n={2} state={steps[1].state} title="First commit">
            <div className="cl-d">{steps[1].state === 'done' ? commitLine : steps[1].state === 'now' ? commitSummary(s.preview) : 'Everything here, minus what .gitignore keeps out.'}</div>
            {steps[1].state === 'now' ? (
              <div className="cl-body">
                {flagged.length ? (
                  <div className="rs-flag">
                    <span className="t-body-s c-2">These look private, so they stay out unless you untick them:</span>
                    {flagged.map((f) => (
                      <label className="rs-flag-row" key={f.path}>
                        <TickBox checked={!keep.has(f.path)} onChange={(on) => setKeep((k) => { const n = new Set(k); if (on) n.delete(f.path); else n.add(f.path); return n; })} label={`Leave out ${f.path}`} />
                        <code>{f.path}</code><span className="c-3">{f.why}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
                {blocks.length ? <span className="t-body-s rs-warn" role="alert">GitHub refuses files over 100 MB: {blocks.map((f) => <code key={f.path}>{f.path} ({f.mb} MB)</code>)}. Move them out or ignore them, then check again.</span> : null}
                {large.filter((f) => !f.blocks).length ? <span className="t-body-s c-3">Big files (over 50 MB) go in, but GitHub warns about them: {large.filter((f) => !f.blocks).map((f) => f.path).join(', ')}.</span> : null}
                {noIdentity ? (
                  <Guide why="no-identity" start={s} onRecheck={recheck} checking={checking}>
                    {ghReady ? (
                      <div className="rs-acts">
                        <button className="btn btn-s" type="button" disabled={!!busy} onClick={() => act('identity', () => repoCalls.identity())}><Icon name="check" size={14} />Use {s.gh.login} for this repo</button>
                        <span className="t-body-s c-3">Your GitHub name and its private noreply email, for this repo only. Or for every repo:</span>
                      </div>
                    ) : null}
                  </Guide>
                ) : (
                  <div className="rs-acts">
                    <button className="btn btn-s btn-primary" type="button" disabled={!!busy || blocks.length > 0} aria-busy={busy === 'commit' || undefined} onClick={() => act('commit', () => repoCalls.commit(leaveOut))}>
                      <Icon name="commit" size={14} />{busy === 'commit' ? 'Committing...' : 'Make the first commit'}
                    </button>
                    {blocks.length ? <button className="btn btn-s btn-ghost" type="button" onClick={recheck} disabled={checking}><Icon name="refresh" size={14} />Check again</button> : null}
                  </div>
                )}
                {errFor('commit') || errFor('identity') ? <ErrLine e={errFor('commit') || errFor('identity')} start={s} /> : null}
              </div>
            ) : null}
          </Step>
        ) : null}

        {show(steps[2]) ? (
          <Step n={3} state={steps[2].state} title={<>Put it on GitHub <span className="t-body-s c-3" style={{ fontWeight: 400 }}>optional</span></>}>
            {steps[2].state === 'done' ? <div className="cl-d">On GitHub{web ? <> at <b>{web.replace(/^https:\/\//, '')}</b></> : null}.</div> : null}
            {steps[2].state === 'wait' ? <div className="cl-d">A repo of your own on GitHub, private unless you say otherwise. You see every command first.</div> : null}
            {steps[2].state === 'now' && s.next === 'remote' ? (
              !s.gh?.installed ? <Guide why="gh-missing" start={s} onRecheck={recheck} checking={checking} />
                : !ghReady ? <Guide why="gh-signed-out" start={s} onRecheck={recheck} checking={checking} />
                  : (
                    <div className="cl-body">
                      {confirm ? (
                        <RepoConfirm
                          kind="create" owner={ownerNow} name={nameNow} visibility={vis} login={s.gh.login}
                          plan={check?.key === key && check.plan ? check.plan : s.plan} counts={counts}
                          ownerMode={ownerTick} onOwnerMode={setOwnerMode} phase={phase} created={created}
                          onCancel={() => setConfirm(false)} onGo={createAndPush}
                        >
                          {errFor('push') ? <ErrLine e={errFor('push')} start={s} /> : null}
                          {errFor('remote') ? <ErrLine e={errFor('remote')} start={s} /> : null}
                        </RepoConfirm>
                      ) : (
                        <>
                          <div className="rs-fields">
                            <label className="rs-field"><span>Owner</span>
                              <select value={ownerNow} onChange={(e) => setOwner(e.target.value)}>
                                {owners.map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                            </label>
                            <label className="rs-field rs-name"><span>Name</span>
                              <input type="text" value={nameNow} spellCheck={false} autoComplete="off" onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 100))} />
                            </label>
                            <div className="rs-field" role="radiogroup" aria-label="Visibility"><span>Visibility</span>
                              <div className="rs-vis">
                                {['private', 'public'].map((v) => (
                                  <label key={v} className={vis === v ? 'is-on' : undefined}>
                                    <input type="radio" name="rs-vis" checked={vis === v} onChange={() => setVis(v)} />{v === 'private' ? 'Private' : 'Public'}
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>
                          <span className={`t-body-s ${check?.key === key && check.free === false ? 'rs-warn' : 'c-3'}`} aria-live="polite">{nameLine(ownerNow, nameNow, check?.key === key ? check.free : 'checking')}</span>
                          {check?.key === key && check.free === false ? <Guide why="exists" start={s} cmds={check.guide?.exists} /> : null}
                          <div className="rs-acts">
                            <button className="btn btn-s btn-primary" type="button" disabled={!!busy || !(check?.key === key && check.plan) || check.free === false} onClick={() => setConfirm(true)}><Icon name="external" size={14} />Put it on GitHub...</button>
                            <span className="t-body-s c-3">Nothing goes out until you confirm.</span>
                          </div>
                        </>
                      )}
                    </div>
                  )
            ) : null}
            {steps[2].state === 'now' && s.next === 'push' ? (
              <div className="cl-body">
                <div className="cl-d">origin is <b>{(s.repo?.remote?.web || '').replace(/^https:\/\//, '')}</b>, with nothing pushed yet.</div>
                {confirm ? (
                  <RepoConfirm kind="push" owner={s.repo?.remote?.owner} name={s.repo?.remote?.name} login={s.gh?.login} plan={s.plan} counts={counts} phase={phase} onCancel={() => setConfirm(false)} onGo={pushOnly}>
                    {errFor('push') ? <ErrLine e={errFor('push')} start={s} /> : null}
                  </RepoConfirm>
                ) : (
                  <div className="rs-acts"><button className="btn btn-s btn-primary" type="button" onClick={() => setConfirm(true)}><Icon name="arrowUp" size={14} />Push {counts.branch}...</button></div>
                )}
              </div>
            ) : null}
          </Step>
        ) : null}

        <Step n={4} state={steps[3].state} title="Done">
          {steps[3].state === 'done'
            ? (
              <div className="cl-body">
                <div className="cl-d">On GitHub at <b>{(web || '').replace(/^https:\/\//, '')}</b>. {counts.branch} is pushed.</div>
                {web ? <a className="btn btn-s" href={web} target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-start' }}>Open on GitHub<Icon name="external" size={14} /></a> : null}
              </div>
            )
            : <div className="cl-d">{s.place === 'local' && !s.gh?.signedIn ? 'A repo on this machine works for local sessions. The cloud loop needs it on GitHub.' : 'Then the rest of setup carries on.'}</div>}
        </Step>
      </div>

      {s.next !== 'done' && s.manual?.length ? (
        <div className="rs-manual">
          <button className="btn btn-ghost btn-s" type="button" aria-expanded={manual} onClick={() => setManual(!manual)}><Icon name={manual ? 'chevronDown' : 'chevronRight'} size={14} />Do it in a terminal instead</button>
          {manual ? (
            <div className="rs-manual-body">
              <Cmds cmds={s.manual} all />
              <div className="rs-acts"><span className="t-body-s c-3">Then press Check again.</span><button className="btn btn-s btn-ghost" type="button" onClick={recheck} disabled={checking}><Icon name="refresh" size={14} />Check again</button></div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** A step's error: the server's words, and its commands when it sent some. */
function ErrLine({ e, start }) {
  return (
    <div className="rs-err" role="alert">
      <span className="t-body-s">{e.error}</span>
      {e.why && guideCopy(e.why, start) && guideCopy(e.why, start) !== e.error ? <span className="t-body-s c-2">{guideCopy(e.why, start)}</span> : null}
      <Cmds cmds={e.guide} />
    </div>
  );
}
