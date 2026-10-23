// Who needs the owner right now, for the top bar of every screen: one row per session, the most pressing first.
// A permission waits on a tool call, a question waits on an answer (the start questions among them), and a session
// that fell over waits on a resume decision. Parked and plan questions are not here: they wait on the Oversight
// button's count, and nothing stops for them.
//
// Server: GET /api/needs and the `needs` event on every live channel (server.mjs) send needsFrom(...).
// The page: needsBar() splits the rows into chips and the rest, for the top bar (src/ui/needs.jsx).

const ORDER = { permission: 0, question: 1, fallen: 2, stopped: 3 };
/** Kinds that wait on a decision, not on an answer now: no pulse, never "urgent". */
export const CALM = new Set(['fallen', 'stopped']);
const SKIP = new Set(['closed', 'resuming', 'resumed']);

const clip = (t, n = 140) => {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 3)}...` : s;
};
const ms = (t) => { const v = typeof t === 'number' ? t : Date.parse(t); return Number.isFinite(v) ? v : null; };

/**
 * rows: the fleet's session rows (GET /api/sessions without its git: id, name, kind, state, questions, fell, ended,
 * chunk); hosted: the sessions this server runs, [{ id, claude, asks: [view], permissions: [view] }].
 * -> [{ id, name, kind, what: 'permission'|'question'|'fallen', count, label, detail, at, to }]
 */
export function needsFrom(rows = [], hosted = []) {
  const out = [];
  const list = (Array.isArray(rows) ? rows : []).filter(Boolean);
  // A session this server runs that the list leaves out (the home session) still needs the owner when it asks.
  const unlisted = (hosted || []).filter((h) => h && h.id && !list.some((r) => r.id === h.id || (h.claude && r.claude === h.claude)));
  for (const h of unlisted) list.push({ id: h.id, claude: h.claude, name: h.name || String(h.id).slice(0, 8), kind: 'local', state: 'live' });
  for (const r of list) {
    if (!r || !r.id || r.ended || SKIP.has(r.state)) continue;
    const h = (hosted || []).find((x) => x && (x.id === r.id || (x.claude && x.claude === r.claude)));
    const perms = h && Array.isArray(h.permissions) ? h.permissions : [];
    const asks = h && Array.isArray(h.asks) ? h.asks : [];
    const base = { id: r.id, name: r.name || String(r.id).slice(0, 8), kind: r.kind || 'local' };
    const cockpit = `/s/${encodeURIComponent(r.id)}`;
    if (perms.length) {
      const p = perms[0];
      out.push({
        ...base, what: 'permission', count: perms.length,
        label: perms.length > 1 ? `${perms.length} permissions` : `Allow ${p.tool || 'a tool'}?`,
        detail: clip(p.title || p.args || p.summary), at: ms(p.at), to: cockpit,
      });
      continue;
    }
    const qs = asks.flatMap((a) => (Array.isArray(a.questions) && a.questions.length ? a.questions : [{}]).map((q) => ({ q, at: a.at })));
    const total = qs.length || (r.state === 'asking' ? Math.max(1, (r.questions?.total || 0) - (r.questions?.answered || 0)) : 0);
    if (total) {
      const first = qs[0]?.q || {};
      out.push({
        ...base, what: 'question', count: total,
        label: total > 1 ? `${total} questions` : 'a question',
        detail: clip(first.question || first.header || r.event?.text), at: ms(qs[0]?.at) ?? ms(r.event?.at), to: cockpit,
      });
      continue;
    }
    if (r.state === 'stopped') continue; // counted below, in one quiet row
    if (r.state === 'fallen' || r.state === 'resume-failed') {
      const f = r.fell || {};
      const where = f.chunk || r.chunk?.id || '';
      out.push({
        ...base, what: 'fallen', count: 1,
        label: r.state === 'resume-failed' ? 'resume failed' : 'fell over',
        detail: clip(`${f.tool ? `Fell over at ${f.tool}` : 'Fell over'}${where ? ` in ${where}` : ''}. Resume it or clear it.`),
        at: ms(f.at) ?? ms(r.beat), to: '/?show=fallen',
      });
    }
  }
  // Sessions that stopped with nexus (a restart, an upgrade) never alarm: two or more get one quiet row that lands on
  // the fleet, where Pick up all brings them back. One alone waits on its own tile.
  const stopped = list.filter((r) => r && r.state === 'stopped' && !r.ended);
  if (stopped.length >= 2) {
    out.push({
      id: 'stopped', name: `${stopped.length} sessions`, kind: 'other', what: 'stopped', count: stopped.length,
      label: 'stopped with nexus', detail: 'Pick up all to carry on where they left off.', at: null, to: '/?show=here',
    });
  }
  // The most pressing first; within a kind, whoever has waited longest.
  return out.sort((a, b) => ORDER[a.what] - ORDER[b.what] || (a.at ?? Infinity) - (b.at ?? Infinity) || a.name.localeCompare(b.name));
}

/**
 * The top bar's share of the rows: the first `max` as chips, the rest behind "+N". `here` is the session whose cockpit is
 * open: what it needs is already in front of the owner, so it takes no chip (it still counts in `total`).
 * -> { chips, more, total, urgent }  (urgent: a permission or a question is waiting, not only a fallen session)
 */
export function needsBar(rows = [], { max = 3, here = null } = {}) {
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && r.id !== here);
  return {
    chips: list.slice(0, max),
    more: list.slice(max),
    total: (Array.isArray(rows) ? rows : []).length,
    urgent: list.some((r) => !CALM.has(r.what)),
  };
}

/** The words a screen reader hears for one row: "vega asks a question: Ties on points..." */
export function needsSay(r) {
  if (!r) return '';
  const head = r.what === 'permission' ? `${r.name} asks: ${r.label}`
    : r.what === 'question' ? `${r.name} asks ${r.label}`
      : `${r.name} ${r.label}`;
  return r.detail ? `${head}. ${r.detail}` : head;
}
