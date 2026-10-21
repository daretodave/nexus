// Icons: inline stroke SVG on a 24 viewBox, the `.ic` class family
// (.ic-12 … .ic-24, .ic-bold, .ic-fill). Paths come verbatim from the
// handoff (icon-paths.js); `d` draws a one-off path (a data-driven glyph).
import { ICONS } from './icon-paths.js';

export { ICONS };

/**
 * @param {object} p
 * @param {string} [p.name]   a key of ICONS
 * @param {string} [p.d]      a raw path instead of a named icon
 * @param {12|14|18|20|24} [p.size]  adds .ic-<size> (16 is the default .ic)
 * @param {string} [p.className]     extra classes (log-chev, tick, k-on, ...)
 * @param {object} [p.style]
 * @param {string} [p.label]  an accessible name; otherwise aria-hidden
 */
export function Icon({ name, d, size, className = '', style, label }) {
  const cls = ['ic', size ? `ic-${size}` : '', className].filter(Boolean).join(' ');
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  if (d) {
    return (
      <svg className={cls} viewBox="0 0 24 24" style={style} {...a11y}>
        <path d={d} />
      </svg>
    );
  }
  const inner = ICONS[name];
  if (!inner) return null;
  // Constant markup from the handoff, never user input.
  return <svg className={cls} viewBox="0 0 24 24" style={style} {...a11y} dangerouslySetInnerHTML={{ __html: inner }} />;
}

/** The moon of a chunk state (16 viewBox, .moon): empty, quarter, half, three-quarter, full. */
export const MOON = {
  ready: null,
  claimed: 'M8 8V2a6 6 0 0 1 6 6z',
  building: 'M8 2a6 6 0 0 1 0 12z',
  review: 'M8 8V2a6 6 0 1 1-6 6z',
  settled: 'full',
  closed: 'full',
};

export function Moon({ state = 'ready', style }) {
  const f = MOON[state] ?? null;
  return (
    <svg className="moon" viewBox="0 0 16 16" aria-hidden="true" style={style}>
      {f === 'full' ? <circle className="f" cx="8" cy="8" r="6" /> : <circle cx="8" cy="8" r="6" />}
      {f && f !== 'full' ? <path className="f" d={f} /> : null}
    </svg>
  );
}
