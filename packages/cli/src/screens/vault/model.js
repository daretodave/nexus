// The vault's view model (boards Vault, VaultImport, VaultContributor, VaultKit, Secrets, the Inbox's key card, the
// plan board's "Waiting on a secret"), as pure functions over GET /api/secrets (server/secrets.mjs). No React here.
//
// The rule every function keeps: names and status in, names and status out. A value never enters this file; the only
// place one lives is a paste field's own React state, until it is sent in a POST body and cleared.
//
//   status: { mode, owner, projectSecretsNeeded, vault: { local, workspace, keychain }, secrets: [secret],
//             localKeys: [{ name, rings }], nudges, rotateDays, audit: [event], sinks, requests: [request], envFiles }
//   secret: { name, for, where, chunk, declared, set, rings, destinations: [{ destination, state, at, stale? }], age,
//             setAt, rotate }
//   event:  { time, action: 'set'|'rotate'|'push'|'remove', name, destination, ring?, ... }
//   request: { chunk, names, missing, file, line, date }

import { DESTINATIONS } from '../../../shared/stack/destinations.mjs';

/** A stored value, always: eight dots, whatever its length (the design's rule: a length never leaks). */
export const MASK = '\u2022'.repeat(8);

/** The manifest's destinations the table always shows, in its column order. */
export const DESTS = ['local', 'github-actions', 'vercel', 'cloudflare'];
const MORE = Object.keys(DESTINATIONS).filter((d) => !DESTS.includes(d));
/** A destination as the table's column and the dots' titles name it. */
export const SHORT = { local: 'local', 'github-actions': 'Actions', vercel: 'Vercel', cloudflare: 'Cloudflare', ...Object.fromEntries(MORE.map((d) => [d, DESTINATIONS[d].short])) };
/** A destination as the "Where values go" card names it. */
export const LABEL = { local: 'Local', 'github-actions': 'GitHub Actions', vercel: 'Vercel', cloudflare: 'Cloudflare', ...Object.fromEntries(MORE.map((d) => [d, DESTINATIONS[d].label])) };
/** The column heads' titles. */
export const HEAD_TITLE = { local: 'this checkout\'s vault', 'github-actions': 'GitHub Actions secrets', vercel: 'Vercel environment variables', cloudflare: 'Cloudflare secrets', ...Object.fromEntries(MORE.map((d) => [d, `${DESTINATIONS[d].label} ${DESTINATIONS[d].what}`])) };

/**
 * The table's columns for a status: the four it always shows, then each other place (Fly.io, Netlify, AWS...) that
 * some declared name goes to, in the sinks' order.
 */
export function destsIn(status) {
  const used = new Set((status?.secrets || []).flatMap((s) => (s.destinations || []).map((x) => x.destination)));
  return [...DESTS, ...MORE.filter((d) => used.has(d))];
}
/** A dot per state. */
export const DOT = { set: 'dd is-set', stale: 'dd is-stale', missing: 'dd is-missing', none: 'dd is-none', optional: 'dd is-none', unknown: 'dd is-unknown' };
const WORD = { set: 'set', stale: 'out of sync', missing: 'missing', none: 'not used', optional: 'optional · not set', unknown: 'unknown (gh can\'t tell)' };
/** What an optional secret that is not set reads (spec 49, A6): never missing, no warning. */
export const OPTIONAL_UNSET = 'optional \u00b7 not set';

const DAY = 86_400_000;
const pad2 = (n) => String(n).padStart(2, '0');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "a, b and c". */
export function andList(list) {
  const a = list.filter(Boolean);
  return a.length <= 1 ? (a[0] || '') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
}

/** Whole local days between two times (0 today, 1 yesterday). */
function daysAgo(t, now) {
  const a = new Date(t);
  const b = new Date(now);
  if (Number.isNaN(a.getTime())) return null;
  const da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da) / DAY);
}

/** The audit log's when: "02:30" today, "yesterday", else "Oct 18". */
export function whenText(t, now = Date.now()) {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '';
  const n = daysAgo(t, now);
  if (n === 0) return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (n === 1) return 'yesterday';
  return `${MON[d.getMonth()]} ${d.getDate()}`;
}

/** The Rotated column: when the value was last set ("today", "yesterday", "3 days ago"), or why there is none. */
export function ageText(s, now = Date.now()) {
  if (!s.set) return 'never set';
  if (s.setAt) {
    const n = daysAgo(s.setAt, now);
    if (n === 0) return 'today';
    if (n === 1) return 'yesterday';
    if (n != null) return `${n} days ago`;
  }
  if (Number.isFinite(s.age)) return s.age === 0 ? 'today' : s.age === 1 ? 'yesterday' : `${s.age} days ago`;
  return '';
}

/**
 * One destination's state for one secret: set, stale (out of sync), missing, unknown, or none (not used there). A
 * destination the kit reads back (github-actions: `gh secret list`, names only; spec 49 A5) answers from what it holds:
 * listed is set (stale when the vault's value is newer than its last push), not listed is missing, and unknown when
 * gh can't tell, never missing. Without that read, the audit log's last push says.
 */
export function destState(s, d) {
  const e = (s.destinations || []).find((x) => x.destination === d);
  if (!e) return 'none';
  if (d === 'local') return e.state === 'set' ? 'set' : 'missing';
  if (e.remote === 'set') return e.state === 'pushed' && e.stale ? 'stale' : 'set';
  if (e.remote === 'not set') return 'missing';
  if (e.remote === 'unknown') return 'unknown';
  if (e.state === 'pushed') return e.stale ? 'stale' : 'set';
  return 'missing';
}

/** destState as the table and the cards show it: an optional secret that is not set reads optional, never missing. */
export function shownState(s, d) {
  const st = destState(s, d);
  return st === 'missing' && s.optional && !s.set ? 'optional' : st;
}

/** Where the vault keeps values on this machine, in words. */
export function vaultPlace(vault) {
  if (vault?.keychain) return 'the keychain on this machine';
  return '.env in this checkout';
}

/** The names a request still waits on, keyed `${chunk}:${name}`, from status.requests. */
export function requestedNames(status) {
  const out = new Map();
  for (const r of status?.requests || []) for (const n of r.missing || []) if (!out.has(n)) out.set(n, r);
  return out;
}

/**
 * The vault table's rows. ui: { edit, fresh: Set, now }. Each row: name, for, the mask (eight dots or "no value"),
 * a dot and its title per destination, the chunk that asked, the age with a rotate nudge, and which actions it offers.
 */
export function vaultRows(status, { edit = null, fresh = new Set(), now = Date.now() } = {}) {
  const asked = requestedNames(status);
  const cols = destsIn(status);
  return (status?.secrets || []).map((s) => {
    if (s.declared === false) return undeclaredRow(s, { fresh, cols });
    const states = Object.fromEntries(cols.map((d) => [d, shownState(s, d)]));
    const optionalUnset = !!s.optional && !s.set;
    // Held where it lives (spec 49, A5): not in the vault, every place it goes is remote and lists it. Set there.
    const held = heldRemotely(s);
    if (held) return heldRow(s, states, held, { edit, fresh, now, asked, cols });
    // What Sync pushes: a place holding an older value, or one the value never reached (a set value, missing there).
    const stale = s.set ? cols.filter((d) => d !== 'local' && (states[d] === 'stale' || states[d] === 'missing')) : [];
    const where = cols.filter((d) => states[d] === 'set' || states[d] === 'stale').map((d) => SHORT[d]);
    const ticks = cols.filter((d) => states[d] !== 'none').map((d) => SHORT[d]);
    const req = asked.get(s.name);
    const chunk = s.chunk || req?.chunk || '';
    return {
      name: s.name,
      for: s.for || '',
      set: !!s.set,
      requested: !!req && !s.set,
      optional: !!s.optional,
      editing: edit === s.name,
      fresh: fresh.has(s.name),
      mask: s.set ? MASK : optionalUnset ? OPTIONAL_UNSET : 'no value',
      // The value cell's tone: '' (the dots), 'empty' (no value: the warning), 'quiet' (nothing wrong: muted).
      maskTone: s.set ? '' : optionalUnset ? 'quiet' : 'empty',
      maskAria: s.set ? 'value hidden' : optionalUnset ? OPTIONAL_UNSET : 'no value yet',
      dots: cols.map((d) => ({ d, cls: DOT[states[d]], title: `${SHORT[d]}: ${WORD[states[d]]}` })),
      chunk,
      age: optionalUnset ? '' : ageText(s, now),
      old: !!s.rotate,
      canAdd: !s.set,
      canSync: !!s.set && stale.length > 0,
      canReplace: !!s.set,
      stale,
      sinks: ticks,
      // Save pushes a replaced value where the old one lives, and a first value to every place the manifest names.
      pushTo: cols.filter((d) => d !== 'local' && (s.set ? ['set', 'stale', 'unknown'].includes(states[d]) : states[d] !== 'none')),
      placeholder: s.set ? 'Paste the new value' : 'Paste the value',
      rings: s.rings || [],
      editNote: s.set
        ? `Saving replaces it in ${andList(where.length ? where : ['the vault'])}${sharedNote(s)}. The old value is gone for good.`
        : `Saving stores it in ${andList(ticks.length ? ticks : ['the vault'])}${chunk ? `, then ${chunk} is ready again` : ''}.`,
    };
  });
}

/** A value read from .env.workspace is replaced there, where the sibling repos read it too: the note says so. */
function sharedNote(s) {
  return (s.rings || [])[0] === 'workspace' ? ' (in .env.workspace, which the sibling repos share)' : '';
}

/** Where a value sits on this machine, as the remove confirmation names it: ".env and the keychain". */
const RING_FILE = { local: '.env', keychain: 'the keychain', workspace: '.env.workspace' };
export function removeWhere(rings = []) {
  const list = rings.map((r) => RING_FILE[r]).filter(Boolean);
  return list.length ? andList(list) : 'the vault';
}

/**
 * What the remove confirmation says before it runs: the places on this machine it leaves, a word when one is the
 * shared workspace file, and the places it was pushed to, which keep their copy. pushedTo: the destinations shown.
 */
export function removeNote({ name, rings = [], pushedTo = [] }) {
  const shared = rings.includes('workspace') ? ' The sibling repos lose it too: .env.workspace is shared.' : '';
  const far = pushedTo.length ? ` ${andList(pushedTo.map((d) => SHORT[d] || d))} ${pushedTo.length === 1 ? 'keeps its' : 'keep their'} copy.` : '';
  return `Take ${name} out of ${removeWhere(rings)}?${shared}${far}`;
}

/** The toast a remove answers with: what left, what is still set, and where a pushed copy stays. */
export function removedToast(r, name) {
  const from = r?.removed?.length ? removeWhere(r.removed) : 'the vault';
  const still = r?.still?.length ? ` It is still set in ${removeWhere(r.still)}.` : '';
  const far = (r?.notes || []).some((n) => /pushed to keep their copy/.test(n)) ? ' The places it was pushed to keep their copy.' : '';
  return { kind: 'shipped', title: r?.removed?.length ? `${name} is out of ${from}` : `${name} was not in the vault`, body: `${still}${far}`.trim() || 'Nothing else held it.' };
}

/**
 * The warning over the vault when git would commit the root .env (status.envIgnore): null when it is ignored or git
 * cannot tell. `fix` says the Add to .gitignore button can mend it (a tracked file is the person's to untrack).
 */
export function ignoreWarn(status) {
  const st = status?.envIgnore;
  if (st === 'not ignored') return { title: '.env is not in .gitignore', body: 'A value saved here could be committed. Add it to .gitignore first; the vault refuses to write it until then.', fix: true };
  if (st === 'tracked') return { title: '.env is tracked by git', body: 'Its values are in the repo\'s history already. Run git rm --cached .env (the file stays), add it to .gitignore, commit both, and rotate what it held.', fix: false };
  return null;
}

/**
 * A name the vault does not hold whose every destination is remote and lists it (github-actions read through gh):
 * { places: ['GitHub Actions'], at: the latest updatedAt or null }, else null.
 */
export function heldRemotely(s) {
  if (s.set || s.declared === false) return null;
  const ds = s.destinations || [];
  if (!ds.length || ds.some((x) => x.destination === 'local' || x.remote !== 'set')) return null;
  const ats = ds.map((x) => x.remoteAt).filter((t) => typeof t === 'string' && !Number.isNaN(Date.parse(t))).sort();
  return { places: ds.map((x) => LABEL[x.destination] || x.destination), at: ats.length ? ats[ats.length - 1] : null };
}

/** A row for a name held where it lives: "in GitHub Actions" (muted), its age from the sink, and Replace. */
function heldRow(s, states, held, { edit, fresh, now, asked, cols = DESTS }) {
  const req = asked.get(s.name);
  const ticks = cols.filter((d) => states[d] !== 'none');
  const where = `in ${andList(held.places)}`;
  return {
    name: s.name,
    for: s.for || '',
    set: true,
    held: true,
    requested: false,
    optional: !!s.optional,
    editing: edit === s.name,
    fresh: fresh.has(s.name),
    mask: where,
    maskTone: 'quiet',
    maskAria: `set ${where}`,
    dots: cols.map((d) => ({ d, cls: DOT[states[d]], title: `${SHORT[d]}: ${WORD[states[d]]}` })),
    chunk: s.chunk || req?.chunk || '',
    age: held.at ? ageText({ set: true, setAt: held.at }, now) : '',
    old: false,
    canAdd: false,
    canSync: false,
    canReplace: true,
    stale: [],
    sinks: ticks.map((d) => SHORT[d]),
    pushTo: ticks.filter((d) => d !== 'local'),
    placeholder: 'Paste the new value',
    editNote: `Saving replaces it in ${andList(ticks.map((d) => SHORT[d]))} and keeps it in the vault. The old value is gone for good.`,
  };
}

/** Where an undeclared name sits, in words: "in .env", "in .env.workspace", "in the keychain". */
const UNDECLARED_RING = { local: 'in .env', workspace: 'in .env.workspace', keychain: 'in the keychain' };

/**
 * A name the vault holds that nexus.secrets.json does not declare (spec 49, A4): marked "in .env, not in the
 * manifest", its Local dot truthful (set where it is set), no other place (the manifest names none), and Declare only.
 */
function undeclaredRow(s, { fresh, cols = DESTS }) {
  const local = s.set || (s.rings || []).length > 0;
  const where = (s.rings || []).map((r) => UNDECLARED_RING[r]).filter(Boolean)[0] || 'in .env';
  return {
    name: s.name,
    for: `${where}, not in the manifest`,
    set: local,
    undeclared: true,
    requested: false,
    editing: false,
    fresh: fresh.has(s.name),
    mask: local ? MASK : 'no value',
    maskTone: local ? '' : 'empty',
    maskAria: local ? 'value hidden' : 'no value yet',
    dots: cols.map((d) => {
      const st = d === 'local' ? (local ? 'set' : 'missing') : 'none';
      return { d, cls: DOT[st], title: `${SHORT[d]}: ${WORD[st]}` };
    }),
    chunk: '',
    age: '',
    old: false,
    canAdd: false,
    canSync: false,
    canReplace: false,
    canDeclare: true,
    stale: [],
    sinks: [],
    pushTo: [],
    placeholder: '',
    editNote: '',
  };
}

/** The names nexus.secrets.json declares (the Vault's count; an undeclared vault name is not one of them). */
export const declaredSecrets = (status) => (status?.secrets || []).filter((s) => s.declared !== false);

/** The "Where values go" card: one row per destination, with its count and its worst dot. */
export function destRows(status, { repo = '' } = {}) {
  const secrets = status?.secrets || [];
  const cols = destsIn(status);
  const what = {
    local: vaultPlace(status?.vault),
    'github-actions': repo ? `${repo} repository secrets` : 'repository secrets',
    vercel: 'project environment variables',
    cloudflare: 'worker secrets',
    ...Object.fromEntries(Object.entries(DESTINATIONS).filter(([d]) => !DESTS.includes(d)).map(([d, x]) => [d, x.what])),
  };
  return cols.map((d) => {
    const n = (w) => secrets.filter((s) => shownState(s, d) === w).length;
    const set = n('set');
    const stale = n('stale');
    const miss = n('missing');
    const unknown = n('unknown');
    const bits = [];
    if (set) bits.push(`${set} set`);
    if (stale) bits.push(`${stale} out of sync`);
    if (miss) bits.push(`${miss} missing`);
    if (unknown) bits.push(`${unknown} unknown`);
    return { d, label: LABEL[d], what: what[d], count: bits.join(' · ') || 'none', stale, dot: miss ? DOT.missing : stale ? DOT.stale : unknown ? DOT.unknown : set ? DOT.set : DOT.none };
  });
}

/** Every place behind the vault: [{ name, destinations }] (Sync N): an older value there, or a set value never pushed. */
export function staleList(status) {
  return (status?.secrets || []).filter((s) => s.set)
    .map((s) => ({ name: s.name, destinations: destsIn(status).filter((d) => d !== 'local' && ['stale', 'missing'].includes(destState(s, d))) }))
    .filter((x) => x.destinations.length);
}

const RING = { local: 'local', workspace: 'workspace', keychain: 'keychain' };

/**
 * The audit timeline, newest first: a set or rotation folds in the pushes that followed it within a minute ("set
 * X → local, Actions"); a later push alone reads "synced". Requests join as "requested ... for 7.1". Names and
 * places only. `limit` rows.
 */
export function auditRows(status, { now = Date.now(), limit = 8, fresh = new Set() } = {}) {
  const events = [...(status?.audit || [])].filter((e) => e && typeof e.name === 'string').sort((a, b) => String(a.time).localeCompare(String(b.time)));
  const rows = [];
  const lastSetRow = new Map();
  for (const e of events) {
    const t = Date.parse(e.time);
    if (e.action === 'set' || e.action === 'rotate') {
      const place = RING[e.ring] || RING[e.destination] || 'local';
      const row = { key: `${e.time}:${e.name}:${e.action}`, time: e.time, kind: e.action === 'set' ? 'set' : 'rotated', verb: e.action === 'set' ? 'set' : 'rotated', name: e.name, to: [place], sep: e.action === 'set' ? '\u2192' : '\u00b7' };
      rows.push(row);
      lastSetRow.set(e.name, { row, t });
    } else if (e.action === 'remove') {
      rows.push({ key: `${e.time}:${e.name}:remove:${e.ring}`, time: e.time, kind: 'removed', verb: 'removed', name: e.name, to: [RING[e.ring] || 'local'], sep: 'from' });
      lastSetRow.delete(e.name);
    } else if (e.action === 'push') {
      const prev = lastSetRow.get(e.name);
      const place = SHORT[e.destination] || e.destination;
      if (prev && Number.isFinite(t) && t - prev.t <= 60000) { if (!prev.row.to.includes(place)) prev.row.to.push(place); continue; }
      rows.push({ key: `${e.time}:${e.name}:push:${e.destination}`, time: e.time, kind: 'synced', verb: 'synced', name: e.name, to: [place], sep: '\u2192' });
    }
  }
  // The name's last set or rotation says where the old value still sits: "\u00b7 local, Vercel still has the old one".
  for (const [name, { row }] of lastSetRow) {
    const s = (status?.secrets || []).find((x) => x.name === name);
    const stale = destsIn(status).filter((d) => d !== 'local' && s && destState(s, d) === 'stale').map((d) => SHORT[d]);
    if (stale.length) row.tail = ` ${andList(stale)} still ${stale.length === 1 ? 'has' : 'have'} the old one`;
  }
  for (const r of status?.requests || []) {
    for (const n of r.missing || []) rows.push({ key: `req:${r.chunk}:${n}`, time: r.date ? `${r.date}T00:00:00` : '', kind: 'requested', verb: 'requested', name: n, rest: `for ${r.chunk}`, dateOnly: true });
  }
  rows.sort((a, b) => String(b.time).localeCompare(String(a.time)));
  return rows.slice(0, limit).map((r) => ({
    key: r.key,
    w: r.dateOnly ? (r.time ? whenText(`${r.time.slice(0, 10)}T12:00:00`, now).replace(/^\d\d:\d\d$/, 'today') : '') : whenText(r.time, now),
    cls: `audit-row${fresh.has(r.key) ? ' is-new' : ''}`,
    pt: `pt is-${r.kind}`,
    verb: r.verb,
    name: r.name,
    rest: r.rest || `${r.sep} ${r.to.join(', ')}${r.tail ? `,${r.tail}` : ''}`,
  }));
}

/** The view's sub line: "6 secrets in nexus.secrets.json", declared names only (spec 49, A4). */
export function subLine(status) {
  const n = declaredSecrets(status).length;
  return `${n} ${n === 1 ? 'secret' : 'secrets'} in nexus.secrets.json`;
}

// ---- the key card (a secret request: Vault, Inbox) ---------------------------------------------------------------

/** "vercel.com", for "Where to get this". */
export function hostOf(url) {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return ''; }
}

/**
 * A key card's model, from a request and the secret's manifest entry: { name, chunk, who, src, why, where,
 * whereLabel, dests: [{ d, label, locked }] }. Every place the manifest names starts ticked; the vault keeps every
 * value (the sinks push from it), so its box is ticked and locked.
 */
export function keyCard(req, name, status, { now = Date.now() } = {}) {
  const s = (status?.secrets || []).find((x) => x.name === name) || { name, destinations: [] };
  const declared = (s.destinations || []).map((x) => x.destination);
  // The places the request named (`request --to`) join the manifest's: ticked, and declared on save.
  const asked = (req?.to || []).filter((d) => d !== 'local' && !declared.includes(d));
  const places = [...declared, ...asked];
  const local = status?.vault?.keychain ? 'keychain' : '.env';
  const dests = ['local', ...places.filter((d) => d !== 'local')].map((d) => ({
    d, locked: d === 'local', label: d === 'local' ? `Store locally \u00b7 ${local}` : `Push to ${LABEL[d] || d}`,
  }));
  const when = req?.date ? whenText(`${req.date}T12:00:00`, now).replace(/^\d\d:\d\d$/, 'today') : '';
  const chunk = req?.chunk || s.chunk || '';
  const purpose = s.for ? `${s.for.replace(/\.?\s*$/, '.')} ` : '';
  return {
    key: `${chunk}:${name}`,
    name,
    chunk,
    who: 'the plan',
    src: [req?.file ? 'secret request' : '', when].filter(Boolean).join(' \u00b7 '),
    why: `${purpose}${chunk ? `${chunk} waits on it; /next picks ${chunk} back up once it is set.` : 'A chunk waits on it.'}`,
    where: s.where || '',
    whereLabel: s.where ? hostOf(s.where) : '',
    dests,
    sinks: places.filter((d) => d !== 'local'),
    ...(asked.length ? { adds: asked } : {}),
  };
}

/** The cards the owner's vault shows: one per name a request still waits on, oldest request first. */
export function keyCards(status, opts) {
  const out = [];
  const seen = new Set();
  for (const r of status?.requests || []) {
    for (const n of r.missing || []) {
      if (seen.has(n)) continue;
      seen.add(n);
      out.push(keyCard(r, n, status, opts));
    }
  }
  return out;
}

/**
 * The body Save sends, from the card's ticks: the sinks only (the vault always keeps the value). `adds`: places the
 * request named that nexus.secrets.json does not list yet; ticked, they are declared as the value is stored.
 */
export function saveBody(value, ticked, adds = []) {
  const destinations = ticked.filter((d) => d !== 'local');
  return { value, destinations, ...(adds.some((d) => destinations.includes(d)) ? { declare: true } : {}) };
}

/** The saved line's places: "local, Actions, Vercel"; and the ones a sink refused. */
export function savedPlaces(result) {
  const ok = ['local', ...(result?.pushed || []).filter((p) => p.ok).map((p) => p.destination)];
  const failed = (result?.pushed || []).filter((p) => !p.ok);
  return { places: ok.map((d) => SHORT[d] || d).join(', '), failed: failed.map((p) => ({ d: p.destination, label: LABEL[p.destination] || p.destination, error: p.error || '' })) };
}

// ---- the import --------------------------------------------------------------------------------------------------

/** The import's notes, as the boards word them. */
const LOOK_NOTE = { public: 'looks public, not a secret', setting: 'a setting, not a secret' };

/**
 * The import's rows from a names-only preview. owner: each row ticks Local and the places the manifest names (Local
 * and Actions for a new name); contributor: this machine only. A public-looking name or a setting starts unticked, and
 * so does one already in the vault ("the vault value stays"); ticking that one replaces it. cols: the place columns the
 * screen draws (onboarding draws Local and Actions only); a place with no box on screen is never ticked or sent.
 */
export function importRows(preview, status, { owner = true, cols = DESTS } = {}) {
  const asked = requestedNames(status);
  const known = new Map((status?.secrets || []).map((s) => [s.name, s]));
  const mine = new Set((status?.localKeys || []).map((k) => k.name));
  return (preview?.names || []).filter((n) => !n.skip).map((n) => {
    const exists = owner ? (n.rings || []).length > 0 || !!known.get(n.name)?.set : mine.has(n.name) || (n.rings || []).length > 0;
    const look = n.looks && n.looks !== 'secret' ? n.looks : null;
    const req = asked.get(n.name);
    const keep = !exists && !look;
    let note;
    let tone = '';
    if (exists) { note = owner ? 'already in the vault; the vault value stays' : 'already a local key; yours stays'; tone = 'is-quiet'; }
    else if (look) { note = LOOK_NOTE[look]; tone = look === 'public' ? 'is-warn' : 'is-quiet'; }
    else if (req) { note = `new \u00b7 answers the request from ${req.chunk}`; tone = 'is-match'; }
    else note = 'new';
    const declared = known.get(n.name);
    const places = declared ? ['local', ...(declared.destinations || []).map((x) => x.destination).filter((d) => d !== 'local')] : ['local', 'github-actions'];
    const dests = Object.fromEntries(DESTS.map((d) => [d, keep && owner && places.includes(d) && cols.includes(d)]));
    return { name: n.name, exists, look, note, tone, keep, dests, places, cols, declared: !!declared, for: declared?.for || '' };
  });
}

/** The vault keeps every value (each sink pushes from it), so Local is locked, and ticked on every row that will be stored. */
export const LOCAL_LOCKED = 'The vault keeps every value; pushes read it from there.';

/**
 * The patch the import's Keep box makes: unticking keeps the row's places for later; ticking brings them back, or the
 * places the manifest names (Local and Actions for a new name) when none is ticked. Never a place a declared name
 * does not go to.
 */
export function keepToggle(row) {
  if (row.keep) return { keep: false };
  const any = DESTS.some((d) => d !== 'local' && row.dests[d]);
  const places = (row.places || ['local', 'github-actions']).filter((d) => (row.cols || DESTS).includes(d));
  return { keep: true, dests: Object.fromEntries(DESTS.map((d) => [d, d === 'local' || (any ? !!row.dests[d] && places.includes(d) : places.includes(d))])) };
}

/** One of an import row's place boxes: Local locked on, a place a declared name does not go to locked off. */
export function importTick(row, d) {
  if (d === 'local') return { checked: !!row.keep, disabled: true, title: LOCAL_LOCKED };
  if (row.declared && !(row.places || []).includes(d)) return { checked: false, disabled: true, title: `${row.name} does not go to ${SHORT[d] || d} in nexus.secrets.json` };
  return { checked: !!row.dests[d], disabled: !row.keep, title: undefined };
}

/** One of Add a secret's place boxes: Local locked on. */
export function addTick(nw, d) {
  if (d === 'local') return { checked: true, disabled: true, title: LOCAL_LOCKED };
  return { checked: !!nw.dests[d], disabled: false, title: undefined };
}

/** What Add a secret sends: the name declared, the value, and the sinks ticked (the vault always keeps it). */
export function addBody(nw) {
  return { value: nw.value, declare: true, for: nw.for, destinations: DESTS.filter((d) => d !== 'local' && nw.dests[d]) };
}

/** A row's note once ticked or unticked: an existing name ticked replaces its value. */
export function importNote(row, owner = true) {
  if (row.exists && row.keep) return { note: owner ? 'replaces the vault value, a rotation' : 'replaces your local value', cls: 'env-note is-warn' };
  return { note: row.note, cls: `env-note${row.tone ? ` ${row.tone}` : ''}` };
}

/** What the confirm sends: the kept names and, for the owner, the places per name (only places the screen draws). */
export function importBody(rows, source, { owner = true } = {}) {
  const kept = rows.filter((r) => r.keep);
  const body = { ...source, confirm: true, names: kept.map((r) => r.name) };
  if (owner) body.destinations = Object.fromEntries(kept.map((r) => [r.name, DESTS.filter((d) => d === 'local' || (r.dests[d] && (r.cols || DESTS).includes(d) && (!r.declared || (r.places || []).includes(d))))]));
  return body;
}

/** "7 entries, 2 comment lines skipped · values stay masked". */
export function importLine(preview) {
  const n = (preview?.names || []).length;
  const c = preview?.comments || 0;
  return `${n} ${n === 1 ? 'entry' : 'entries'}${c ? `, ${c} comment line${c === 1 ? '' : 's'} skipped` : ''} \u00b7 values stay masked`;
}

// ---- a contributor's local keys ------------------------------------------------------------------------------------

/** Where a local key sits, in words. */
const RING_WORD = { local: 'in .env', keychain: 'in the keychain', workspace: 'in .env.workspace' };

/** The local keys section's rows: name, where it sits and when it was last set (from the audit log). */
export function localRows(status, { now = Date.now(), fresh = new Set(), edit = null } = {}) {
  const last = new Map();
  for (const e of status?.audit || []) if ((e.action === 'set' || e.action === 'rotate') && (!last.has(e.name) || last.get(e.name) < e.time)) last.set(e.name, e.time);
  return (status?.localKeys || []).map((k) => {
    const at = last.get(k.name);
    const n = at ? daysAgo(at, now) : null;
    const age = n == null ? '' : n === 0 ? 'set today' : n === 1 ? 'set yesterday' : `set ${n} days ago`;
    const set = (k.rings || []).length > 0;
    const where = set ? k.rings.map((r) => RING_WORD[r] || r).join(', ') : 'not set on this machine';
    return { name: k.name, set, rings: k.rings || [], sub: [where, set ? age : ''].filter(Boolean).join(' \u00b7 '), fresh: fresh.has(k.name), editing: edit === k.name };
  });
}

/** The local keys' sub line: "2 keys for running tidepool on this machine", or when none, "only if tidepool needs them to run here". */
export function localSub(n, repo) {
  const r = repo || 'this repo';
  return n ? `${n} ${n === 1 ? 'key' : 'keys'} for running ${r} on this machine` : `only if ${r} needs them to run here`;
}

/** The first chunk a contributor's board shows waiting on a project secret: { chunk, name } or null. */
export function waitingOn(plan) {
  for (const s of plan?.specs || []) {
    for (const c of s.chunks || []) {
      if (c.state === 'closed') continue;
      const names = c.needsSecret || [];
      if (names.length) return { chunk: String(c.id), name: names[0], title: c.title || '' };
    }
  }
  return null;
}

/** An env-var name as typed into the name field: upper case, anything else an underscore. */
export const nameInput = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9_]/g, '_');
/** Can this name be stored? */
export const validName = (n) => /^[A-Z][A-Z0-9_]*$/.test(String(n || ''));

// ---- skipped requests: names only, kept for this tab ----------------------------------------------------------------

const SKIP = 'nexus-vault-skipped';
/** The request cards skipped for now (keys `${chunk}:${name}`, never a value), for this tab. */
export function readSkipped() {
  try { return new Set(JSON.parse(sessionStorage.getItem(SKIP) || '[]')); } catch { return new Set(); }
}
export function writeSkipped(set) {
  try { sessionStorage.setItem(SKIP, JSON.stringify([...set])); } catch { /* the skip lasts for this page only */ }
}

/**
 * Launch's secrets row: "3 names in the vault · values in .env and CI", "skipped · the vault is in the rail", or for a
 * contributor "no project secrets needed"; null when the vault does not answer.
 */
export function secretsLine(status, pick) {
  if (!status) return null;
  if (vaultMissing(status)) return 'no vault yet · set it up from the Vault';
  if (!status.owner) return 'no project secrets needed · local keys stay on this machine';
  if (pick === 'skip' && !(status.secrets || []).length) return 'skipped · the vault is in the rail';
  const n = (status.secrets || []).length;
  const ci = (status.secrets || []).some((s) => (s.destinations || []).some((x) => x.state === 'pushed'));
  const where = status.vault?.keychain ? 'your keychain' : '.env';
  return `${n} ${n === 1 ? 'name' : 'names'} in the vault · values in ${where}${ci ? ' and CI' : ''}`;
}

// ---- a mature repo's vault (spec 47, A2) ---------------------------------------------------------------------------

/** The docs page the vault's empty states link to. */
export const VAULT_DOCS = 'https://github.com/daretodave/nexus/blob/main/customization/secrets.md';

/** True when GET /api/secrets says the repo has no vault scripts yet (an empty state, never an error). */
export const vaultMissing = (status) => !!status && (status.vaultState === 'missing' || status.available === false);

const nameCount = (n) => `${n} ${n === 1 ? 'name' : 'names'}`;

/**
 * What onboarding's Secrets step draws, from GET /api/secrets: { kind, ... }.
 *   'unknown'  the vault has not answered
 *   'missing'  no vault scripts: say so before any file is picked; the import and an empty manifest wait for it
 *   'already'  the root .env is the vault's own file: N names, and how many the manifest does not declare yet
 *   'import'   a ready vault and no root .env with names: the import as before
 */
export function secretsStep(status) {
  if (!status) return { kind: 'unknown' };
  const env = status.rootEnv || { exists: false, names: 0 };
  if (vaultMissing(status)) return { kind: 'missing', envNames: env.exists ? env.names : 0 };
  if (env.exists && env.names > 0) return { kind: 'already', names: env.names, undeclared: env.undeclared ?? 0, manifest: !!status.manifest };
  return { kind: 'import' };
}

/** "2 names in .env aren't in nexus.secrets.json yet" (spec 49, A2): what the manifest lacks, by count. */
export function lacksLine(n) {
  return `${nameCount(n)} in .env ${n === 1 ? 'isn\'t' : 'aren\'t'} in nexus.secrets.json yet`;
}

/**
 * "Your .env is already the vault · 4 names", the line under it, and the owner's action (or null). With a manifest
 * present the line names what it lacks ("1 name in .env isn't in nexus.secrets.json yet") and the action adds it.
 */
export function alreadyCopy(step, { owner = true } = {}) {
  const title = `Your .env is already the vault · ${nameCount(step.names)}`;
  if (!owner) return { title, line: 'The owner keeps the project\'s secrets and their manifest.', action: null };
  if (step.undeclared > 0 && step.manifest) {
    return { title, line: `${lacksLine(step.undeclared)}. Names only; the values stay where they are.`, action: step.undeclared === 1 ? 'Add it' : 'Add them' };
  }
  if (step.undeclared > 0) {
    const which = step.undeclared === step.names ? 'them' : `the ${step.undeclared} not named yet`;
    return { title, line: `Its values stay where they are. Write the manifest to name ${which} in nexus.secrets.json, names only.`, action: 'Write the manifest' };
  }
  return { title, line: 'nexus.secrets.json names every one of them. Nothing to write.', action: null };
}

/** The Import radio's lowercase twin: "your .env is already the vault · 4 names · 1 name in .env isn't in ...". */
export function alreadyPick(step) {
  const base = `your .env is already the vault · ${nameCount(step.names)}`;
  return step.manifest && step.undeclared > 0 ? `${base} · ${lacksLine(step.undeclared)}` : base;
}

/**
 * The missing vault's empty state, for the step and the Vault screen alike: { title, body, action, note }. The owner
 * sets it up (a commit on main); a contributor reads that the vault is the owner's, and may propose it as a PR.
 */
export function missingCopy({ owner = true, envNames = 0 } = {}) {
  if (owner) {
    const env = envNames ? ` Your .env (${nameCount(envNames)}) becomes the vault's own file as it is.` : '';
    return {
      title: 'This repo has no vault yet',
      body: `Set it up and nexus adds its secrets scripts in one commit on main: values stay in your .env, agents see names only.${env}`,
      action: 'Set up the vault',
      note: null,
    };
  }
  return {
    title: 'This repo has no vault yet',
    body: 'The owner sets up the vault; until then there is nowhere to keep local keys. Nothing here asks you for a project secret.',
    action: 'Propose it in a pull request',
    note: 'A pull request adds the vault; it lands when the owner merges it.',
  };
}

/** Why the import and an empty manifest are off in the step while the vault is missing (their radios' line). */
export const WAITS_FOR_VAULT = 'waits for the vault: set it up first';

/** The toast after Set up the vault: { kind, title, body }. */
export function setupToast(r) {
  if (!r) return null;
  if (r.landed === 'branch') return { kind: 'shipped', title: r.already ? 'The vault\'s pull request is open already' : 'A pull request adds the vault', body: r.pr || r.note || '' };
  if (r.here) return { kind: 'shipped', title: r.already ? 'The vault is here' : 'The vault is set up', body: r.already ? '' : 'One commit on main: feat: add the nexus secrets vault.' };
  return { kind: 'info', title: 'The vault is on main', body: r.note || 'Pull main into this checkout to use it here.' };
}
