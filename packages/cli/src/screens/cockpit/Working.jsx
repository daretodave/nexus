// Working (Cockpit board, phase "working"): the conversation, newest at the
// bottom, with each agent message's tool rows; your notes on the right; a
// live question as a pending tug (the stage hushes while it waits).
import { useState } from 'react';
import { LogRow, MsgYou, Orb, Tug, toolGlyph } from '../../ui/index.js';
import { server } from '../../data/client.js';
import { agentState, convoItems } from './model.js';

/** A .log row as the board draws it, with the board's tool glyph; opens to show the full call. */
function ToolRow({ t, running }) {
  const [open, setOpen] = useState(false);
  return (
    <LogRow
      tool={t.tool} args={t.args} d={toolGlyph(t.tool)}
      state={running ? 'running' : t.failed ? 'failed' : undefined}
      meta={<span className="diffstat">{t.failed ? <span className="c-3">failed</span> : null}</span>}
      open={open} onToggle={() => setOpen((o) => !o)}
    >
      <pre className="t-mono-xs c-2" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>{t.args}</pre>
      {t.error ? <pre className="t-mono-xs" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '6px 0 0', color: 'var(--st-failed)' }}>{t.error}</pre> : null}
    </LogRow>
  );
}

function AgentMsg({ m, state, runningTool }) {
  return (
    <div className="msg">
      <Orb state={m.error ? 'failed' : state} size="s" style={{ marginTop: 1 }} />
      <div style={{ minWidth: 0 }}>
        <div className="msg-meta"><b>{m.name}</b><span>{m.time || ''}</span></div>
        {m.text ? <p className="msg-text">{m.text}</p> : null}
        {m.tools.length ? (
          <div className="msg-tools">
            {m.tools.map((t, i) => <ToolRow key={t.id || i} t={t} running={runningTool === t} />)}
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
          options={opts} why={rec?.desc}
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

export default function Working({ live }) {
  const { stage, transcript, asks, permissions, status } = live;
  const items = convoItems(transcript, stage);
  const busy = status?.state === 'running';
  // The newest tool call of a session that is still running is the one spinning.
  let runningTool = null;
  if (busy) {
    for (let i = items.length - 1; i >= 0 && !runningTool; i -= 1) {
      const m = items[i];
      if (m.tools && m.tools.length) runningTool = m.tools[m.tools.length - 1];
      if (m.you) break;
    }
  }
  const nameOf = (agent) => (!agent || agent === 'main' ? 'main' : stage.agents?.[agent]?.label || 'agent');
  return (
    <div className="convo" aria-live="polite">
      {items.map((m) => (m.you
        ? <MsgYou key={m.key} time={m.time || ''} text={m.text} />
        : <AgentMsg key={m.key} m={m} state={agentState(stage.agents?.[m.agent]) || 'idle'} runningTool={runningTool} />))}
      {asks.map((a) => <AskTugs key={a.id} ask={a} who={nameOf(a.agent)} />)}
      {permissions.map((p) => <PermissionTug key={p.id} req={p} who={nameOf(p.agent)} />)}
    </div>
  );
}
