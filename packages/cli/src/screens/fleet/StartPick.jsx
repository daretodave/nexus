// Start heads-down: choose infinite or a spec first, then start. The Fleet's "start another session" tile and the
// Heads-down screen with no session both draw it. A choice a session this server runs is already on opens that
// session; one a terminal is on can still be started anyway. `compact` (the Fleet's start tile, sized like a card):
// the list stays folded behind Start heads-down until it is asked for. Start empty skips the choice: a session with
// no prompt and no chunk, opened in its cockpit for whatever the person types. Picking infinite opens its follow
// selector (InfiniteFollow): march or the next loop, and the one question each asks; the choice is kept per checkout
// (prefs.infinite) as the next default.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, cx } from '../../ui/index.js';
import { PATHS } from '../../routes.js';
import { useAppState, useLocalSettings } from '../../data/index.js';
import { act } from './util.js';
import { INFINITE, startChoices, startPrompt } from './startPick.js';
import { followLabel, parseFollow, serializeFollow, startLabel } from './follow.js';
import InfiniteFollow from './InfiniteFollow.jsx';
import '../../styles/start-pick.css';

/** `open(id)` is where a started or running session opens (the cockpit by default); `onError(title, body)` reports. */
export default function StartPick({ plan, sessions, open, onError, compact = false }) {
  const navigate = useNavigate();
  const go = open || ((id) => navigate(PATHS.cockpit(id)));
  const [pick, setPick] = useState(null);
  const [starting, setStarting] = useState(false);
  const [unfolded, setUnfolded] = useState(!compact);
  const app = useAppState();
  const local = useLocalSettings();
  const owner = local.data?.effective ?? app.data?.info?.owner ?? true;
  const savedFollow = app.data?.prefs?.infinite;
  const [follow, setFollow] = useState(() => parseFollow(savedFollow, { owner }));
  const seeded = useRef(savedFollow != null);
  useEffect(() => {
    // Seed once from the saved choice when the prefs arrive after the first draw.
    if (seeded.current || savedFollow == null) return;
    seeded.current = true;
    setFollow(parseFollow(savedFollow, { owner }));
  }, [savedFollow, owner]);
  const choices = startChoices(plan, sessions);
  const chosen = choices.find((c) => c.value === pick) || null;
  const infinite = chosen?.value === INFINITE;
  const opensHere = !!(chosen?.running && !chosen.running.terminal);
  const following = infinite && !opensHere;
  const fit = parseFollow(serializeFollow(follow), { owner });

  async function start() {
    if (!chosen) return;
    const opens = chosen.running && !chosen.running.terminal;
    if (opens) { go(chosen.running.id); return; }
    setStarting(true);
    const r = await act('/api/sessions', { prompt: startPrompt(chosen.value, infinite ? fit : undefined) });
    setStarting(false);
    if (r.ok && r.data?.id) {
      if (infinite) await keepFollow(fit);
      go(r.data.id);
      return;
    }
    onError?.(r.missing ? 'Starting a session from here is not wired up yet' : "Couldn't start a session", r.missing ? 'Start /heads-down in a terminal; it shows up here as it starts.' : r.error);
  }

  // The choice becomes this checkout's next default. Best-effort: the session already started.
  async function keepFollow(f) {
    try {
      const r = await act('/api/prefs', { infinite: serializeFollow(f) });
      if (r?.ok) app.reload?.();
    } catch { /* a pref that did not save changes nothing that started */ }
  }

  async function startEmpty() {
    setStarting(true);
    const r = await act('/api/sessions', {});
    setStarting(false);
    if (r.ok && r.data?.id) { navigate(PATHS.cockpit(r.data.id)); return; }
    onError?.(r.missing ? 'Starting a session from here is not wired up yet' : "Couldn't start a session", r.missing ? 'Start claude in a terminal; it shows up here as it starts.' : r.error);
  }
  const empty = (
    <button className="btn btn-s" type="button" onClick={startEmpty} disabled={starting} title="A new session with no prompt and no chunk: type whatever you like in its cockpit">
      Start empty
    </button>
  );

  if (!unfolded) {
    return (
      <div className="start-pick">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-primary btn-s" type="button" onClick={() => setUnfolded(true)} aria-expanded="false">
            <Icon name="plus" size={14} />Start heads-down
          </button>
          {empty}
          <Link className="btn btn-ghost btn-s" to={PATHS.board}>Pick a chunk</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={cx('start-pick', following && 'is-following')}>
      <div className="sp-list" role="radiogroup" aria-label="What should it work on?">
        {choices.map((c) => (
          <button key={c.value} type="button" role="radio" aria-checked={pick === c.value} className={cx('sp-row', pick === c.value && 'is-on')} onClick={() => setPick(c.value)}>
            <span className="sp-dot" />
            <span className="sp-text">
              <span className="sp-label">{c.value === 'infinite' ? <Icon name="refresh" size={13} /> : null}{c.label}</span>
              <span className="sp-sub">{runningLine(c)}</span>
            </span>
          </button>
        ))}
      </div>
      <InfiniteFollow value={fit} onChange={setFollow} owner={owner} busy={starting} open={following} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary btn-s" type="button" onClick={start} disabled={!chosen || starting} aria-busy={starting || undefined}>
          {chosen?.running && !chosen.running.terminal ? <>Open {chosen.running.name}</> : <><Icon name="plus" size={14} />{!chosen ? 'Choose a spec or infinite' : `${infinite ? startLabel(fit) : `Start spec ${chosen.value}`}${chosen.running ? ' anyway' : ''}`}</>}
        </button>
        {empty}
        <Link className="btn btn-ghost btn-s" to={PATHS.board}>Pick a chunk</Link>
      </div>
    </div>
  );
}

/** A choice's second line: its description, or who is on it (and, for infinite, how it runs). */
function runningLine(c) {
  if (!c.running) return c.sub;
  const how = c.running.follow ? ` (${followLabel(c.running.follow)})` : '';
  return c.running.terminal ? `${c.running.name} is on it in a terminal${how}` : `${c.running.name} is already on it${how}`;
}
