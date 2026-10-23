// Grill me (0.5.1): the open plan questions full screen, one at a time, spec by spec. Entering a spec runs its wand
// once (the next spec's starts when this one has two or fewer left), so the choices are there when you arrive; the
// answer box is the Oversight panel's, large. Answers are kept as you go (headsdown-inbox/useOversightAnswers.js,
// the store the panel reads), skips and where you are are drafts (`grill:skip`, `grill:at`), so leaving loses nothing
// and coming back picks up. It ends on a review that sends everything to a session, which runs /oversight to apply
// the answers, and opens that session.
//
// A dialog over the whole app (position: fixed), its own chunk, no particles: the reading surface stays still.
// The pure half: grill/model.js (queue, steps, progress, resume, hand-off) and grill/keys.js. CSS: styles/grill.css.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon, Kbd, cx, useShell } from '../ui/index.js';
import { useInbox, useOversight, useResource } from '../data/index.js';
import { useDrafts } from '../data/drafts.js';
import { useChoices } from '../data/choices.js';
import { choiceId } from '../ui/answer-logic.js';
import { hasFiles } from '../ui/attachments.js';
import { PATHS } from '../routes.js';
import { collect, names, planGroups } from './headsdown-inbox/inboxModel.js';
import { continueChoices, continueTarget, sendable } from './headsdown-inbox/planAnswers.js';
import { useOversightAnswers } from './headsdown-inbox/useOversightAnswers.js';
import { grillLeft, handoffPlan, progress, queueOf, readGrillAt, readIds, resumeTarget, runHandoff, specKeyOf, standing, step } from './grill/model.js';
import { KEY_SHEET, isField, keyAction } from './grill/keys.js';
import { SpecSide } from './grill/SpecSide.jsx';
import { Question } from './grill/Question.jsx';
import { Between } from './grill/Between.jsx';
import { HandOff } from './grill/HandOff.jsx';
import '../styles/grill.css';

const AT = 'grill:at';
const SKIP = 'grill:skip';
const EMPTY_HINT = 'Pick a choice, write an answer, or press S to skip.';

export default function Grill() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const shell = useShell();
  const inbox = useInbox();
  const oversight = useOversight(15000);
  const live = shell.live || {};
  const { items } = collect({ inbox, live, oversight, now: Date.now() });
  const planItems = useMemo(() => items.filter((i) => i.kind === 'plan'), [items]);
  const answers = useOversightAnswers({ items: planItems });
  const done = answers.kept;
  const drafts = useDrafts();
  const choices = useChoices();
  const wandOn = shell.app?.data?.prefs?.aiSummaries !== false;
  const groups = useMemo(() => planGroups(planItems), [planItems]);
  const skipped = readIds(drafts.get(SKIP));
  const saved = readGrillAt(drafts.get(AT));
  const loaded = (inbox.status !== 'loading' || oversight.status !== 'loading') && drafts.ready && answers.ready;

  const everything = queueOf(groups, done, { all: planItems });
  const [run, setRun] = useState(null); // { specs: [key] } once started
  const [picked, setPicked] = useState(null); // the start screen's checked specs
  const [st, setSt] = useState({ view: 'start', id: null });
  const [flash, setFlash] = useState('');
  const [hint, setHint] = useState('');
  const [sheet, setSheet] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [returnTo, setReturnTo] = useState(null); // 'review' while editing from the review
  const [picks, setPicks] = useState({}); // spec key -> target
  const [between, setBetween] = useState({}); // spec key -> { sending, sent }
  const [handing, setHanding] = useState(null); // { sending, results }
  const visited = useRef(new Set());
  const boxRef = useRef(null);
  const lastIndex = useRef(0);
  const opener = useRef(typeof document !== 'undefined' ? document.activeElement : null);

  const queue = queueOf(groups, done, { specs: run?.specs, all: planItems });
  const totals = progress(queue, done, skipped);
  const cur = st.id ? queue.byId[st.id] : null;
  const x = cur?.item || null;
  const spec = cur ? queue.specs.find((s) => s.key === cur.spec) : null;
  const sessions = answers.sessions;
  const targets = continueChoices(sessions);
  const defaultTarget = (s) => continueTarget({ n: s.n, file: s.file }, sessions);
  const briefsRes = useResource(queue.specs.length ? `/api/oversight/specs?files=${encodeURIComponent(queue.specs.map((s) => s.file).join(','))}` : null, { skip: !queue.specs.length });
  const briefs = briefsRes.status === 'ready' ? briefsRes.data?.specs || {} : {};

  // ---- where a visit starts: ?spec=, then a saved run, then the start screen ----
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !loaded) return;
    started.current = true;
    const n = params.get('spec');
    if (n) { setPicked([`spec:${n}`]); return; }
    const all = queueOf(groups, done, { specs: saved?.specs, all: planItems });
    const left = saved ? grillLeft(saved, all.ids.map((id) => all.byId[id].item).filter((i) => standing(i.id, done, skipped) === 'open')) : 0;
    if ((params.get('resume') || saved) && left) {
      const t = resumeTarget(all, saved, done, skipped);
      if (t) {
        setRun({ specs: saved.specs || [] });
        setSt({ view: 'q', id: t.id });
        setFlash('Picking up where you left off');
      }
    }
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // A line that fades: picked up, settled elsewhere.
  useEffect(() => { if (!flash) return undefined; const t = setTimeout(() => setFlash(''), 4000); return () => clearTimeout(t); }, [flash]);

  // ---- remember where you are ----
  useEffect(() => {
    if (!run || !st.id || st.view === 'start') return;
    const i = queue.ids.indexOf(st.id);
    if (i >= 0) lastIndex.current = i;
    drafts.save(AT, JSON.stringify({ specs: run.specs, id: st.id, i: lastIndex.current, at: Date.now() }));
  }, [st.id, run]); // eslint-disable-line react-hooks/exhaustive-deps

  // A question that vanished (answered in another tab, gone from the plan): on to the next open one.
  useEffect(() => {
    if (!run || st.view !== 'q' || !loaded || cur) return;
    const t = resumeTarget(queue, { i: lastIndex.current }, done, skipped);
    if (t && t.id !== st.id) { setSt({ view: 'q', id: t.id }); setFlash('That one was settled elsewhere.'); } else if (!t) setSt({ view: 'review', id: null });
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the wand: once on entering a spec, and the next spec's ahead of time ----
  const openIn = (s) => (s ? s.ids.filter((id) => standing(id, done, skipped) === 'open') : []);
  useEffect(() => {
    if (!wandOn || !spec || st.view !== 'q') return;
    const ask = (s) => {
      const ids = openIn(s).map((id) => choiceId(queue.byId[id].item)).filter((id) => id && choices.get(id).status === 'idle');
      if (ids.length) choices.ask(ids);
    };
    if (!visited.current.has(spec.key)) { visited.current.add(spec.key); ask(spec); }
    const left = openIn(spec).length;
    const next = queue.specs[queue.specs.findIndex((s) => s.key === spec.key) + 1];
    if (next && left <= 2 && !visited.current.has(`pre:${next.key}`)) { visited.current.add(`pre:${next.key}`); ask(next); }
  }, [spec?.key, st.id, st.view, wandOn]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- moving ----
  const move = (action) => {
    setHint('');
    const next = step(st, action, queue);
    if (returnTo === 'review' && ['keep', 'decide', 'skip'].includes(action.type)) { setReturnTo(null); setSt({ view: 'review', id: st.id }); return; }
    setSt(next);
  };
  const startRun = (keys) => {
    const q = queueOf(groups, done, { specs: keys, all: planItems });
    if (!q.ids.length) return;
    setRun({ specs: keys });
    const first = q.ids.find((id) => standing(id, done, skipped) === 'open') || q.ids[0];
    drafts.clear(SKIP);
    setSt({ view: 'q', id: first });
  };
  const exit = () => {
    const kept = queue.ids.filter((id) => done[id]?.kept && !done[id].sent).length;
    const at = cur && spec ? `${spec.n ? `spec ${spec.n}` : spec.file}, question ${spec.ids.indexOf(st.id) + 1}` : '';
    const toast = kept ? `Kept ${kept} ${kept === 1 ? 'answer' : 'answers'}.${at ? ` Grill me picks up at ${at}.` : ''}` : '';
    navigate(PATHS.inbox, { state: { fromGrill: true, toast } });
  };
  const keep = (text, images, how) => {
    answers.keep([[x, text, how, images]]);
    if (skipped.includes(x.id)) drafts.save(SKIP, JSON.stringify(skipped.filter((id) => id !== x.id)));
    move({ type: how === 'decide' ? 'decide' : 'keep' });
  };
  const skip = () => {
    if (x && !skipped.includes(x.id)) drafts.save(SKIP, JSON.stringify([...skipped, x.id]));
    move({ type: 'skip' });
  };
  const wandNow = (fresh = true) => { if (x && wandOn) choices.ask([choiceId(x)], { fresh }); };
  const wandSpec = () => { if (!spec || !wandOn) return; choices.ask(openIn(spec).map((id) => choiceId(queue.byId[id].item)).filter(Boolean), { fresh: true }); };

  // ---- the hand-off ----
  const reviewSpecs = queue.specs.map((s) => ({ ...s, items: s.ids.map((id) => queue.byId[id].item) }));
  const handOff = async () => {
    const plan = handoffPlan(reviewSpecs, done, sessions, picks);
    if (!plan.length) return;
    setHanding({ sending: true, results: null });
    const results = await runHandoff(plan, (g) => answers.send(g.items, g.target, `grill:${g.target.id}`, done));
    setHanding({ sending: false, results });
    if (results.every((r) => r.result.ok)) {
      drafts.clear(AT);
      drafts.clear(SKIP);
      const first = results.find((r) => r.result.fresh) || results[0];
      navigate(PATHS.cockpit(first.result.session));
    }
  };

  // ---- keys and a whole-window drop ----
  useEffect(() => {
    const onKey = (e) => {
      const a = keyAction(e, { inField: isField(document.activeElement), bare: !document.activeElement || document.activeElement === document.body });
      if (!a) return;
      if (a === 'keys') { e.preventDefault(); setSheet((s) => !s); return; }
      if (a === 'exit') { e.preventDefault(); if (sheet) setSheet(false); else exit(); return; }
      if (st.view === 'start') { if (a === 'enter' || a === 'keep') { e.preventDefault(); startRun(picked || everything.specs.map((s) => s.key)); } return; }
      if (st.view === 'between') { if (a === 'enter' || a === 'keep') { e.preventDefault(); move({ type: 'go' }); } return; }
      if (st.view !== 'q' || !x) return;
      const settled = done[x.id]?.kept ? done[x.id] : null;
      const box = boxRef.current;
      if (typeof a === 'object') { e.preventDefault(); box?.pick(a.pick); return; }
      e.preventDefault();
      switch (a) {
        case 'keep': if (settled) move({ type: 'next' }); else box?.keep(); break;
        case 'enter': if (settled) move({ type: 'next' }); else if (box?.has()) box.keep(); else box?.focus(); break;
        case 'wand': wandNow(true); break;
        case 'wandSpec': wandSpec(); break;
        case 'skip': skip(); break;
        case 'decide': if (!settled) box?.decide(); break;
        case 'prev': move({ type: 'prev' }); break;
        case 'next': move({ type: 'next' }); break;
        case 'prevSpec': move({ type: 'prevSpec' }); break;
        case 'nextSpec': move({ type: 'nextSpec' }); break;
        case 'focus': box?.focus(); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  useEffect(() => {
    const over = (e) => { if (st.view === 'q' && hasFiles(e.dataTransfer)) { e.preventDefault(); setDragging(true); } };
    const leave = (e) => { if (!e.relatedTarget) setDragging(false); };
    const drop = (e) => {
      setDragging(false);
      if (st.view !== 'q') return;
      const f = [...(e.dataTransfer?.files || [])];
      if (f.length) { e.preventDefault(); boxRef.current?.addFiles(f); }
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop); };
  }, [st.view]);
  // Focus goes back where it came from when Grill me closes.
  useEffect(() => () => { try { opener.current?.focus?.(); } catch { /* gone */ } }, []);

  // ---- live asks wait on you: a banner, not a step ----
  const nowItems = items.filter((i) => i.kind === 'now');
  const nowWho = names(nowItems.map((i) => i.session?.name || i.who));
  const banner = nowItems.length ? (
    <div className="grill-banner" role="status">
      <span className="park-mark" />
      <span>{nowWho || 'A session'} {nowItems.length === 1 && !nowWho.includes(' and ') ? 'waits' : 'wait'} on you: {nowItems.length} {nowItems.length === 1 ? 'question' : 'questions'}.</span>
      <button className="btn btn-s" type="button" onClick={exit}>Answer now<Icon name="arrowRight" size={14} /></button>
    </div>
  ) : null;

  // ---- the bar ----
  const bar = (
    <header className="grill-bar">
      <span className="grill-title">Grill me</span>
      {run && queue.specs.length ? (
        <div className="grill-prog" role="list" aria-label="Progress, spec by spec">
          {queue.specs.map((s) => {
            const c = totals.perSpec[s.key];
            const doneSpec = c && c.left === 0 && c.skipped === 0;
            return (
              <span key={s.key} className={cx('grill-seg', spec?.key === s.key && 'is-on')} style={{ flexGrow: s.ids.length }} role="listitem">
                <span className="grill-seg-n">{doneSpec ? <Icon name="check" size={12} /> : null}{s.n || 'other'}</span>
                <span className="qprog">
                  {s.ids.map((id) => {
                    const k = standing(id, done, skipped);
                    const cls = id === st.id && st.view === 'q' ? 'cur' : k === 'kept' ? 'on' : k === 'decided' ? 'def' : k === 'skipped' ? 'skip' : '';
                    return <i key={id} className={cls || undefined} onClick={() => setSt({ view: 'q', id })} title={queue.byId[id].item.q.slice(0, 80)} />;
                  })}
                </span>
              </span>
            );
          })}
        </div>
      ) : <span className="grill-prog" />}
      {run ? <span className="grill-count tb-long">{totals.answered + totals.decided} of {totals.total}{totals.skipped ? ` · ${totals.skipped} skipped` : ''}</span> : null}
      <button className="btn btn-ghost btn-s" type="button" aria-label="Keys" onClick={() => setSheet((s) => !s)}>?</button>
      {run && queue.ids.some((id) => done[id]?.kept && !done[id].sent) && st.view !== 'review' ? <button className="btn btn-s" type="button" onClick={() => setSt({ view: 'review', id: st.id })}>Hand off</button> : null}
      <button className="btn btn-ghost btn-s" type="button" onClick={exit}>Exit<Kbd>esc</Kbd></button>
    </header>
  );

  // ---- the screens ----
  let body;
  if (!loaded) {
    body = <div className="grill-center"><p className="t-body c-2">Gathering the open questions...</p></div>;
  } else if (st.view === 'start' || !run) {
    const specs = everything.specs;
    const on = picked || specs.map((s) => s.key);
    const count = specs.filter((s) => on.includes(s.key)).reduce((n, s) => n + s.ids.length, 0);
    const savedLeft = saved ? grillLeft(saved, planItems.filter((i) => everything.byId[i.id] && standing(i.id, done, skipped) === 'open')) : 0;
    body = (
      <section className="grill-center grill-start" aria-label="Start">
        {specs.length ? (
          <>
            <h1 className="grill-start-h">{everything.ids.length} open {everything.ids.length === 1 ? 'question' : 'questions'} across {specs.length} {specs.length === 1 ? 'spec' : 'specs'}.</h1>
            <ul className="grill-start-list">
              {specs.map((s) => (
                <li key={s.key}>
                  <label>
                    <input type="checkbox" checked={on.includes(s.key)} onChange={(e) => setPicked(e.target.checked ? [...on, s.key] : on.filter((k) => k !== s.key))} />
                    {s.n ? <span className="n">{s.n}</span> : null}
                    <span className="t">{s.n ? s.title : s.file}</span>
                    <span className="c">{s.ids.length}</span>
                  </label>
                </li>
              ))}
            </ul>
            {everything.secrets ? <p className="t-body-s c-3">{everything.secrets === 1 ? '1 secret request waits' : `${everything.secrets} secret requests wait`} in the Vault. Set {everything.secrets === 1 ? 'it' : 'them'} there.</p> : null}
            <p className="t-body-s c-2">Your answers are kept as you go. At the end they go to a session, which applies them.</p>
            {savedLeft && !params.get('spec') ? <p className="t-body-s c-2">Pick up where you left off: {savedLeft} left.</p> : null}
            <div className="grill-acts">
              {savedLeft && !params.get('spec') ? (
                <>
                  <button className="btn btn-primary" type="button" autoFocus onClick={() => { const t = resumeTarget(queueOf(groups, done, { specs: saved.specs, all: planItems }), saved, done, skipped); setRun({ specs: saved.specs || [] }); setSt({ view: 'q', id: t?.id }); }}>Resume<Kbd>⏎</Kbd></button>
                  <button className="btn btn-ghost" type="button" disabled={!count} onClick={() => startRun(on)}>Start over</button>
                </>
              ) : <button className="btn btn-primary" type="button" autoFocus disabled={!count} onClick={() => startRun(on)}>Start<Kbd>⏎</Kbd></button>}
              <button className="btn btn-ghost" type="button" onClick={exit}>Back to Oversight<Kbd>esc</Kbd></button>
            </div>
          </>
        ) : (
          <>
            <h1 className="grill-start-h">Nothing to grill you on.</h1>
            <p className="t-body-s c-2">No open plan questions right now. Parked and live ones stay in Oversight.</p>
            <div className="grill-acts"><button className="btn btn-primary" type="button" autoFocus onClick={exit}>Back to Oversight</button></div>
          </>
        )}
      </section>
    );
  } else if (st.view === 'review') {
    body = (
      <div className="grill-center grill-wide">
        <HandOff
          queue={queue} done={done} skipped={skipped} totals={totals} specs={reviewSpecs} picks={picks} targets={targets} defaultTarget={defaultTarget}
          onPick={(key, t) => setPicks((p) => ({ ...p, [key]: t }))} onEdit={(id) => { setReturnTo('review'); setSt({ view: 'q', id }); }}
          onSend={handOff} onBack={exit} sending={handing?.sending} results={handing?.results} onOpen={(r) => navigate(PATHS.cockpit(r.session))}
        />
      </div>
    );
  } else if (st.view === 'between' && cur) {
    const fromKey = Object.keys(totals.perSpec).find((k) => k === (st.from || ''));
    const from = queue.specs.find((s) => s.key === fromKey) || spec;
    const fromItems = from.ids.map((id) => queue.byId[id].item);
    const list = sendable(fromItems, done);
    const t = picks[from.key] || defaultTarget(from);
    const b = between[from.key] || {};
    body = (
      <div className="grill-center">
        <Between
          from={from} fromCounts={totals.perSpec[from.key]} to={spec} sendable={list.length} targets={targets} target={t}
          onPick={(tt) => setPicks((p) => ({ ...p, [from.key]: tt }))} sending={b.sending} sent={b.sent}
          onSend={async () => {
            setBetween((m) => ({ ...m, [from.key]: { sending: true } }));
            const r = await answers.send(list, t, `between:${from.key}`, done);
            setBetween((m) => ({ ...m, [from.key]: r.ok ? { sent: `sent to ${r.name || (t.kind === 'new' ? 'a new session' : t.name)}` } : {} }));
          }}
          onGo={() => move({ type: 'go' })}
        />
      </div>
    );
  } else if (x && spec) {
    const settled = done[x.id]?.kept ? done[x.id] : null;
    body = (
      <div className="grill-main">
        <SpecSide
          spec={spec} brief={briefs[spec.file]} curId={x.id} done={done} skipped={skipped} wand={openIn(spec).some((id) => choices.get(choiceId(queue.byId[id].item)).status === 'loading') ? 'loading' : 'idle'}
          onWand={wandOn ? wandSpec : null} onJump={(id) => setSt({ view: 'q', id })} firstVisit={!visited.current.has(`seen:${spec.key}`) && (visited.current.add(`seen:${spec.key}`), true)}
        />
        <div className="grill-col">
          {banner}
          {flash ? <p className="grill-flash" role="status">{flash}</p> : null}
          <Question
            boxRef={boxRef} x={x} spec={spec} index={spec.ids.indexOf(x.id)} total={spec.ids.length} entry={choices.get(choiceId(x))} wandOn={wandOn}
            onAsk={(fresh) => wandNow(fresh)} onKeep={keep} onSkip={skip} onBack={() => move({ type: 'prev' })} onNext={() => move({ type: 'next' })}
            onChange={settled && !settled.sent ? () => answers.reopen(x) : null} settled={settled} hint={hint} onEmpty={() => setHint(EMPTY_HINT)} arriving
          />
        </div>
      </div>
    );
  } else {
    body = <div className="grill-center"><p className="t-body c-2">Gathering the open questions...</p></div>;
  }

  return (
    <div className="grill" role="dialog" aria-modal="true" aria-label="Grill me: open questions, spec by spec">
      {bar}
      {st.view !== 'q' && banner ? <div className="grill-center grill-banner-top">{banner}</div> : null}
      {body}
      <footer className="grill-keys tb-long" aria-hidden="true">
        <span><Kbd>alt 1-4</Kbd>pick</span><span><Kbd>ctrl ⏎</Kbd>keep and next</span><span><Kbd>w</Kbd>wand</span><span><Kbd>s</Kbd>skip</span><span><Kbd>d</Kbd>decide</span><span><Kbd>[ ]</Kbd>spec</span><span><Kbd>?</Kbd>keys</span>
      </footer>
      {sheet ? (
        <div className="menu grill-sheet" role="dialog" aria-label="Keys">
          <div className="menu-head"><span className="t-caps c-2">Keys</span></div>
          <dl>{KEY_SHEET.map(([k, v]) => <div key={k}><dt><Kbd>{k}</Kbd></dt><dd>{v}</dd></div>)}</dl>
        </div>
      ) : null}
      {dragging ? <div className="grill-drop" aria-hidden="true"><span>Drop images onto this answer</span></div> : null}
    </div>
  );
}
