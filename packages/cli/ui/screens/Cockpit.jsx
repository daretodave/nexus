// The cockpit, split 50/50: the prompt pane (context strip, transcript,
// live questions, composer) on the left; the agent stage on the right.
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { AskCard, PermissionCard } from '../parts.jsx';
import Stage from '../Stage.jsx';
import { classify, toPrompt, complete } from '../../shared/route.mjs';
import { MAIN } from '../../shared/beats.mjs';

const ROUTE_LABEL = { ask: 'asks inline', bug: 'runs as /bug', plot: 'runs as /plot', slash: 'runs as typed' };

export default function Cockpit({ app, live }) {
  const { info, prefs, commands } = app;
  const { stage, transcript, status, asks, permissions } = live;
  const scroller = useRef(null);

  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  }, [transcript, asks, permissions]);

  const subagents = stage.order.filter((id) => id !== MAIN);
  const running = subagents.filter((id) => stage.agents[id].state === 'running').length;
  const lastResult = [...transcript].reverse().find((t) => t.kind === 'result');

  return (
    <div className="cockpit">
      <section className="left" aria-label="Prompt and context">
        <div className="context" aria-label="What this session knows">
          <span className="layer">{info?.branch || 'no branch'}</span>
          <span className={`layer pill ${info?.owner ? 'owner' : ''}`}>{info?.owner ? 'owner: push to main' : 'contributor: PRs'}</span>
          <span className="layer">session {status.state}{status.provider ? ` · ${status.provider}` : ''}</span>
          {stage.current && <span className="layer">chunk {stage.current} · {stage.chunks[stage.current].stage}</span>}
          <span className="layer">{subagents.length} agents ({running} running)</span>
          {info?.lastCommit && <span className="layer" title={info.lastCommit}>last: {info.lastCommit.slice(0, 40)}</span>}
          {lastResult?.cost != null && <span className="layer">${lastResult.cost.toFixed(2)} last turn</span>}
        </div>
        <div className="transcript" ref={scroller} aria-live="polite">
          {!transcript.length && <p className="muted">Type a request below. Free text routes itself: a bug goes to /bug, a feature or task to /plot, a question is answered here. Or start with a slash command such as /next.</p>}
          {transcript.map((t, i) => <Item key={`${t.id || 'x'}-${i}`} t={t} />)}
          {asks.map((a) => <AskCard key={a.id} ask={a} />)}
          {permissions.map((p) => <PermissionCard key={p.id} req={p} />)}
        </div>
        <Composer commands={commands} prefs={prefs} running={status.state === 'running'} />
      </section>
      <section className="right" aria-label="Agent stage">
        <Stage stage={stage} />
        <div className="stage-legend"><span>o running</span><span>? waiting on you</span><span>+ done</span><span>x failed</span></div>
      </section>
    </div>
  );
}

function Item({ t }) {
  switch (t.kind) {
    case 'user': return <div className="msg user">{t.text}</div>;
    case 'text': return <div className="msg">{t.text}</div>;
    case 'system': return <div className="msg system">{t.text}</div>;
    case 'error': return <div className="msg error">{t.text}</div>;
    case 'tool': return <div className={`tool ${t.agent !== 'main' ? 'sub' : ''}`}><span className="name">{t.name}</span> {t.summary}</div>;
    case 'tool-error': return <div className="tool bad">  error: {t.text}</div>;
    case 'result': return <div className="result">{t.ok ? 'turn done' : `turn ended: ${t.subtype || 'error'}`}{t.turns != null ? ` · ${t.turns} turns` : ''}{t.ms != null ? ` · ${Math.round(t.ms / 1000)}s` : ''}{t.cost != null ? ` · $${t.cost.toFixed(2)}` : ''}{t.text ? ` · ${t.text}` : ''}</div>;
    default: return null;
  }
}

function Composer({ commands, prefs, running }) {
  const [draft, setDraft] = useState('');
  const [override, setOverride] = useState(null);
  const [sel, setSel] = useState(0);
  const [err, setErr] = useState('');
  const options = useMemo(() => complete(draft, commands), [draft, commands]);
  const auto = classify(draft);
  const route = override && auto !== 'slash' ? override : auto;

  const send = async () => {
    const prompt = toPrompt(draft, route, prefs);
    if (!prompt) return;
    setErr('');
    try { await api('/api/send', { text: prompt }); setDraft(''); setOverride(null); } catch (e) { setErr(e.message); }
  };

  const onKey = (e) => {
    if (options.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((sel + 1) % options.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel((sel - 1 + options.length) % options.length); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); setDraft(`/${options[sel].name} `); setSel(0); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="composer">
      {options.length > 0 && (
        <ul className="complete" role="listbox">
          {options.map((c, i) => (
            <li key={c.name} role="option" aria-selected={i === sel} onMouseDown={(e) => { e.preventDefault(); setDraft(`/${c.name} `); }}>
              <span className="mono">/{c.name}</span> <span className="muted">{c.hint}</span>
            </li>
          ))}
        </ul>
      )}
      <textarea
        className="field"
        aria-label="Prompt"
        placeholder={running ? 'Nudge the running session (a tug)...' : 'What should happen next? Try /next, or describe a bug or a feature.'}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setSel(0); }}
        onKeyDown={onKey}
      />
      <div className="row" style={{ marginTop: 'var(--s-2)' }}>
        {auto && auto !== 'slash' && (
          <span className="route muted">
            {ROUTE_LABEL[route]}{' '}
            <select className="field route" value={route} onChange={(e) => setOverride(e.target.value)} aria-label="Route">
              <option value="ask">ask inline</option>
              <option value="bug">/bug</option>
              <option value="plot">/plot</option>
            </select>
          </span>
        )}
        <span className="spacer" />
        {err && <span className="bad small">{err}</span>}
        {running && <button className="btn quiet" onClick={() => api('/api/interrupt', {})}>Interrupt</button>}
        {running && <button className="btn danger" onClick={() => api('/api/stop', {})}>Stop</button>}
        {!running && <button className="btn quiet" onClick={() => api('/api/fresh', {})}>New session</button>}
        <button className="btn primary" disabled={!draft.trim()} onClick={send}>{running ? 'Tug' : 'Send'}</button>
      </div>
    </div>
  );
}
