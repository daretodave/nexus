// Small shared pieces: status glyphs, the live question card, the
// permission card. Glyph + colour together, never colour alone.
import { useState } from 'react';
import { api } from './api.js';

export function Mark({ ok, optional }) {
  if (ok) return <span className="glyph ok" aria-label="ok">+</span>;
  if (optional) return <span className="glyph warn" aria-label="optional, not set">-</span>;
  return <span className="glyph bad" aria-label="missing">x</span>;
}

/** A live AskUserQuestion: buttons per option, an "other" field, and "use the defaults". */
export function AskCard({ ask }) {
  const [picked, setPicked] = useState({});
  const [other, setOther] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const toggle = (q, label) => setPicked((p) => {
    const cur = p[q.question] || [];
    if (!q.multiSelect) return { ...p, [q.question]: [label] };
    return { ...p, [q.question]: cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label] };
  });

  const submit = async (useDefaults) => {
    const answers = {};
    for (const q of ask.questions) {
      const typed = (other[q.question] || '').trim();
      const chosen = picked[q.question] || [];
      answers[q.question] = useDefaults ? (q.options[0]?.label || '') : typed || chosen.join(', ') || q.options[0]?.label || '';
    }
    setBusy(true);
    try { await api(`/api/ask/${encodeURIComponent(ask.id)}`, { answers }); } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="card ask tug-in" role="group" aria-label="A question from the agent">
      <div className="small muted">question from {ask.agent === 'main' ? 'the session' : `agent ${ask.agent.slice(0, 8)}`}</div>
      {ask.questions.map((q) => (
        <div key={q.question}>
          <h3>{q.header ? `${q.header}: ` : ''}{q.question}</h3>
          <div className="opts">
            {q.options.map((o, i) => (
              <button key={o.label} type="button" className="btn opt" aria-pressed={(picked[q.question] || []).includes(o.label)} title={o.description} onClick={() => toggle(q, o.label)}>
                {o.label}{i === 0 ? ' (recommended)' : ''}
              </button>
            ))}
          </div>
          <input className="field" placeholder="Other: type your own answer" value={other[q.question] || ''} onChange={(e) => setOther({ ...other, [q.question]: e.target.value })} />
        </div>
      ))}
      <div className="row" style={{ marginTop: 'var(--s-3)' }}>
        <button className="btn primary" disabled={busy} onClick={() => submit(false)}>Answer</button>
        <button className="btn quiet" disabled={busy} onClick={() => submit(true)}>Use the defaults and keep going</button>
        {err && <span className="bad small">{err}</span>}
      </div>
    </div>
  );
}

export function PermissionCard({ req }) {
  const [busy, setBusy] = useState(false);
  const decide = async (allow, always = false) => {
    setBusy(true);
    try { await api(`/api/permission/${encodeURIComponent(req.id)}`, { allow, always }); } catch { setBusy(false); }
  };
  return (
    <div className="card ask tug-in" role="group" aria-label="Permission request">
      <h3>Allow {req.tool}?</h3>
      {req.reason && <p className="small muted">{req.reason}</p>}
      <div className="prompt-box">{req.summary}</div>
      <div className="row" style={{ marginTop: 'var(--s-3)' }}>
        <button className="btn primary" disabled={busy} onClick={() => decide(true)}>Allow</button>
        {req.canAlways && <button className="btn" disabled={busy} onClick={() => decide(true, true)}>Always allow</button>}
        <button className="btn danger" disabled={busy} onClick={() => decide(false)}>Deny</button>
      </div>
    </div>
  );
}
