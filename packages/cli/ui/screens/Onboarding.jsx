// First run: preflight, the "using anything else?" door, shape the project
// (owner mode, run mode), adopt, and explode messy thoughts into /messy.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Mark } from '../parts.jsx';

export default function Onboarding({ app, go }) {
  const { prefs, info, setPrefs, refresh, permissionModes } = app;
  const [pf, setPf] = useState(null);
  const [prompts, setPrompts] = useState(null);
  const [showFull, setShowFull] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dump, setDump] = useState('');
  const [err, setErr] = useState('');

  const check = () => { setPf(null); api('/api/preflight').then(setPf).catch((e) => setErr(e.message)); };
  useEffect(() => { check(); api('/api/prompts').then(setPrompts).catch(() => {}); }, []);

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  const setOwner = async (on) => { await api('/api/owner', { on }); refresh(); };
  const run = async (path, body) => {
    try { await api(path, body); await setPrefs({ onboarded: true }); go('cockpit'); } catch (e) { setErr(e.message); }
  };

  return (
    <div className="page">
      <section className="hero">
        <h1><span className="tag">Using Claude Code? Enjoy a GUI on us. For free.</span></h1>
        <p className="lede">nexus turns this repo into a project that ships itself: agents pick work off the plan, build it, gate it, and land it. This window lets you watch and steer.</p>
      </section>

      <h2>1. Preflight</h2>
      <div className="card">
        {!pf && <p className="muted">Checking this machine...</p>}
        {pf && (
          <ul className="list">
            {pf.checks.map((c) => (
              <li key={c.id}>
                <Mark ok={c.ok} optional={c.optional} />
                <div>
                  <div>{c.label} <span className="muted small">{c.detail}</span></div>
                  {c.fix && <div className="small warn">{c.fix}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="row"><button className="btn quiet" onClick={check}>Check again</button></div>
      </div>

      <h2>Using anything else? Give this to your agent.</h2>
      <div className="card">
        <p className="small muted">Cursor, another CLI, any capable agent: paste this at your project's root. It is the same canonical text the nexus README hands out.</p>
        <div className="prompt-box">{prompts ? prompts.paste : '...'}</div>
        <div className="row" style={{ marginTop: 'var(--s-2)' }}>
          <button className="btn" onClick={() => prompts && copy(prompts.paste)}>{copied ? 'Copied' : 'Copy prompt'}</button>
          {prompts?.adopt && <button className="btn quiet" onClick={() => setShowFull(!showFull)}>{showFull ? 'Hide' : 'Read'} what it authorizes (prompts/adopt.md)</button>}
        </div>
        {showFull && prompts?.adopt && <div className="prompt-box" style={{ marginTop: 'var(--s-2)' }}>{prompts.adopt}</div>}
      </div>

      <h2>2. Shape the project</h2>
      <div className="card">
        <h3>Who lands the work?</h3>
        <div className="choice" role="radiogroup">
          <label>
            <input type="radio" name="owner" checked={!!info?.owner} onChange={() => setOwner(true)} /> <strong>Owner: push straight to main</strong>
            <div className="small muted">This checkout settles the plan and pushes main. Writes an untracked .owner file.</div>
          </label>
          <label>
            <input type="radio" name="owner" checked={!info?.owner} onChange={() => setOwner(false)} /> <strong>Contributor: open pull requests</strong>
            <div className="small muted">Work goes to next/&lt;id&gt; branches as PRs; pushes to main are refused.</div>
          </label>
        </div>
        <h3 style={{ marginTop: 'var(--s-4)' }}>How should /next build?</h3>
        <label className="check"><input type="checkbox" checked={prefs.agents} onChange={(e) => setPrefs({ agents: e.target.checked })} /> <span>Delegate to sub-agents <span className="muted small">(a builder subagent per chunk; the lead keeps claim, gate, land)</span></span></label>
        <label className="check"><input type="checkbox" checked={prefs.workflows} onChange={(e) => setPrefs({ workflows: e.target.checked })} /> <span>Use workflows <span className="muted small">(multi-agent build plus adversarial verify; more tokens, more rigor)</span></span></label>
        <p className="small muted">Neither checked: /next picks by size (S and M as a sub-agent, L as a workflow).</p>
        <h3 style={{ marginTop: 'var(--s-4)' }}>Tool permissions</h3>
        <select className="field" value={prefs.permissionMode} onChange={(e) => setPrefs({ permissionMode: e.target.value })}>
          {permissionModes.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <span className="small muted"> default asks here for anything outside the repo's allowlist.</span>
      </div>

      <h2>3. Adopt</h2>
      <div className="card">
        {info?.adopted
          ? <p><Mark ok /> This repo already runs nexus.</p>
          : (
            <>
              <p className="small muted">Runs the canonical adoption prompt in a Claude Code session here. You will watch it work and answer its questions.</p>
              <button className="btn primary" disabled={!pf?.ready} onClick={() => run('/api/adopt', {})}>Adopt nexus</button>
            </>
          )}
      </div>

      <h2>4. Explode your messy thoughts</h2>
      <div className="card">
        <p className="small muted">Dump everything: ideas, bugs, half-plans. It is saved raw, then refined into specs and chunks (/messy).</p>
        <textarea className="field" rows={6} value={dump} onChange={(e) => setDump(e.target.value)} placeholder="what is on your mind about this project..." />
        <div className="row" style={{ marginTop: 'var(--s-2)' }}>
          <button className="btn primary" disabled={!dump.trim() || !pf?.ready} onClick={() => run('/api/send', { text: `/messy ${dump.trim()}` })}>Explode</button>
          <button className="btn quiet" onClick={async () => { await setPrefs({ onboarded: true }); go('cockpit'); }}>Skip to the cockpit</button>
        </div>
      </div>
      {err && <p className="bad">{err}</p>}
    </div>
  );
}
