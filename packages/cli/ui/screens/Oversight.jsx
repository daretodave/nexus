// The oversight inbox: live questions from running sessions (answered in
// place) and durable questions waiting in plan files (answered in a batch,
// applied by /oversight and landed per owner mode).
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { AskCard, PermissionCard } from '../parts.jsx';

export default function Oversight({ app, live }) {
  const [durable, setDurable] = useState(null);
  const [answers, setAnswers] = useState({});
  const [msg, setMsg] = useState('');

  const load = () => api('/api/oversight').then((d) => setDurable(d.durable)).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const submit = async () => {
    const rows = (durable || []).filter((q) => (answers[q.id] || '').trim()).map((q) => ({ ...q, answer: answers[q.id] }));
    if (!rows.length) return;
    try {
      await api('/api/oversight/answer', { answers: rows });
      setAnswers({});
      setMsg(`Sent ${rows.length} answer${rows.length > 1 ? 's' : ''} to /oversight. It will ${app.info?.owner ? 'commit and push to main' : 'open a pull request'}; watch it in the cockpit.`);
    } catch (e) { setMsg(e.message); }
  };

  return (
    <div className="page">
      <h1>Oversight</h1>
      <p className="lede">Everything waiting on a human, in one place.</p>

      <h2>Live: sessions waiting on you</h2>
      {!live.asks.length && !live.permissions.length && <p className="muted">Nothing live. Questions from a running session appear here and in the cockpit.</p>}
      {live.asks.map((a) => <AskCard key={a.id} ask={a} />)}
      {live.permissions.map((p) => <PermissionCard key={p.id} req={p} />)}

      <h2>Durable: questions in the plan</h2>
      {!durable && <p className="muted">Reading plan/...</p>}
      {durable && !durable.length && <p className="muted">No open questions or [needs-user-call] rows in plan/.</p>}
      {durable && durable.map((q) => (
        <div className="card" key={q.id}>
          <div className="small muted">{q.file}:{q.line} · {q.source}</div>
          <h3>{q.text}</h3>
          <textarea className="field" rows={2} placeholder="Your answer (leave empty to skip)" value={answers[q.id] || ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
        </div>
      ))}
      {durable && durable.length > 0 && (
        <div className="row">
          <button className="btn primary" onClick={submit}>Apply answers ({app.info?.owner ? 'commit to main' : 'open a PR'})</button>
          <button className="btn quiet" onClick={load}>Reload</button>
        </div>
      )}
      {msg && <p className="small">{msg}</p>}
    </div>
  );
}
