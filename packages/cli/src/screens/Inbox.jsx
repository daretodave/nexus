// The oversight inbox (Inbox + InboxLight boards; the tug and parked card
// from the Tug board). Every open question, grouped by where it really comes
// from (spec 47, A7): Waiting now (a live session asks), Parked (a session took
// a default), In the plan (a spec's Open questions and [needs-user-call] rows,
// under a header per spec), and Cloud runs (only what a cloud run parked).
// Rows (.ibx-group/.ibx-row) on the left, the selected question in .ibx-panel
// on the right (a pending .tug, a parked or plan .pcard, or the answered tug),
// with .ibx-ctx under it. Question text is markdown, drawn by ui/markdown.jsx.
// Batch-answer with defaults confirms its list first and takes only questions
// that carry a default. Items: headsdown-inbox/inboxModel.js; app glue CSS:
// styles/oversight.css.
// Answers save as typed and send as given (spec 51, A1): a typed answer is a draft on the server (data/drafts.js)
// until it goes; a parked or cloud question sends the moment it is answered; a live ask's picks are kept as
// drafts too (`<askId>:<i>:pick`) and go from the first one on with Send (data/answers.js), the rest taking their
// defaults, or on their own once every one is settled.
// A plan question's answer is kept, not sent (spec 53, A1): it records on the server at once (GET/PUT
// /api/plan-answers), reads "answered · not sent yet" across reloads and tabs, and goes back with its spec's Continue,
// every answer of that spec in one message to the session that asked (headsdown-inbox/planAnswers.js).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ViewFrame, ViewHead, ViewTitle, ChoiceButtons, LoopStatus, Icon, Orb, Ring, SessTag, Empty, ToastHost, KeyCard, KeyOrb, Markdown, cx, useShell,
} from '../ui/index.js';
import '../styles/oversight.css';
import { countdown } from '../../shared/times.mjs';
import { api, server, useCloudLoop, useInbox, useOversight, usePlanAnswers, useSecrets, useSessions } from '../data/index.js';
import { draftFailed, draftSending, draftSent, useDrafts } from '../data/drafts.js';
import { askSend, sendsNow } from '../data/answers.js';
import { NO_ANSWER } from '../../shared/times.mjs';
import { AnswerField } from '../ui/answer-field.jsx';
import { PATHS } from '../routes.js';
import { batchEligible, batchWhyLine, collect, clock, names, planGroups } from './headsdown-inbox/inboxModel.js';
import {
  continueBody, continueChoices, continueTarget, keepsAnswer, keptDone, planKey, sendable,
} from './headsdown-inbox/planAnswers.js';
import { ContinueBar } from './headsdown-inbox/ContinueBar.jsx';
import { keyCard } from './vault/model.js';
import { useKeyCards } from './vault/useKeyCards.js';

const KIND_CLS = { now: 'is-now', parked: 'is-parked', cloud: 'is-cloud', plan: 'is-cloud' };
const KINDS = ['now', 'parked', 'plan', 'cloud'];
const HOW_META = { approved: 'approved: ', default: 'default: ', answered: 'answered: ', changed: 'changed: ' };
const HOW_LABEL = { approved: 'approved', default: 'default', answered: 'answered', changed: 'changed', set: 'set' };
const CLOUD_TAG = { width: 12, height: 12, color: 'var(--accent)' };

const sessName = (x) => x.session?.name || '';
/** The session a row belongs to; today's live rows all come from the one session this server runs. */
const sessKey = (x) => x.sessionId || sessName(x) || 'live';
/** The question set a row's progress counts against: its session, or the one ask it came in. */
const groupKey = (x) => x.sessionId || sessName(x) || x.askId || 'live';

/** A question's markdown on one line, for a row (its wrapped and nested lines run on). */
const oneLine = (q) => String(q || '').replace(/\s*\n\s*/g, ' ');

/** The row's tag: a cloud run or the session (star + name). A plan question has none: its group says where it lives. */
function Tag({ x }) {
  if (x.kind === 'cloud') return <span className="sess-tag" style={{ '--sess': 'var(--accent)' }}><Icon name="cloud" style={CLOUD_TAG} />{x.run}</span>;
  if (x.session) return <SessTag session={x.session} />;
  return <span className="sess-tag">session</span>;
}

/**
 * The pending tug's timer (Tug board): a live question counts down to the default its session takes (shared/times.mjs
 * ASK_DEFAULT_MS), ticking each second; one without a deadline shows its age.
 */
function DefaultIn({ deadline, age }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadline]);
  const c = deadline ? countdown(deadline, now) : null;
  if (c) return <span className="tug-timer"><Ring size="s" color="var(--st-blocked)" value={c.pct} />default in {c.left}</span>;
  return age ? <span className="tug-timer">{age}</span> : null;
}

/** A live ask's question as AskUserQuestion has it, for data/answers.js: its default is its first option. */
const askQ = (x) => ({ question: x.qText, options: x.hasDefault ? [x.opts[0]] : [] });
/** Where a live ask's picked answer is kept until Send (the server clears `<askId>:` drafts once it is answered). */
const pickKey = (x) => `${x.id}:pick`;

function Opts({ x, onPick }) {
  return (
    <div className="tug-opts">
      {x.opts.map((o, i) => {
        const rec = i === 0 && x.hasDefault;
        return <button key={o} className={cx('tug-opt', rec && 'is-rec')} type="button" onClick={() => onPick(o, i)}>{o}{rec ? <span className="rec">recommended</span> : null}</button>;
      })}
    </div>
  );
}

export default function Inbox() {
  const shell = useShell();
  const inbox = useInbox();
  const oversight = useOversight(15000);
  const cloudRes = useCloudLoop();
  const cloud = cloudRes.status === 'ready' ? cloudRes.data : null;
  const live = shell.live || {};
  const now = Date.now();

  const { items: current } = collect({ inbox, live, oversight, now });
  // A secret request's key card reads the manifest's entry (what it is for, where to get it, where it goes).
  const hasKey = current.some((i) => i.secret);
  const secretsRes = useSecrets(undefined, { skip: !hasKey });

  const [sel, setSel] = useState(null);
  const [filter, setFilter] = useState('all');
  const [done, setDone] = useState({});
  const [batch, setBatch] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [errs, setErrs] = useState({});
  // Plan answers kept on the server (spec 53): the store as last read or written here; a poll waits while a write is out.
  const keptRes = usePlanAnswers(8000);
  const sessionsRes = useSessions(8000);
  const sessions = sessionsRes.status === 'ready' && Array.isArray(sessionsRes.data) ? sessionsRes.data : [];
  const [planStore, setPlanStore] = useState({});
  const writing = useRef(0);
  useEffect(() => {
    if (keptRes.status === 'ready' && !writing.current) setPlanStore(keptRes.data?.answers || {});
  }, [keptRes.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sendTo, setSendTo] = useState({}); // spec group key -> the target picked with "send to…"
  const [continuing, setContinuing] = useState(null); // the spec group whose Continue is on its way
  // What is settled: this screen's own, then the kept plan answers over them (the server's word on sent).
  const doneAll = { ...done, ...keptDone(current, planStore) };
  const doneRef = useRef(doneAll);
  doneRef.current = doneAll;
  const drafts = useDrafts();
  const sendingAsks = useRef(new Set());
  // A saved secret settles its row ("set") without an answer to the plan: the value went to the vault, and the
  // request leaves the server's list once its names are set.
  const keys = useKeyCards({
    reload: () => { secretsRes.reload(); inbox.reload?.(); },
    onSaved: (card, saved) => {
      const item = current.find((i) => i.secret === card.name && i.chunk === card.chunk) || doneRef.current[card.itemId]?.item;
      if (item) setDone((d) => ({ ...d, [item.id]: { a: saved.places, how: 'set', item, sent: true } }));
    },
  });

  // A stable order: rows keep their place when they settle and leave the server's list.
  const order = useRef([]);
  const byId = {};
  for (const x of current) {
    byId[x.id] = x;
    if (!order.current.includes(x.id)) order.current.push(x.id);
  }
  const items = order.current.map((id) => byId[id] || doneAll[id]?.item).filter(Boolean);
  const isDone = (x) => !!doneAll[x.id];
  const openItems = items.filter((x) => !isDone(x));

  // A live ask's picks, kept as drafts, come back after a reload or a return: settled, not yet sent.
  const askIds = current.filter((i) => i.src === 'ask').map((i) => i.id).join('|');
  useEffect(() => {
    if (!drafts.ready) return;
    const add = {};
    for (const i of current) {
      if (i.src !== 'ask' || doneRef.current[i.id]) continue;
      try {
        const p = JSON.parse(drafts.get(pickKey(i)) || 'null');
        if (p && p.a) add[i.id] = { a: String(p.a), how: p.how || 'answered', item: i };
      } catch { /* not a pick */ }
    }
    if (Object.keys(add).length) setDone((d) => ({ ...add, ...d }));
  }, [drafts.ready, askIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const cloudNext = cloud?.next ? clock(cloud.next) : '';
  // A cloud run names its repo's loop ("tidepool loop"), as the board does now that loops span repos.
  const loopName = shell.repo ? `${shell.repo} loop` : 'cloud loop';
  const loopAt = cloudNext ? `the ${cloudNext} loop` : 'the next loop';

  /**
   * Keep plan answers on the server ({ "<file:line>": { answer, how } | null }): shown at once, written through PUT
   * /api/plan-answers. One that did not keep comes back off, with why.
   */
  async function keepPlan(patch, ids = []) {
    setPlanStore((st) => {
      const c = { ...st };
      for (const [k, v] of Object.entries(patch)) { if (v) c[k] = { ...v, at: Date.now() }; else delete c[k]; }
      return c;
    });
    writing.current += 1;
    try {
      const r = await server.savePlanAnswers(patch);
      setPlanStore(r.answers || {});
    } catch (e) {
      setDone((d) => { const c = { ...d }; ids.forEach((id) => delete c[id]); return c; });
      setErrs((er) => ({ ...er, ...Object.fromEntries(ids.map((id) => [id, `Not kept: ${e.message}`])) }));
      keptRes.reload();
    } finally {
      writing.current -= 1;
    }
  }

  const submit = useCallback(async (entries, nextDone) => {
    const fail = (ids, msg) => {
      setDone((d) => { const c = { ...d }; ids.forEach((id) => delete c[id]); return c; });
      setErrs((e) => ({ ...e, ...Object.fromEntries(ids.map((id) => [id, msg])) }));
    };
    const sent = (ids) => setDone((d) => { const c = { ...d }; ids.forEach((id) => { if (c[id]) c[id] = { ...c[id], sent: true }; }); return c; });
    const asks = new Map();
    const plan = {};
    const planIds = [];
    for (const [x, a, how] of entries) {
      setErrs((e) => { if (!e[x.id]) return e; const c = { ...e }; delete c[x.id]; return c; });
      if (keepsAnswer(x)) {
        // A plan answer is kept, not sent: it goes back with its spec's Continue. Its typed words are the answer now.
        plan[planKey(x)] = { answer: a, how: how === 'answered' || how === 'changed' ? 'answered' : 'default' };
        planIds.push(x.id);
        drafts.clear(x.id);
        continue;
      }
      if (!sendsNow(x)) {
        // Kept until Send (or until every one of its questions is settled).
        drafts.save(pickKey(x), JSON.stringify({ a, how }));
        asks.set(x.askId, true);
        continue;
      }
      draftSending(x.id);
      try {
        if (x.src === 'perm') await server.answerPermission(x.raw.id, a !== 'Deny', a === 'Always allow');
        else await api(`/api/inbox/${encodeURIComponent(x.id)}`, { answer: a, how });
        sent([x.id]);
        draftSent(x.id);
      } catch (e) {
        draftFailed(x.id);
        fail([x.id], e.status === 404 && x.src === 'inbox' ? 'Answering here is not served yet (POST /api/inbox/:id).' : e.message);
      }
    }
    if (planIds.length) await keepPlan(plan, planIds);
    // An ask carries several questions; once all of them are settled it goes on its own (Send takes it sooner).
    for (const askId of asks.keys()) {
      if (askItems(askId, nextDone).every((x) => nextDone[x.id])) await sendAsk(askId, nextDone);
    }
  }, [byId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** A live ask's questions, in order, the settled ones too. */
  function askItems(askId, doneMap = doneRef.current) {
    return order.current.map((id) => byId[id] || doneMap[id]?.item).filter((i) => i && i.askId === askId);
  }

  /** What Send would do for an ask now: data/answers.js askSend over its questions and the picks not yet sent. */
  function askPlan(askId, doneMap = doneRef.current) {
    const all = askItems(askId, doneMap);
    const picked = Object.fromEntries(all.filter((i) => doneMap[i.id]).map((i) => [i.qText, doneMap[i.id].a]));
    return { all, ...askSend(all.map(askQ), picked) };
  }

  /** Send an ask with what is answered: the rest take their defaults (the server fills them in). */
  async function sendAsk(askId, doneMap = doneRef.current) {
    if (sendingAsks.current.has(askId)) return;
    sendingAsks.current.add(askId);
    const plan = askPlan(askId, doneMap);
    const ids = plan.all.map((i) => i.id);
    const filled = plan.all.filter((i) => !doneMap[i.id]).map((i) => i.id);
    setDone((d) => {
      const c = { ...d };
      for (const i of plan.all) if (!c[i.id]) c[i.id] = { a: plan.answers[i.qText] ?? NO_ANSWER, how: 'default', item: i };
      return c;
    });
    ids.forEach(draftSending);
    try {
      await server.answerAsk(askId, plan.payload);
      setDone((d) => { const c = { ...d }; ids.forEach((id) => { if (c[id]) c[id] = { ...c[id], sent: true }; }); return c; });
      ids.forEach(draftSent);
    } catch (e) {
      // Nothing went: the defaults filled in come back off, the picks stay (they are still drafts).
      setDone((d) => { const c = { ...d }; filled.forEach((id) => delete c[id]); return c; });
      ids.forEach(draftFailed);
      setErrs((er) => ({ ...er, [ids[0]]: e.message }));
    } finally {
      sendingAsks.current.delete(askId);
    }
  }

  const settleMany = useCallback((entries) => {
    if (!entries.length) return;
    const next = { ...doneRef.current };
    for (const [x, a, how] of entries) next[x.id] = { a, how, item: x, ...(keepsAnswer(x) ? { kept: true } : {}) };
    setDone(next);
    const after = items.find((i) => !next[i.id]);
    setSel(after ? after.id : entries[entries.length - 1][0].id);
    submit(entries, next);
  }, [items, submit]);

  const settle = (x, a, how) => settleMany([[x, a, how]]);
  const reopen = (x) => {
    if (x.src === 'ask') drafts.clear(pickKey(x));
    setDone((d) => { const c = { ...d }; delete c[x.id]; return c; });
    // A kept plan answer, changed: it leaves the store until the new one is given.
    if (keepsAnswer(x) && planStore[planKey(x)]) keepPlan({ [planKey(x)]: null });
    setSel(x.id);
  };
  /**
   * A spec's Continue: every kept, unsent answer of the group in one message to one session (the one that asked, the
   * one picked, or a new one running /oversight). Never one prompt per answer, never the hidden home session.
   */
  async function continueGroup(pg, target) {
    const list = sendable(pg.items, doneRef.current);
    if (!list.length || continuing) return;
    setContinuing(pg.key);
    try {
      const body = continueBody(list, doneRef.current, target);
      const r = await server.continueAnswers(body.answers, body.session);
      const to = r.session || body.session;
      const ids = list.map((i) => i.id);
      setPlanStore((st) => { const c = { ...st }; for (const i of list) if (c[planKey(i)]) c[planKey(i)] = { ...c[planKey(i)], sent: Date.now(), to }; return c; });
      setDone((d) => { const c = { ...d }; ids.forEach((id) => { if (c[id]) c[id] = { ...c[id], sent: true, to }; }); return c; });
      keptRes.reload();
      sessionsRes.reload();
    } catch (e) {
      setErrs((er) => ({ ...er, [`continue:${pg.key}`]: e.message }));
    } finally {
      setContinuing(null);
    }
  }
  const settleKind = (kind, how) => settleMany(openItems.filter((x) => x.kind === kind && x.hasDefault).map((x) => [x, x.opts[0], how]));
  // Batch-answer with defaults: only the questions that carry a default (a live ask's first option, a parked
  // default, a plan question that names its Recommendation:/Default:/(recommended)); the list shows before it sends.
  const eligible = batchEligible(openItems);
  const batchAll = () => {
    const entries = eligible.map((x) => [x, x.opts[0], x.kind === 'now' ? 'default' : 'approved']);
    settleMany(entries);
    setBatch(entries.length);
    setConfirm(false);
  };

  // counts and filters
  const open = (k) => openItems.filter((x) => x.kind === k).length;
  const n = Object.fromEntries(KINDS.map((k) => [k, open(k)]));
  n.all = KINDS.reduce((t, k) => t + n[k], 0);
  const show = Object.fromEntries(KINDS.map((k) => [k, filter === 'all' || filter === k]));
  const g = Object.fromEntries(KINDS.map((k) => [k, items.filter((x) => x.kind === k)]));
  const batchable = eligible.length;
  const batchWhy = batchWhyLine(batchable);

  // keep a selection that exists
  const x = items.find((i) => i.id === sel) || openItems[0] || items[0] || null;
  useEffect(() => { if (x && x.id !== sel) setSel(x.id); }, [x?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // the top line: "4 open across 3 sessions and the cloud loop"
  const openLine = useMemo(() => {
    if (!n.all) return 'nothing open';
    const sess = new Set(openItems.filter((i) => i.kind === 'now' || i.kind === 'parked').map(sessKey));
    const hasCloud = openItems.some((i) => i.kind === 'cloud');
    const hasPlan = openItems.some((i) => i.kind === 'plan');
    const parts = [];
    if (sess.size) parts.push(sess.size === 1 ? '1 session' : `${sess.size} sessions`);
    if (hasCloud) parts.push('the cloud loop');
    if (hasPlan) parts.push('the plan');
    return `${n.all} open across ${names(parts)}`;
  }, [n.all, openItems]); // eslint-disable-line react-hooks/exhaustive-deps

  // the Waiting now group: who it blocks, and the session to start once it is settled
  const nowSess = names(g.now.map(sessName));
  const nowStart = g.now.length > 0 && g.now.every((i) => i.phase === 'start');
  const nowMany = new Set(g.now.map(sessName).filter(Boolean)).size > 1;
  const nowLine = nowSess ? (nowStart ? `blocks ${nowSess} from starting` : `${nowSess} ${nowMany ? 'wait' : 'waits'} on these`) : 'an agent waits on these';
  const startId = nowStart ? g.now.find((i) => i.sessionId)?.sessionId : null;

  const effect = (i) => {
    if (i.secret) return `${loopAt} picks ${i.chunk || 'its chunk'} back up; the agent sees the name, never the value`;
    if (i.src === 'perm') return `${i.who} waits on this permission`;
    if (i.src === 'durable') return "the answer is kept here; its spec's Continue sends it, with the others, to the session that asked";
    if (i.kind === 'now') {
      if (i.src !== 'ask') return `${i.who} waits on this answer`;
      const who = i.phase === 'start' && sessName(i) ? `${sessName(i)} starts working` : `${i.who} goes on`;
      return `${who} once you send, from the first answer on; what you leave takes its default`;
    }
    if (i.kind === 'cloud') return `${loopAt} picks up your answer`;
    return 'approving now saves a step at review; a change queues a fix chunk';
  };

  // Secrets never take a default: batch-answer passes over a key row and says so.
  const keyOpen = openItems.filter((i) => i.secret).map((i) => i.secret);
  const keyNote = keyOpen.length ? ` ${names(keyOpen)} still ${keyOpen.length === 1 ? 'needs a value' : 'need values'}: secrets never take a default.` : '';

  const groupDone = (kind) => g[kind].length > 0 && g[kind].every(isDone);
  const batchLine = () => {
    const parts = [];
    if (g.now.length) parts.push(nowSess ? `${nowSess} ${nowStart ? 'can start working' : 'can go on'}` : 'the waiting agent can go on');
    const parkedSess = names(g.parked.map(sessName));
    if (g.parked.length) parts.push(`${parkedSess || 'the parked sessions'} keep going`);
    if (g.plan.length) parts.push("the plan answers are kept for each spec's Continue");
    if (g.cloud.length) parts.push(`the cloud answers land in the plan for ${loopAt}`);
    return names(parts);
  };

  const row = (r) => {
    const d = doneAll[r.id];
    const settled = !!d;
    let meta = '';
    let metaB = '';
    if (settled) { meta = d.how === 'set' ? `${r.secret} set · ` : HOW_META[d.how] || 'answered: '; metaB = d.a; }
    else if (r.secret) { meta = `plan · ${r.chunk} · `; metaB = 'needs a value, no default'; }
    else if (r.src === 'durable') { meta = `${r.raw.file}:${r.raw.line}${r.age ? ` · ${r.age}` : ''}${r.hasDefault ? ' · recommends ' : ''}`; metaB = r.hasDefault ? r.opts[0] : ''; }
    else if (r.kind === 'now') meta = [r.who, r.chunk, r.age].filter(Boolean).join(' · ');
    else { meta = `${[r.kind === 'cloud' ? loopName : r.who, r.chunk, r.at].filter(Boolean).join(' · ')}${r.hasDefault ? ' · assumed ' : ''}`; metaB = r.hasDefault ? r.opts[0] : ''; }
    return (
      <div key={r.id} className={cx('ibx-row', r.kind === 'plan' && 'is-plan', x?.id === r.id && 'is-selected', settled && 'is-settled')}>
        {r.secret ? <KeyOrb small state={settled ? (d.how === 'set' ? 'set' : 'quiet') : ''} icon="key" /> : <span className={cx('urg', settled ? 'is-done' : KIND_CLS[r.kind])} />}
        {r.kind === 'plan' ? null : <Tag x={r} />}
        <button className="ibx-open" type="button" onClick={() => setSel(r.id)} aria-label={`Open: ${oneLine(r.q)}`}>
          <span className="ibx-q">{r.secret ? <>{r.chunk} needs <code className="secret-code">{r.secret}</code></> : <Markdown inline text={oneLine(r.q)} />}</span>
          <span className="ibx-meta">{meta}{metaB ? <b>{metaB}</b> : null}</span>
        </button>
        <div className="ibx-acts">
          {!settled && r.kind === 'now' && r.hasDefault ? <button className="btn btn-ghost btn-s" type="button" onClick={() => settle(r, r.opts[0], 'default')}>Use default</button> : null}
          {!settled && r.kind !== 'now' && r.hasDefault ? <button className="btn btn-s" type="button" onClick={() => settle(r, r.opts[0], 'approved')}><Icon name="check" size={14} />Approve</button> : null}
          {!settled && r.secret ? <button className="btn btn-s btn-warn" type="button" onClick={() => setSel(r.id)}><Icon name="key" size={14} />Add value</button> : null}
          {settled && d.kept ? <span className={cx('chk-state', d.sent ? 'is-ok' : 'pans-kept')}><Icon name={d.sent ? 'check' : 'clock'} size={14} />{d.sent ? 'sent' : `${HOW_LABEL[d.how] || 'answered'} · not sent yet`}</span> : null}
          {settled && !d.kept ? <span className="chk-state is-ok"><Icon name="check" size={14} />{HOW_LABEL[d.how] || 'answered'}</span> : null}
        </div>
      </div>
    );
  };

  const group = (kind, title, label, line, head, body) => (show[kind] && g[kind].length ? (
    <section className="ibx-group" aria-label={label}>
      <div className="ibx-gh">
        <span className="t-caps c-2">{title}</span><span className="n">{n[kind]}</span><span className="d">{line}</span><span className="tb-spacer" />
        {head}
      </div>
      {body || g[kind].map(row)}
    </section>
  ) : null);

  // In the plan: a header per spec (its number and title) over its questions, then each other file's [needs-user-call] rows
  const planBody = (
    <PlanGroups
      items={g.plan} row={row} isDone={isDone} done={doneAll} sessions={sessions} sendTo={sendTo} continuing={continuing}
      onPick={(key, id) => setSendTo((m) => ({ ...m, [key]: id }))} onContinue={continueGroup}
    />
  );

  // The Send bar under a live ask's question: from its first pick on, until it has gone.
  const askBar = (askId) => {
    const plan = askPlan(askId);
    if (!plan.label || plan.all.every((i) => doneAll[i.id]?.sent)) return null;
    return { label: plan.label, answered: plan.answered, total: plan.all.length, sending: sendingAsks.current.has(askId), onSend: () => sendAsk(askId) };
  };

  const loading = !items.length && (oversight.status === 'loading' || inbox.status === 'loading');
  const cloudEmpty = filter === 'cloud' && !g.cloud.length;

  const actions = (
    <>
      {cloud ? <LoopStatus paused={!!cloud.paused}>{cloud.paused ? 'paused' : cloudNext ? `next ${cloudNext}` : 'on'}</LoopStatus> : null}
      <Link className="btn btn-s" to={PATHS.fleet}><Icon name="fleet" size={14} />Fleet</Link>
    </>
  );

  return (
    <ViewFrame current="inbox" title="Oversight" sub={openLine} label="Oversight inbox" actions={actions}>
      <ViewHead>
        <ViewTitle title={<h1 className="t-title-l">Oversight</h1>} sub="Every open question from your sessions and cloud loops. Answer here and it unblocks the agent, or lands in the plan for the next loop." />
        <div className="view-acts">
          <ChoiceButtons
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `All ${n.all}` },
              { value: 'now', label: `Waiting now ${n.now}` },
              { value: 'parked', label: `Parked ${n.parked}` },
              { value: 'plan', label: `In the plan ${n.plan}` },
              { value: 'cloud', label: `Cloud runs ${n.cloud}`, title: n.cloud ? undefined : 'No cloud run has parked a question' },
            ]}
          />
          <span className="ibx-batch" title={batchWhy}>
            <button className="btn btn-primary" type="button" onClick={() => setConfirm(true)} disabled={!batchable} aria-label={`Batch-answer with defaults: ${batchWhy}`}><Icon name="rays8" size={14} />Batch-answer with defaults{batchable ? <span className="ibx-batch-n">{batchable}</span> : null}</button>
          </span>
        </div>
      </ViewHead>
      {!items.length || cloudEmpty ? (
        loading ? null : cloudEmpty && items.length
          ? <Empty sky="quiet" title="No cloud run has parked a question" body="Questions a cloud run parks show up here. The plan's own questions are under In the plan." />
          : <Empty sky="quiet" title="Nothing needs you" body="No open questions in any session or in the plan's specs. Parked ones will show up here at the end of each run." />
      ) : (
        <div className="inbox">
          <div className="ibx-list">
            {group('now', 'Waiting now', 'Waiting now', nowLine, (
              <>
                {n.now > 0 && g.now.some((i) => !isDone(i) && i.hasDefault) ? <button className="btn btn-ghost btn-s" type="button" onClick={() => settleKind('now', 'default')}>Use defaults for these</button> : null}
                {groupDone('now') && startId ? <Link className="btn btn-primary btn-s" to={PATHS.cockpit(startId)}>Start {nowSess}<Icon name="arrowRight" size={14} /></Link> : null}
              </>
            ))}
            {group('parked', 'Parked', 'Parked', 'agents took a default and kept going', (
              n.parked > 0 ? <button className="btn btn-ghost btn-s" type="button" onClick={() => settleKind('parked', 'approved')}>Approve all</button> : null
            ))}
            {group('plan', 'In the plan', 'In the plan', "open questions in specs and [needs-user-call] rows; answers are kept until a spec's Continue sends them back", (
              g.plan.some((i) => !isDone(i) && i.hasDefault) ? <button className="btn btn-ghost btn-s" type="button" onClick={() => settleKind('plan', 'approved')}>Approve recommended</button> : null
            ), planBody)}
            {group('cloud', 'From cloud runs', 'From cloud runs', 'answers land in the plan for the next loop', (
              g.cloud.some((i) => !isDone(i) && i.hasDefault) ? <button className="btn btn-ghost btn-s" type="button" onClick={() => settleKind('cloud', 'approved')}>Approve all</button> : null
            ))}
          </div>
          <aside className="ibx-panel" aria-label="Selected question">
            {confirm && batchable ? <BatchConfirm items={eligible} onSend={batchAll} onCancel={() => setConfirm(false)} /> : null}
            {batch > 0 ? (
              <div className="ibx-done">
                <Icon name="check" style={{ color: 'var(--st-done)', flex: 'none', marginTop: 2 }} />
                <span><b>{batch} settled with defaults.</b> {batchLine()}.{keyNote}</span>
              </div>
            ) : null}
            {x ? <Detail x={x} d={doneAll[x.id]} items={g.now} done={doneAll} settle={settle} reopen={reopen} ask={x.src === 'ask' ? askBar(x.askId) : null} effect={effect(x)} loopAt={loopAt} repo={shell.repo} keyProps={x.secret ? keys.props({ ...keyCard({ chunk: x.chunk, file: x.raw?.file }, x.secret, secretsRes.data), itemId: x.id }) : null} onKeyChange={() => reopen(x)} /> : null}
          </aside>
        </div>
      )}
      <ToastHost toasts={Object.entries(errs).map(([id, msg]) => ({ id, kind: 'error', title: 'Not sent', body: msg, onDismiss: () => setErrs((e) => { const c = { ...e }; delete c[id]; return c; }) }))} />
    </ViewFrame>
  );
}

/** The selected question: a pending tug, a parked card, or the settled tug; then its context. */
function Detail({ x, d, items, done, settle, reopen, ask, effect, loopAt, repo, keyProps, onKeyChange }) {
  const sess = sessName(x);
  const src = x.src === 'durable' ? `${x.raw.file}:${x.raw.line}` : x.kind === 'cloud'
    ? [`${repo ? `${repo} loop` : 'cloud run'}${x.run ? ` ${x.run}` : ''}`, x.chunk].filter(Boolean).join(' · ')
    : [sess, x.chunk, x.kind === 'now' ? (x.phase === 'start' ? 'Questions (start)' : x.src === 'perm' ? 'permission' : '') : `parked ${x.at}`].filter(Boolean).join(' · ');
  const group = items.filter((o) => groupKey(o) === groupKey(x));
  const answered = group.filter((o) => done[o.id]).length;
  const prog = group.map((o) => (done[o.id] ? (done[o.id].how === 'default' ? 'def' : 'on') : o.id === x.id ? 'cur' : ''));
  const canReopen = d && (!d.sent || x.src === 'inbox');

  let card;
  if (keyProps) {
    // The key card: no default, no countdown. Saved, it folds into one line and the chunk relights.
    const phase = d?.how === 'set' && keyProps.phase === 'pending' ? 'saved' : keyProps.phase;
    card = <KeyCard key={keyProps.card.key} {...keyProps} phase={phase} saved={keyProps.saved || (d ? { places: d.a, failed: [] } : undefined)} onChange={() => { keyProps.onChange(); onKeyChange(); }} />;
  } else if (d) {
    const resultA = d.how === 'changed' ? 'Changed to ' : d.how === 'approved' ? 'Approved ' : d.how === 'default' ? 'Took the default, ' : 'You chose ';
    let resultC;
    if (x.src === 'perm') resultC = `. ${x.who} goes on.`;
    else if (x.src === 'durable') resultC = d.sent ? ". Sent with its spec's Continue." : ". Kept, not sent yet: its spec's Continue sends it.";
    else if (x.kind === 'now' && x.src === 'ask' && !d.sent) resultC = '. It goes with Send; what you leave takes its default.';
    else if (x.kind === 'now') resultC = x.phase === 'start' && sess ? `. ${sess} starts working.` : `. ${x.who} resumed.`;
    else if (x.kind === 'cloud') resultC = `. It lands in the plan for ${loopAt}.`;
    else resultC = d.how === 'changed' ? '. A fix chunk is queued.' : '. Nothing to redo at review.';
    card = (
      <div className="tug is-answered" role="group" aria-label="Settled question">
        <div className="tug-head"><Orb state="done" size="s" /><span><span className="tug-who">{x.who}</span> {src ? <span className="tug-src">· {src}</span> : null}</span></div>
        <div className="tug-q" style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: '21px' }}><Markdown text={x.q} /></div>
        <div className="tug-result"><Icon name="check" style={{ color: 'var(--st-done)' }} /><span>{resultA}<b>{d.a}</b>{resultC}</span></div>
        {canReopen ? <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-ghost btn-s" type="button" onClick={() => reopen(x)}>Change answer</button></div> : null}
      </div>
    );
  } else if (x.kind === 'now') {
    const perm = x.src === 'perm';
    card = (
      <div className="tug is-pending" role="group" aria-label={`Question from ${x.who}`}>
        <div className="tug-head"><Orb state="blocked" size="s" /><span><span className="tug-who">{x.who}</span> {src ? <span className="tug-src">· {src}</span> : null}</span><DefaultIn deadline={x.deadline} age={x.age} /></div>
        <div className="tug-q"><Markdown text={x.q} /></div>
        <Opts x={x} onPick={(o) => settle(x, o, 'answered')} />
        {x.why ? <p className="tug-why"><Icon name="rays8" size={14} style={{ marginTop: 3, color: 'var(--st-blocked)' }} /><span><b>{perm ? 'Why it asks:' : 'Why the default:'}</b> {x.why}</span></p> : null}
        {!perm ? (
          <div className="tug-foot">
            <AnswerField draftKey={x.id} button="Answer" onSend={(t) => settle(x, t, 'answered')} />
            {x.hasDefault ? <button className="btn btn-s tug-default" type="button" onClick={() => settle(x, x.opts[0], 'default')}>Use the default and keep going<Icon name="arrowRight" size={14} /></button> : null}
          </div>
        ) : null}
      </div>
    );
  } else if (x.kind === 'plan') {
    // A plan question: the whole of it, drawn; its recommendation (when it names one) to take, or your words.
    card = (
      <div className="pcard is-plan" role="group" aria-label="Plan question">
        <div className="pcard-top">
          <span className="ibx-at"><Icon name="list" size={14} /><span>{x.raw.file}:{x.raw.line}</span></span>
          <span>{x.who}</span>
        </div>
        <Markdown className="pcard-q" text={x.q} />
        {x.hasDefault ? (
          <>
            <div className="pcard-assumed"><Icon name="rays8" size={14} style={{ color: 'var(--st-blocked)' }} /><span>It recommends <b>{x.opts[0]}</b></span></div>
            <div className="pcard-acts">
              <button className="btn btn-s btn-primary" type="button" onClick={() => settle(x, x.opts[0], 'approved')}><Icon name="check" size={14} />Take the recommendation</button>
            </div>
          </>
        ) : null}
        <div className="tug-foot"><AnswerField draftKey={x.id} placeholder="Your answer…" button="Send answer" onSend={(t) => settle(x, t, 'answered')} /></div>
      </div>
    );
  } else {
    card = (
      <div className="pcard" role="group" aria-label="Parked question">
        <div className="pcard-top">
          {x.kind === 'cloud' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="cloud" size={14} /><span>cloud run {x.run}</span></span>
              : x.session ? <SessTag session={x.session} /> : null}
          <span>{[x.who, x.chunk, x.at].filter(Boolean).join(' · ')}</span>
        </div>
        <Markdown className="pcard-q" text={x.q} />
        {x.hasDefault ? <div className="pcard-assumed"><Icon name="clock" size={14} style={{ color: 'var(--st-blocked)' }} /><span>{x.who} assumed <b>{x.opts[0]}</b></span></div> : null}
        {x.opts.length ? <Opts x={x} onPick={(o, i) => settle(x, o, i === 0 && x.hasDefault ? 'approved' : 'changed')} /> : null}
        {x.hasDefault ? (
          <div className="pcard-acts">
            <button className="btn btn-s btn-primary" type="button" onClick={() => settle(x, x.opts[0], 'approved')}><Icon name="check" size={14} />Approve the default</button>
            <span className="t-body-s c-3">{x.kind === 'cloud' ? 'Pick another option and it lands in the plan for the next loop.' : 'Pick another option and a fix chunk is queued for this session.'}</span>
          </div>
        ) : (
          <div className="tug-foot"><AnswerField draftKey={x.id} placeholder="Your answer…" button="Send answer" onSend={(t) => settle(x, t, 'answered')} /></div>
        )}
      </div>
    );
  }

  const from = x.src === 'durable' ? `${x.raw.file}, line ${x.raw.line}` : x.kind === 'cloud' ? `${repo ? `${repo} cloud loop, run` : 'cloud loop run'} ${x.run}${x.at ? ` at ${x.at}` : ''}` : `${sess ? `${sess}, ` : ''}agent ${x.who}`;
  return (
    <>
      {card}
      {ask ? <AskSendBar {...ask} /> : null}
      <div className="ibx-ctx">
        <div className="ibx-ctx-row"><span className="k">from</span><span className="v">{from}</span></div>
        {x.spec ? <div className="ibx-ctx-row"><span className="k">spec</span><span className="v"><Link className="ibx-spec-link" to={PATHS.board} title={`See spec ${x.spec.n}'s chunks on the board`}><span className="chunk-id">{x.spec.n}</span> {x.spec.title || x.raw.file}</Link></span></div> : null}
        {x.chunk ? <div className="ibx-ctx-row"><span className="k">chunk</span><span className="v"><span className="chunk-id">{x.chunk}</span> {x.chunkT}</span></div> : null}
        <div className="ibx-ctx-row"><span className="k">when settled</span><span className="v">{effect}</span></div>
        {x.kind === 'now' && group.length ? (
          <div className="ibx-ctx-row">
            <span className="k">progress</span>
            <span className="v" style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 6 }}>
              <span className="qprog">{prog.map((c, i) => <i key={i} className={c || undefined} />)}</span>
              <span className="t-body-s c-2">{answered} of {group.length} answered</span>
            </span>
          </div>
        ) : null}
      </div>
    </>
  );
}

/** A live ask's Send, from the first answer on: "Send 2 answers · 3 take their defaults" (styles/answers.css). */
function AskSendBar({ label, answered, total, sending, onSend }) {
  return (
    <div className="ans-send" role="group" aria-label="Send these answers">
      <Icon name="arrowRight" size={14} style={{ color: 'var(--accent)', flex: 'none' }} />
      <span className="t-body-s c-2 ans-send-t">{answered} of {total} answered. The agent waits until you send.</span>
      <button className="btn btn-primary btn-s" type="button" disabled={sending} onClick={onSend}>{sending ? 'Sending…' : label}</button>
    </div>
  );
}

/** In the plan's body: a header per spec (number, title, open count) over its questions; other files after, by path. */
// Under each group, its Continue (spec 53): "Send 2 answers to vega and continue", live from the first answer.
function PlanGroups({ items, row, isDone, done, sessions, sendTo, continuing, onPick, onContinue }) {
  const choices = continueChoices(sessions);
  return planGroups(items).map((pg) => {
    const count = sendable(pg.items, done).length;
    const found = continueTarget(pg, sessions);
    const target = choices.find((c) => c.id === sendTo[pg.key]) || found;
    const words = pg.items.some(keepsAnswer);
    return (
      <div key={pg.key} className="ibx-spec" role="group" aria-label={pg.n ? `Spec ${pg.n} ${pg.title}` : pg.file}>
        <div className="ibx-spec-h">
          {pg.n ? <><span className="ibx-spec-n">{pg.n}</span><span className="ibx-spec-t">{pg.title || pg.file}</span></> : <span className="ibx-spec-t is-file">{pg.file}</span>}
          <span className="ibx-spec-c">{pg.items.filter((i) => !isDone(i)).length} open</span>
        </div>
        {pg.items.map(row)}
        {words ? (
          <ContinueBar
            count={count} target={target} asked={target.id === found.id && found.why === 'asked'} choices={choices}
            sending={continuing === pg.key} onPick={(id) => onPick(pg.key, id)} onSend={() => onContinue(pg, target)}
          />
        ) : null}
      </div>
    );
  });
}

/** Batch-answer, before it sends: the count and each question with the default it would take. */
function BatchConfirm({ items, onSend, onCancel }) {
  return (
    <div className="ibx-confirm" role="dialog" aria-label="Batch-answer with defaults">
      <div className="ibx-confirm-h"><Icon name="rays8" size={14} /><b>{items.length} {items.length === 1 ? 'question takes its' : 'questions take their'} default</b></div>
      <ol className="ibx-confirm-list">
        {items.map((i) => (
          <li key={i.id}>
            <span className="q"><Markdown inline text={oneLine(i.q)} /></span>
            <span className="a">{i.kind === 'plan' ? 'recommended' : 'default'}: <b>{i.opts[0]}</b></span>
          </li>
        ))}
      </ol>
      <div className="pcard-acts">
        <button className="btn btn-s btn-primary" type="button" onClick={onSend}><Icon name="check" size={14} />{items.every((i) => i.kind === 'plan') ? 'Take' : 'Send'} {items.length} {items.length === 1 ? 'answer' : 'answers'}</button>
        <button className="btn btn-s btn-ghost" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
