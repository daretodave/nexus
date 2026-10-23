// One value row on a stack card (design 8.2, `.stk-val`): the label, the env names it becomes (a public name with an
// eye, "Ships to the browser"; a server name with a lock, "Server only"), the field (a MaskField for a secret, so the
// paste never reaches a DOM attribute; a plain mono input for an id or a URL), a one-line shape note that says what
// the value should look like, and Save. After a save the field clears; the row says where the value went.
import { Icon, MaskField, cx } from '../../../ui/index.js';
import { shortId } from './model.js';
import { destLabel } from '../../../../shared/stack/destinations.mjs';

const NOTE_CLASS = { 'typed-bad': 'is-bad', 'save-failed': 'is-bad', drift: 'is-warn', saved: 'is-saved', 'typed-ok': 'is-ok', saving: 'is-ok' };

export function EnvChips({ chips }) {
  return (
    <span className="stk-chips">
      {chips.map((c) => (
        <span key={c.name} className={cx('stk-chip', c.public && 'is-public')} title={c.title}>
          <Icon name={c.public ? 'eye' : 'lockOne'} size={11} />{c.name}
        </span>
      ))}
    </span>
  );
}

/**
 * row: model.valueRow. f: the field's ui state ({ paste, show, replacing }). readOnly: a contributor's view.
 * onPaste(text) -> true when the panel took it (paste-many).
 */
export default function ValueField({ svc, row, f = {}, set, onSave, onPaste, onResync, readOnly, asked = null }) {
  const editing = !row.saved || f.replacing || !!f.paste || row.phase === 'save-failed';
  const id = `stk-${svc}-${row.key}`;
  const paste = typeof f.paste === 'string' ? f.paste : '';
  const takePaste = (e) => {
    const text = e.clipboardData?.getData?.('text') || '';
    if (text.includes('\n') && onPaste?.(text)) e.preventDefault();
  };
  return (
    <div className={cx('stk-val', `is-${row.phase}`, asked && 'is-asked')} id={id}>
      {asked ? (
        <span className="stk-val-ask" role="note">
          <Icon name="key" size={12} />
          {asked.chunk ? <><b>{asked.chunk}</b> asked for <code>{asked.key}</code>.</> : <>Asked for <code>{asked.key}</code>.</>}
          {asked.to?.length ? <> Saving stores it in the vault and pushes it to {asked.to.map(destLabel).join(', ')}.</> : <> Saving stores it in the vault.</>}
        </span>
      ) : null}
      <span className="stk-val-l">
        <b>{row.label}</b>
        {!row.required ? <span className="c-3">optional</span> : null}
      </span>
      <EnvChips chips={row.chips} />
      <div className="stk-val-f" onPasteCapture={takePaste}>
        {readOnly || row.readOnly ? (
          <span className="stk-val-ro">{row.saved ? <><Icon name="check" size={12} />saved</> : <span className="c-3">{row.readOnlyNote || 'Set by the owner'}</span>}</span>
        ) : editing ? (
          row.secret ? (
            <MaskField value={paste} onChange={(v) => set({ paste: v, error: null })} show={!!f.show} onToggle={() => set({ show: !f.show })} label={`Paste the ${row.label.toLowerCase()}`} onEnter={() => row.canSave && onSave()} />
          ) : (
            <input className="field stk-plain" type="text" value={paste} onChange={(e) => set({ paste: e.target.value, error: null })} onKeyDown={(e) => { if (e.key === 'Enter' && row.canSave) onSave(); }} aria-label={`The ${row.label.toLowerCase()}`} placeholder="Paste it here" autoComplete="off" spellCheck={false} />
          )
        ) : (
          <span className="stk-val-ro is-set"><Icon name="check" size={12} />saved</span>
        )}
      </div>
      <span className="stk-val-a">
        {readOnly || row.readOnly ? null : editing ? (
          <>
            <button className="btn btn-s btn-primary" type="button" onClick={onSave} disabled={!row.canSave}>{row.phase === 'saving' ? 'Saving…' : 'Save'}</button>
            {row.saved && f.replacing ? <button className="btn btn-s btn-ghost" type="button" onClick={() => set({ replacing: false, paste: '', error: null })}>Cancel</button> : null}
          </>
        ) : row.phase === 'drift' ? (
          <button className="btn btn-s" type="button" onClick={onResync}><Icon name="refresh" size={14} />Re-sync</button>
        ) : (
          <button className="btn btn-s btn-ghost" type="button" onClick={() => set({ replacing: true })}>Replace</button>
        )}
      </span>
      {row.note || row.alias || row.found || (row.where && !row.saved) ? (
        <span className={cx('stk-val-note', NOTE_CLASS[row.phase])} role={row.phase === 'typed-bad' || row.phase === 'save-failed' ? 'alert' : undefined}>
          {row.phase === 'saved' ? <Icon name="check" size={12} /> : null}
          {row.note}
          {row.alias ? <span className="c-2"> {row.alias}</span> : null}
          {row.found ? <span className="c-2"> Found by Check it: <code>{shortId(row.found)}</code></span> : null}
          {row.where && !row.saved ? <a className="stk-where" href={row.where.href} target="_blank" rel="noreferrer">{row.where.label}<Icon name="external" size={11} /></a> : null}
        </span>
      ) : null}
    </div>
  );
}
