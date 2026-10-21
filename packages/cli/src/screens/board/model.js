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
export const CS = { ready: 'cs-ready', claimed: 'cs-claimed', building: 'cs-building', review: 'cs-review', closed: 'cs-settled' };

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
  const sess = (sessions || []).find((s) => s.id === row.session || s.claimsSession === row.session);
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
  const state = held ? 'ready' : c.state;
  return {
    id: c.id, t: c.t, size: c.size, spec: c.spec, ai: !!c.ai, plotted: !!c.plotted && !closed,
    plottedLabel: c.plotted === 'main' ? 'just plotted · on main' : `just plotted · plan PR ${c.plotted}`,
    state, closed, bloom: !!c.bloom, delay: c.delay,
    covered: !!(cl && cl.via), hover: pop === c.id,
    stateLabel: held ? 'held' : LAB[c.state],
    claim: cl,
    freeLabel: closed ? (c.landed || 'closed') : requested ? `requested · waiting on ${ownerName || 'the owner'}` : 'unclaimed',
    canClaim: free && !requested && !prot,
    canRequest: free && !requested && prot,
    canRelease: !!cl && !cl.via && (mine || owner) && cl.kind !== 'cloud' && !held,
    // A hold is the owner's assign (claims.mjs refuses anyone else's).
    canHold: owner && !closed && !held && !cl,
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

/** Does a row pass the stacked filters (mine, unclaimed, held)? */
export function passes(c, cover, flt) {
  if (!flt.mine && !flt.unclaimed && !flt.held) return true;
  const cl = c.claim || cover;
  if (flt.mine && cl && cl.person === 'you') return true;
  if (flt.unclaimed && !cl && c.state !== 'closed') return true;
  if (flt.held && cl && cl.kind === 'held') return true;
  return false;
}

/**
 * The all-chunks list as sections: [{ title, d, asap, rows }]. sort: next |
 * spec | size | claim. Closed chunks are left out (the fold shows them).
 */
export function lanes(plan, chunks, sort, flt, specClaims) {
  const byOrder = ranker(plan);
  const cover = (c) => (!c.claim && c.state !== 'closed' && specClaims[c.spec]) ? specClaims[c.spec] : null;
  const out = [];
  const push = (title, list, d, asap) => {
    const l = list.filter((c) => passes(c, cover(c), flt));
    if (l.length) out.push({ title, d: d || '', asap: !!asap, rows: l.map((c) => [c, cover(c)]) });
  };
  const open = chunks.filter((c) => c.state !== 'closed');
  const isHeld = (c) => !!(c.claim && c.claim.kind === 'held') || c.laneHeld;
  if (sort === 'next') {
    push('asap', open.filter((c) => c.asap && !isHeld(c)).sort(byOrder), 'pinned on top, /next takes these first', true);
    push('Next up', open.filter((c) => !c.asap && !isHeld(c) && (c.state === 'ready' || c.state === 'claimed')).sort(byOrder), 'the order /next would pick');
    push('In flight', open.filter((c) => !c.asap && !isHeld(c) && (c.state === 'building' || c.state === 'review')).sort(byOrder), 'building or in review');
    push('Held', open.filter(isHeld).sort(byOrder), 'never expires');
  } else if (sort === 'spec') {
    plan.specs.forEach((s) => push(`${s.id} · ${s.title}`, open.filter((c) => c.spec === s.id).sort(byOrder), s.file));
  } else if (sort === 'size') {
    ['L', 'M', 'S'].forEach((z) => push(`Size ${z}`, open.filter((c) => c.size === z).sort(byOrder), ''));
  } else {
    push('Unclaimed', open.filter((c) => !c.claim && !cover(c) && !c.laneHeld).sort(byOrder), 'free to take');
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
      const name = v.kind === 'held' ? 'held' : v.kind === 'cloud' ? `run #${v.run}` : (s?.name || r.star || (v.session ? String(v.session).slice(0, 8) : 'no session'));
      const d = v.kind === 'held' ? '' : s ? sessionWord(s) : v.kind === 'cloud' && r.at ? hhmm(r.at) : '';
      p.sessions.set(skey, { key: skey, name, star, d, claims: [] });
    }
    const isSpec = isSpecId(r.id);
    const t = isSpec ? (specById[specKey(r.id)]?.title || '') : (chunkById[String(r.id)]?.t || '');
    p.sessions.get(skey).claims.push({ id: isSpec ? `spec ${specKey(r.id)}` : String(r.id), rawId: String(r.id), t, v });
  }
  const list = [...people.values()].map((p) => ({ ...p, sessions: [...p.sessions.values()] }));
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
