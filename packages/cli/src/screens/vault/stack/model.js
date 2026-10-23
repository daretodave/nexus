// The stack hand-off's view model (design section 4): pure functions over GET /api/stack and the cards' own state.
// Card states, value rows, the milestone progress and the one next action, the names still missing, the save body,
// and the paste-many matcher. Names and status only: no function here returns or keeps a stored value; a paste is the
// card's own until Save sends it.
import { SERVICES, ORDER, ACTIONS, MILESTONES, PRESETS, milestonesFor, fillTemplate, unfilledKeys, servicesIn, valueOf } from '../../../../shared/stack/recipes.mjs';
import { checkShape, normalize } from '../../../../shared/stack/shapes.mjs';
import { frameworkById, envNamesFor, isPublicName } from '../../../../shared/stack/frameworks.mjs';

export { SERVICES, ORDER, ACTIONS, PRESETS, fillTemplate, unfilledKeys, servicesIn, valueOf, envNamesFor, checkShape };

const EMPTY = { picked: [], inputs: {}, values: {}, names: {}, checks: {}, actions: {}, ticks: {}, targets: [] };
const s0 = (stack) => ({ ...EMPTY, ...(stack || {}) });

/** "a", "a and b", "a, b and c". */
export function joinList(xs) {
  const l = xs.filter(Boolean);
  if (l.length <= 1) return l[0] || '';
  return `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`;
}

/** A long id shortened for show: 3f2a…9c1b. Ids are not secret; this only keeps the line short. */
export const shortId = (id) => (typeof id === 'string' && id.length > 12 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id || '');

/** The context templates fill from: the domain, the project ref, the team, the project's name and the dev port. */
export function ctxOf(stack) {
  const s = s0(stack);
  const fw = frameworkById(s.app?.framework);
  const vf = s.checks.vercel?.facts || {};
  const project = (vf.projects || []).find((p) => p.id === s.checks.vercel?.fill?.projectId)?.name;
  return { domain: s.inputs.domain || '', ref: s.checks.supabase?.facts?.ref || '', team: '', project: project || '', port: fw.port };
}

/** A fact from the last check: 'cloudflare.active'. An array fact counts when it has items. */
export function fact(stack, ref) {
  const [svc, k] = String(ref).split('.');
  const v = s0(stack).checks[svc]?.facts?.[k];
  return Array.isArray(v) ? v.length > 0 : !!v;
}

export const saved = (stack, svc, key) => !!s0(stack).values[`${svc}.${key}`]?.saved;
export const requiredOf = (svc) => SERVICES[svc].values.filter((v) => v.required);
export const allRequiredSaved = (stack, svc) => requiredOf(svc).every((v) => saved(stack, svc, v.key));

/** Whether a milestone's `done` source holds. */
export function sourceDone(stack, src) {
  const s = s0(stack);
  const [kind, rest] = String(src).includes(':') ? String(src).split(':') : ['fact', src];
  if (kind === 'values') return allRequiredSaved(s, rest);
  if (kind === 'action') return !!s.actions[rest]?.ok;
  if (kind === 'tick') return !!s.ticks[rest];
  return fact(s, rest);
}

/**
 * The milestones and their states (design 4.4): done, waiting (its slow outside thing is false), ready (everything
 * it needs is done) or blocked (after an unfinished one). A waiting milestone does not hold up the ones after it.
 */
export function progress(stack) {
  const s = s0(stack);
  const ms = milestonesFor(s.picked);
  const ctx = ctxOf(s);
  const state = new Map();
  const out = [];
  for (const m of ms) {
    const done = sourceDone(s, m.done);
    const waitOk = !m.wait || fact(s, m.wait);
    const behind = m.after.filter((a) => !['done', 'waiting'].includes(state.get(a)));
    let st;
    if (done && waitOk) st = 'done';
    else if (done && !waitOk) st = 'waiting';
    else if (behind.length) st = 'blocked';
    else if (m.wait && !waitOk && m.id === 'live') st = 'waiting';
    else st = 'ready';
    state.set(m.id, st);
    const first = behind.length ? ms.find((x) => x.id === behind[0]) : null;
    out.push({ id: m.id, service: m.service, label: fillTemplate(m.label, ctx), state: st, ...(st === 'waiting' ? { note: `waiting on ${m.waitLabel || 'something outside'}` } : {}), ...(first ? { note: `after ${fillTemplate(first.label, ctx)}` } : {}) });
  }
  return { milestones: out, done: out.filter((m) => m.state === 'done').length, total: out.length };
}

const NEXT = {
  zone: { text: 'Add {domain} to Cloudflare and change the nameservers. It is the slow one, so start here.', service: 'cloudflare', step: 'cf.add' },
  db: { text: 'Paste your Supabase keys.', service: 'supabase', step: 'sb.connect' },
  host: { text: 'Paste a Vercel token and pick the project.', service: 'vercel', step: 'vc.token' },
  env: { text: 'Send the {n} Supabase values to Vercel.', service: 'vercel', step: 'vc.env', action: 'vercel.env', cta: 'Send to Vercel' },
  domain: { text: 'Add {domain} to your Vercel project.', service: 'vercel', step: 'vc.domain', action: 'vercel.domain', cta: 'Add the domain' },
  dns: { text: 'Point {domain} at Vercel.', service: 'cloudflare', step: 'cf.ns', action: 'cloudflare.dns', cta: 'Write the records' },
  auth: { text: 'Tell Supabase sign-in about https://{domain}.', service: 'supabase', step: 'sb.auth' },
  live: { text: 'Waiting for Vercel to see the records. Usually a few minutes.', service: 'vercel', step: 'vc.ready', check: 'vercel', cta: 'Check again' },
};

/** The one next action: the first ready milestone, else what is being waited on, else "set". */
export function nextAction(prog, stack) {
  const s = s0(stack);
  const ctx = ctxOf(s);
  const ready = prog.milestones.find((m) => m.state === 'ready');
  if (ready) {
    const n = NEXT[ready.id];
    const count = ['url', 'publishable', 'secret', 'dbUrl'].filter((k) => saved(s, 'supabase', k)).length;
    let text = fillTemplate(n.text, ctx).replace('{n}', String(count || 4));
    if (ready.id === 'auth' && !s.picked.includes('cloudflare')) text = 'Tell Supabase sign-in about your vercel.app URL.';
    if (ready.id === 'zone' && !s.inputs.domain) text = 'Type your domain, then add it to Cloudflare. It is the slow one, so start here.';
    return { kind: 'ready', milestone: ready.id, service: n.service, step: n.step, text, ...(n.action ? { action: n.action } : {}), ...(n.check ? { check: n.check } : {}), cta: n.cta || 'Show me' };
  }
  const waiting = prog.milestones.find((m) => m.state === 'waiting');
  if (waiting) {
    const m = MILESTONES.find((x) => x.id === waiting.id);
    return { kind: 'waiting', milestone: waiting.id, service: waiting.service, text: `Waiting on ${m?.waitLabel || 'the services'}. Nothing else to do right now.` };
  }
  if (prog.total && prog.done === prog.total) return { kind: 'done', text: 'Your stack is set. Push to main and Vercel builds it.', copy: 'git push origin main' };
  return { kind: 'none', text: 'Pick what your app runs on to start.' };
}

/** A card's state (design 4.2): not-started, in-progress, checked, check-failed, waiting, done. */
export function cardState(svc, stack) {
  const s = s0(stack);
  const prog = progress(s);
  const mine = prog.milestones.filter((m) => m.service === svc);
  const vals = SERVICES[svc].values;
  const nSaved = vals.filter((v) => saved(s, svc, v.key)).length;
  const check = s.checks[svc];
  if (mine.length && mine.every((m) => m.state === 'done')) return 'done';
  if (check && check.ok === false) return 'check-failed';
  if (allRequiredSaved(s, svc) && mine.some((m) => m.state === 'waiting')) return 'waiting';
  if (check?.ok && allRequiredSaved(s, svc)) return 'checked';
  if (nSaved || check || SERVICES[svc].steps.some((x) => s.ticks[x.id])) return 'in-progress';
  return 'not-started';
}

export const CARD_CLASS = { 'not-started': 'is-not-started', 'in-progress': 'is-progress', checked: 'is-checked', 'check-failed': 'is-failed', waiting: 'is-waiting', done: 'is-done' };

/** The head's right-hand line for a card. */
export function cardHead(svc, stack) {
  const s = s0(stack);
  const st = cardState(svc, s);
  const req = requiredOf(svc);
  const n = req.filter((v) => saved(s, svc, v.key)).length;
  if (st === 'not-started') return 'Start';
  if (st === 'done') return 'Done';
  if (st === 'waiting') return 'Waiting on nameservers';
  if (st === 'check-failed') return 'Check failed';
  if (st === 'checked') return 'Checked';
  return `${n} of ${req.length} saved`;
}

/** A step's state: done, waiting, ready (the first not done) or todo. */
export function stepStates(svc, stack) {
  const s = s0(stack);
  const out = [];
  let first = true;
  for (const step of SERVICES[svc].steps) {
    let done = false;
    let waiting = false;
    if (step.tick) done = !!s.ticks[step.id];
    if (step.auto) {
      done = fact(s, step.auto);
      if (step.id === 'cf.ns' && !done && fact(s, 'cloudflare.zone')) waiting = true;
      if (step.id === 'vc.ready' && !done && s.actions['cloudflare.dns']?.ok) waiting = true;
    }
    if (step.values) done = step.values.every((k) => saved(s, svc, k));
    if (step.action) done = !!s.actions[step.action]?.ok;
    const st = done ? 'done' : waiting ? 'waiting' : first ? 'ready' : 'todo';
    if (!done && !waiting) first = false;
    out.push({ id: step.id, state: st });
  }
  return out;
}

/** The env name chips for a value here: each name with whether it ships to the browser. */
export function envChips(names) {
  return (names || []).map((n) => ({ name: n, public: isPublicName(n), title: isPublicName(n) ? 'Ships to the browser' : 'Server only' }));
}

/** The write targets' short label for a saved line: '.env', 'apps/web/.env.local', 'Actions'. */
export function targetLabel(t) {
  if (!t) return '';
  if (t.id === 'vault') return /keychain/.test(t.label) ? 'the keychain' : '.env';
  if (t.id === 'github-actions') return 'Actions';
  if (t.id === 'vercel') return 'Vercel';
  return t.label;
}

/** "Written to .env, apps/web/.env.local and Actions": where a saved value's names are, by name only. */
export function writtenLine(names, stack, pushed = []) {
  const s = s0(stack);
  const places = [];
  const vault = s.targets.find((t) => t.id === 'vault');
  if ((names || []).some((n) => s.names[n]?.vault)) places.push(targetLabel(vault || { id: 'vault', label: '.env' }));
  for (const t of s.targets.filter((x) => x.id === 'app' || x.id === 'workspaceJson')) if ((names || []).some((n) => s.names[n]?.[t.id])) places.push(targetLabel(t));
  for (const d of [...new Set((pushed || []).filter((p) => p.ok).map((p) => p.destination))]) places.push(d === 'github-actions' ? 'Actions' : d === 'vercel' ? 'Vercel' : d);
  return places.length ? `Written to ${joinList(places)}` : '';
}

/**
 * One value row (design 4.3): { key, label, names, chips, secret, phase, note, written, drift, where, fill }.
 * ui: the card's own state for this value { paste, busy, error, result }.
 */
export function valueRow(svc, value, stack, ui = {}) {
  const s = s0(stack);
  const fw = frameworkById(s.app?.framework);
  const meta = s.values[`${svc}.${value.key}`];
  const names = meta?.names || envNamesFor(value, fw);
  const isSaved = !!meta?.saved;
  const drift = names.filter((n) => s.names[n]?.drift);
  const paste = typeof ui.paste === 'string' ? ui.paste : '';
  const shape = paste.trim() ? checkShape(value.shape, paste) : null;
  let phase = 'empty';
  let note = '';
  if (ui.busy) { phase = 'saving'; note = 'Saving…'; }
  else if (ui.error) { phase = 'save-failed'; note = ui.error; }
  else if (shape && !shape.ok) { phase = 'typed-bad'; note = shape.why; }
  else if (shape && shape.ok) { phase = 'typed-ok'; note = shape.note || 'Looks right.'; }
  else if (drift.length) { phase = 'drift'; note = `${joinList([...new Set(drift.flatMap((n) => s.targets.filter((t) => s.names[n]?.[t.id] && t.id !== 'vault').map((t) => t.label)))]) || 'A file'} has a different value than the vault.`; }
  else if (isSaved) { phase = 'saved'; note = writtenLine(names, s, ui.result?.pushed); }
  const fillVal = value.fill === 'check' ? s.checks[svc]?.fill?.[value.key] : null;
  return {
    key: value.key, label: value.label, names, chips: envChips(names), secret: !!value.secret, required: !!value.required,
    phase, note, saved: isSaved, drift: drift.length > 0, canSave: !!shape?.ok && !ui.busy,
    ...(meta?.notes?.length ? { alias: meta.notes[0] } : {}),
    ...(value.where ? { where: value.where } : {}),
    ...(value.fill === 'url' ? { readOnly: true, readOnlyNote: 'Read from the project URL when it is saved.' } : {}),
    ...(fillVal && !isSaved ? { found: fillVal } : {}),
  };
}

/** The names still unset across the picked services' required values. */
export function missing(stack) {
  const s = s0(stack);
  const fw = frameworkById(s.app?.framework);
  const out = [];
  for (const svc of ORDER.filter((x) => s.picked.includes(x))) {
    for (const v of requiredOf(svc)) {
      if (saved(s, svc, v.key)) continue;
      const names = s.values[`${svc}.${v.key}`]?.names || envNamesFor(v, fw);
      out.push(...names.filter((n) => !s.names[n]?.vault).map((n) => ({ name: n, service: svc, key: v.key })));
    }
  }
  return out;
}

/** The body for POST /api/stack/save. */
export function saveBody(svc, key, paste, targets) {
  const v = valueOf(svc, key);
  return { service: svc, key, value: v ? normalize(v.shape, paste) : String(paste || '').trim(), ...(targets ? { targets } : {}) };
}

/** Which card is open by default: the next action's, else the first one not done. */
export function openCard(stack, next) {
  const s = s0(stack);
  if (next?.service && s.picked.includes(next.service)) return next.service;
  return ORDER.find((id) => s.picked.includes(id) && cardState(id, s) !== 'done') || null;
}

/**
 * Paste-many: several KEY=value lines (Supabase's Connect dialog, a .env snippet) matched to the Supabase values by
 * name, then by shape. Returns [{ key, value }] held in memory only; [] for a single line.
 */
export function matchPaste(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (lines.length < 2) return [];
  const byName = [
    [/SUPABASE_URL$/, 'url'], [/(PUBLISHABLE|ANON)_KEY$/, 'publishable'], [/(SECRET|SERVICE_ROLE)_KEY$/, 'secret'],
    [/^(DATABASE_URL|POSTGRES_URL)$/, 'dbUrl'], [/ACCESS_TOKEN$/, 'pat'],
  ];
  const out = new Map();
  for (const line of lines) {
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    const name = m ? m[1].toUpperCase() : '';
    const val = (m ? m[2] : line).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (!val) continue;
    let key = byName.find(([re]) => re.test(name))?.[1];
    if (!key) key = SERVICES.supabase.values.find((v) => !v.fill && checkShape(v.shape, val).kind === 'ok')?.key;
    if (key && !out.has(key) && checkShape(valueOf('supabase', key).shape, val).ok) out.set(key, val);
  }
  return [...out].map(([key, value]) => ({ key, value }));
}
