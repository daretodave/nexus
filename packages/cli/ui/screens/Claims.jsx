// The claims board: who holds which chunk, from `claims list --json`.
// Releasing needs owner mode.
import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Claims({ app }) {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');
  const load = () => api('/api/claims').then(setData).catch((e) => setMsg(e.message));
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const release = async (id) => {
    if (!window.confirm(`Release the claim on ${id}?`)) return;
    const r = await api('/api/claims/release', { id }).catch((e) => ({ ok: false, error: e.message }));
    setMsg(r.ok ? `released ${id}` : r.error || r.out);
    load();
  };

  const rows = data?.rows || [];
  const bySpec = {};
  for (const r of rows) (bySpec[String(r.id).split('.')[0]] ||= []).push(r);

  return (
    <div className="page">
      <h1>Claims</h1>
      <p className="lede">Who builds what. Claims live on the repo's orphan claims branch and last 24 hours unless held.</p>
      <div className="row" style={{ marginBottom: 'var(--s-3)' }}><button className="btn" onClick={load}>Refresh</button>{!app.info?.owner && <span className="small muted">Release and assign need owner mode.</span>}</div>
      {data && !data.available && <p className="muted">{data.note}</p>}
      {data?.error && <p className="bad small">{data.error}</p>}
      {data?.available && !rows.length && !data.error && <p className="muted">No claims. Every chunk is free.</p>}
      {Object.entries(bySpec).map(([spec, list]) => (
        <div className="card" key={spec}>
          <h3>spec {spec}</h3>
          <table className="grid">
            <thead><tr><th>chunk</th><th>state</th><th>who</th><th>host</th><th>since</th><th>PR</th><th /></tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.id}</td>
                  <td><span className={r.state === 'stale' ? 'warn' : 'ok'}>{r.state === 'stale' ? '- ' : '+ '}{r.state}</span>{r.mine ? ' · yours' : ''}{r.held ? ` · held @${r.held}` : ''}</td>
                  <td>{r.who}</td>
                  <td className="muted">{r.host}</td>
                  <td className="muted">{r.at}</td>
                  <td>{r.pr ? `#${r.pr}` : ''}</td>
                  <td>{app.info?.owner && <button className="btn quiet" onClick={() => release(r.id)}>Release</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {msg && <p className="small">{msg}</p>}
    </div>
  );
}
