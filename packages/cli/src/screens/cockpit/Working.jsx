// Working (Cockpit board, phase "working"): the conversation, newest at the
// bottom, with each agent message's tool rows; your notes on the right; a
// live question as a pending tug (the stage hushes while it waits).
import { useEffect, useState } from 'react';
import { LogRow, Markdown, MsgYou, Orb, ToolArgs, Tug, toolGlyph } from '../../ui/index.js';
import { server } from '../../data/client.js';
import { agentState, convoItems, mmss, toolDur } from './model.js';
import { countdown } from '../../../shared/times.mjs';

/**
 * A .log row as the board draws it, with the board's tool glyph; opens to show the full call. Its diffstat comes from
 * the call's own input, its duration from its result (a running call counts up from when it went out); either one
 * unknown stays blank.
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
      <pre className="t-mono-xs c-2" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}><ToolArgs tool={t.tool} args={t.args} /></pre>
      {t.error ? <pre className="t-mono-xs" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '6px 0 0', color: 'var(--st-failed)' }}>{t.error}</pre> : null}
    </LogRow>
  );
}

function AgentMsg({ m, state, runningTool, now }) {
  return (
    <div className="msg">
      <Orb state={m.error ? 'failed' : state} size="s" style={{ marginTop: 1 }} />
      <div style={{ minWidth: 0 }}>
        <div className="msg-meta"><b>{m.name}</b><span>{m.time || ''}</span></div>
        {m.text ? <Markdown className="msg-text" text={m.text} /> : null}
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

/** A live AskUserQuestion: one pending tug per question; the answers go back together. */
function AskTugs({ ask, who }) {
  const [picked, setPicked] = useState({});
  // The countdown to the default the session takes on its own (shared/times.mjs ASK_DEFAULT_MS).
  const timer = countdown(ask.deadline, useTick(!!ask.deadline));
  const [err, setErr] = useState('');
  const qs = ask.questions || [];
  const send = async (next) => {
    if (Object.keys(next).length < qs.length) return;
    try { await server.answerAsk(ask.id, next); } catch (e) { setErr(e.message); }
  };
  const pick = (q, label) => { const next = { ...picked, [q.question]: label }; setPicked(next); send(next); };
  return qs.map((q, i) => {
    const opts = (q.options || []).map((o) => ({ label: String(o.label || '').replace(REC, ''), rec: REC.test(o.label || ''), desc: o.description }));
    if (opts.length && !opts.some((o) => o.rec)) opts[0].rec = true;
    const rec = opts.find((o) => o.rec);
    if (picked[q.question] != null) {
      return <Tug key={i} state="answered" who={who} src={q.header} question={q.question} chosen={picked[q.question]} />;
    }
    return (
      <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Tug
          who={who} src={q.header} question={q.question}
          options={opts} why={rec?.desc} timer={timer}
          onPick={(label) => pick(q, label)}
          onOther={(text) => pick(q, text)}
          onDefault={rec ? () => pick(q, rec.label) : undefined}
        />
        {err ? <span className="hint" style={{ color: 'var(--st-failed)' }}>{err}</span> : null}
      </div>
    );
  });
}

/** A tool waiting for permission, drawn as a pending tug (no board of its own). */
function PermissionTug({ req, who }) {
  const [err, setErr] = useState('');
  const answer = async (allow, always) => { try { await server.answerPermission(req.id, allow, always); } catch (e) { setErr(e.message); } };
  const options = [{ label: 'Allow', rec: true }, ...(req.canAlways ? [{ label: 'Always allow' }] : []), { label: 'Deny' }];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Tug
        who={who} src={`wants to use ${req.tool}`} question={req.reason || req.summary}
        options={options} compact
        onPick={(label) => answer(label !== 'Deny', label === 'Always allow')}
      />
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

export default function Working({ live, pinned }) {
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
  const nameOf = (agent) => (!agent || agent === 'main' ? 'main' : stage.agents?.[agent]?.label || 'agent');
  return (
    <div className="convo" aria-live="polite">
      {items.map((m) => (m.you
        ? <MsgYou key={m.key} time={m.time || ''} text={m.text} pinned={m.pinned || (!!pinned && m.text?.trim().toLowerCase() === pinned.trim().toLowerCase())} />
        : <AgentMsg key={m.key} m={m} state={agentState(stage.agents?.[m.agent]) || 'idle'} runningTool={runningTool} now={now} />))}
      {asks.map((a) => <AskTugs key={a.id} ask={a} who={nameOf(a.agent)} />)}
      {permissions.map((p) => <PermissionTug key={p.id} req={p} who={nameOf(p.agent)} />)}
    </div>
  );
}
