// The change feed's rules for the top bar's ticker and its modal (change-feed.jsx), as pure functions so they are
// tested: what each deploy state says, the ticker's line, the day groups, how old a push is, and which answer is the
// newer (the live channel's `feed` event or the last GET /api/feed). The events: server/feed.mjs.

/** What a deploy state says, and the tone of its dot. Null: the repo has no deploy integration, so nothing is said. */
export function deployWords(d) {
  if (!d || !d.state) return null;
  switch (d.state) {
    case 'waiting': return { text: 'not deployed yet', short: 'not deployed yet', tone: 'waiting' };
    case 'deploying': return { text: d.env ? `Deploying to ${d.env}` : 'Deploying', short: 'Deploying', tone: 'deploying' };
    case 'deployed': return { text: d.env ? `Deployed to ${d.env}` : 'Deployed', short: 'Deployed', tone: 'deployed' };
    case 'failed': return { text: d.env ? `Deploy to ${d.env} failed` : 'Deploy failed', short: 'Deploy failed', tone: 'failed' };
    default: return null;
  }
}

/** The ticker's words for a push: "Added blue to the home background (not deployed yet)", "... · Deployed". */
export function tickerText(ev) {
  if (!ev) return '';
  const line = ev.line || 'New changes landed on main';
  const d = deployWords(ev.deploy);
  if (!d) return line;
  return d.tone === 'waiting' ? `${line} (not deployed yet)` : `${line} · ${d.short}`;
}

/** Who made a push, as the session glyph draws it: a star here, else the commit's author with a neutral initial. */
export function whoOf(ev) {
  const w = ev?.who || {};
  const name = String(w.name || 'someone');
  if (w.kind === 'local' || w.kind === 'terminal') return { name, session: { name, kind: w.kind } };
  return { name, session: { name, kind: 'other', person: name } };
}

/** "just now", "4 min ago", "3h ago", "yesterday", "5 days ago". */
export function ago(t, now = Date.now()) {
  const d = Date.parse(t || '');
  if (!Number.isFinite(d)) return '';
  const m = Math.max(0, Math.round((now - d) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  return days <= 1 ? 'yesterday' : `${days} days ago`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Events (newest first) in local days: [{ key, label: 'Today' | 'Yesterday' | 'Mon 21 Oct', events }]. */
export function byDay(events = [], now = Date.now()) {
  const today = new Date(now);
  const yest = new Date(now - 86400000);
  const out = [];
  for (const ev of events) {
    const t = Date.parse(ev.at || '');
    const d = Number.isFinite(t) ? new Date(t) : today;
    const key = dayKey(d);
    let g = out.find((x) => x.key === key);
    if (!g) {
      const label = key === dayKey(today) ? 'Today' : key === dayKey(yest) ? 'Yesterday' : `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
      g = { key, label, events: [] };
      out.push(g);
    }
    g.events.push(ev);
  }
  return out;
}

/** The newer of the live channel's feed and the last look (both { on, at, events }), or null before either. */
export function newerFeed(live, polled) {
  if (live && (!polled || (live.at || 0) >= (polled.at || 0))) return live;
  return polled || null;
}

/** The fuller list the modal reads, with the live channel's word on any event both hold (it is the newer). */
export function mergeEvents(live = [], full = []) {
  const byId = new Map(live.map((e) => [e.id, e]));
  const out = full.map((e) => (byId.has(e.id) ? { ...e, ...byId.get(e.id), paths: e.paths, commits: e.commits } : e));
  for (const e of live) if (!out.some((x) => x.id === e.id)) out.push(e);
  return out.sort((a, b) => (Date.parse(b.at || 0) || 0) - (Date.parse(a.at || 0) || 0));
}
