// Set up a stack (design 8.1): pick what the app runs on, say the domain and the app, see where values will be
// written, then one card per service in the trinity's order, the one holding the next action open and lit. The picker
// scales to the whole registry (21 services in 0.5.2): grouped, searchable, with presets, and folded to a line of
// chips once something is picked. The agent guide line says what sessions read about the stack (docs/stack.md). In the
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
import { SERVICES, ORDER, PRESETS, progress, nextAction, openCard, checkShape, searchServices, groupedServices, nameClashes, joinList } from './model.js';
import { FRAMEWORKS } from '../../../../shared/stack/frameworks.mjs';
import { renderGuide } from '../../../../shared/stack/guide.mjs';
import '../../../styles/stack.css';

export { useStackPanel };

/** A service's monogram orb: its own colours for the first three, its group's for the rest. */
export function Orb({ id, small = false }) {
  const svc = SERVICES[id];
  return <span className={cx('stk-orb', `g-${svc.group}`, `is-${id}`, small && 'is-small')} aria-hidden="true">{svc.mono}</span>;
}

function Tile({ id, on, disabled, onToggle }) {
  const s = SERVICES[id];
  return (
    <button type="button" className={cx('stk-tile', on && 'is-on')} aria-pressed={on ? 'true' : 'false'} disabled={disabled} onClick={onToggle}>
      <Orb id={id} />
      <span className="stk-tile-t"><b>{s.name}</b><span>{s.role}</span></span>
      <span className="stk-tile-tick" aria-hidden="true">{on ? <Icon name="check" size={12} /> : null}</span>
    </button>
  );
}

/**
 * The picker: presets, then (open) a search box over the grouped tiles, or (folded, once something is picked) one
 * line of the picked services with Add or remove. A name two picked services both write gets a plain note.
 */
export function Picker({ stack, ui, readOnly, startOpen }) {
  const picked = stack.picked || [];
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(startOpen ?? !picked.length);
  const set = (ids) => ui.pick({ picked: ids });
  const toggle = (id) => set(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  const groups = groupedServices(searchServices(query));
  const clashes = nameClashes(picked);
  const shown = open || !picked.length;
  return (
    <div className="stk-pick-wrap">
      <div className="stk-presets" role="group" aria-label="Presets">
        {PRESETS.map((p) => {
          const on = p.picked.length === picked.length && p.picked.every((x) => picked.includes(x));
          return <button key={p.id} type="button" className={cx('stk-preset', on && 'is-on')} onClick={() => set(p.picked)} disabled={readOnly || ui.busy} aria-pressed={on ? 'true' : 'false'} title={joinList(p.picked.map((x) => SERVICES[x].name))}>{on ? <Icon name="check" size={12} /> : null}{p.label}</button>;
        })}
      </div>
      {shown ? (
        <>
          <div className="stk-pick-bar">
            <span className="stk-search">
              <input className="field stk-search-f" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search services: redis, email, payments" aria-label="Search services" autoComplete="off" spellCheck={false} />
            </span>
            <span className="t-body-s c-3">{picked.length ? `${picked.length} picked` : `${ORDER.length} services`}</span>
            {picked.length ? <button className="btn btn-s btn-ghost" type="button" onClick={() => { setOpen(false); setQuery(''); }}>Done</button> : null}
          </div>
          {groups.map((g) => (
            <section key={g.id} className="stk-group" aria-label={g.label}>
              <span className="t-caps c-2 stk-group-h">{g.label}</span>
              <div className="stk-pick" role="group" aria-label={g.label}>
                {g.services.map((id) => <Tile key={id} id={id} on={picked.includes(id)} disabled={readOnly || ui.busy} onToggle={() => toggle(id)} />)}
              </div>
            </section>
          ))}
          {!groups.length ? <span className="t-body-s c-3 stk-pick-none">No service matches that. Each one is a recipe in the registry, so a missing one can be added.</span> : null}
        </>
      ) : (
        <div className="stk-picked" role="group" aria-label="What your app runs on">
          <span className="t-label c-2">Runs on</span>
          <span className="stk-picked-list">
            {ORDER.filter((id) => picked.includes(id)).map((id) => <span key={id} className="stk-picked-chip"><Orb id={id} small />{SERVICES[id].name}</span>)}
          </span>
          <button className="btn btn-s btn-ghost" type="button" onClick={() => setOpen(true)} disabled={readOnly}>Add or remove</button>
        </div>
      )}
      {clashes.map((c) => (
        <span key={c.name} className="t-body-s stk-clash" role="note"><Icon name="warn" size={12} />{joinList(c.services.map((x) => SERVICES[x].name))} both write <code>{c.name}</code>. The last one saved wins; pick one to own it.</span>
      ))}
    </div>
  );
}

function Context({ stack, ui, readOnly }) {
  const [domain, setDomain] = useState(stack.inputs?.domain || '');
  const [changing, setChanging] = useState(false);
  useEffect(() => { setDomain(stack.inputs?.domain || ''); }, [stack.inputs?.domain]);
  const needsDomain = stack.picked.some((id) => id === 'cloudflare' || id === 'vercel' || SERVICES[id]?.inputs?.some((i) => i.key === 'domain'));
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

/** The agent guide: where sessions read the stack (docs/stack.md, pointed at from agents.md), with a preview. */
export function Guide({ stack }) {
  const g = stack.guide || { path: 'docs/stack.md', exists: false, pointer: null };
  const names = Object.fromEntries(Object.entries(stack.values || {}).map(([k, v]) => [k, v?.names || []]));
  const text = renderGuide({ picked: stack.picked || [], app: stack.app || {}, names });
  return (
    <details className="stk-guide">
      <summary>
        <span className="t-label c-2">For agents</span>
        <span className="t-body-s">
          {g.exists ? <>Sessions read <code>{g.path}</code>{g.pointer ? <>, which {g.pointer} points to</> : null}</> : <>nexus writes <code>{g.path}</code> when you pick or save</>}
          : each service&apos;s names, how code reads them, and how to run its CLI with vault values. Names only, never a value.
        </span>
        <span className="btn btn-s btn-ghost stk-guide-open">Preview</span>
      </summary>
      <pre className="stk-guide-pre">{text}</pre>
    </details>
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
          {!compact ? <Guide stack={stack} /> : null}
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
