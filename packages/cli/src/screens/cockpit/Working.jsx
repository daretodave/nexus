// Working (Cockpit board, phase "working"): the conversation, newest at the
// bottom, with each agent message's tool rows; your notes on the right; a
// live question as a pending tug (the stage hushes while it waits).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon, LogRow, Markdown, MsgYou, Orb, ToolArgs, Tug, toolGlyph, toolNameWidth } from '../../ui/index.js';
import { PlotCard } from '../../ui/plot-card.jsx';
import { PermissionCard } from '../../ui/permission-card.jsx';
import { ToolDetail } from '../../ui/tool-detail.jsx';
import { extractPlotReport } from '../../ui/plot-report.js';
import { server, TOKEN } from '../../data/client.js';
import { draftFailed, draftSending, draftSent, useDrafts } from '../../data/drafts.js';
import { askSend } from '../../data/answers.js';
import '../../styles/answers.css';
import { agentState, convoItems, mmss, toolDur } from './model.js';
import { countdown } from '../../../shared/times.mjs';
import { pinAfterScroll, stickTarget } from './stick.js';
import '../../styles/convo-scroll.css';
import '../../styles/plot-card.css';
import '../../styles/permission-card.css';

/** The images in your own message, each served back by the server (GET /api/uploads, spec 51) with the launch token. */
const uploadSrcs = (images) => (images || []).map((i) => ({ name: i.name, src: i.url ? `${i.url}?t=${encodeURIComponent(TOKEN)}` : null }));

/**
 * A .log row as the board draws it, with the board's tool glyph; opens to show the full call (ui/tool-detail.jsx:
 * the command whole, an edit's diff, the output). Its diffstat comes from the call's own input, its duration from its
 * result (a running call counts up from when it went out); either one unknown stays blank.
 */
function ToolRow({ t, running, now }) {
  const [open, setOpen] = useState(false);
  const d = t.diff;
  const time = running ? (t.at != null && now ? mmss(now - t.at) : '') : toolDur(t.ms);
  return (
    <LogRow
      tool={t.tool} args={<ToolArgs tool={t.tool} args={t.args} />} d={toolGlyph(t.tool)} dur={time}
      state={running ? 'running' : t.failed ? 'failed' : undefined}
      meta={(
        <span className="diffstat">
          {d && d.add != null ? <span className="add">+{d.add}</span> : null}
          {d && d.del != null ? <span className="del">−{d.del}</span> : null}
          {t.failed ? <span className="c-3">failed</span> : t.note ? <span className="c-3">{t.note}</span> : null}
        </span>
      )}
      open={open} onToggle={() => setOpen((o) => !o)}
    >
      <ToolDetail tool={t.tool} args={t.args} input={t.input} clipped={t.clipped} output={t.output} error={t.error} />
    </LogRow>
  );
}

/**
 * An agent's text: markdown, or, when it ends a /plot report with a valid nexus-plot block, the card, its prose
 * folded behind "Full report". A block still streaming or invalid stays a code block in the markdown.
 */
function AgentText({ text, onSend }) {
  const { prose, report } = useMemo(() => extractPlotReport(text), [text]);
  const [open, setOpen] = useState(false);
  if (!report) return <Markdown className="msg-text" text={text} />;
  return (
    <>
      {prose ? (
        <button className="btn btn-ghost btn-s plotc-full" type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          Full report<Icon name="chevronDown" size={14} />
        </button>
      ) : null}
      {prose && open ? <Markdown className="msg-text" text={prose} /> : null}
      <PlotCard report={report} onSend={onSend} />
    </>
  );
}

function AgentMsg({ m, state, runningTool, now, onSend }) {
  return (
    <div className="msg">
      <Orb state={m.error ? 'failed' : state} size="s" style={{ marginTop: 1 }} />
      <div style={{ minWidth: 0 }}>
        <div className="msg-meta"><b>{m.name}</b><span>{m.time || ''}</span></div>
        {m.text ? <AgentText text={m.text} onSend={onSend} /> : null}
        {m.tools.length ? (
          <div className="msg-tools">
            {m.tools.map((t, i) => <ToolRow key={t.id || i} t={t} running={runningTool === t} now={now} />)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const REC = /\s*\(recommended\)\s*$/i;

/**
 * A live AskUserQuestion: one pending tug per question (spec 51, A1). A pick is kept as a draft
 * (`<askId>:<i>:pick`, data/drafts.js) and the answers go from the first one on with Send, the rest taking their
 * defaults (data/answers.js askSend; the server fills them in), or on their own once every one is picked.
 */
function AskTugs({ ask, who }) {
  const drafts = useDrafts();
  const [picked, setPicked] = useState({});
  const [sending, setSending] = useState(false);
  // The countdown to the default the session takes on its own (shared/times.mjs ASK_DEFAULT_MS).
  const timer = countdown(ask.deadline, useTick(!!ask.deadline));
  const [err, setErr] = useState('');
  const qs = ask.questions || [];
  const key = (i) => `${ask.id}:${i}`;
  // Picks kept as drafts come back after a reload or a return.
  const kept = {};
  qs.forEach((q, i) => {
    if (picked[q.question] != null) return;
    try { const p = JSON.parse(drafts.get(`${key(i)}:pick`) || 'null'); if (p && p.a) kept[q.question] = String(p.a); } catch { /* not a pick */ }
  });
  const have = { ...kept, ...picked };
  const plan = askSend(qs, have);
  const send = async (next) => {
    if (sending) return;
    setSending(true);
    setErr('');
    qs.forEach((_, i) => draftSending(key(i)));
    try {
      await server.answerAsk(ask.id, askSend(qs, next).payload);
      qs.forEach((_, i) => draftSent(key(i)));
    } catch (e) {
      qs.forEach((_, i) => draftFailed(key(i)));
      setErr(e.message);
      setSending(false);
    }
  };
  const pick = (i, q, label) => {
    const next = { ...have, [q.question]: label };
    setPicked(next);
    drafts.save(`${key(i)}:pick`, JSON.stringify({ a: label }));
    if (qs.every((x) => next[x.question] != null)) send(next);
  };
  const unpick = (i, q) => {
    setPicked((p) => { const c = { ...p }; delete c[q.question]; return c; });
    drafts.clear(`${key(i)}:pick`);
  };
  const tugs = qs.map((q, i) => {
    const opts = (q.options || []).map((o) => ({ label: String(o.label || '').replace(REC, ''), rec: REC.test(o.label || ''), desc: o.description }));
    if (opts.length && !opts.some((o) => o.rec)) opts[0].rec = true;
    const rec = opts.find((o) => o.rec);
    if (have[q.question] != null) {
      return <Tug key={i} state="answered" who={who} src={q.header} question={q.question} chosen={have[q.question]} tail={sending ? `${who} resumes.` : 'It goes with Send; what you leave takes its default.'} onChange={sending ? undefined : () => unpick(i, q)} />;
    }
    return (
      <Tug
        key={i} who={who} src={q.header} question={q.question} draftKey={key(i)}
        options={opts} why={rec?.desc} timer={timer}
        onPick={(label) => pick(i, q, label)}
        onOther={(text) => pick(i, q, text)}
        onDefault={rec ? () => pick(i, q, rec.label) : undefined}
      />
    );
  });
  return (
    <>
      {tugs}
      {plan.label && plan.answered < qs.length ? (
        <div className="ans-send" role="group" aria-label="Send these answers">
          <Icon name="arrowRight" size={14} style={{ color: 'var(--accent)', flex: 'none' }} />
          <span className="t-body-s c-2 ans-send-t">{plan.answered} of {qs.length} answered. {who} waits until you send.</span>
          <button className="btn btn-primary btn-s" type="button" disabled={sending} onClick={() => send(have)}>{sending ? 'Sending…' : plan.label}</button>
        </div>
      ) : null}
      {err ? <span className="hint" style={{ color: 'var(--st-failed)' }}>{err}</span> : null}
    </>
  );
}

/** A tool waiting for permission, drawn as a pending tug that reads like a tool row (ui/permission-card.jsx). */
function PermissionTug({ req, who }) {
  const [err, setErr] = useState('');
  const answer = async (allow, always) => { try { await server.answerPermission(req.id, allow, always); } catch (e) { setErr(e.message); } };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <PermissionCard req={req} who={who} onAnswer={answer} />
      {err ? <span className="hint" style={{ color: 'var(--st-failed)' }}>{err}</span> : null}
    </div>
  );
}

/** The clock a running tool row counts up on: a tick a second while one runs, still otherwise. */
function useTick(on) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

/**
 * The transcript's scroller, pinned to the newest message (stick.js): every render and every resize of the box
 * scrolls to the bottom while pinned; the person's own scroll pins or unpins it.
 */
function useStick() {
  const ref = useRef(null);
  const pinnedRef = useRef(true);
  const [pinned, setPinned] = useState(true);
  const stick = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const top = stickTarget(pinnedRef.current, el);
    if (top != null && Math.abs(el.scrollTop - top) > 1) el.scrollTop = top;
  }, []);
  useLayoutEffect(stick);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(stick);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stick]);
  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const now = pinAfterScroll(el);
    if (now !== pinnedRef.current) { pinnedRef.current = now; setPinned(now); }
  }, []);
  const jump = useCallback(() => {
    pinnedRef.current = true;
    setPinned(true);
    stick();
  }, [stick]);
  return { ref, pinned, onScroll, jump };
}

/** onSend(line): the cockpit's send for one exact line (a /plot card's action); resolves true when it went. */
/** `end`: what closes the conversation once the session is done (the put-away card), or nothing. */
export default function Working({ live, pinned, onSend, end = null }) {
  const { stage, transcript, asks, permissions, status } = live;
  const items = convoItems(transcript, stage);
  const busy = status?.state === 'running';
  // The newest tool call of a session that is still running is the one spinning.
  let runningTool = null;
  if (busy) {
    for (let i = items.length - 1; i >= 0 && !runningTool; i -= 1) {
      const m = items[i];
      // A call whose result came back is not running, whatever the turn is doing.
      if (m.tools && m.tools.length) runningTool = m.tools[m.tools.length - 1].done ? null : m.tools[m.tools.length - 1];
      if (m.tools && m.tools.length) break;
      if (m.you) break;
    }
  }
  const now = useTick(!!runningTool);
  const scroller = useStick();
  const nameOf = (agent) => (!agent || agent === 'main' ? 'main' : stage.agents?.[agent]?.label || 'agent');
  // Every tool row's name column fits the longest name shown, so "PowerShell" never runs into its argument (spec 52, A4).
  const toolW = toolNameWidth(items.flatMap((m) => (m.tools || []).map((t) => t.tool)));
  return (
    <div className="convo-wrap">
      <div className="convo is-scroll" aria-live="polite" ref={scroller.ref} onScroll={scroller.onScroll} style={{ '--log-tool': toolW }}>
        {items.map((m) => (m.you
          ? <MsgYou key={m.key} time={m.time || ''} text={m.text} images={uploadSrcs(m.images)} files={m.files} pinned={m.pinned || (!!pinned && m.text?.trim().toLowerCase() === pinned.trim().toLowerCase())} />
          : <AgentMsg key={m.key} m={m} state={agentState(stage.agents?.[m.agent]) || 'idle'} runningTool={runningTool} now={now} onSend={onSend} />))}
        {asks.map((a) => <AskTugs key={a.id} ask={a} who={nameOf(a.agent)} />)}
        {permissions.map((p) => <PermissionTug key={p.id} req={p} who={nameOf(p.agent)} />)}
        {end}
      </div>
      {scroller.pinned ? null : (
        <button className="btn btn-s jump-latest" type="button" onClick={scroller.jump}>
          <Icon name="chevronDown" size={14} />Jump to latest
        </button>
      )}
    </div>
  );
}
