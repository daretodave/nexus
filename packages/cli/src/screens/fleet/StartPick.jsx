// Start heads-down: choose infinite or a spec first, then start. The Fleet's "start another session" tile and the
// Heads-down screen with no session both draw it. A choice a session this server runs is already on opens that
// session; one a terminal is on can still be started anyway.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, cx } from '../../ui/index.js';
import { PATHS } from '../../routes.js';
import { act } from './util.js';
import { startChoices, startPrompt } from './startPick.js';
import '../../styles/start-pick.css';

/** `open(id)` is where a started or running session opens (the cockpit by default); `onError(title, body)` reports. */
export default function StartPick({ plan, sessions, open, onError }) {
  const navigate = useNavigate();
  const go = open || ((id) => navigate(PATHS.cockpit(id)));
  const [pick, setPick] = useState(null);
  const [starting, setStarting] = useState(false);
  const choices = startChoices(plan, sessions);
  const chosen = choices.find((c) => c.value === pick) || null;

  async function start() {
    if (!chosen) return;
    const opens = chosen.running && !chosen.running.terminal;
    if (opens) { go(chosen.running.id); return; }
    setStarting(true);
    const r = await act('/api/sessions', { prompt: startPrompt(chosen.value) });
    setStarting(false);
    if (r.ok && r.data?.id) { go(r.data.id); return; }
    onError?.(r.missing ? 'Starting a session from here is not wired up yet' : "Couldn't start a session", r.missing ? 'Start /heads-down in a terminal; it shows up here as it starts.' : r.error);
  }

  return (
    <div className="start-pick">
      <div className="sp-list" role="radiogroup" aria-label="What should it work on?">
        {choices.map((c) => (
          <button key={c.value} type="button" role="radio" aria-checked={pick === c.value} className={cx('sp-row', pick === c.value && 'is-on')} onClick={() => setPick(c.value)}>
            <span className="sp-dot" />
            <span className="sp-text">
              <span className="sp-label">{c.value === 'infinite' ? <Icon name="refresh" size={13} /> : null}{c.label}</span>
              <span className="sp-sub">{!c.running ? c.sub : c.running.terminal ? `${c.running.name} is on it in a terminal` : `${c.running.name} is already on it`}</span>
            </span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary btn-s" type="button" onClick={start} disabled={!chosen || starting} aria-busy={starting || undefined}>
          {chosen?.running && !chosen.running.terminal ? <>Open {chosen.running.name}</> : <><Icon name="plus" size={14} />{!chosen ? 'Choose a spec or infinite' : `Start ${chosen.value === 'infinite' ? 'infinite' : `spec ${chosen.value}`}${chosen.running ? ' anyway' : ''}`}</>}
        </button>
        <Link className="btn btn-ghost btn-s" to={PATHS.board}>Pick a chunk</Link>
      </div>
    </div>
  );
}
