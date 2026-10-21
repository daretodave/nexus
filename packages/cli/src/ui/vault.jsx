// The vault kit (VaultKit board; nexus.css section 20): .key-orb, .key-badge, .mask and .mask-field, the vault table's
// .vt-row with its .dd dots, the key card (.tug.is-secret: an oversight tug with no default and no countdown), its
// saved (.secret-set), partial (.secret-set.is-partial) and skipped (.secret-wait) lines, the .env rows, the audit log
// and the "Where values go" card. Names and status only: a value lives in a .mask-field's own state until Save sends
// it, and every stored value draws as the same eight dots.
import { useState } from 'react';
import { Icon } from './icons.jsx';
import { cx } from './controls.jsx';

/** The eight dots of a stored value, whatever its length. */
export const MASK_DOTS = '•'.repeat(8);

/** .key-orb: the key in a ring. state: '' (asking, amber), 'set' (green check), 'quiet'. small: the inbox row's. */
export function KeyOrb({ state = '', small, icon }) {
  return (
    <span className={cx('key-orb', small && 'key-orb-s', state === 'set' && 'is-set', state === 'quiet' && 'is-quiet')}>
      <Icon name={icon || (state === 'set' ? 'check' : 'key')} />
    </span>
  );
}

/** .key-badge: the name a chunk waits on, on the plan board. */
export function KeyBadge({ children, style, title = 'Waiting on a secret: nexus agents see the name, never the value' }) {
  return <span className="key-badge" title={title} style={style}><Icon name="key" />{children}</span>;
}

/** The key that stands in for a chunk's moon while it needs a secret. */
export function KeyMoon() {
  return <svg className="moon" viewBox="0 0 24 24" aria-hidden="true" style={{ strokeWidth: 2.2 }}><path d="M14.5 4a5.5 5.5 0 1 1-4.9 8L4 17.6V20h3v-2h2v-2h2l1.1-1.1A5.5 5.5 0 0 1 14.5 4zM16 8.2v.01" /></svg>;
}

/** .vault-note: "nexus agents see names, not values." */
export function VaultNote({ children = 'nexus agents see names, not values.' }) {
  return <span className="vault-note"><Icon name="key" />{children}</span>;
}

/** .key-note: a lock and a line. */
export function KeyNote({ children }) {
  return <span className="key-note"><Icon name="lockOne" />{children}</span>;
}

/**
 * .mask-field: a password input behind a key glyph. `onToggle` adds Show / Hide (only for your own paste, before it
 * is saved). The browser is told not to keep or autocomplete it.
 */
export function MaskField({ value, onChange, show = false, onToggle, label, placeholder = 'Paste the value', autoFocus, onEnter }) {
  return (
    <div className="mask-field">
      <Icon name="key" />
      <input
        type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" spellCheck={false}
        aria-label={label} placeholder={placeholder} autoFocus={autoFocus} name="nexus-vault-value" data-lpignore="true" data-1p-ignore="true"
        onKeyDown={onEnter ? (e) => { if (e.key === 'Enter') onEnter(); } : undefined}
      />
      {onToggle ? <button className="btn btn-ghost" type="button" onClick={onToggle} aria-pressed={show ? 'true' : 'false'}>{show ? 'Hide' : 'Show'}</button> : null}
    </div>
  );
}

/** A bare .check.check-s box (the import's and the key card's ticks). */
export function TickBox({ checked, onChange, label, disabled, title }) {
  return (
    <label className={cx('check', 'check-s')} title={title}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} aria-label={label} />
      <Icon name="check" className="tick" />
    </label>
  );
}

/** A .check.check-s with its title (the key card's "Store it" and the add form's places). */
export function TickLabel({ checked, onChange, children, disabled, title }) {
  return (
    <label className="check check-s" title={title}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      <Icon name="check" className="tick" />
      <span className="check-text"><span className="check-title">{children}</span></span>
    </label>
  );
}

/**
 * The key card. card: { key, name, chunk, who, src, why, where, whereLabel, dests: [{ d, label, locked }] }.
 * phase: pending | saved | partial | skipped. result: the store's answer, as model.savedPlaces reads it.
 * onSave(value, ticked) -> Promise (the parent sends it and moves the phase); the paste is cleared once it resolves.
 */
export function KeyCard({ card, phase = 'pending', saved, busy, error, onSave, onSkip, onUnskip, onChange, onRetry }) {
  const [paste, setPaste] = useState('');
  const [show, setShow] = useState(false);
  // Every place starts ticked, including ones the manifest names after the card first draws; unticking is remembered.
  const [off, setOff] = useState({});
  const chosen = card.dests.filter((x) => x.locked || !off[x.d]).map((x) => x.d);
  const save = async () => {
    if (!paste || !chosen.length || busy) return;
    const ok = await onSave(paste, chosen);
    if (ok) { setPaste(''); setShow(false); }
  };
  if (phase === 'saved' || phase === 'partial') {
    const partial = phase === 'partial';
    return (
      <div className={cx('secret-set', partial && 'is-partial')} role="status">
        <KeyOrb state={partial ? '' : 'set'} />
        <span className="t">
          <b>{card.name}</b> set · {saved?.places || 'local'}
          {partial ? <>. <span style={{ color: 'var(--st-blocked)', fontWeight: 600 }}>{saved.failed.map((f) => f.label).join(', ')} refused it:</span> {saved.failed.map((f) => f.error).filter(Boolean).join('; ') || 'the push did not land.'}</> : null}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: partial ? 6 : 8 }}>
          {partial
            ? <button className="btn btn-s" type="button" onClick={onRetry} disabled={busy}><Icon name="refresh" size={14} />Retry {saved.failed.map((f) => f.label).join(', ')}</button>
            : card.chunk ? <span className="relit"><span className="chunk-id">{card.chunk}</span> relit</span> : null}
          <button className="btn btn-ghost btn-s" type="button" onClick={onChange}>Change</button>
        </span>
      </div>
    );
  }
  if (phase === 'skipped') {
    return (
      <div className="secret-wait">
        <KeyOrb state="quiet" />
        <span><b>{card.chunk} skipped for now.</b> It shows as needs secret on the plan board until <code>{card.name}</code> has a value. <button className="btn btn-ghost btn-s" type="button" onClick={onUnskip} style={{ marginLeft: 4 }}>Add it now</button></span>
      </div>
    );
  }
  return (
    <div className="tug is-pending is-secret" role="group" aria-label={`Secret requested: ${card.name}`}>
      <div className="tug-head">
        <KeyOrb />
        <span><span className="tug-who">{card.who}</span> {card.src ? <span className="tug-src">· {card.src}</span> : null}</span>
        <span className="tug-timer">needs a value</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="key-name">{card.name}</span>
        <p className="key-why">{card.why}</p>
        {card.where ? (
          <a className="key-where" href={card.where} target="_blank" rel="noreferrer">
            Where to get this<Icon name="external" size={14} />{card.whereLabel ? <span className="d">{card.whereLabel}</span> : null}
          </a>
        ) : null}
      </div>
      <MaskField value={paste} onChange={setPaste} show={show} onToggle={() => setShow((v) => !v)} label={`Paste the value of ${card.name}`} onEnter={save} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="t-label c-2">Store it</span>
        <div className="dests">
          {card.dests.map((x) => (
            <TickLabel key={x.d} checked={x.locked || !off[x.d]} disabled={x.locked} title={x.locked ? 'The vault keeps every value; pushes read it from there.' : undefined} onChange={(on) => setOff((t) => ({ ...t, [x.d]: !on }))}>{x.label}</TickLabel>
          ))}
        </div>
      </div>
      <KeyNote>Agents only ever see the name. The value goes from this field to the places you tick.</KeyNote>
      {error ? <span className="t-body-s" role="alert" style={{ color: 'var(--st-blocked)' }}>{error}</span> : null}
      <div className="tug-foot" style={{ justifyContent: 'flex-start' }}>
        <button className="btn btn-primary btn-s" type="button" onClick={save} disabled={!paste || !chosen.length || busy}><Icon name="check" size={14} />Save and resume chunk</button>
        {card.chunk ? <button className="btn btn-ghost btn-s" type="button" onClick={onSkip}>Skip {card.chunk} for now</button> : null}
      </div>
    </div>
  );
}

/** The audit log: rows from model.auditRows. */
export function AuditLog({ rows }) {
  return (
    <div className="audit">
      {rows.map((a) => (
        <div key={a.key} className={a.cls}>
          <span className="w">{a.w}</span>
          <span className={a.pt} />
          <span><span className="verb">{a.verb}</span> <b>{a.name}</b> {a.rest}</span>
        </div>
      ))}
    </div>
  );
}

/** .env-file: the file being imported, its line, and an optional action. */
export function EnvFile({ name, line, action }) {
  return (
    <div className="env-file">
      <Icon name="fileOne" style={{ color: 'var(--accent)' }} />
      <span className="t"><b>{name}</b><span>{line}</span></span>
      {action || null}
    </div>
  );
}
