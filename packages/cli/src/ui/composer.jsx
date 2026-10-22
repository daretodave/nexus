// Composer (Composer board): .composer, .slash, .route, .choice, .chip,
// .tool-btn, .send, and the re-route .menu. Large, multiline, always at the
// bottom of the left pane. Free text goes as typed. A guessed route shows as
// a suggestion chip (.route-suggest) the person can accept; a route they pick
// from its menu is armed and shows as the .route chip.
import { useMemo, useRef, useState } from 'react';
import '../styles/route-suggest.css';
import { Icon } from './icons.jsx';
import { Choice, FileChip, Kbd, Menu, cx } from './controls.jsx';

/** The seven commands the slash list offers, in the design's order and words. */
export const COMMANDS = [
  { name: 'bug', desc: 'Report a bug: reproduce it, fix it, add a test', badge: 'new' },
  { name: 'march', desc: 'Work the plan: claim, build, check, commit, repeat' },
  { name: 'next', desc: 'Take only the next ready chunk' },
  { name: 'heads-down', desc: 'Questions first, then hours of quiet work' },
  { name: 'plot', desc: 'Turn notes into planned chunks' },
  { name: 'oversight', desc: 'Open questions from every session' },
  { name: 'explode', desc: 'Bloom messy thoughts into idea cards' },
];

/** What a route chip says. `ask` is the quieter, neutral chip: nothing gets planned. */
export const ROUTE_META = {
  bug: { icon: 'bug', cmd: '/bug', menuIcon: 'bugSmall', menuLabel: '/bug', desc: 'Reproduce, fix, add a test', hint: 'send as /bug', why: 'Reproduce, fix, add a regression test. Joins the plan as a bug chunk.' },
  plot: { icon: 'plot', cmd: '/plot', menuLabel: '/plot', desc: 'Plan it, or plan it and do it', hint: 'plan it', why: 'Plan it and do it runs the whole ceremony, plan, build and archive, as one unit. Not the default.' },
  ask: { icon: 'answer', cmd: 'Answer inline', inline: true, menuLabel: 'Answer inline', desc: 'No plan change', hint: 'ask', why: 'A plain question. Answered here; the plan does not change.' },
  nudge: { icon: 'nudge', cmd: 'Nudge', tail: 'this run', menuLabel: 'Nudge this run', desc: 'Read on the next step', hint: 'send as nudge', why: 'Read by the agents on their next step. No plan change.' },
  pin: { icon: 'pinNote', cmd: 'Pin', tail: 'for next step', menuLabel: 'Pin for next step', desc: 'Stays in context until unpinned', hint: 'pin', why: 'Every agent reads this on its next step.' },
};

/** What a suggestion chip leads with: the guess, said as a guess. */
export const SUGGEST_LEAD = { bug: 'Looks like a bug', plot: 'Looks like a task to plan' };

/**
 * .route-suggest: the classifier's guess, never applied on its own. The chip
 * sends as the route (Ctrl+Enter does the same); the chevron arms another
 * route from the menu; the x dismisses it. Enter alone sends as typed.
 */
export function SuggestChip({ route, open, onAccept, onMenu, onDismiss }) {
  const m = ROUTE_META[route];
  if (!m) return null;
  return (
    <div className="route-suggest" role="group" aria-label="Suggested route">
      <span className="route-suggest-lead">{SUGGEST_LEAD[route] || 'Suggested'}</span>
      <button className="route route-suggest-send" type="button" onClick={onAccept} title={`Send as ${m.cmd} (Ctrl+Enter)`}>
        <Icon name={m.icon} /><span>send as</span><span className="cmd">{m.cmd}</span><Kbd>Ctrl ⏎</Kbd>
      </button>
      {onMenu ? <button className={cx('route-suggest-icon', open && 'is-open')} type="button" aria-label="Route as something else" aria-haspopup="menu" aria-expanded={!!open} onClick={onMenu}><Icon name="chevronDown" /></button> : null}
      {onDismiss ? <button className="route-suggest-icon" type="button" aria-label="Dismiss: send as typed" onClick={onDismiss}><Icon name="xSmall" /></button> : null}
    </div>
  );
}

/** The five-way re-route menu order (a separator before nudge). */
export const ROUTE_ORDER = ['bug', 'plot', 'ask', null, 'nudge', 'pin'];

/** .route: the chip. `open` while its menu shows. */
export function RouteChip({ route, open, onClick }) {
  const m = ROUTE_META[route];
  if (!m) return null;
  return (
    <button className={cx('route', m.inline && 'is-inline', open && 'is-open')} type="button" onClick={onClick} aria-haspopup="menu" aria-expanded={!!open}>
      <Icon name={m.icon} /><span className="cmd">{m.cmd}</span>{m.tail ? <span>{m.tail}</span> : null}<Icon name="chevronDown" />
    </button>
  );
}

/** The re-route menu: the current route checked. */
export function RouteMenu({ route, onPick, style }) {
  const items = ROUTE_ORDER.map((r) => (r === null ? { sep: true } : {
    key: r, icon: ROUTE_META[r].menuIcon || ROUTE_META[r].icon, label: ROUTE_META[r].menuLabel, desc: ROUTE_META[r].desc,
    active: r === route, role: 'menuitemradio', end: r === route ? <Icon name="check" /> : <span />, onSelect: () => onPick?.(r),
  }));
  return <Menu head="Route as" items={items} label="Route this message" style={style} />;
}

/** .slash: the command list. `typed` is the text after nothing (e.g. "/he"); its prefix is bolded. */
export function SlashList({ items, active = 0, typed = '/', onPick }) {
  const n = typed.length;
  return (
    <div className="slash" role="listbox" aria-label="Commands">
      <div className="slash-head"><span className="t-caps c-2">Commands</span><span className="cap">↑ ↓ to move · ⏎ to run</span></div>
      {items.map((c, i) => {
        const full = `/${c.name}`;
        return (
          <div key={c.name} className={cx('slash-item', i === active && 'is-active')} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); onPick?.(c); }}>
            <span className="slash-cmd"><b>{full.slice(0, n)}</b>{full.slice(n)}</span>
            <span className="slash-desc">{c.desc}</span>
            {c.badge ? <span className="badge-def">{c.badge}</span> : <span />}
          </div>
        );
      })}
    </div>
  );
}

/** Commands matching a draft like "/he" (no space yet). */
export function matchCommands(draft, commands = COMMANDS) {
  const m = /^\/([\w:-]*)$/.exec(String(draft || ''));
  if (!m) return [];
  const want = m[1].toLowerCase();
  return commands.filter((c) => c.name.toLowerCase().startsWith(want));
}

/**
 * The composer. Controlled text, sent as typed. `route` is one the person
 * armed (shown as the chip, Enter sends under it, its x un-arms it);
 * `suggest` is the classifier's guess (shared/route.mjs), shown as a
 * suggestion chip and sent under only when accepted: onSend(text, suggest).
 *
 * mode: 'normal' | 'pin' | 'paused'. `dock` gives it the fixed dock height
 * (.dock .composer, plus .has-route while a route shows).
 */
export function Composer({
  value, onChange, onSend, route, onRoute, suggest, onDismissSuggest, why, plotMode = 'plan', onPlotMode,
  chips, onAttach, attached = 0, mode = 'normal', onTogglePin, pausedText, onResume,
  placeholder = 'Nudge the run, or type / for commands', commands = COMMANDS, dock, rows = 2, focus,
}) {
  const [menu, setMenu] = useState(false);
  const [active, setActive] = useState(0);
  const area = useRef(null);
  const paused = mode === 'paused';
  const pin = mode === 'pin';
  const slash = useMemo(() => (paused ? [] : matchCommands(value, commands)), [value, commands, paused]);
  const text = String(value || '');
  const hasRoute = !!route && !!text.trim() && !slash.length && !pin && !paused;
  const meta = hasRoute ? ROUTE_META[route] : null;
  const guess = !route && !!suggest && !!text.trim() && !slash.length && !pin && !paused && ROUTE_META[suggest] ? suggest : null;

  const send = () => { if (text.trim() && !paused) onSend?.(text); };
  const accept = () => { if (guess && text.trim()) { setMenu(false); onSend?.(text, guess); } };
  const keyDown = (e) => {
    if (slash.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % slash.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + slash.length) % slash.length); return; }
      if (e.key === 'Escape') { e.preventDefault(); onChange?.(''); return; }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onChange?.(`/${slash[Math.min(active, slash.length - 1)].name} `); setActive(0); return; }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && guess) { e.preventDefault(); accept(); return; }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  let hint = null;
  if (slash.length) hint = <><Kbd>esc</Kbd>close</>;
  else if (pin) hint = <><Kbd>⏎</Kbd>pin</>;
  else if (meta) hint = <><Kbd>⏎</Kbd>{route === 'plot' && plotMode === 'do' ? 'plan it and do it' : meta.hint}</>;
  else if (guess) hint = <><Kbd>⏎</Kbd>send as typed</>;
  // Docked in the cockpit the idle hint is just / commands (Cockpit board); the Composer board's free-standing one adds ⏎ send.
  else if (!paused && !text) hint = dock ? <><Kbd>/</Kbd>commands</> : <><Kbd>/</Kbd>commands<Kbd>⏎</Kbd>send</>;

  return (
    <div className={cx('composer', focus && 'is-focus', pin && 'is-pin', paused && 'is-disabled', dock && (hasRoute || guess) && 'has-route')}>
      {slash.length ? <SlashList items={slash} active={Math.min(active, slash.length - 1)} typed={text} onPick={(c) => { onChange?.(`/${c.name} `); area.current?.focus(); }} /> : null}
      {pin ? <div className="composer-pinhead"><Icon name="pinNote" size={14} />Pinned note · every agent reads this on its next step</div> : null}
      {chips && chips.length ? <div className="composer-chips">{chips.map((c) => <FileChip key={c.name} {...c} />)}</div> : null}
      <textarea
        ref={area} rows={rows} aria-label={pin ? 'Pinned note' : 'Message the session'} value={text} disabled={paused}
        placeholder={paused ? (pausedText ? 'Paused. Notes you write now wait until you resume.' : placeholder) : placeholder}
        onChange={(e) => { onChange?.(e.target.value); setActive(0); }} onKeyDown={keyDown}
      />
      {meta ? (
        <div className="route-slot" style={{ position: 'relative' }}>
          <RouteChip route={route} open={menu} onClick={() => setMenu((m) => !m)} />
          {route === 'plot' && onPlotMode ? (
            <Choice label="How far to take it" value={plotMode} onChange={onPlotMode} options={[{ value: 'plan', label: 'Plan it' }, { value: 'do', label: 'Plan it and do it' }]} />
          ) : <span className="route-why">{why ?? meta.why}</span>}
          {onRoute ? <button className="route-suggest-icon" type="button" aria-label="Send as typed instead" onClick={() => { setMenu(false); onRoute(null); }}><Icon name="xSmall" /></button> : null}
          {menu ? <RouteMenu route={route} onPick={(r) => { setMenu(false); onRoute?.(r); }} style={{ position: 'absolute', zIndex: 6, left: 0, bottom: 'calc(100% + 8px)' }} /> : null}
        </div>
      ) : guess ? (
        <div className="route-slot" style={{ position: 'relative' }}>
          <SuggestChip route={guess} open={menu} onAccept={accept} onMenu={onRoute ? () => setMenu((m) => !m) : undefined} onDismiss={onDismissSuggest} />
          {menu ? <RouteMenu route={null} onPick={(r) => { setMenu(false); onRoute?.(r); }} style={{ position: 'absolute', zIndex: 6, left: 0, bottom: 'calc(100% + 8px)' }} /> : null}
        </div>
      ) : null}
      {meta && route === 'plot' && onPlotMode ? <div className="route-why" style={{ paddingLeft: 2 }}>{why ?? meta.why}</div> : null}
      <div className="composer-bar">
        {paused ? (
          <span className="composer-hint" style={{ marginLeft: 6 }}><Icon name="pause" size={14} />{pausedText}</span>
        ) : slash.length ? null : (
          <>
            {onAttach ? <button className={cx('tool-btn', attached > 0 && 'is-on')} type="button" aria-label="Attach files" onClick={onAttach}><Icon name="paperclip" />{attached > 0 ? attached : null}</button> : null}
            {onTogglePin ? <button className={cx('tool-btn', pin && 'is-on')} type="button" onClick={onTogglePin}><Icon name="pinNote" />{pin ? 'Pinned' : 'Pin'}</button> : null}
          </>
        )}
        <span className="spacer" />
        {hint ? <span className={cx('composer-hint', dock && 'tb-long')}>{hint}</span> : null}
        {paused && onResume ? <button className="btn btn-s" type="button" onClick={onResume}><Icon name="play" size={14} />Resume</button> : null}
        <button className="send" type="button" aria-label={pin ? 'Pin note' : 'Send'} disabled={paused || !text.trim()} onClick={send}><Icon name="arrowUp" /></button>
      </div>
    </div>
  );
}
