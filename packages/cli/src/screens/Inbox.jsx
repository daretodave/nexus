// The oversight inbox (Inbox + InboxLight boards; the tug and parked card
// from the Tug board). Every open question from the sessions and the cloud
// loop: grouped rows (.ibx-group/.ibx-row) on the left, the selected
// question in .ibx-panel on the right (a pending .tug, a parked .pcard, or
// the answered tug), with .ibx-ctx under it. Filters, per-row defaults,
// Approve all, and Batch-answer with defaults all work; answers go to the
// server as they settle. Items come from headsdown-inbox/inboxModel.js.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ViewFrame, ViewHead, ViewTitle, ChoiceButtons, LoopStatus, Icon, Orb, SessTag, Empty, ToastHost, cx, useShell,
} from '../ui/index.js';
import { api, server, useCloudLoop, useInbox, useOversight } from '../data/index.js';
import { PATHS } from '../routes.js';
import { collect, clock, names } from './headsdown-inbox/inboxModel.js';

const KIND_CLS = { now: 'is-now', parked: 'is-parked', cloud: 'is-cloud' };
const HOW_META = { approved: 'approved: ', default: 'default: ', answered: 'answered: ', changed: 'changed: ' };
const HOW_LABEL = { approved: 'approved', default: 'default', answered: 'answered', changed: 'changed' };
const CLOUD_TAG = { width: 12, height: 12, color: 'var(--accent)' };

const sessName = (x) => x.session?.name || '';
/** The session a row belongs to; today's live rows all come from the one session this server runs. */
const sessKey = (x) => x.sessionId || sessName(x) || 'live';
/** The question set a row's progress counts against: its session, or the one ask it came in. */
const groupKey = (x) => x.sessionId || sessName(x) || x.askId || 'live';

/** The row's tag: a cloud run, a plan file, or the session (star + name). */
function Tag({ x }) {
  if (x.src === 'durable') return <span className="sess-tag" style={{ '--sess': 'var(--accent)' }}><Icon name="list" style={CLOUD_TAG} />plan</span>;
  if (x.kind === 'cloud') return <span className="sess-tag" style={{ '--sess': 'var(--accent)' }}><Icon name="cloud" style={CLOUD_TAG} />{x.run}</span>;
  if (x.session) return <SessTag session={x.session} />;
  return <span className="sess-tag">session</span>;
}

/** "Other…": a typed answer, sent on Enter (or the button, where one is drawn). */
function Other({ onSend, placeholder = 'Other…', button }) {
  const [v, setV] = useState('');
  const send = () => { const t = v.trim(); if (t) { onSend(t); setV(''); } };
  return (
    <>
      <input className="field tug-other" type="text" aria-label="Other answer" placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />
      {button ? <button className="btn btn-s btn-primary" type="button" onClick={send} disabled={!v.trim()}>{button}<Icon name="arrowRight" size={14} /></button> : null}
    </>
  );
}

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

  const [sel, setSel] = useState(null);
  const [filter, setFilter] = useState('all');
  const [done, setDone] = useState({});
  const [batch, setBatch] = useState(0);
  const [errs, setErrs] = useState({});
  const doneRef = useRef(done);
  doneRef.current = done;

  // A stable order: rows keep their place when they settle and leave the server's list.
  const order = useRef([]);
  const byId = {};
  for (const x of current) {
    byId[x.id] = x;
    if (!order.current.includes(x.id)) order.current.push(x.id);
  }
  const items = order.current.map((id) => byId[id] || done[id]?.item).filter(Boolean);
  const isDone = (x) => !!done[x.id];
  const openItems = items.filter((x) => !isDone(x));

  const cloudNext = cloud?.next ? clock(cloud.next) : '';
  const loopAt = cloudNext ? `the ${cloudNext} loop` : 'the next loop';

  const submit = useCallback(async (entries, nextDone) => {
    const fail = (ids, msg) => {
      setDone((d) => { const c = { ...d }; ids.forEach((id) => delete c[id]); return c; });
      setErrs((e) => ({ ...e, ...Object.fromEntries(ids.map((id) => [id, msg])) }));
    };
    const sent = (ids) => setDone((d) => { const c = { ...d }; ids.forEach((id) => { if (c[id]) c[id] = { ...c[id], sent: true }; }); return c; });
    const asks = new Map();
    for (const [x, a, how] of entries) {
      setErrs((e) => { if (!e[x.id]) return e; const c = { ...e }; delete c[x.id]; return c; });
      if (x.src === 'ask') { asks.set(x.askId, true); continue; }
      try {
        if (x.src === 'perm') await server.answerPermission(x.raw.id, a !== 'Deny', a === 'Always allow');
        else if (x.src === 'durable') await server.answerDurable([{ file: x.raw.file, line: x.raw.line, text: x.raw.text, answer: a }]);
        else await api(`/api/inbox/${encodeURIComponent(x.id)}`, { answer: a, how });
        sent([x.id]);
      } catch (e) {
        fail([x.id], e.status === 404 && x.src === 'inbox' ? 'Answering here is not served yet (POST /api/inbox/:id).' : e.message);
      }
    }
    // An ask carries several questions; it goes back to its agent once all of them are settled.
    for (const askId of asks.keys()) {
      const all = order.current.map((id) => byId[id] || nextDone[id]?.item).filter((x) => x && x.askId === askId);
      if (!all.every((x) => nextDone[x.id])) continue;
      const answers = Object.fromEntries(all.map((x) => [x.qText, nextDone[x.id].a]));
      try { await server.answerAsk(askId, answers); sent(all.map((x) => x.id)); } catch (e) { fail(all.map((x) => x.id), e.message); }
    }
  }, [byId]);

  const settleMany = useCallback((entries) => {
    if (!entries.length) return;
    const next = { ...doneRef.current };
    for (const [x, a, how] of entries) next[x.id] = { a, how, item: x };
    setDone(next);
    const after = items.find((i) => !next[i.id]);
    setSel(after ? after.id : entries[entries.length - 1][0].id);
    submit(entries, next);
  }, [items, submit]);

  const settle = (x, a, how) => settleMany([[x, a, how]]);
  const reopen = (x) => { setDone((d) => { const c = { ...d }; delete c[x.id]; return c; }); setSel(x.id); };
  const settleKind = (kind, how) => settleMany(openItems.filter((x) => x.kind === kind && x.hasDefault).map((x) => [x, x.opts[0], how]));
  const batchAll = () => {
    const entries = openItems.filter((x) => x.hasDefault).map((x) => [x, x.opts[0], x.kind === 'now' ? 'default' : 'approved']);
    settleMany(entries);
    setBatch(entries.length);
  };

  // counts and filters
  const open = (k) => openItems.filter((x) => x.kind === k).length;
  const n = { now: open('now'), parked: open('parked'), cloud: open('cloud') };
  n.all = n.now + n.parked + n.cloud;
  const show = { now: filter === 'all' || filter === 'now', parked: filter === 'all' || filter === 'parked', cloud: filter === 'all' || filter === 'cloud' };
  const g = { now: items.filter((x) => x.kind === 'now'), parked: items.filter((x) => x.kind === 'parked'), cloud: items.filter((x) => x.kind === 'cloud') };
  const batchable = openItems.filter((x) => x.hasDefault).length;

  // keep a selection that exists
  const x = items.find((i) => i.id === sel) || openItems[0] || items[0] || null;
  useEffect(() => { if (x && x.id !== sel) setSel(x.id); }, [x?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // the top line: "4 open across 3 sessions and the cloud loop"
  const openLine = useMemo(() => {
    if (!n.all) return 'nothing open';
    const sess = new Set(openItems.filter((i) => i.kind !== 'cloud').map(sessKey));
    const hasCloud = openItems.some((i) => i.kind === 'cloud' && i.src !== 'durable');
    const hasPlan = openItems.some((i) => i.src === 'durable');
    const parts = [];
    if (sess.size) parts.push(sess.size === 1 ? '1 session' : `${sess.size} sessions`);
    if (hasCloud) parts.push('the cloud loop');
    if (hasPlan) parts.push('the plan');
    return `${n.all} open across ${names(parts)}`;
  }, [n.all, openItems]); // eslint-disable-line react-hooks/exhaustive-deps

  // the Waiting now group: who it blocks, and the session to start once it is settled
  const nowSess = names(g.now.map(sessName));
  const nowStart = g.now.length > 0 && g.now.every((i) => i.phase === 'start');
  const nowLine = nowSess ? (nowStart ? `blocks ${nowSess} from starting` : `${nowSess} waits on these`) : 'an agent waits on these';
  const startId = nowStart ? g.now.find((i) => i.sessionId)?.sessionId : null;

  const effect = (i) => {
    if (i.src === 'perm') return `${i.who} waits on this permission`;
    if (i.src === 'durable') return 'the answer lands in the plan; the next loop or session picks it up';
    if (i.kind === 'now') {
      const total = g.now.filter((o) => groupKey(o) === groupKey(i)).length;
      return i.phase === 'start' && sessName(i) ? `${sessName(i)} starts working once all ${total === 1 ? 'of them' : total} are settled` : `${i.who} waits on this answer`;
    }
    if (i.kind === 'cloud') return `${loopAt} picks up your answer`;
    return 'approving now saves a step at review; a change queues a fix chunk';
  };

  const groupDone = (kind) => g[kind].length > 0 && g[kind].every(isDone);
  const batchLine = () => {
    const parts = [];
    if (g.now.length) parts.push(nowSess ? `${nowSess} ${nowStart ? 'can start working' : 'can go on'}` : 'the waiting agent can go on');
    const parkedSess = names(g.parked.map(sessName));
    if (g.parked.length) parts.push(`${parkedSess || 'the parked sessions'} keep going`);
    if (g.cloud.length) parts.push(`the cloud answers land in the plan for ${loopAt}`);
    return names(parts);
  };

  const row = (r) => {
    const d = done[r.id];
    const settled = !!d;
    let meta = '';
    let metaB = '';
    if (settled) { meta = HOW_META[d.how] || 'answered: '; metaB = d.a; }
    else if (r.src === 'durable') meta = `${r.raw.file}:${r.raw.line}`;
    else if (r.kind === 'now') meta = [r.who, r.chunk, r.age].filter(Boolean).join(' · ');
    else { meta = `${[r.who, r.chunk, r.at].filter(Boolean).join(' · ')}${r.hasDefault ? ' · assumed ' : ''}`; metaB = r.hasDefault ? r.opts[0] : ''; }
    return (
      <div key={r.id} className={cx('ibx-row', x?.id === r.id && 'is-selected', settled && 'is-settled')}>
        <span className={cx('urg', settled ? 'is-done' : KIND_CLS[r.kind])} />
        <Tag x={r} />
        <button className="ibx-open" type="button" onClick={() => setSel(r.id)} aria-label={`Open: ${r.q}`}>
          <span className="ibx-q">{r.q}</span>
          <span className="ibx-meta">{meta}{metaB ? <b>{metaB}</b> : null}</span>
        </button>
        <div className="ibx-acts">
          {!settled && r.kind === 'now' && r.hasDefault ? <button className="btn btn-ghost btn-s" type="button" onClick={() => settle(r, r.opts[0], 'default')}>Use default</button> : null}
          {!settled && r.kind !== 'now' && r.hasDefault ? <button className="btn btn-s" type="button" onClick={() => settle(r, r.opts[0], 'approved')}><Icon name="check" size={14} />Approve</button> : null}
          {settled ? <span className="chk-state is-ok"><Icon name="check" size={14} />{HOW_LABEL[d.how] || 'answered'}</span> : null}
        </div>
      </div>
    );
  };

  const group = (kind, title, label, line, head) => (show[kind] && g[kind].length ? (
    <section className="ibx-group" aria-label={label}>
      <div className="ibx-gh">
        <span className="t-caps c-2">{title}</span><span className="n">{n[kind]}</span><span className="d">{line}</span><span className="tb-spacer" />
        {head}
      </div>
      {g[kind].map(row)}
    </section>
  ) : null);

  const loading = !items.length && (oversight.status === 'loading' || inbox.status === 'loading');

  const actions = (
    <>
      {cloud ? <LoopStatus paused={!!cloud.paused}>{cloud.paused ? 'paused' : cloudNext ? `next ${cloudNext}` : 'on'}</LoopStatus> : null}
      <Link className="btn btn-s" to={PATHS.fleet}><Icon name="fleet" size={14} />Fleet</Link>
    </>
  );

  return (
    <ViewFrame current="inbox" title="Oversight" sub={openLine} label="Oversight inbox" actions={actions}>
      <ViewHead>
        <ViewTitle title={<h1 className="t-title-l">Oversight</h1>} sub="Every open question from your sessions and the cloud loop. Answer here and it unblocks the agent, or lands in the plan for the next loop." />
        <div className="view-acts">
          <ChoiceButtons
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `All ${n.all}` },
              { value: 'now', label: `Waiting now ${n.now}` },
              { value: 'parked', label: `Parked ${n.parked}` },
              { value: 'cloud', label: `Cloud runs ${n.cloud}` },
            ]}
          />
          <button className="btn btn-primary" type="button" onClick={batchAll} disabled={!batchable}><Icon name="rays8" size={14} />Batch-answer with defaults</button>
        </div>
      </ViewHead>
      {!items.length ? (
        loading ? null : <Empty sky="quiet" title="Nothing needs you" body="No open questions in any session. Parked ones will show up here at the end of each run." />
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
            {group('cloud', 'From cloud runs', 'From cloud runs', 'answers land in the plan for the next loop', (
              g.cloud.some((i) => !isDone(i) && i.hasDefault) ? <button className="btn btn-ghost btn-s" type="button" onClick={() => settleKind('cloud', 'approved')}>Approve all</button> : null
            ))}
          </div>
          <aside className="ibx-panel" aria-label="Selected question">
            {batch > 0 ? (
              <div className="ibx-done">
                <Icon name="check" style={{ color: 'var(--st-done)', flex: 'none', marginTop: 2 }} />
                <span><b>{batch} settled with defaults.</b> {batchLine()}.</span>
              </div>
            ) : null}
            {x ? <Detail x={x} d={done[x.id]} items={g.now} done={done} settle={settle} reopen={reopen} effect={effect(x)} loopAt={loopAt} /> : null}
          </aside>
        </div>
      )}
      <ToastHost toasts={Object.entries(errs).map(([id, msg]) => ({ id, kind: 'error', title: 'Not sent', body: msg, onDismiss: () => setErrs((e) => { const c = { ...e }; delete c[id]; return c; }) }))} />
    </ViewFrame>
  );
}

/** The selected question: a pending tug, a parked card, or the settled tug; then its context. */
function Detail({ x, d, items, done, settle, reopen, effect, loopAt }) {
  const sess = sessName(x);
  const src = x.kind === 'cloud'
    ? (x.src === 'durable' ? `${x.raw.file}:${x.raw.line}` : [`cloud run ${x.run}`, x.chunk].filter(Boolean).join(' · '))
    : [sess, x.chunk, x.kind === 'now' ? (x.phase === 'start' ? 'Questions (start)' : x.src === 'perm' ? 'permission' : '') : `parked ${x.at}`].filter(Boolean).join(' · ');
  const group = items.filter((o) => groupKey(o) === groupKey(x));
  const answered = group.filter((o) => done[o.id]).length;
  const prog = group.map((o) => (done[o.id] ? (done[o.id].how === 'default' ? 'def' : 'on') : o.id === x.id ? 'cur' : ''));
  const canReopen = d && (!d.sent || x.src === 'inbox');

  let card;
  if (d) {
    const resultA = d.how === 'changed' ? 'Changed to ' : d.how === 'approved' ? 'Approved ' : d.how === 'default' ? 'Took the default, ' : 'You chose ';
    let resultC;
    if (x.src === 'perm') resultC = `. ${x.who} goes on.`;
    else if (x.src === 'durable') resultC = '. It lands in the plan.';
    else if (x.kind === 'now') resultC = x.phase === 'start' && sess ? `. ${sess} starts once all ${group.length === 1 ? 'of them' : group.length} are settled.` : `. ${x.who} resumed.`;
    else if (x.kind === 'cloud') resultC = `. It lands in the plan for ${loopAt}.`;
    else resultC = d.how === 'changed' ? '. A fix chunk is queued.' : '. Nothing to redo at review.';
    card = (
      <div className="tug is-answered" role="group" aria-label="Settled question">
        <div className="tug-head"><Orb state="done" size="s" /><span><span className="tug-who">{x.who}</span> {src ? <span className="tug-src">· {src}</span> : null}</span></div>
        <p className="tug-q" style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: '21px' }}>{x.q}</p>
        <div className="tug-result"><Icon name="check" style={{ color: 'var(--st-done)' }} /><span>{resultA}<b>{d.a}</b>{resultC}</span></div>
        {canReopen ? <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-ghost btn-s" type="button" onClick={() => reopen(x)}>Change answer</button></div> : null}
      </div>
    );
  } else if (x.kind === 'now') {
    const perm = x.src === 'perm';
    card = (
      <div className="tug is-pending" role="group" aria-label={`Question from ${x.who}`}>
        <div className="tug-head"><Orb state="blocked" size="s" /><span><span className="tug-who">{x.who}</span> {src ? <span className="tug-src">· {src}</span> : null}</span>{x.age ? <span className="tug-timer">{x.age}</span> : null}</div>
        <p className="tug-q">{x.q}</p>
        <Opts x={x} onPick={(o) => settle(x, o, 'answered')} />
        {x.why ? <p className="tug-why"><Icon name="rays8" size={14} style={{ marginTop: 3, color: 'var(--st-blocked)' }} /><span><b>{perm ? 'Why it asks:' : 'Why the default:'}</b> {x.why}</span></p> : null}
        {!perm ? (
          <div className="tug-foot">
            <Other onSend={(t) => settle(x, t, 'answered')} />
            {x.hasDefault ? <button className="btn btn-s tug-default" type="button" onClick={() => settle(x, x.opts[0], 'default')}>Use the default and keep going<Icon name="arrowRight" size={14} /></button> : null}
          </div>
        ) : null}
      </div>
    );
  } else {
    card = (
      <div className="pcard" role="group" aria-label="Parked question">
        <div className="pcard-top">
          {x.src === 'durable' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="list" size={14} /><span>{x.raw.file}:{x.raw.line}</span></span>
            : x.kind === 'cloud' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="cloud" size={14} /><span>cloud run {x.run}</span></span>
              : x.session ? <SessTag session={x.session} /> : null}
          <span>{[x.who, x.chunk, x.at].filter(Boolean).join(' · ')}</span>
        </div>
        <p className="pcard-q">{x.q}</p>
        {x.hasDefault ? <div className="pcard-assumed"><Icon name="clock" size={14} style={{ color: 'var(--st-blocked)' }} /><span>{x.who} assumed <b>{x.opts[0]}</b></span></div> : null}
        {x.opts.length ? <Opts x={x} onPick={(o, i) => settle(x, o, i === 0 && x.hasDefault ? 'approved' : 'changed')} /> : null}
        {x.hasDefault ? (
          <div className="pcard-acts">
            <button className="btn btn-s btn-primary" type="button" onClick={() => settle(x, x.opts[0], 'approved')}><Icon name="check" size={14} />Approve the default</button>
            <span className="t-body-s c-3">{x.kind === 'cloud' ? 'Pick another option and it lands in the plan for the next loop.' : 'Pick another option and a fix chunk is queued for this session.'}</span>
          </div>
        ) : (
          <div className="tug-foot"><Other placeholder="Your answer…" button="Send answer" onSend={(t) => settle(x, t, 'answered')} /></div>
        )}
      </div>
    );
  }

  const from = x.src === 'durable' ? `${x.raw.file}, line ${x.raw.line}` : x.kind === 'cloud' ? `cloud loop run ${x.run}${x.at ? ` at ${x.at}` : ''}` : `${sess ? `${sess}, ` : ''}agent ${x.who}`;
  return (
    <>
      {card}
      <div className="ibx-ctx">
        <div className="ibx-ctx-row"><span className="k">from</span><span className="v">{from}</span></div>
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
