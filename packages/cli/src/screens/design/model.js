// The design gallery's view model (spec 43, A7): one handoff from GET /api/design (server/design.mjs, the repo's
// port-map.mjs) as pages of board cards, each with its port status. Pure: no React, no fetch.
//
//   handoff: { id, ok, problems, pages: [{ id, name }], boards: [{ board, page, status, files?, reason?, chunk? }] }

const LOOK = {
  ported: { label: 'ported', kind: 'active' },
  skipped: { label: 'skipped', kind: 'idle' },
  pending: { label: 'pending', kind: 'fallen' },
  unmapped: { label: 'unmapped', kind: 'orphan' },
};

export const STATUSES = ['ported', 'skipped', 'pending', 'unmapped'];

/** A status's flag: { label, kind } (the .flag is-<kind>). An unknown status reads as unmapped. */
export function statusLook(status) {
  return { ...(LOOK[status] || LOOK.unmapped) };
}

function card(b) {
  const status = LOOK[b.status] ? b.status : 'unmapped';
  const look = statusLook(status);
  let detail = '';
  if (status === 'ported') detail = (Array.isArray(b.files) ? b.files : []).join(', ');
  else if (status === 'skipped') detail = String(b.reason || '');
  else if (status === 'pending') detail = b.chunk ? `waits on ${b.chunk}` : '';
  else detail = 'not in the port map';
  return {
    name: String(b.board),
    status,
    label: status === 'pending' && b.chunk ? `pending ${b.chunk}` : look.label,
    kind: look.kind,
    detail,
  };
}

/**
 * -> { pages: [{ id, name, boards: [card] }], counts: { ported, skipped, pending, unmapped, total } }. Pages read in
 * the canvas's order; a page the canvas does not name keeps its id; boards with no page go last, as "Other boards".
 * `only` keeps one status (the counts stay the whole handoff's).
 */
export function galleryOf(handoff, { only = null } = {}) {
  const counts = { ported: 0, skipped: 0, pending: 0, unmapped: 0, total: 0 };
  const boards = Array.isArray(handoff?.boards) ? handoff.boards.filter((b) => b && b.board) : [];
  const cards = boards.map((b) => ({ page: b.page ?? null, c: card(b) }));
  for (const { c } of cards) { counts[c.status]++; counts.total++; }
  const named = new Map((Array.isArray(handoff?.pages) ? handoff.pages : []).map((p) => [String(p.id), String(p.name ?? p.id)]));
  const order = [...named.keys()];
  for (const { page } of cards) if (page != null && !order.includes(String(page))) order.push(String(page));
  const pages = [];
  for (const id of [...order, null]) {
    const list = cards.filter((x) => (x.page == null ? id === null : String(x.page) === id)).map((x) => x.c).filter((c) => !only || c.status === only);
    if (list.length) pages.push({ id, name: id === null ? 'Other boards' : named.get(id) || id, boards: list });
  }
  return { pages, counts };
}

/** The handoff to show: the one `want` names, else the last found (the newest dated delivery sorts last). */
export function handoffPick(handoffs, want) {
  const list = Array.isArray(handoffs) ? handoffs : [];
  if (!list.length) return null;
  return list.find((h) => h.id === want) || list[list.length - 1];
}
