// The stale-tab bar (data/health.js): a slim, calm line under the top bar when this tab lost its nexus (stopped, or
// restarted as a newer version). The tab keeps what it shows and what was typed; it reconnects by itself.
import { useEffect, useState } from 'react';
import { health, healthNow, healthWords, subscribeHealth } from '../data/index.js';
import '../styles/stale.css';

export default function StaleBar() {
  const [s, setS] = useState(() => healthNow());
  useEffect(() => subscribeHealth(setS), []);
  const w = healthWords(s);
  if (!w || !health) return null;
  return (
    <div className={`stale-bar is-${s.status}`} role="status" aria-live="polite">
      <span className="stale-dot" aria-hidden="true" />
      <span className="stale-text">{w.text}</span>
      {w.action === 'reload' ? <button className="btn btn-s" type="button" onClick={() => window.location.reload()}>Reload</button> : null}
    </div>
  );
}
