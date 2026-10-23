// The stack panel's own state (design 4.1 `ui`): each field's paste (held here until Save sends it, then dropped),
// what is busy, the last answers, the plans fetched, the open card, and the Check it re-poll while a zone is pending.
// Writes go through server.stackSave, stackCheck, stackApply, stackPick and stackTick; nothing here keeps a value
// past its Save, and nothing touches browser storage.
import { useCallback, useEffect, useRef, useState } from 'react';
import { server, useStack } from '../../../data/index.js';
import { SERVICES, saveBody, valueOf, checkShape, matchPaste } from './model.js';
import { recipeOfName, destLabel } from '../../../../shared/stack/moves.mjs';

const REPOLL_S = 30;
const REPOLL_MAX_MS = 30 * 60 * 1000;

/**
 * The data and the panel state, shared by the panel and the rail. `skip`: the panel is closed (no polling). `ask`: a
 * secret request's card to open ({ service, key: the env name, chunk, to }, from the Vault's URL); `onAnswered` runs
 * once its value is saved.
 */
export function useStackPanel({ skip = false, toast, ask = null, onAnswered } = {}) {
  const res = useStack(skip ? undefined : 10000, { skip });
  const ui = useStackUi({ stack: res.data, reload: res.reload, toast, ask, onAnswered });
  return { res, stack: res.data, ui };
}

/** The recipe key an asked env name is saved under on its service's card (this repo's names first), or null. */
export function askedKey(ask, stack) {
  if (!ask || !SERVICES[ask.service]) return null;
  for (const v of SERVICES[ask.service].values) {
    if ((stack?.values?.[`${ask.service}.${v.key}`]?.names || []).includes(ask.key)) return v.key;
  }
  const hit = recipeOfName(ask.key);
  return hit && hit.service === ask.service ? hit.key : null;
}

export function useStackUi({ stack, reload = () => {}, toast = () => {}, ask: asked = null, onAnswered } = {}) {
  // The open request (Oversight's Add value): kept until its value is saved here, then let go.
  const [ask, setAsk] = useState(asked);
  useEffect(() => { setAsk(asked); }, [asked]);
  const askKey = askedKey(ask, stack);
  const [fields, setFields] = useState({});
  const [checks, setChecks] = useState({});
  const [plans, setPlans] = useState({});
  // Cards the person opened or closed by hand (svc -> bool); any other card is open only while it holds the next action.
  const [opened, setOpened] = useState({});
  const setOpen = (svc, on) => setOpened((o) => ({ ...o, [svc]: on }));
  const [offer, setOffer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [repoll, setRepoll] = useState({});
  const pending = useRef({});

  const field = (svc, key) => fields[`${svc}.${key}`] || {};
  const setField = (svc, key, patch) => setFields((f) => ({ ...f, [`${svc}.${key}`]: { ...(f[`${svc}.${key}`] || {}), ...patch } }));

  const save = useCallback(async (svc, key, value) => {
    const k = `${svc}.${key}`;
    const paste = value ?? fields[k]?.paste ?? '';
    if (!paste) return false;
    setField(svc, key, { busy: true, error: null });
    setOpen(svc, true);
    try {
      const answering = ask && ask.chunk && ask.service === svc && askKey === key ? ask : null;
      const r = await server.stackSave({ ...saveBody(svc, key, paste), ...(answering ? { request: { chunk: answering.chunk, to: answering.to || [] } } : {}) });
      setField(svc, key, { busy: false, paste: '', show: false, replacing: false, result: { pushed: r.pushed || [], notes: r.notes || [], failed: r.failed || [] } });
      if (r.failed?.length) toast({ kind: 'error', title: `${r.names?.join(', ')} saved in the vault`, body: r.failed.map((f) => `${f.label}: ${f.error}`).join(' ') });
      if (answering) {
        const bad = (r.pushed || []).filter((p) => !p.ok);
        toast(bad.length
          ? { kind: 'error', title: `${answering.key} is in the vault; ${bad.map((p) => destLabel(p.destination)).join(', ')} refused it`, body: bad.map((p) => p.error).filter(Boolean).join('; ') || 'Retry from the table with Sync.' }
          : { kind: 'success', title: `${answering.key} saved${answering.to?.length ? ` and pushed to ${answering.to.map(destLabel).join(', ')}` : ''}`, body: `${answering.chunk} is ready again; the next pick takes it.` });
        setAsk(null);
        onAnswered?.(answering);
      }
      reload();
      return true;
    } catch (e) {
      setField(svc, key, { busy: false, error: e.message });
      return false;
    }
  }, [fields, reload, toast, ask, askKey, onAnswered]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Re-sync: the vault's value written to the mirror files again (the server reads it; the browser never has it). */
  const resync = async (svc, key) => {
    setField(svc, key, { busy: true, error: null });
    try { await server.stackSave({ service: svc, key, resync: true }); setField(svc, key, { busy: false }); reload(); } catch (e) { setField(svc, key, { busy: false, error: e.message }); }
  };

  /** Check it: the unsaved pastes of this card that look right go in the body; the rest the server reads from the vault. */
  const check = useCallback(async (svc, { quiet = false } = {}) => {
    if (checks[svc]?.busy) return null;
    const values = {};
    for (const v of SERVICES[svc].values) {
      const p = fields[`${svc}.${v.key}`]?.paste;
      if (p && checkShape(v.shape, p).ok) values[v.key] = p;
    }
    setChecks((c) => ({ ...c, [svc]: { busy: true, error: null } }));
    if (!quiet) setOpen(svc, true);
    try {
      const r = await server.stackCheck(svc, { values });
      setChecks((c) => ({ ...c, [svc]: { busy: false, at: Date.now() } }));
      // The ids a check finds are not secret: fill the ones not saved yet, so the card moves on by itself.
      if (r.ok && r.fill) {
        for (const [key, val] of Object.entries(r.fill)) {
          const v = valueOf(svc, key);
          if (v && v.fill === 'check' && !stack?.values?.[`${svc}.${key}`]?.saved) await server.stackSave(saveBody(svc, key, val)).catch(() => null);
        }
      }
      reload();
      return r;
    } catch (e) {
      setChecks((c) => ({ ...c, [svc]: { busy: false, error: e.message } }));
      if (!quiet && e.status !== 429) toast({ kind: 'error', title: `${SERVICES[svc].name} was not checked`, body: e.message });
      return null;
    }
  }, [checks, fields, stack, reload, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const plan = useCallback(async (action) => {
    setPlans((p) => ({ ...p, [action]: { ...(p[action] || {}), busy: true, error: null, result: null } }));
    try {
      const r = await server.stackApply(action, {});
      setPlans((p) => ({ ...p, [action]: { busy: false, plan: r.ok ? r.plan : null, error: r.ok ? null : r.reason, replace: [] } }));
    } catch (e) {
      setPlans((p) => ({ ...p, [action]: { busy: false, error: e.message } }));
    }
  }, []);

  const confirm = useCallback(async (action) => {
    const cur = plans[action] || {};
    setPlans((p) => ({ ...p, [action]: { ...cur, busy: true, error: null } }));
    try {
      const r = await server.stackApply(action, { confirm: true, replace: cur.replace || [] });
      setPlans((p) => ({ ...p, [action]: { busy: false, plan: null, result: r, error: r.ok ? null : r.reason } }));
      reload();
    } catch (e) {
      setPlans((p) => ({ ...p, [action]: { ...cur, busy: false, error: e.message, plan: e.status === 409 ? null : cur.plan } }));
    }
  }, [plans, reload]);

  const toggleReplace = (action, key, on) => setPlans((p) => {
    const cur = p[action] || {};
    const set = new Set(cur.replace || []);
    if (on) set.add(key); else set.delete(key);
    return { ...p, [action]: { ...cur, replace: [...set] } };
  });

  const run = async (fn, fail) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast({ kind: 'error', title: fail, body: e.message }); } finally { setBusy(false); }
  };
  const pick = (body) => run(async () => { await server.stackPick(body); reload(); }, 'The stack did not save that');
  const tick = (step, on) => run(async () => { await server.stackTick({ step, on }); reload(); }, 'The tick did not save');

  /** Paste-many: a paste of several KEY=value lines into a Supabase field becomes an offer to fill them in. */
  const pasted = (svc, text) => {
    if (svc !== 'supabase') return false;
    const m = matchPaste(text);
    if (m.length < 2) return false;
    setOffer({ svc, matches: m });
    return true;
  };
  const fill = () => {
    if (!offer) return;
    for (const { key, value } of offer.matches) setField(offer.svc, key, { paste: value, error: null, replacing: true });
    setOffer(null);
  };
  const saveAll = async (svc) => {
    for (const v of SERVICES[svc].values) {
      const p = fields[`${svc}.${v.key}`]?.paste;
      if (p && checkShape(v.shape, p).ok) await save(svc, v.key, p); // eslint-disable-line no-await-in-loop
    }
  };

  /** Go to the next action: open its card, scroll to it, and start the action's plan or the check it names. */
  const go = (next) => {
    if (!next?.service) return;
    setOpen(next.service, true);
    setTimeout(() => {
      const el = document.getElementById(next.key ? `stk-${next.service}-${next.key}` : next.action ? `stk-act-${next.action}` : `stk-${next.service}`);
      el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      const target = el?.querySelector?.('input:not([disabled]), button.btn-primary');
      target?.focus?.({ preventScroll: true });
    }, 60);
    if (next.action) plan(next.action);
    if (next.check) check(next.check);
  };

  // Check it again every 30 s while the zone is pending (or Vercel waits on the records), only while the panel is
  // open, and for 30 minutes at most. The countdown shows on the card.
  const cf = stack?.checks?.cloudflare;
  const waitingZone = !!(cf?.ok && cf?.facts?.zone && !cf?.facts?.active);
  const waitingLive = !!(stack?.actions?.['cloudflare.dns']?.ok && !stack?.checks?.vercel?.facts?.domainOk);
  const checkRef = useRef(check);
  checkRef.current = check;
  useEffect(() => {
    const want = { cloudflare: waitingZone, vercel: waitingLive };
    const left = {};
    const t = setInterval(() => {
      const show = {};
      for (const [svc, on] of Object.entries(want)) {
        if (!on) { delete pending.current[svc]; continue; }
        pending.current[svc] ||= Date.now();
        if (Date.now() - pending.current[svc] > REPOLL_MAX_MS) continue;
        left[svc] = (left[svc] ?? REPOLL_S) - 1;
        if (left[svc] <= 0) { left[svc] = REPOLL_S; checkRef.current(svc, { quiet: true }); }
        show[svc] = left[svc];
      }
      setRepoll(show);
    }, 1000);
    return () => clearInterval(t);
  }, [waitingZone, waitingLive]);

  return {
    field, setField, save, saveAll, resync, check, checks, plan, confirm, plans, toggleReplace, pick, tick, busy,
    opened, setOpen, go, offer, setOffer, pasted, fill, repoll, ask: ask ? { ...ask, valueKey: askKey } : null,
  };
}
