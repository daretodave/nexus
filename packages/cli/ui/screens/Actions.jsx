// GitHub Actions setup: a checklist (secret, token permissions, rulesets),
// one checkbox per workflow, and live runs polled through gh.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Mark } from '../parts.jsx';

const CONCLUSION = { success: ['+', 'ok'], failure: ['x', 'bad'], cancelled: ['-', 'muted'], skipped: ['-', 'muted'] };

export default function Actions({ live }) {
  const [setup, setSetup] = useState(null);
  const [runs, setRuns] = useState(null);
  const [msg, setMsg] = useState('');

  const loadSetup = () => { setSetup(null); api('/api/actions').then(setSetup).catch((e) => setMsg(e.message)); };
  const loadRuns = () => api('/api/runs').then((r) => setRuns(r)).catch(() => {});
  useEffect(() => { loadSetup(); loadRuns(); const t = setInterval(loadRuns, 8000); return () => clearInterval(t); }, []);

  const toggle = async (w) => {
    const r = await api('/api/actions/workflow', { id: w.id, enabled: !w.enabled }).catch((e) => ({ ok: false, out: e.message }));
    setMsg(r.ok ? `${w.name} ${w.enabled ? 'disabled' : 'enabled'}` : r.out || r.error);
    loadSetup();
  };

  const list = (live.runs && live.runs.length ? live.runs : runs?.runs) || [];

  return (
    <div className="page">
      <h1>Cloud loop</h1>
      <p className="lede">Run the loop on GitHub Actions while you sleep. Skip all of this to run it locally.</p>
      {!setup && <p className="muted">Asking gh...</p>}
      {setup && !setup.gh && <p className="warn">{setup.note}</p>}
      {setup?.gh && (
        <>
          <div className="card">
            <ul className="list">
              {setup.steps.map((s) => (
                <li key={s.id}>
                  <Mark ok={s.ok} optional={s.optional} />
                  <div>
                    <div>{s.label} <span className="small muted">{s.detail}</span></div>
                    {!s.ok && <div className="small warn">{s.fix}</div>}
                  </div>
                </li>
              ))}
            </ul>
            <button className="btn quiet" onClick={loadSetup}>Check again</button>
          </div>
          <h2>Workflows</h2>
          <div className="card">
            {!setup.workflows.length && <p className="muted">No workflows in this repo.</p>}
            {setup.workflows.map((w) => (
              <label className="check" key={w.id}>
                <input type="checkbox" checked={w.enabled} onChange={() => toggle(w)} />
                <span>{w.name} <span className="small muted mono">{w.path}</span>{!w.enabled && <span className="small muted"> · {w.state}</span>}</span>
              </label>
            ))}
          </div>
        </>
      )}
      <h2>Recent runs</h2>
      <div className="card">
        {runs && !runs.ok && <p className="muted small">{runs.error || 'gh run list failed'}</p>}
        {!list.length && <p className="muted">No runs yet.</p>}
        {list.length > 0 && (
          <table className="grid">
            <thead><tr><th>state</th><th>workflow</th><th>title</th><th>started</th></tr></thead>
            <tbody>
              {list.map((r) => {
                const [g, cls] = r.status === 'completed' ? CONCLUSION[r.conclusion] || ['?', 'warn'] : r.stalled ? ['!', 'warn'] : ['o', 'ok'];
                return (
                  <tr key={r.databaseId}>
                    <td className={cls}>{g} {r.status === 'completed' ? r.conclusion : r.stalled ? 'stalled (queued over 2 min)' : r.status}</td>
                    <td>{r.workflowName}</td>
                    <td><a href={r.url} target="_blank" rel="noreferrer">{r.displayTitle}</a></td>
                    <td className="muted">{new Date(r.createdAt).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {msg && <p className="small">{msg}</p>}
    </div>
  );
}
