// Put away (0.5.1): a session that finished its job closes from its cockpit or its Fleet tile. Its star frees, the
// session ends and, when it left nothing behind, its empty worktree closes the way Clear closes one (the repo's own
// scripts/worktree.mjs, never a bare `git worktree remove`). This is the rule the screen and the server both read:
// what the session still holds, so putting it away never loses work. Pure.
//
//   holdsOf(row)     -> [{ kind: 'commits' | 'changes' | 'claims' | 'git', n?, ids?, text }]
//   putAwayPlan(row) -> { clean, holds, say, keep, worktree }
//
// `row` is a GET /api/sessions row with its git (server/git.mjs forSession): up / ahead (commits past its base),
// dirty and staged (counts or flags), claims (a count, null when unknown) and claimIds.
//
// A session with no worktree of its own works in the shared checkout: its commits and changes there may be anyone's
// (the owner's own edits, another session's), and putting it away touches none of them, so only its claims count.

const TRUNKS = new Set(['', 'main', 'master', 'trunk', 'develop', 'HEAD']);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const count = (v) => (v === true ? 1 : Number(v) > 0 ? Number(v) : 0);

/** The claims a session's git says it holds: a count (the live server), or the ids themselves (the demo). */
export function claimCount(g = {}) {
  if (Array.isArray(g.claims)) return g.claims.length;
  return Number(g.claims) > 0 ? Number(g.claims) : 0;
}

/** What a session still holds that putting it away must keep. Empty: it left nothing behind. */
export function holdsOf(row = {}) {
  const g = row.git || {};
  const out = [];
  const own = !!g.worktree;
  const ahead = g.ahead != null ? g.ahead : g.up;
  if (ahead == null) out.push({ kind: 'git', text: 'git unknown' });
  else if (own && Number(ahead) > 0) {
    const where = TRUNKS.has(String(g.branch || '')) ? 'not pushed yet' : 'not on main yet';
    out.push({ kind: 'commits', n: Number(ahead), text: `${plural(Number(ahead), 'commit')} ${where}` });
  }
  const changed = own ? count(g.dirty) + count(g.staged) : 0;
  if (changed) out.push({ kind: 'changes', n: changed, text: changed === 1 ? 'an uncommitted change' : `${changed} uncommitted changes` });
  // Claims that could not be read are not "no claims": they stay, and the card says it does not know.
  if (ahead != null && g.claims == null) out.push({ kind: 'git', text: 'claims unknown' });
  const claims = claimCount(g);
  if (claims) {
    const ids = (Array.isArray(g.claimIds) ? g.claimIds : Array.isArray(g.claims) ? g.claims : []).filter(Boolean).map(String);
    out.push({ kind: 'claims', n: claims, ids, text: `${plural(claims, 'claim')}${ids.length ? ` (${ids.join(', ')})` : ''}` });
  }
  return out;
}

/** "a, b and c" */
export function andList(items) {
  const xs = items.filter(Boolean);
  if (xs.length < 2) return xs[0] || '';
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/**
 * How a session puts away. clean: nothing held, so its session ends, its star frees and its empty worktree closes.
 * Otherwise `say` names what it holds and `keep` the safe choice: the session ends and its star frees, but its
 * worktree, branch and claims stay exactly as they are (nothing is deleted).
 */
export function putAwayPlan(row = {}) {
  const holds = holdsOf(row);
  const worktree = row.git?.worktree || '';
  const clean = holds.length === 0;
  const known = holds.filter((h) => h.kind !== 'git');
  const unknown = holds.filter((h) => h.kind === 'git');
  const say = [
    known.length ? `It still holds ${andList(known.map((h) => h.text))}.` : '',
    unknown.some((h) => h.text === 'git unknown') ? 'Its git could not be read, so nothing of it is closed.'
      : unknown.length ? 'Its claims could not be read, so nothing of it is closed.' : '',
  ].filter(Boolean).join(' ');
  const keep = clean ? '' : worktree
    ? 'Putting it away keeps all of that: its worktree, branch and claims stay as they are.'
    : 'Putting it away keeps all of that: its branch and claims stay as they are.';
  return { clean, holds, say, keep, worktree };
}
