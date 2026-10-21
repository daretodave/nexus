// Heads-down: the repo's own progress renderer (progress.mjs) as monospace
// ASCII, refreshed whenever a chunk beat lands.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { toPrompt } from '../../shared/route.mjs';

export default function HeadsDown({ app, live }) {
  const [out, setOut] = useState(null);
  const [spec, setSpec] = useState('');
  const [err, setErr] = useState('');
  const { stage } = live;
  const chunkKey = stage.chunkOrder.map((id) => `${id}:${stage.chunks[id].stage}`).join(',');

  const load = () => api(`/api/progress${spec ? `?spec=${encodeURIComponent(spec)}` : ''}`).then(setOut).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [chunkKey, spec]);
  useEffect(() => { const t = setInterval(load, 30000); return () => clearInterval(t); }, [spec]);

  const send = async (text) => {
    setErr('');
    try { await api('/api/send', { text }); } catch (e) { setErr(e.message); }
  };

  return (
    <div className="page">
      <h1>Heads down</h1>
      <p className="lede">Claim a spec's chunks and loop /next through them, taking defaults and logging each one. This is the repo's own progress view.</p>
      <div className="row" style={{ marginBottom: 'var(--s-3)' }}>
        <input className="field" style={{ width: 120 }} placeholder="spec, e.g. 12" value={spec} onChange={(e) => setSpec(e.target.value.replace(/[^0-9]/g, ''))} aria-label="Spec number" />
        <button className="btn primary" onClick={() => send(toPrompt(`/heads-down${spec ? ` ${spec}` : ''}`, 'slash', app.prefs))}>Go heads down</button>
        <button className="btn" onClick={load}>Refresh</button>
        <span className="spacer" />
        <button className="btn danger" onClick={() => send('/rebooting')} title="Announce a reboot: every loop parks with its claims kept">Pause all (reboot train)</button>
      </div>
      {out && !out.available && <p className="muted">This repo has no progress renderer yet (scripts/progress.mjs). It arrives with the chunk plan shape.</p>}
      <pre className="ascii" aria-label="Progress">{out?.available ? out.text || '(no output)' : ''}</pre>
      <h2>Live</h2>
      <pre className="ascii" aria-label="Live chunk tape">{tape(stage)}</pre>
      {err && <p className="bad">{err}</p>}
    </div>
  );
}

function tape(s) {
  const lines = s.chunkOrder.slice(-12).map((id) => {
    const c = s.chunks[id];
    const steps = ['claim', 'build', 'gate', 'archive'];
    const at = steps.indexOf(c.stage);
    const bar = steps.map((st, i) => (i <= at ? `[${st}]` : ` ${st} `)).join('--');
    return `${id.padEnd(8)} ${bar}${s.current === id ? '  <--- [here]' : ''}`;
  });
  return lines.length ? lines.join('\n') : 'no chunk activity in this session yet';
}
