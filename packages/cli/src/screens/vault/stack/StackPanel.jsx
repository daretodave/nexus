// Set up a stack (design 8.1): pick what the app runs on, say the domain and the app, see where values will be
// written, then one card per service in the trinity's order, the one holding the next action open and lit. In the
// Vault it sits where the import does, with the rail (StackRail) in the right column; in onboarding (`compact`) the
// rail folds to one line above the cards and the gotchas hide.
//
// Data: GET /api/stack (useStack, through useStackPanel); writes: /api/stack/pick, save, check, apply, tick.
import { useEffect, useState } from 'react';
import { Icon, KeyNote, TickLabel, cx } from '../../../ui/index.js';
import VaultSetup from '../VaultSetup.jsx';
import StackCard from './StackCard.jsx';
import StackRail from './StackRail.jsx';
import { useStackPanel } from './useStack.js';
import { SERVICES, ORDER, PRESETS, progress, nextAction, openCard, checkShape } from './model.js';
import { FRAMEWORKS } from '../../../../shared/stack/frameworks.mjs';
import '../../../styles/stack.css';

export { useStackPanel };

function Picker({ stack, ui, readOnly }) {
  const picked = stack.picked || [];
  const set = (ids) => ui.pick({ picked: ids });
  return (
    <div className="stk-pick-wrap">
      <div className="stk-presets" role="group" aria-label="Presets">
        {PRESETS.map((p) => {
          const on = p.picked.length === picked.length && p.picked.every((x) => picked.includes(x));
          return <button key={p.id} type="button" className={cx('stk-preset', on && 'is-on')} onClick={() => set(p.picked)} disabled={readOnly || ui.busy} aria-pressed={on ? 'true' : 'false'}>{on ? <Icon name="check" size={12} /> : null}{p.label}</button>;
        })}
      </div>
      <div className="stk-pick" role="group" aria-label="What your app runs on">
        {ORDER.map((id) => {
          const s = SERVICES[id];
          const on = picked.includes(id);
          return (
            <button key={id} type="button" className={cx('stk-tile', on && 'is-on')} aria-pressed={on ? 'true' : 'false'} disabled={readOnly || ui.busy} onClick={() => set(on ? picked.filter((x) => x !== id) : [...picked, id])}>
              <span className={cx('stk-orb', `is-${id}`)} aria-hidden="true">{s.mono}</span>
              <span className="stk-tile-t"><b>{s.name}</b><span>{s.role}</span></span>
              <span className="stk-tile-tick" aria-hidden="true">{on ? <Icon name="check" size={12} /> : null}</span>
            </button>
          );
        })}
        <span className="stk-tile is-soon" aria-hidden="true"><span className="stk-tile-t"><b>More services soon</b><span>Each one is a recipe in the registry.</span></span></span>
      </div>
    </div>
  );
}

function Context({ stack, ui, readOnly }) {
  const [domain, setDomain] = useState(stack.inputs?.domain || '');
  const [changing, setChanging] = useState(false);
  useEffect(() => { setDomain(stack.inputs?.domain || ''); }, [stack.inputs?.domain]);
  const needsDomain = stack.picked.includes('cloudflare') || stack.picked.includes('vercel');
  const shape = domain.trim() ? checkShape('hostname', domain) : null;
  const saveDomain = () => { if ((shape?.ok || !domain.trim()) && domain !== (stack.inputs?.domain || '')) ui.pick({ inputs: { domain } }); };
  const app = stack.app || { dir: '.', framework: 'next', label: 'Next.js' };
  const apps = stack.apps || [];
  return (
    <div className="stk-ctx">
      {needsDomain ? (
        <label className="stk-ctx-row">
          <span className="t-label c-2">Domain</span>
          <input className="field stk-plain" type="text" value={domain} placeholder="example.com" aria-label="Your domain" disabled={readOnly}
            onChange={(e) => setDomain(e.target.value)} onBlur={saveDomain} onKeyDown={(e) => { if (e.key === 'Enter') saveDomain(); }} autoComplete="off" spellCheck={false} />
          {shape && !shape.ok ? <span className="stk-val-note is-bad">{shape.why}</span> : null}
        </label>
      ) : null}
      <div className="stk-ctx-row">
        <span className="t-label c-2">App</span>
        {stack.fresh && !changing ? (
          <span className="t-body-s">No app yet. Building with:{' '}
            <select className="field stk-select" value={app.framework} disabled={readOnly} onChange={(e) => ui.pick({ app: { dir: '.', framework: e.target.value } })} aria-label="Framework">
              {FRAMEWORKS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </span>
        ) : changing ? (
          <span className="stk-ctx-change">
            {apps.length > 1 ? (
              <select className="field stk-select" value={app.dir} onChange={(e) => { const a = apps.find((x) => x.dir === e.target.value); ui.pick({ app: { dir: a.dir, framework: a.framework } }); }} aria-label="Which app">
                {apps.map((a) => <option key={a.dir} value={a.dir}>{a.dir === '.' ? 'the repo root' : a.dir} ({a.label})</option>)}
              </select>
            ) : null}
            <select className="field stk-select" value={app.framework} onChange={(e) => ui.pick({ app: { dir: app.dir, framework: e.target.value } })} aria-label="Framework">
              {FRAMEWORKS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            <button className="btn btn-s btn-ghost" type="button" onClick={() => setChanging(false)}>Done</button>
          </span>
        ) : (
          <span className="t-body-s">{app.label} in <code>{app.dir === '.' ? 'the repo root' : app.dir}</code>{app.prefix ? <span className="c-3"> · public names start {app.prefix}</span> : <span className="c-3"> · no public prefix</span>} <button className="btn btn-s btn-ghost" type="button" onClick={() => setChanging(true)} disabled={readOnly}>Change</button></span>
        )}
      </div>
    </div>
  );
}

function Targets({ stack, ui, compact, readOnly }) {
  const [show, setShow] = useState(!compact);
  const ts = stack.targets || [];
  const on = ts.filter((t) => t.on && !t.disabled).map((t) => t.label);
  if (!show) {
    return (
      <div className="stk-targets is-folded">
        <span className="t-body-s c-2">Writes to {on.join(', ')}.</span>
        <button className="btn btn-s btn-ghost" type="button" onClick={() => setShow(true)}>Change</button>
      </div>
    );
  }
  return (
    <div className="stk-targets">
      <span className="t-label c-2">Writes to</span>
      {ts.map((t) => (
        <TickLabel key={t.id} checked={t.on} disabled={readOnly || t.locked || t.disabled} title={t.locked ? 'The vault keeps every value; pushes read it from there.' : t.why} onChange={(v) => ui.pick({ targets: { [t.id]: v } })}>{t.label}</TickLabel>
      ))}
      {stack.appNote ? <span className="t-body-s c-3 stk-target-note">{stack.appNote}</span> : null}
    </div>
  );
}

/**
 * sp: useStackPanel's { res, stack, ui } when the parent shares it with the rail; otherwise the panel has its own.
 */
export default function StackPanel({ sp: shared, compact = false, onClose, onOpenVault, toast = () => {} }) {
  const own = useStackPanel({ skip: !!shared, toast });
  const { res, stack, ui } = shared || own;
  if (res.status === 'loading' && !stack) return <div className="stk-panel"><span className="t-body-s c-3">Reading the stack…</span></div>;
  if (!stack) return <div className="stk-panel"><span className="t-body-s" role="alert" style={{ color: 'var(--st-blocked)' }}>{res.error || 'GET /api/stack did not answer.'}</span></div>;
  if (stack.vaultState === 'missing') {
    return (
      <div className="stk-panel">
        <Head compact={compact} onClose={onClose} />
        <VaultSetup owner={!!stack.owner} envNames={0} reload={res.reload} toast={toast} />
      </div>
    );
  }
  const readOnly = !stack.owner;
  const prog = progress(stack);
  const next = nextAction(prog, stack);
  const nextSvc = openCard(stack, next);
  return (
    <div className={cx('stk-panel', compact && 'is-compact')}>
      <Head compact={compact} onClose={onClose} onOpenVault={onOpenVault} />
      {readOnly ? <KeyNote>The stack is the owner&apos;s to set up. Keep your own keys under Local keys.</KeyNote> : null}
      <Picker stack={stack} ui={ui} readOnly={readOnly} />
      {stack.picked.length ? (
        <>
          <Context stack={stack} ui={ui} readOnly={readOnly} />
          <Targets stack={stack} ui={ui} compact={compact} readOnly={readOnly} />
          {compact ? <StackRail stack={stack} ui={ui} compact /> : null}
          <div className="stk-cards">
            {ORDER.filter((id) => stack.picked.includes(id)).map((id) => <StackCard key={id} svc={id} stack={stack} ui={ui} isNext={id === nextSvc} compact={compact} readOnly={readOnly} />)}
          </div>
        </>
      ) : (
        <span className="t-body-s c-3">Pick a preset or the services your app uses. Each one gets a card.</span>
      )}
    </div>
  );
}

function Head({ compact, onClose, onOpenVault }) {
  return (
    <div className="stk-head">
      <div className="stk-head-t">
        <h2 className="t-title-s">Set up a stack</h2>
        <p className="t-body-s c-2">Pick what your app runs on. Each card says what to create, which permissions to give it, and what to paste. Values go to the vault and the files your app reads.</p>
      </div>
      {onClose ? <button className="btn btn-s btn-ghost" type="button" onClick={onClose}>Back to the table</button> : null}
      {compact && onOpenVault ? <button className="btn btn-s btn-ghost" type="button" onClick={onOpenVault}>Open in the vault<Icon name="arrowRight" size={12} /></button> : null}
    </div>
  );
}
