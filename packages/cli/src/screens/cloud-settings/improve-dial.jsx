// Settings' "Improvement dial" (spec 59, A4): the `Improve:` line of plan/bearings.md as four radios, each with a
// one-line explanation and a four-pip meter (how hard the loop pushes past the plan). Choosing one asks the server
// (POST /api/improve, server/improve.mjs) to land the line as a pending file; the knob lines that override the dial
// are listed under it. Styles: styles/improve-dial.css (nexus.css's .check pieces, drawn round, the aurora on the pips).
import { Icon } from '../../ui/icons.jsx';

export const DIAL_CHOICES = [
  { value: 'off', label: 'Off', sub: 'The loop builds what you planned and nothing else.' },
  { value: 'gentle', label: 'Gentle', sub: 'Triages issues and alerts on a stall; you promote every candidate, as the loop ran before the dial.' },
  { value: 'steady', label: 'Steady', sub: 'Fixes small issues, ages strong candidates into the plan, refills from the kit\'s generators, researches monthly.' },
  { value: 'bold', label: 'Bold', sub: 'Fixes every issue, promotes on a stall, runs every generator, researches weekly, at an eager cadence.' },
];

/** The position Settings shows as chosen: anything it does not list reads gentle, as the resolver reads it. */
export function shownDial(value) {
  return DIAL_CHOICES.some((c) => c.value === value) ? value : 'gentle';
}

/** One line on the knobs that override the dial, or null. */
export function overridesLine(overrides = []) {
  if (!overrides.length) return null;
  return overrides.map((o) => `${o.knob} ${o.value}`).join(', ');
}

/**
 * view: GET /api/improve's answer (value, source, overrides, here, branch, resolver). busy: the position being landed.
 * note / error: what the last landing said.
 */
export function ImproveDial({ view, value, onChange, busy = null, note = null, error = null, name = 'improve-dial' }) {
  const v = shownDial(value ?? view?.value);
  const over = overridesLine(view?.overrides);
  return (
    <div className="dial-modes">
      <div className="dial-list" role="radiogroup" aria-label="Improvement dial" aria-busy={busy ? 'true' : undefined}>
        {DIAL_CHOICES.map((c, i) => (
          <label key={c.value} className={`check dial-opt${busy === c.value ? ' is-landing' : ''}${busy && busy !== c.value ? ' is-disabled' : ''}`}>
            <input type="radio" name={name} value={c.value} checked={v === c.value} disabled={!!busy} onChange={() => onChange?.(c.value)} />
            <span className="dial-dot" />
            <span className="check-text">
              <span className="check-title">
                {c.label}
                <span className="dial-pips" aria-hidden="true">{[0, 1, 2].map((p) => <i key={p} className={p < i ? 'on' : ''} />)}</span>
              </span>
              <span className="check-sub">{c.sub}</span>
            </span>
          </label>
        ))}
      </div>
      {view?.source === 'default' ? <p className="t-body-s c-3 dial-note">No <code className="t-mono-s">Improve:</code> line in <span className="file-tag">{view.file || 'plan/bearings.md'}</span> yet, so the loop reads gentle.</p> : null}
      {view?.here ? <p className="t-body-s c-3 dial-note">{view.branch || 'main'} reads {view.value}; this checkout still reads {view.here} until you pull.</p> : null}
      {over ? <p className="t-body-s c-2 dial-note"><b>Overridden by their own lines:</b> {over}. Each stays as set whatever the dial says.</p> : null}
      {busy ? <p className="t-body-s c-3 dial-note" role="status">Landing <code className="t-mono-s">Improve: {busy}</code> in {view?.file || 'plan/bearings.md'}</p> : null}
      {!busy && note ? <p className="t-body-s c-2 dial-note" role="status"><Icon name="check" size={14} style={{ color: 'var(--st-done)' }} /> {note}</p> : null}
      {!busy && error ? <p className="dial-warn" role="alert"><Icon name="warn" size={14} /><span>Not changed · {error}</span></p> : null}
    </div>
  );
}
