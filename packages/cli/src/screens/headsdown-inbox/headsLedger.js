// The session ledger as the heads-down canvas reads it. Pure, no JSX, so tests import it.
/**
 * GET /api/sessions/:id is one ledger for both the cockpit and this view; its
 * shape is documented in screens/cockpit/model.js. Fold that shape into the
 * fields this canvas reads (questions as counts, closed as a count, the
 * budget in ms, git ahead/behind, the context strata), keeping any field
 * already in this view's own form.
 */
export function headsLedger(L) {
  if (!L) return {};
  const out = { ...L };
  out.phase = { start: 'questions-start', review: 'questions-end' }[L.phase] || L.phase;
  if (Array.isArray(L.questions)) out.questions = { settled: L.questions.filter((q) => q.answer != null || q.how).length, total: L.questions.length };
  if (Array.isArray(L.closed)) out.closed = L.closed.length;
  if (L.budget && typeof L.budget === 'object') { out.budget = L.budget.label || null; if (out.budgetMs == null) out.budgetMs = L.budget.ms; }
  if (L.spec && typeof L.spec === 'object') out.spec = [L.spec.ref, L.spec.line].filter(Boolean).join('  ');
  if (L.git) {
    const g = { ...L.git };
    if (g.ahead == null && g.up != null) g.ahead = g.up;
    if (typeof g.behind !== 'number') g.behind = g.down ?? 0;
    if (g.pr && g.pr.num && !g.pr.state) g.pr = { ...g.pr, state: 'open' };
    out.git = g;
  }
  if (Array.isArray(L.parked)) out.parked = L.parked.map((p) => ({ ...p, assumed: p.assumed ?? p.default ?? p.alts?.[0] }));
  if (L.context && Array.isArray(L.context.strata)) {
    const [pinned, spec, conversation] = L.context.strata;
    out.context = { pinned, spec, conversation, ...L.context, compactAt: L.context.compactAt ?? L.context.compactsAt };
  }
  if (L.base?.num && !L.package?.stacksOn) out.package = { ...(L.package || {}), stacksOn: L.base.num };
  return out;
}
