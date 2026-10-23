// One service's card (design 8.2, `.stk-card` on the `.tug` look): what it is for, the steps with links to the
// console page each one happens on, the token to create with exactly which permissions, the values to paste, Check it,
// the actions it can do for you, and what is good to know. Copy is plain and second person; nothing here says "fix".
import { useState } from 'react';
import { Icon, KeyNote, TickBox, cx } from '../../../ui/index.js';
import { server } from '../../../data/index.js';
import ValueField from './ValueField.jsx';
import {
  SERVICES, ACTIONS, CARD_CLASS, progress, nextAction, cardState, cardHead, stepStates, valueRow, fillTemplate, ctxOf, shortId, joinList,
} from './model.js';

/** A copy button for a plain, non-secret string (a nameserver, a redirect URL, the permission list, git push). */
export function CopyBtn({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); } catch { /* the browser said no */ }
  };
  return <button className="btn btn-ghost btn-s stk-copy" type="button" onClick={copy} aria-label={`${label}: ${text}`}><Icon name={done ? 'check' : 'copy'} size={12} />{done ? 'Copied' : label}</button>;
}

function StepGlyph({ state }) {
  if (state === 'done') return <span className="stk-glyph is-done"><Icon name="check" size={12} /></span>;
  if (state === 'waiting') return <span className="stk-glyph is-waiting" />;
  if (state === 'ready') return <span className="stk-glyph is-ready" />;
  return <span className="stk-glyph" />;
}

function Grant({ svc, ctx }) {
  const t = SERVICES[svc].token;
  if (!t) return null;
  const rows = t.grant.map((g) => ({ ...g, item: fillTemplate(g.item, ctx) }));
  const asText = [t.title, ...rows.map((g) => `${g.group} / ${g.item} / ${g.level}`), t.resources ? fillTemplate(t.resources, ctx) : ''].filter(Boolean).join('\n');
  return (
    <div className="stk-sec stk-grant">
      <div className="stk-sec-h">
        <span className="t-caps c-2">{t.optionalToken ? 'Optional token' : 'The token to create'}</span>
        <span className="tb-spacer" style={{ flex: 1 }} />
        <CopyBtn text={asText} label="Copy the list" />
        <a className="btn btn-s" href={t.create.href} target="_blank" rel="noreferrer">{t.create.label}<Icon name="external" size={12} /></a>
      </div>
      <b className="stk-grant-t">{t.title}</b>
      {t.start ? <span className="t-body-s c-2">{t.start}</span> : null}
      <div className="stk-grant-grid" role="table" aria-label="Permissions to give it">
        {rows.map((g) => (
          <div key={`${g.group}.${g.item}`} className="stk-grant-row" role="row" title={g.why}>
            <span role="cell" className="c-2">{g.group}</span>
            <span role="cell">{g.item}</span>
            <span role="cell"><span className={cx('stk-level', /Edit|All/.test(g.level) && 'is-edit')}>{g.level}</span></span>
            <span role="cell" className="stk-grant-why c-3">{g.why}</span>
          </div>
        ))}
      </div>
      {t.resources ? <span className="t-body-s">{fillTemplate(t.resources, ctx)}</span> : null}
      {t.scope ? <span className="t-body-s c-2">{t.scope}</span> : null}
      {(t.optional || []).map((o) => <span key={o.item} className="t-body-s c-3">Optional: {o.item}: {o.level} ({o.why})</span>)}
      {t.avoid ? <span className="t-body-s c-2">{t.avoid}</span> : null}
      {t.expiry ? <span className="t-body-s c-3">{t.expiry}</span> : null}
      {t.once ? <span className="t-body-s stk-once"><Icon name="warn" size={12} />{t.once}</span> : null}
    </div>
  );
}

function CheckRow({ svc, stack, ui, readOnly }) {
  const s = SERVICES[svc];
  const last = stack.checks?.[svc];
  const local = ui.checks[svc] || {};
  const facts = last?.facts || {};
  const waitingZone = svc === 'cloudflare' && facts.zone && !facts.active;
  const left = ui.repoll?.[svc];
  const pickProject = async (p) => {
    await server.stackSave({ service: 'vercel', key: 'projectId', value: p.id }).catch(() => null);
    if (facts.team) await server.stackSave({ service: 'vercel', key: 'teamId', value: facts.team }).catch(() => null);
    ui.check('vercel', { quiet: true });
  };
  const projectId = stack.values?.['vercel.projectId']?.saved ? last?.fill?.projectId : null;
  return (
    <div className="stk-sec stk-check">
      <div className="stk-check-row">
        <button className="btn btn-s" type="button" onClick={() => ui.check(svc)} disabled={readOnly || local.busy}><Icon name="bolt" size={14} />{local.busy ? 'Checking…' : s.check.label}</button>
        {last ? (
          <span className={cx('stk-check-line', last.ok ? 'is-ok' : 'is-bad')} role="status">
            {last.ok ? <Icon name="check" size={12} /> : <Icon name="warn" size={12} />}
            {last.ok ? last.summary : last.reason}
            {!last.ok ? <button className="btn btn-ghost btn-s" type="button" onClick={() => document.getElementById(`stk-${svc}-grant`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })}>What to change</button> : null}
          </span>
        ) : <span className="t-body-s c-3">{s.check.note}</span>}
      </div>
      {waitingZone && facts.nameServers?.length ? (
        <div className="stk-ns">
          <span className="t-body-s c-2">Set these at your registrar, in place of the nameservers there now:</span>
          {facts.nameServers.map((n) => <span key={n} className="stk-ns-row"><code>{n}</code><CopyBtn text={n} /></span>)}
          <span className="t-body-s c-3">{left ? `Waiting: the zone is pending. Checking again in ${left} s.` : 'Waiting: the zone is pending.'}</span>
        </div>
      ) : null}
      {svc === 'vercel' && facts.projects?.length ? (
        <div className="stk-projects" role="group" aria-label="Which project is this app?">
          <span className="t-body-s c-2">Which project is this app?</span>
          <span className="stk-proj-list">
            {facts.projects.map((p) => (
              <button key={p.id} type="button" className={cx('stk-proj', projectId === p.id && 'is-on')} onClick={() => pickProject(p)} disabled={readOnly} aria-pressed={projectId === p.id ? 'true' : 'false'}>
                {projectId === p.id ? <Icon name="check" size={12} /> : null}{p.name}<span className="c-3">{shortId(p.id)}</span>
              </button>
            ))}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function ActionRow({ action, stack, ui, ctx, readOnly, next }) {
  const a = ACTIONS[action];
  const p = ui.plans[action] || {};
  const last = stack.actions?.[action];
  return (
    <div className="stk-act" id={`stk-act-${action}`}>
      <div className="stk-act-h">
        <span className="stk-act-t">{last?.ok ? <Icon name="check" size={12} /> : null}{fillTemplate(a.label, ctx)}</span>
        <span className="tb-spacer" style={{ flex: 1 }} />
        {!p.plan ? <button className={cx('btn btn-s', !last?.ok && next && 'btn-primary')} type="button" onClick={() => ui.plan(action)} disabled={readOnly || p.busy}>{p.busy ? 'Reading…' : last?.ok ? 'Again' : 'See the plan'}</button> : null}
      </div>
      {p.plan ? (
        <div className="stk-plan">
          {p.plan.lines.map((l) => <span key={l} className="stk-plan-row"><Icon name="arrowRight" size={12} />{l}</span>)}
          {(p.plan.conflicts || []).map((c) => (
            <label key={c.key} className="stk-plan-row is-conflict">
              <TickBox checked={(p.replace || []).includes(c.key)} onChange={(on) => ui.toggleReplace(action, c.key, on)} label={`Replace ${c.type} ${c.name}`} />
              Replace {c.type} {c.name} ({c.content}{c.proxied ? ', proxied' : ''})?
            </label>
          ))}
          <span className="stk-plan-foot">
            <button className="btn btn-s btn-primary" type="button" onClick={() => ui.confirm(action)} disabled={p.busy || !p.plan.count}>{p.busy ? 'Working…' : p.plan.cta}</button>
            <button className="btn btn-s btn-ghost" type="button" onClick={() => ui.plan(action)} disabled={p.busy}>Read it again</button>
          </span>
        </div>
      ) : null}
      {p.error ? <span className="stk-check-line is-bad" role="alert"><Icon name="warn" size={12} />{p.error}</span> : null}
      {!p.error && (p.result?.ok || last) ? <span className={cx('stk-check-line', (p.result || last).ok ? 'is-ok' : 'is-bad')}>{(p.result || last).ok ? (p.result || last).summary : (p.result || last).reason}</span> : null}
    </div>
  );
}

export default function StackCard({ svc, stack, ui, isNext, compact, readOnly }) {
  const s = SERVICES[svc];
  const state = cardState(svc, stack);
  const ctx = ctxOf(stack);
  const steps = stepStates(svc, stack);
  const nextAct = nextAction(progress(stack), stack).action;
  const open = ui.opened?.[svc] ?? !!isNext;
  const toggle = () => ui.setOpen(svc, !open);
  const actions = s.actions.filter((a) => ACTIONS[a].needs.every((n) => stack.picked.includes(n)) && (a !== 'vercel.nameservers' || stack.checks?.vercel?.facts?.vercelRegistrar));
  const rows = s.values.map((v) => ({ v, row: valueRow(svc, v, stack, ui.field(svc, v.key)) }));
  const typedOk = rows.filter(({ row }) => row.phase === 'typed-ok').length;
  if (state === 'done' && !open) {
    return (
      <section id={`stk-${svc}`} className={cx('stk-card', CARD_CLASS[state])}>
        <button className="stk-card-head" type="button" onClick={toggle} aria-expanded="false">
          <span className={cx('stk-orb', `is-${svc}`)} aria-hidden="true">{s.mono}</span>
          <span className="stk-card-t"><b>{s.name}</b><span className="stk-done-names">{joinList(rows.filter(({ row }) => row.saved).flatMap(({ row }) => row.names).slice(0, 4))}</span></span>
          <span className="stk-card-state is-done"><Icon name="check" size={12} />Done</span>
          <span className="btn btn-ghost btn-s">Open</span>
        </button>
      </section>
    );
  }
  return (
    <section id={`stk-${svc}`} className={cx('stk-card', CARD_CLASS[state], isNext && 'is-next', open && 'is-open')} aria-label={`${s.name}: ${s.role}`}>
      <button className="stk-card-head" type="button" onClick={toggle} aria-expanded={open ? 'true' : 'false'}>
        <span className={cx('stk-orb', `is-${svc}`)} aria-hidden="true">{s.mono}</span>
        <span className="stk-card-t"><b>{s.name}</b><span>{s.role}</span></span>
        <span className={cx('stk-card-state', state === 'check-failed' && 'is-bad')}>{cardHead(svc, stack)}</span>
        <Icon name="chevronDown" size={14} className="stk-chev" />
      </button>
      {open ? (
        <div className="stk-card-body">
          <p className="t-body-s c-2 stk-why">{s.why}</p>
          <div className="stk-sec">
            <span className="t-caps c-2">Steps</span>
            <ol className="stk-steps">
              {s.steps.map((step, i) => {
                const st = steps[i].state;
                return (
                  <li key={step.id} className={cx('stk-step', `is-${st}`)} id={`stk-${svc}-${step.id}`}>
                    <StepGlyph state={st} />
                    <span className="stk-step-n">{i + 1}</span>
                    <span className="stk-step-t">
                      {fillTemplate(step.text, ctx)}
                      {step.note ? <span className="c-3"> {step.note}</span> : null}
                      {step.copy ? (
                        <span className="stk-copies">
                          {step.copy.map((c) => { const t = fillTemplate(c, ctx); return <span key={c} className="stk-ns-row"><code>{t}</code><CopyBtn text={t} /></span>; })}
                        </span>
                      ) : null}
                    </span>
                    <span className="stk-step-a">
                      {step.tick ? <TickBox checked={!!stack.ticks?.[step.id]} onChange={(on) => ui.tick(step.id, on)} label={`Done: ${fillTemplate(step.text, ctx)}`} disabled={readOnly} /> : null}
                      {step.link ? <a className="stk-link" href={step.link.href} target="_blank" rel="noreferrer">{step.link.label}<Icon name="external" size={12} /></a> : null}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
          <div id={`stk-${svc}-grant`}><Grant svc={svc} ctx={ctx} /></div>
          <div className="stk-sec">
            <div className="stk-sec-h">
              <span className="t-caps c-2">Values</span>
              <span className="tb-spacer" style={{ flex: 1 }} />
              {typedOk >= 2 && !readOnly ? <button className="btn btn-s btn-primary" type="button" onClick={() => ui.saveAll(svc)}>Save all {typedOk}</button> : null}
            </div>
            {ui.offer && ui.offer.svc === svc ? (
              <div className="stk-offer" role="status">
                <span>Looks like {ui.offer.matches.length} values from Supabase&apos;s Connect dialog. Fill them in?</span>
                <button className="btn btn-s btn-primary" type="button" onClick={ui.fill}>Fill</button>
                <button className="btn btn-s btn-ghost" type="button" onClick={() => ui.setOffer(null)}>No</button>
              </div>
            ) : null}
            <div className="stk-vals">
              {rows.map(({ v, row }) => (
                <ValueField key={v.key} svc={svc} row={row} f={ui.field(svc, v.key)} readOnly={readOnly}
                  set={(patch) => ui.setField(svc, v.key, patch)}
                  onSave={() => ui.save(svc, v.key)}
                  onPaste={(text) => ui.pasted(svc, text)}
                  onResync={() => ui.resync(svc, v.key)} />
              ))}
            </div>
          </div>
          <CheckRow svc={svc} stack={stack} ui={ui} readOnly={readOnly} />
          {actions.length ? (
            <div className="stk-sec">
              <span className="t-caps c-2">Do it for me</span>
              {actions.map((a) => <ActionRow key={a} action={a} stack={stack} ui={ui} ctx={ctx} readOnly={readOnly} next={nextAct === a} />)}
            </div>
          ) : null}
          {!compact ? (
            <details className="stk-gotchas">
              <summary className="t-caps c-2">Good to know</summary>
              <ul>{s.gotchas.map((g) => <li key={g} className="t-body-s c-2">{g}</li>)}</ul>
            </details>
          ) : null}
          <KeyNote>Agents only ever see the names. Values go from these fields to the places ticked above.</KeyNote>
        </div>
      ) : null}
    </section>
  );
}
