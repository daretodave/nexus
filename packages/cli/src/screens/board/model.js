// The plan board's view model (Board / BoardOwner boards), as pure functions:
// the plan (GET /api/plan) and the claims (GET /api/claims) in, the rows,
// lanes, specs and the claims-by-person rail out. No React here, so the
// rules read in one place: who may do what, what a lane holds, the sort.
//
// Inputs (tolerant of both spellings the server may send):
//   plan:   { repo?, ownerName?, protected?, specs: [{ id|num, title|name, file, open?, unchunked?,
//             chunks?: [chunk] }], chunks?: [chunk], order?: [id] | next?: [{ id }], asap?: [id], held?: [id],
//             planPr?: { number?, state?, title?, adds?, note?, landed? } }
//   chunk:  { id, spec?, title|t, size, state?: 'ready'|'claimed'|'building'|'review'|'closed', closed?, asap?,
//             plotted?: 'main' | '#151' | true, landed?, ai? }
//   claims: [{ id, who, host, at, session, star?, pr, held, state: 'live'|'stale'|'pr'|'held', mine }]  (claims.mjs list --json;
//           star is the session's star name from its tag, s:<session>~<star>)
//   sessions (optional): [{ id, name, kind: 'local'|'terminal'|'other', state, phase, chunk, claimsSession? }]

import { isStarName } from '../../ui/stars.js';

export const TTL_H = 24;
export const PRIVILEGED = 'privileged_agent_session';

/** The word under the moon. */
export const LAB = { ready: 'ready', claimed: 'claimed', building: 'building', review: 'in review', closed: 'closed' };
/** The moon's state class (closed chunks wear the settled moon). */
export const CS = { ready: 'cs-ready', claimed: 'cs-claimed', building: 'cs-building', review: 'cs-review', closed: 'cs-settled', secret: 'cs-secret' };

const pad2 = (n) => String(n).padStart(2, '0');
/** A spec's number as files spell it ("4" and "04" are one spec). */
export const specKey = (n) => (n == null ? '' : pad2(String(n).replace(/^0+(?=\d{2})/, '')));
/** The spec a chunk id belongs to: "06.24" -> "06". */
export const specOf = (id) => specKey(String(id).split('.')[0]);
const isSpecId = (id) => /^\d+$/.test(String(id));

/** "2h 19m", "6m", "just now". */
export function dur(ms) {
  if (!Number.isFinite(ms) || ms < 60000) return 'just now';
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  if (!h) return `${m}m`;
  return `${h}h ${pad2(m % 60)}m`;
}

// ---- the plan ---------------------------------------------------------------

/** Flatten the plan to { specs, chunks, order, asap, held } with one spelling. */
export function normalizePlan(plan) {
  if (!plan) return null;
  const specs = [];
  const chunks = [];
  for (const s of plan.specs || []) {
    const id = specKey(s.id ?? s.num ?? s.n);
    specs.push({ id, title: s.title ?? s.name ?? '', file: s.file ?? '', open: s.open, unchunked: !!s.unchunked, percent: s.percent ?? null, counts: s.counts ?? null });
    for (const c of s.chunks || []) chunks.push({ ...c, spec: specKey(c.spec ?? id) });
  }
  for (const c of plan.chunks || []) if (!chunks.some((k) => k.id === c.id)) chunks.push({ ...c, spec: specKey(c.spec ?? specOf(c.id)) });
  const next = [].concat(plan.next || []);
  const order = (plan.order || next.map((c) => c.id) || []).map(String);
  const asapIds = new Set((plan.asap || []).map(String));
  for (const c of next) if (c.lane === 'asap') asapIds.add(String(c.id));
  const heldIds = new Set((plan.held || []).map(String));
  const all = chunks.map((c) => {
    const closed = c.state === 'closed' || c.state === 'settled' || !!c.closed;
    return {
      id: String(c.id), spec: c.spec, t: c.t ?? c.title ?? '', size: c.size || 'M',
      state: closed ? 'closed' : (c.state && LAB[c.state] ? c.state : 'ready'),
      asap: !!c.asap || asapIds.has(String(c.id)) || asapIds.has(c.spec),
      laneHeld: heldIds.has(String(c.id)) || heldIds.has(c.spec),
      plotted: c.plotted === true ? 'main' : (c.plotted || null), landed: c.landed || null, ai: !!c.ai,
      // The secret gate (spec 42): the names a chunk waits on; it parks as needs secret until they are set.
      needsSecret: !closed && Array.isArray(c.needsSecret) ? c.needsSecret.map(String) : [],
    };
  });
  return {
    repo: plan.repo || '', ownerName: plan.ownerName || '', protected: !!plan.protected,
    specs, chunks: all, order, planPr: plan.planPr || null,
  };
}

// ---- claims -----------------------------------------------------------------

/**
 * Who a claims row is, as the board draws it. kind: sess (one of your star
 * sessions), cloud, held, other (a neutral initial: someone else, or you in
 * a session the GUI can't name). person: 'you' | their name | 'cloud'.
 */
export function claimView(row, ctx, now = Date.now()) {
  const { meWho, owner, ownerName, sessions } = ctx;
  const at = Date.parse(row.at);
  const age = Number.isFinite(at) ? now - at : NaN;
  const since = dur(age);
  const left = Number.isFinite(age) ? dur(Math.max(0, TTL_H * 3600000 - age)) : '24h';
  const stale = row.state === 'stale';
  const pr = row.pr ? `PR #${row.pr}` : '';
  const isMe = (row.who && row.who === meWho) || !!row.mine;
  const ownerLabel = ownerName && ownerName !== 'you' ? ownerName : 'owner';
  const whoName = isMe ? 'you' : row.who === PRIVILEGED ? ownerLabel : (row.who || 'someone');
  const base = { raw: row, id: row.id, session: row.session || '', pr: row.pr || null, stale };
  if (String(row.session || '').startsWith('cloud-')) {
    const run = String(row.session).slice(6);
    return { ...base, kind: 'cloud', person: 'cloud', label: `loop #${run}`, since: pr || since, exp: pr ? `in review · ${pr}` : `${since} · ${left} left`, run };
  }
  if (row.held) {
    const heldMe = !!row.mine || (owner && row.who === PRIVILEGED && isMe);
    const name = heldMe ? 'you' : (typeof row.held === 'string' && row.held ? row.held : whoName);
    return { ...base, kind: 'held', person: name, label: `${name} · held`, since: 'never expires', exp: 'held · never expires' };
  }
  const sess = sessionOf(sessions, row.session);
  // A claim's tag names its session's star (s:<session>~<star>) even when no live session row does.
  const star = sess?.name || row.star || '';
  const exp = stale ? `stale · ${since}` : pr ? `in review · ${pr}` : `${since} · ${left} left`;
  if (isMe) {
    if (sess && sess.kind !== 'terminal' && isStarName(sess.name)) {
      const fell = sess.state === 'fallen';
      return { ...base, kind: 'sess', person: 'you', who: sess.name, label: sess.name, since: fell ? 'fell over' : (pr || since), exp: fell ? `fell over · ${left} left` : exp, stale: stale || fell, sess };
    }
    if (sess) return { ...base, kind: 'other', person: 'you', label: `${sess.name} · terminal`, since: pr || since, exp, initial: sess.name.slice(0, 1), sess };
    if (isStarName(star)) return { ...base, kind: 'sess', person: 'you', who: star, label: star, since: pr || since, exp };
    return { ...base, kind: 'other', person: 'you', label: 'you', since: pr || since, exp, initial: 'y' };
  }
  const sname = star || (row.session ? String(row.session).slice(0, 8) : '');
  return { ...base, kind: 'other', person: whoName, label: sname ? `${whoName} · ${sname}` : whoName, since: pr || since, exp, initial: whoName.slice(0, 1).toLowerCase() };
}

/**
 * The session row a claim's session tag names: by id, Claude Code id or claims session, else (a tag of 8 or more
 * characters, as the ledger's `claims` writes it) the session whose id starts with it.
 */
export function sessionOf(sessions, tag) {
  const t = String(tag || '');
  if (!t) return null;
  const list = sessions || [];
  return list.find((s) => s.id === t || s.claude === t || s.claimsSession === t)
    || (t.length >= 8 ? list.find((s) => String(s.id || '').startsWith(t) || String(s.claude || '').startsWith(t)) : null)
    || null;
}

/** Index the claims: chunk claims by id, spec claims (a bare number) by spec. */
export function indexClaims(rows, ctx, now) {
  const chunk = {};
  const spec = {};
  for (const r of rows || []) {
    const v = claimView(r, ctx, now);
    if (isSpecId(r.id)) spec[specKey(r.id)] = v;
    else chunk[String(r.id)] = v;
  }
  return { chunk, spec };
}

/** The current user's claims name: a claim of this session names it; the owner's checkout claims as the privileged agent. */
export function meWhoFrom(rows, owner, me) {
  return me?.who || ((rows || []).find((r) => r.mine && !r.held)?.who ?? (owner ? PRIVILEGED : null));
}

// ---- rows -------------------------------------------------------------------

/** A chunk merged with its claim: the moon state follows the claim. */
export function withClaim(c, claims) {
  const cl = claims.chunk[c.id] || null;
  if (c.state === 'closed') return { ...c, claim: null };
  let state = c.state;
  if (cl && cl.kind !== 'held') {
    if (cl.pr) state = 'review';
    else if (state === 'ready' || state === 'claimed') state = cl.sess && cl.sess.chunk === c.id ? 'building' : 'claimed';
  }
  return { ...c, state, claim: cl };
}

/**
 * The row model the board renders: flags for each action, labels, classes.
 * covered: a spec claim that covers this chunk. ui: { owner, prot, ownerName, req, pop }.
 */
export function rowModel(c, covered, ui) {
  const { owner, prot, ownerName, req = {}, pop = null } = ui;
  const cl = c.claim || (covered ? { ...covered, label: `${covered.label} · via spec`, since: 'covers this', via: true } : null);
  const closed = c.state === 'closed';
  const held = !!(cl && cl.kind === 'held');
  const mine = !!(cl && cl.person === 'you');
  const free = !cl && !closed;
  const requested = !!req[c.id];
  // Waiting on a secret: the key stands in for the moon, nobody can take it, and the owner gets "Add secret".
  const needs = !closed && !!(c.needsSecret && c.needsSecret.length);
  const state = held ? 'ready' : needs ? 'secret' : c.state;
  return {
    id: c.id, t: c.t, size: c.size, spec: c.spec, ai: !!c.ai, plotted: !!c.plotted && !closed,
    plottedLabel: c.plotted === 'main' ? 'just plotted · on main' : `just plotted · plan PR ${c.plotted}`,
    state, closed, bloom: !!c.bloom, delay: c.delay, relit: !!c.relit,
    covered: !!(cl && cl.via), hover: pop === c.id,
    stateLabel: held ? 'held' : needs ? 'needs secret' : LAB[c.state],
    claim: cl,
    needsKey: needs, needs: needs ? c.needsSecret.join(', ') : '',
    showAddKey: needs && !cl && owner,
    freeLabel: closed ? (c.landed || 'closed') : needs ? `${ownerName || 'the owner'} adds the key` : requested ? `requested · waiting on ${ownerName || 'the owner'}` : 'unclaimed',
    canClaim: free && !requested && !prot && !needs,
    canRequest: free && !requested && prot && !needs,
    canRelease: !!cl && !cl.via && (mine || owner) && cl.kind !== 'cloud' && !held,
    // A hold is the owner's assign (claims.mjs refuses anyone else's).
    canHold: owner && !closed && !held && !cl && !needs,
    canUnhold: held && (owner || mine),
    canReassign: owner && !!cl && !cl.via && !closed && cl.kind !== 'cloud',
    showPop: pop === c.id,
  };
}

// ---- lanes and sorting ---------------------------------------------------------

/** Rank by /next's simulated pick order, then the plan's own order (specs in table order, chunks as listed). */
export function ranker(plan) {
  const pick = new Map(plan.order.map((id, i) => [id, i]));
  const table = new Map(plan.chunks.map((c, i) => [c.id, i]));
  const r = (c) => (pick.has(c.id) ? pick.get(c.id) : 1e6 + (table.get(c.id) ?? 0));
  return (a, b) => r(a) - r(b);
}

/** Does a chunk wait on a secret (spec 42)? */
export const waits = (c) => c.state !== 'closed' && !!(c.needsSecret && c.needsSecret.length);

/** Does a row pass the stacked filters (mine, unclaimed, held)? */
export function passes(c, cover, flt) {
  if (!flt.mine && !flt.unclaimed && !flt.held) return true;
  const cl = c.claim || cover;
  if (flt.mine && cl && cl.person === 'you') return true;
  if (flt.unclaimed && !cl && c.state !== 'closed' && !waits(c)) return true;
  if (flt.held && cl && cl.kind === 'held') return true;
  return false;
}

/**
 * The all-chunks list as sections: [{ title, d, asap, rows }]. sort: next |
 * spec | size | claim. Closed chunks are left out (the fold shows them).
 */
export function lanes(plan, chunks, sort, flt, specClaims, { owner = true, ownerName = '' } = {}) {
  const byOrder = ranker(plan);
  const cover = (c) => (!c.claim && c.state !== 'closed' && specClaims[c.spec]) ? specClaims[c.spec] : null;
  const out = [];
  const push = (title, list, d, asap, secret) => {
    const l = list.filter((c) => passes(c, cover(c), flt));
    if (l.length) out.push({ title, d: d || '', asap: !!asap, secret: !!secret, rows: l.map((c) => [c, cover(c)]) });
  };
  const open = chunks.filter((c) => c.state !== 'closed');
  const isHeld = (c) => !!(c.claim && c.claim.kind === 'held') || c.laneHeld;
  if (sort === 'next') {
    push('asap', open.filter((c) => c.asap && !isHeld(c) && !waits(c)).sort(byOrder), 'pinned on top, /next takes these first', true);
    push('Next up', open.filter((c) => !c.asap && !isHeld(c) && !waits(c) && (c.state === 'ready' || c.state === 'claimed')).sort(byOrder), 'the order /next would pick');
    push('In flight', open.filter((c) => !c.asap && !isHeld(c) && (c.state === 'building' || c.state === 'review')).sort(byOrder), 'building or in review');
    push('Waiting on a secret', open.filter((c) => waits(c) && !isHeld(c)).sort(byOrder), owner ? 'add the value in the vault and it relights; /next skips it until then' : `${ownerName || 'the owner'} adds the value; /next skips it until then`, false, true);
    push('Held', open.filter(isHeld).sort(byOrder), 'never expires');
  } else if (sort === 'spec') {
    plan.specs.forEach((s) => push(`${s.id} · ${s.title}`, open.filter((c) => c.spec === s.id).sort(byOrder), s.file));
  } else if (sort === 'size') {
    ['L', 'M', 'S'].forEach((z) => push(`Size ${z}`, open.filter((c) => c.size === z).sort(byOrder), ''));
  } else {
    push('Unclaimed', open.filter((c) => !c.claim && !cover(c) && !c.laneHeld && !waits(c)).sort(byOrder), 'free to take');
    push('Waiting on a secret', open.filter((c) => waits(c) && !c.claim && !cover(c) && !c.laneHeld).sort(byOrder), 'nobody can take these until the value is set', false, true);
    push('Claimed', open.filter((c) => (c.claim || cover(c)) && !isHeld(c)).sort(byOrder), 'by a person, a session or the cloud loop');
    push('Held', open.filter(isHeld).sort(byOrder), 'never expires');
  }
  return out;
}

/**
 * % done per spec: closed (pending closes count as closed) over total. A spec carrying progress.mjs's own counts and
 * percent (GET /api/plan) reads those, so the bar says what `/next status` says.
 */
export function specProgress(list, spec) {
  const given = !!(spec && spec.counts && Number.isFinite(spec.percent));
  const total = given ? spec.counts.total : list.length;
  const done = given ? spec.counts.closed : list.filter((c) => c.state === 'closed').length;
  const pct = given ? spec.percent : total ? Math.round((done / total) * 100) : 0;
  return { total, done, pct, text: total ? `${done} of ${total}` : 'no chunks yet' };
}

/** The view's sub line: "tidepool · 4 specs · 18 chunks · 6 closed · claims expire after 24h unless held". */
export function subLine(repo, plan, owner) {
  const closed = plan.chunks.filter((c) => c.state === 'closed').length;
  const n = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`;
  const tail = owner ? 'you own this checkout' : 'claims expire after 24h unless held';
  return [repo, n(plan.specs.length, 'spec'), n(plan.chunks.length, 'chunk'), `${closed} closed`, tail].filter(Boolean).join(' · ');
}

// ---- the claims rail ------------------------------------------------------------

/**
 * Claims grouped by person, then session: [{ name, d, initial, av, you, sessions: [{ key, name, star, d, claims }] }].
 * You first, then people by name, the cloud loop last.
 */
export function railPeople(rows, ctx, chunkById, specById, now) {
  const people = new Map();
  const get = (key, init) => { if (!people.has(key)) people.set(key, { ...init, sessions: new Map() }); return people.get(key); };
  for (const r of rows || []) {
    const v = claimView(r, ctx, now);
    let p;
    if (v.kind === 'cloud') p = get('cloud', { name: 'cloud loop', initial: '', av: 'cloud', you: false });
    else if (v.person === 'you') p = get('you', { name: 'you', initial: 'y', av: 'you', you: true });
    else p = get(`p:${v.person}`, { name: v.person, initial: v.person.slice(0, 1).toLowerCase(), av: null, you: false, owner: r.who === PRIVILEGED || (!!ctx.ownerName && v.person === ctx.ownerName) });
    const skey = v.kind === 'held' ? 'held' : v.kind === 'cloud' ? `run ${v.run}` : (v.session || '-');
    if (!p.sessions.has(skey)) {
      const s = v.sess;
      const star = v.kind === 'sess' ? v.who : '';
      const name = v.kind === 'held' ? 'held' : v.kind === 'cloud' ? `run #${v.run}` : sessName(s || sessionOf(ctx.sessions, v.session), r, v);
      const d = v.kind === 'held' ? '' : s ? sessionWord(s) : v.kind === 'cloud' && r.at ? hhmm(r.at) : '';
      p.sessions.set(skey, { key: skey, name, star, d, named: v.kind === 'held' || v.kind === 'cloud' || name !== idName(s || sessionOf(ctx.sessions, v.session), v), claims: [] });
    }
    const ps = p.sessions.get(skey);
    // A claim made before its session had a star reads the bare id; a later one of the same session names the star.
    if (!ps.named && r.star) Object.assign(ps, { name: r.star, named: true });
    if (!ps.star && v.kind === 'sess') ps.star = v.who;
    const isSpec = isSpecId(r.id);
    const t = isSpec ? (specById[specKey(r.id)]?.title || '') : (chunkById[String(r.id)]?.t || '');
    p.sessions.get(skey).claims.push({ id: isSpec ? `spec ${specKey(r.id)}` : String(r.id), rawId: String(r.id), t, v });
  }
  const list = [...people.values()].map((p) => ({ ...p, sessions: [...p.sessions.values()].map((x) => ({ ...x, lines: foldClaims(x.claims, x.key) })) }));
  const you = list.filter((p) => p.you);
  const cloud = list.filter((p) => p.av === 'cloud');
  const rest = list.filter((p) => !p.you && p.av !== 'cloud').sort((a, b) => Number(b.owner) - Number(a.owner) || a.name.localeCompare(b.name));
  for (const p of you) {
    const n = p.sessions.filter((s) => s.key !== 'held').length;
    p.d = `${ctx.owner ? 'owner · ' : ''}${n} session${n === 1 ? '' : 's'}${ctx.owner ? '' : ' on this machine'}`;
  }
  for (const p of rest) p.d = p.owner ? 'owner' : 'contributor';
  for (const p of cloud) p.d = ctx.cloudNext ? `next run ${ctx.cloudNext}` : '';
  return [...you, ...rest, ...cloud];
}

/** A session's name with no star: the live row's id-cut name (GET /api/sessions names a starless session by its 8-char id), else the tag's. */
function idName(s, v) {
  const live = s?.name && !String(s.id || '').startsWith(s.name) && !String(s.claude || '').startsWith(s.name) ? '' : s?.name;
  return live || (v.session ? String(v.session).slice(0, 8) : 'no session');
}

/** A session's name in the rail: its star (the live row's, else the claim tag's ~star), else its 8-char id. */
function sessName(s, r, v) {
  const live = s?.name && idName(s, v) !== s.name ? s.name : '';
  return live || r.star || idName(s, v);
}

/** Chunk ids in plan order: 59.9 before 59.10, a spec claim (59) before its chunks. */
export const byChunkId = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });

/** A run of this many chunks of one spec, or more, folds into one line. */
export const FOLD_MIN = 3;

/**
 * One session's claims as the rail lists them (spec 47 A9). Its chunk claims of one spec, FOLD_MIN or more, fold into
 * one run line, gaps and all: first and last id, how many, and the age and time left once, from the oldest claim (the
 * soonest to expire). Fewer, a spec claim, or a claim in review stay rows of their own. In chunk-id order.
 * claims: railPeople's [{ id, rawId, t, v }] -> [{ kind: 'claim', c } | { kind: 'run', key, spec, from, to, n, exp, expKind, claims }]
 */
export function foldClaims(claims, sessKey = '') {
  const sorted = [...(claims || [])].sort((a, b) => byChunkId(a.rawId, b.rawId));
  const foldable = (c) => !isSpecId(c.rawId) && String(c.rawId).includes('.') && !c.v?.pr;
  const bySpec = new Map();
  for (const c of sorted) {
    if (!foldable(c)) continue;
    const sp = specOf(c.rawId);
    if (!bySpec.has(sp)) bySpec.set(sp, []);
    bySpec.get(sp).push(c);
  }
  const out = [];
  const done = new Set();
  for (const c of sorted) {
    if (done.has(c)) continue;
    const run = foldable(c) ? bySpec.get(specOf(c.rawId)) : null;
    if (!run || run.length < FOLD_MIN) { out.push({ kind: 'claim', c }); continue; }
    for (const x of run) done.add(x);
    const at = (x) => { const t = Date.parse(x.v?.raw?.at); return Number.isFinite(t) ? t : Infinity; };
    const oldest = run.reduce((o, x) => (at(x) < at(o) ? x : o), run[0]);
    const ov = oldest.v || {};
    const spec = specOf(c.rawId);
    out.push({
      kind: 'run', key: `${sessKey}|${spec}`, spec, from: run[0].id, to: run[run.length - 1].id, n: run.length,
      exp: ov.exp || '', expKind: ov.kind === 'held' ? 'held' : ov.stale ? 'stale' : undefined, claims: run,
    });
  }
  return out;
}

/** "02:30": a cloud run's start, local time. */
export function hhmm(iso) {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '';
}

/** A session's phase word in the rail ("Working", "Questions", "fell over", "terminal"). */
export function sessionWord(s) {
  if (s.state === 'fallen') return 'fell over';
  if (s.kind === 'terminal') return 'terminal';
  const p = s.phase || s.state || '';
  return p ? p[0].toUpperCase() + p.slice(1) : '';
}

// ---- the grip: reorder within a spec (spec 40 A12) ------------------------------
// A move is relative: { id, after } puts chunk `id` just after open chunk `after` (null: first). The server lands it
// as a pending edit, committed from a worktree of main (server/reorder.mjs, POST /api/plan/reorder); these rules only
// shape the preview, the call, and what the board says while and after it lands.

/** `list` with `id` moved to index `to` (clamped). */
export function moveTo(list, id, to) {
  const rest = list.filter((x) => x !== id);
  if (rest.length === list.length) return list.slice();
  rest.splice(Math.max(0, Math.min(rest.length, to)), 0, id);
  return rest;
}

/** The call a new order makes for chunk `id`: { id, after }, or null when nothing moved (or more than `id` did). */
export function moveOf(before, after, id) {
  if (!id || before.join() === after.join()) return null;
  const without = (l) => l.filter((x) => x !== id).join();
  if (without(before) !== without(after) || before.length !== after.length) return null;
  const i = after.indexOf(id);
  return i < 0 ? null : { id, after: i ? after[i - 1] : null };
}

/**
 * A key on a focused grip. st: { id, order } while a chunk is being moved, else null; list: the spec's open chunk ids
 * as listed. Arrow up and down (Home, End) move it in the preview; Enter or Space places it (commit: { id, after });
 * Escape puts it back. handled: the key was the grip's (the caller prevents its default).
 */
export function gripKey(st, key, list, id) {
  const cur = st && st.id === id ? st.order : list;
  const i = cur.indexOf(id);
  if (i < 0) return { st, handled: false };
  const to = key === 'ArrowUp' ? i - 1 : key === 'ArrowDown' ? i + 1 : key === 'Home' ? 0 : key === 'End' ? cur.length - 1 : null;
  if (to !== null) return { st: { id, order: moveTo(cur, id, to) }, handled: true };
  if (key === 'Enter' || key === ' ') return { st: null, commit: st && st.id === id ? moveOf(list, st.order, id) : null, handled: true };
  if (key === 'Escape') return { st: null, handled: !!st };
  return { st, handled: false };
}

/** The preview while dragging `id` over `over`: before it, or after it when the pointer is on its lower half. */
export function dragOrder(list, id, over, below) {
  if (!list.includes(id) || !list.includes(over) || id === over) return list.slice();
  const rest = list.filter((x) => x !== id);
  rest.splice(rest.indexOf(over) + (below ? 1 : 0), 0, id);
  return rest;
}

/** Rows (anything with an id) with the ids `order` names filling their own slots in that order; the rest stay put. */
export function inOrder(rows, order) {
  if (!order) return rows;
  const at = new Map(order.map((id, i) => [id, i]));
  const named = rows.filter((r) => at.has(r.id)).sort((a, b) => at.get(a.id) - at.get(b.id));
  let k = 0;
  return rows.map((r) => (at.has(r.id) ? named[k++] : r));
}

/** A move in words: `07.2 after 07.4`, `07.5 to the top`. */
const moveWords = (mv) => `${mv.id}${mv.after ? ` after ${mv.after}` : ' to the top'}`;

/**
 * What a spec says while its move lands (47 A11): the server commits it in a worktree of main, then settles and
 * pushes it (owner) or opens a pull request (contributor). The preview order shows meanwhile, marked as not yet landed.
 */
export function landingSays(mv, owner) {
  return `Moving ${moveWords(mv)}: ${owner ? 'committing it to main and pushing' : 'opening a pull request'}…`;
}

/**
 * The toast a move gets once the server answers: what landed (`Reordered on main`, `Opened PR #7`), never a bare
 * "moved" for a move that only sits somewhere. keep: whether the board keeps showing the new order (it is on main;
 * a pull request's order shows once it merges).
 */
export function landedToast(mv, res = {}) {
  if (res.landed === 'main') return { kind: 'shipped', title: `Reordered on ${res.branch || 'main'}`, body: res.note || `${moveWords(mv)}.`, keep: true };
  if (res.landed === 'pr') return { kind: 'info', title: res.pr ? `Opened PR #${res.pr}` : 'Opened a pull request', body: res.note || `${moveWords(mv)}.`, url: res.url || null, keep: false };
  // A server from before the landing wrote a pending file into this checkout: say so, it is not on main.
  return { kind: 'info', title: `${moveWords(mv)} waits in ${res.file || 'a pending file'}`, body: res.note || 'Not landed yet: commit and push it, or update the GUI.', keep: true };
}

/** What the grip says to a screen reader while a chunk moves. */
export function gripSays(st) {
  if (!st) return '';
  const n = st.order.indexOf(st.id) + 1;
  return `${st.id}: place ${n} of ${st.order.length}. Enter places it, Escape puts it back.`;
}

// ---- Reassign's picker (spec 40 A12) ---------------------------------------------------

/** A GitHub login, with or without its @. */
export const GH_LOGIN = /^@?[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

/**
 * Who a claim can go to: the owner (a hold, never expires), then everyone else who holds a claim, by name. Each
 * target: { key, name, desc, owner?, to?, login? }; a person whose GitHub login no claim carries (only a hold
 * names one) gets `login: ''` and the picker asks for it; so does the last row, Someone else. The chunk's current
 * holder is left out; so is the cloud loop.
 */
export function reassignTargets(rows, ctx, id) {
  const cur = (rows || []).find((r) => String(r.id) === String(id));
  const people = new Map();
  for (const r of rows || []) {
    if (!r.who || r.who === PRIVILEGED || String(r.session || '').startsWith('cloud-')) continue;
    if (!people.has(r.who)) people.set(r.who, { who: r.who, login: '', where: new Set(), n: 0 });
    const p = people.get(r.who);
    if (r.held && typeof r.held === 'string' && !p.login) p.login = r.held.replace(/^@/, '');
    if (!r.held && (r.star || r.session)) p.where.add(r.star || String(r.session).slice(0, 8));
    p.n++;
  }
  const out = [];
  if (!cur || cur.who !== PRIVILEGED) {
    const name = ctx.owner ? 'you' : (ctx.ownerName || 'the owner');
    out.push({ key: 'owner', owner: true, name, desc: 'the owner · held, never expires' });
  }
  const list = [...people.values()].filter((p) => !cur || p.who !== cur.who).sort((a, b) => a.who.localeCompare(b.who));
  for (const p of list) {
    const where = [...p.where];
    const desc = [p.login ? `@${p.login}` : 'GitHub login needed', `${p.n} claim${p.n === 1 ? '' : 's'}`, where.length ? where.join(', ') : ''].filter(Boolean).join(' · ');
    out.push({ key: `p:${p.who}`, name: p.who, to: p.who, login: p.login, desc });
  }
  out.push({ key: 'other', name: 'Someone else', login: '', desc: 'by their GitHub login' });
  return out;
}

/** POST /api/claims/reassign's body for a target (and a typed login when it has none), or null when a login is missing. */
export function reassignBody(id, target, login = '') {
  if (!target) return null;
  if (target.owner) return { id, owner: true };
  const l = String(target.login || login || '').trim().replace(/^@/, '');
  if (!GH_LOGIN.test(l)) return null;
  return { id, login: l, ...(target.to ? { to: target.to } : null) };
}

/** ownerName at the start of a sentence: the fallbacks ('the owner', 'you') take a capital, a login never does. */
export const ownerLead = (name) => (name === 'the owner' || name === 'you' ? name[0].toUpperCase() + name.slice(1) : name);
