// The change feed's second kind of event (0.5.2): a secret pushed to where it is needed, from anywhere. The repo's own
// `secrets push` (a session, a terminal) and the GUI (the Vault, Set up a stack, a request's Add value) each append a
// line to .nexus/secrets-audit.jsonl at the primary checkout; this watch reads the lines added since it last looked and
// turns each `push` into one event: "deneb pushed STRIPE_SECRET_KEY to Cloudflare (production)".
//
// Names only. The audit line never holds a value (the kit refuses one), and an event takes only the name, the
// destination, the environments or target it names, and who: the session (by its id, from NEXUS_SESSION, named as the
// GUI knows it), the GUI ("You"), or a terminal. Every field is checked against its shape before it is used.
//
// Where it left off lives in .nexus/feed/secrets.json ({ offset }): a restart catches up on pushes made while the GUI
// was closed; the very first start begins at the end of the record (no backlog). A record that shrank (rewritten)
// starts again from its end.
import fs from 'node:fs';
import path from 'node:path';
import { destLabel } from '../shared/stack/destinations.mjs';

export const AUDIT_FILE = path.join('.nexus', 'secrets-audit.jsonl');
export const SECRETS_STATE = path.join('.nexus', 'feed', 'secrets.json');
export const POLL_MS = 2000;
const NAME = /^[A-Z][A-Z0-9_]*$/;
const DEST = /^[a-z][a-z0-9-]{0,39}$/;
const WORD = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;
const SESSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const TIME = /^\d{4}-\d\d-\d\dT[\d:.]+Z$/;
const MAX_READ = 1024 * 1024;

/** Who pushed, from an audit line: the session as the GUI names it, the GUI itself, or a terminal. */
export function whoPushed(e, sessionName = () => null) {
  if (typeof e.session === 'string' && SESSION.test(e.session)) {
    const name = sessionName(e.session);
    return name ? { name: String(name), kind: 'local', session: e.session } : { name: 'A session', kind: 'terminal', session: e.session };
  }
  if (typeof e.via === 'string' && e.via) return { name: 'You', kind: 'gui' };
  return { name: 'A terminal', kind: 'terminal' };
}

/** Where a push went, said in a few words: "(production)", "(production, preview)", "(worker edge-api)", or ''. */
export function whereWords(e) {
  const envs = Array.isArray(e.environments) ? e.environments.filter((x) => typeof x === 'string' && WORD.test(x)) : [];
  if (envs.length) return ` (${envs.join(', ')})`;
  for (const [k, word] of [['worker', 'worker'], ['app', 'app'], ['project', 'project'], ['vault', 'vault'], ['repo', ''], ['region', '']]) {
    if (typeof e[k] === 'string' && WORD.test(e[k])) return ` (${word ? `${word} ` : ''}${e[k]})`;
  }
  return '';
}

/** One audit line -> a feed event, or null (not a push, or a field out of shape). */
export function pushEventOf(e, sessionName) {
  if (!e || e.action !== 'push' || !NAME.test(String(e.name || '')) || !DEST.test(String(e.destination || '')) || !TIME.test(String(e.time || ''))) return null;
  const who = whoPushed(e, sessionName);
  const where = whereWords(e);
  const label = destLabel(e.destination);
  return {
    id: `secret:${e.time}:${e.name}:${e.destination}`,
    kind: 'secret-push',
    at: e.time,
    name: e.name,
    destination: e.destination,
    label,
    ...(where ? { where: where.trim().replace(/^\(|\)$/g, '') } : {}),
    who,
    line: `${who.name} pushed ${e.name} to ${label}${where}`,
  };
}

/**
 * Watch the audit record for pushes.
 * @param {object} o
 * @param {string} o.root                      the primary checkout
 * @param {(ev) => void} o.onPush              each new push, oldest first
 * @param {(id: string) => string|null} [o.sessionName]  a session's name by its id
 * @param {boolean} [o.watch=true]             poll on a timer (tests call look() by hand)
 */
export function createSecretsWatch({ root, onPush, sessionName = () => null, watch = true, pollMs = POLL_MS }) {
  const file = path.join(root, AUDIT_FILE);
  const stateFile = path.join(root, SECRETS_STATE);
  let offset = null;
  let tail = '';
  let timer = null;

  const size = () => { try { return fs.statSync(file).size; } catch { return 0; } };
  const save = () => {
    try { fs.mkdirSync(path.dirname(stateFile), { recursive: true }); fs.writeFileSync(stateFile, `${JSON.stringify({ offset: offset - Buffer.byteLength(tail) })}\n`); } catch { /* kept in memory */ }
  };

  function begin() {
    let saved = null;
    try { saved = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { saved = null; }
    const now = size();
    offset = saved && Number.isInteger(saved.offset) && saved.offset >= 0 && saved.offset <= now ? saved.offset : now;
    tail = '';
    save();
  }

  /** Read what was added since the last look; each push becomes an event. Returns the events. */
  function look() {
    if (offset === null) begin();
    const now = size();
    if (now < offset) { offset = now; tail = ''; save(); return []; }
    if (now === offset) return [];
    const len = Math.min(now - offset, MAX_READ);
    let text = '';
    try {
      const fd = fs.openSync(file, 'r');
      try { const buf = Buffer.alloc(len); fs.readSync(fd, buf, 0, len, offset); text = buf.toString('utf8'); } finally { fs.closeSync(fd); }
    } catch { return []; }
    offset += len;
    const parts = (tail + text).split('\n');
    tail = parts.pop() || '';
    const out = [];
    for (const line of parts) {
      if (!line.trim()) continue;
      let e;
      try { e = JSON.parse(line); } catch { continue; }
      const ev = pushEventOf(e, sessionName);
      if (ev) out.push(ev);
    }
    save();
    for (const ev of out) onPush(ev);
    return out;
  }

  return {
    look,
    start() {
      begin();
      if (watch && !timer) { timer = setInterval(() => { try { look(); } catch { /* the next look tries again */ } }, pollMs); timer.unref?.(); }
    },
    stop() { clearInterval(timer); timer = null; },
    /** Start from the end of the record (the feed was off: turned on, no backlog). */
    reset() { offset = size(); tail = ''; save(); },
  };
}
