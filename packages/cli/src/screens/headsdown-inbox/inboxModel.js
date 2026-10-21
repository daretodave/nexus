// The oversight inbox's items, from whatever the server serves today.
//
//   GET /api/inbox (served since 40.2): every open and parked question across
//   sessions and the plan, already tagged by star (server/fleet-home.mjs).
//   An older server without it falls back to:
//   - live asks (AskUserQuestion), one row per question   -> Waiting now
//   - live permission requests                            -> Waiting now
//   - durable questions in plan/ ([needs-user-call], open questions)
//                                                         -> From cloud runs
//     (their answers land in the plan for the next loop, like a cloud run's)
//
// An item: { id, kind: 'now'|'parked'|'cloud', src: 'inbox'|'ask'|'perm'|'durable',
//   session: { name, kind } | null, sessionId, run, who, chunk, chunkT, phase,
//   age, at, deadline (a live question: when its session takes the default), q, opts: [label], why, hasDefault,
//   freeText, raw, secret? (a secret request: the name it waits on; answered by the key card, never by a default) }

const label = (o) => (typeof o === 'string' ? o : o?.label || '');
const pad2 = (n) => String(n).padStart(2, '0');
export const clock = (t) => { const d = new Date(t); return Number.isNaN(d.getTime()) ? '' : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

export function ago(t, now = Date.now()) {
  const ms = now - (typeof t === 'number' ? t : Date.parse(t));
  if (!Number.isFinite(ms)) return '';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

function sessionOf(s) {
  if (!s) return null;
  if (typeof s === 'string') return { name: s, kind: 'local' };
  return { name: s.name, kind: s.kind || 'local', id: s.id };
}

/**
 * GET /api/inbox rows -> items. The server tags each row with its session's star and says where it came from
 * (`src`): an ask, a permission and a plan question keep their own answer paths (POST /api/ask/:id,
 * /api/permission/:id, /api/oversight/answer), so they go through the same builders as the live ones below; a
 * parked question (src inbox) answers through POST /api/inbox/:id.
 */
export function fromInbox(data, now) {
  const rows = Array.isArray(data) ? data : data?.items || [];
  return rows.flatMap((x) => {
    const tag = (item) => ({ ...item, session: sessionOf(x.session), sessionId: x.sessionId || x.session?.id || null, chunk: x.chunk || item.chunk });
    if (x.src === 'ask' && x.askId) {
      const [one] = fromAsks([{ id: x.askId, agent: x.agent, at: x.at, deadline: x.deadline, questions: [{ question: x.qText, options: x.options || [] }] }], { now });
      return tag({ ...one, id: String(x.id), q: x.question || one.q, opts: (x.options || []).map(label).filter(Boolean), why: x.why || '', raw: x });
    }
    if (x.src === 'perm' && x.perm) return tag(fromPermissions([x.perm], { now })[0]);
    if (x.src === 'durable' && x.durable) return fromDurable([x.durable]);
    return fromInboxRow(x, now);
  });
}

function fromInboxRow(x, now) {
  const opts = (x.options || x.opts || []).map(label).filter(Boolean);
  const def = x.default != null ? label(x.default) : opts[0];
  const ordered = def && opts.includes(def) ? [def, ...opts.filter((o) => o !== def)] : opts;
  const session = sessionOf(x.session);
  return {
    id: String(x.id),
    kind: x.kind === 'parked' || x.kind === 'cloud' ? x.kind : 'now',
    src: 'inbox',
    session: x.kind === 'cloud' ? null : session,
    sessionId: x.sessionId || session?.id || null,
    run: x.run ? `#${String(x.run).replace(/^#/, '')}` : '',
    who: x.who || x.agent || 'main',
    chunk: x.chunk || '',
    chunkT: x.chunkTitle || x.chunkT || '',
    phase: x.phase || '',
    age: x.at ? `asked ${ago(x.at, now)}` : '',
    at: x.at ? clock(x.at) : '',
    q: x.question || x.q || '',
    opts: ordered,
    why: x.why || '',
    hasDefault: ordered.length > 0,
    freeText: true,
    settled: x.settled || null,
    raw: x,
  };
}

/** Live AskUserQuestion requests -> one item per question. */
export function fromAsks(asks = [], { stage, chunk, now } = {}) {
  const out = [];
  for (const a of asks) {
    const agent = !a.agent || a.agent === 'main' ? 'main' : (stage?.agents?.[a.agent]?.label || 'agent').split(/\s+/)[0].toLowerCase();
    (a.questions || []).forEach((q, i) => {
      const opts = (q.options || []).map(label).filter(Boolean);
      const first = (q.options || [])[0];
      out.push({
        id: `${a.id}:${i}`,
        kind: 'now',
        src: 'ask',
        askId: a.id,
        qText: q.question || q.header || `Question ${i + 1}`,
        session: null,
        sessionId: null,
        run: '',
        who: agent,
        chunk: chunk || '',
        chunkT: '',
        phase: '',
        age: a.at ? `asked ${ago(a.at, now)}` : '',
        at: a.at ? clock(a.at) : '',
        deadline: a.deadline ?? null,
        q: q.question || q.header || '',
        opts,
        why: typeof first === 'object' && first?.description ? first.description : '',
        hasDefault: opts.length > 0,
        freeText: true,
        raw: q,
      });
    });
  }
  return out;
}

/** The useful part of a permission's tool input: the command, the file, or the first value. */
function permTarget(summary) {
  if (!summary) return '';
  try {
    const o = JSON.parse(summary);
    const v = o.command || o.file_path || o.path || o.url || o.pattern || Object.values(o).find((x) => typeof x === 'string');
    return v ? String(v).replace(/\s+/g, ' ').slice(0, 160) : '';
  } catch { return String(summary).slice(0, 160); }
}

/** Live permission requests -> items with no default (a tool waits on a yes or no). */
export function fromPermissions(perms = [], { stage, chunk, now } = {}) {
  return perms.map((p) => ({
    id: `perm:${p.id}`,
    kind: 'now',
    src: 'perm',
    session: null,
    sessionId: null,
    run: '',
    who: !p.agent || p.agent === 'main' ? 'main' : (stage?.agents?.[p.agent]?.label || 'agent').split(/\s+/)[0].toLowerCase(),
    chunk: chunk || '',
    chunkT: '',
    phase: '',
    age: p.at ? `asked ${ago(p.at, now)}` : 'asks permission',
    at: p.at ? clock(p.at) : '',
    q: `Allow ${p.tool}${permTarget(p.summary) ? `: ${permTarget(p.summary)}` : ''}?`,
    opts: p.canAlways ? ['Allow', 'Always allow', 'Deny'] : ['Allow', 'Deny'],
    why: p.reason || '',
    hasDefault: false,
    freeText: false,
    raw: p,
  }));
}

/**
 * A secret request (the server marks it: `secret: { chunk, names, missing }`) -> one key item per name still missing.
 * It has no default and no countdown, so batch-answer and "Approve all" pass over it; the key card answers it.
 */
function fromSecretRequest(d) {
  const { chunk = '', missing = [] } = d.secret || {};
  return missing.map((name) => ({
    id: `plan:${d.id}:${name}`,
    kind: 'cloud',
    src: 'durable',
    session: null,
    sessionId: null,
    run: 'plan',
    who: 'the plan',
    chunk,
    chunkT: '',
    phase: '',
    file: d.file,
    line: d.line,
    age: '',
    at: '',
    q: `${chunk} needs ${name}`,
    secret: name,
    opts: [],
    why: '',
    hasDefault: false,
    freeText: false,
    raw: d,
  }));
}

/** A secret request row's shape (server/secrets.mjs REQUEST_ROW): `secret request <chunk>: set A, B ...`. */
const SECRET_REQUEST = /secret request \S+?:\s*set\s+[A-Z][A-Z0-9_]*/;

/**
 * Durable questions in plan/ -> items answered in words, landing in the plan (a secret request: key items). A secret
 * request the server did not mark (an older server, a vault it could not read) is dropped, never drawn as a
 * free-text question: its answer would go to a session, and a value never goes through one.
 */
export function fromDurable(rows = []) {
  return rows.flatMap((d) => (d.secret ? fromSecretRequest(d) : SECRET_REQUEST.test(String(d.text || '')) ? [] : [{
    id: `plan:${d.id}`,
    kind: 'cloud',
    src: 'durable',
    session: null,
    sessionId: null,
    run: 'plan',
    who: d.source === 'needs-user-call' ? 'needs-user-call' : 'open question',
    chunk: '',
    chunkT: '',
    phase: '',
    file: d.file,
    line: d.line,
    age: '',
    at: '',
    q: d.text,
    opts: [],
    why: '',
    hasDefault: false,
    freeText: true,
    raw: d,
  }]));
}

/** Every item for the view: the inbox when served, else today's sources. */
export function collect({ inbox, live, oversight, now }) {
  if (inbox.status === 'ready' && inbox.data) return { items: fromInbox(inbox.data, now), served: true };
  const ctx = { stage: live?.stage, chunk: live?.stage?.current || '', now };
  const durable = oversight.status === 'ready' ? oversight.data?.durable || [] : [];
  return {
    items: [...fromAsks(live?.asks, ctx), ...fromPermissions(live?.permissions, ctx), ...fromDurable(durable)],
    served: false,
  };
}

/** "Lee and Ana" / "a, b and c". */
export function names(list) {
  const a = [...new Set(list.filter(Boolean))];
  if (a.length <= 1) return a[0] || '';
  return `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
}
