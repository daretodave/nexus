// The demo's vault (spec 42; `nexus --demo`): GET /api/secrets and its writes, staged in memory with the live
// server's shapes (server/secrets.mjs) so the Vault, the Inbox's key card and the board's "Waiting on a secret" draw
// in a demo. It holds names and status only: a posted value is looked at for its shape and dropped on the spot, never
// kept, logged or sent back. Nothing here touches the disk or runs a sink.
import { looksOf, parseRequest, resolveRequest } from '../secrets.mjs';
import { DEST_ORDER } from '../../shared/stack/destinations.mjs';

const DAY = 86_400_000;
const NAME = /^[A-Z][A-Z0-9_]*$/;
/** Every place the kit's sinks push to (scripts/secrets-sinks.mjs), staged here: a push is one audit line, no tool. */
const SINKS = DEST_ORDER;
/** The environments a demo push names, as the real sinks record them. */
const ENVS = { vercel: ['production', 'preview', 'development'], 'cloudflare-pages': ['production'], netlify: ['production', 'deploy-preview', 'branch-deploy'] };
const shaped = (v) => typeof v === 'string' && v.length >= 8 && !/^(?:[A-Za-z]+|\d+)$/.test(v);

/** The chunk the demo's plan holds back for a secret, and the plan row that asks for it. */
export const DEMO_REQUEST = {
  chunk: '15.4',
  title: 'Publish the season site',
  names: ['VERCEL_TOKEN'],
  durable: {
    id: 'plan/pending/secrets-15.4.md:5', file: 'plan/pending/secrets-15.4.md', line: 5, source: 'needs-user-call',
    text: 'secret request 15.4: set VERCEL_TOKEN in your terminal or the GUI\'s vault (never in a session), and 15.4 is ready again. Then delete this row.',
  },
};

/**
 * A request that knows its stack service (0.5.2): Add value opens the Stripe card in Set up a stack, and its save pushes
 * the key to Vercel, a push the change feed shows. Chunk 15.5 waits on it.
 */
export const DEMO_STACK_REQUEST = {
  chunk: '15.5',
  title: 'Take season ticket payments',
  names: ['STRIPE_SECRET_KEY'],
  durable: {
    id: 'plan/pending/secrets-15.5.md:5', file: 'plan/pending/secrets-15.5.md', line: 5, source: 'needs-user-call',
    text: 'secret request 15.5: set STRIPE_SECRET_KEY in your terminal or the GUI\'s vault (never in a session), and 15.5 is ready again. It goes to vercel once it is set; it is a stripe value, so the GUI opens its card in Set up a stack (stack: stripe). Then delete this row.',
  },
};
/** Every request the demo's plan holds, in the order the inbox lists them. */
export const DEMO_REQUESTS = [DEMO_REQUEST, DEMO_STACK_REQUEST];

/** onPush(event): each push the demo records (an audit line: names, place, who), for the change feed. */
export function createDemoVault({ now = () => Date.now(), owner = () => true, onPush = () => {} } = {}) {
  const iso = (msAgo) => new Date(now() - msAgo).toISOString();
  const t0 = now();
  const entries = [
    { name: 'VERCEL_TOKEN', for: 'Deploys the season site and its previews.', where: 'https://vercel.com/account/tokens', destinations: ['local', 'github-actions', 'vercel'], chunk: '15.4' },
    { name: 'CLOUDFLARE_API_TOKEN', for: 'Purges the CDN cache after a deploy.', where: 'https://dash.cloudflare.com/profile/api-tokens', destinations: ['local', 'github-actions'], chunk: '15.1' },
    { name: 'PREVIEW_PASSWORD', for: 'Keeps preview deploys private.', where: null, destinations: ['local', 'vercel'], chunk: '15.1' },
    { name: 'SMTP_PASSWORD', for: 'Sends the weekly fixtures email.', where: null, destinations: ['local', 'github-actions'], chunk: '9.2' },
    { name: 'RESULTS_FEED_KEY', for: 'Reads the league results feed.', where: null, destinations: ['local', 'github-actions', 'cloudflare'], chunk: '12.1' },
    { name: 'STRIPE_SECRET_KEY', for: 'Stripe restricted key (server only). Set up a stack.', where: 'https://dashboard.stripe.com/apikeys', destinations: ['local', 'vercel'], chunk: '15.5' },
  ];
  const at = (d, h = 0) => new Date(t0 - d * DAY - h * 3600000).toISOString();
  const audit = [
    { time: at(124), action: 'set', name: 'RESULTS_FEED_KEY', destination: 'local', ring: 'local' },
    { time: at(124), action: 'push', name: 'RESULTS_FEED_KEY', destination: 'github-actions' },
    { time: at(124), action: 'push', name: 'RESULTS_FEED_KEY', destination: 'cloudflare' },
    { time: at(96), action: 'set', name: 'SMTP_PASSWORD', destination: 'local', ring: 'local' },
    { time: at(96), action: 'push', name: 'SMTP_PASSWORD', destination: 'github-actions' },
    { time: at(9), action: 'set', name: 'PREVIEW_PASSWORD', destination: 'local', ring: 'local' },
    { time: at(9), action: 'push', name: 'PREVIEW_PASSWORD', destination: 'vercel' },
    { time: at(3), action: 'rotate', name: 'PREVIEW_PASSWORD', destination: 'local', ring: 'local' },
    { time: at(1, 2), action: 'rotate', name: 'CLOUDFLARE_API_TOKEN', destination: 'local', ring: 'local' },
    { time: at(1, 1), action: 'push', name: 'CLOUDFLARE_API_TOKEN', destination: 'github-actions' },
  ];
  const set = new Set(['CLOUDFLARE_API_TOKEN', 'PREVIEW_PASSWORD', 'SMTP_PASSWORD', 'RESULTS_FEED_KEY']);
  const localKeys = new Set();

  const lastOf = (name, actions) => audit.filter((e) => e.name === name && actions.includes(e.action)).map((e) => e.time).sort().at(-1) || null;
  const status = () => {
    const isOwner = owner();
    const secrets = entries.map((e) => {
      const setAt = lastOf(e.name, ['set', 'rotate']);
      const destinations = e.destinations.map((d) => {
        if (d === 'local') return { destination: d, state: set.has(e.name) ? 'set' : 'missing' };
        const p = audit.filter((x) => x.action === 'push' && x.name === e.name && x.destination === d).map((x) => x.time).sort().at(-1);
        return { destination: d, state: p ? 'pushed' : 'not pushed', at: p || null, ...(p && setAt && p < setAt ? { stale: true } : {}) };
      });
      const age = setAt ? Math.floor((now() - Date.parse(setAt)) / DAY) : null;
      return { name: e.name, for: e.for, where: e.where, chunk: e.chunk, declared: true, set: set.has(e.name), rings: set.has(e.name) ? ['local'] : [], destinations, age, setAt, rotate: age !== null && age > 90 };
    });
    const open = DEMO_REQUESTS.map((q) => ({ q, missing: q.names.filter((n) => !set.has(n)) })).filter((x) => x.missing.length);
    return {
      available: true, mode: isOwner ? 'owner' : 'contributor', owner: isOwner, projectSecretsNeeded: isOwner ? entries.length : 0, manifest: true,
      vault: { local: '/demo/fieldday/.env', workspace: '/demo/.env.workspace', keychain: null },
      secrets: isOwner ? secrets : [],
      localKeys: [...localKeys].map((name) => ({ name, rings: ['local'] })),
      nudges: secrets.filter((s) => s.rotate).map((s) => ({ name: s.name, days: s.age, at: s.setAt })),
      rotateDays: 90,
      audit: audit.slice(-20),
      sinks: SINKS,
      requests: isOwner ? open.map(({ q, missing }) => ({ ...parseRequest(q.durable.text), ...resolveRequest(parseRequest(q.durable.text)), missing, file: q.durable.file, line: q.durable.line, date: iso(3 * 3600000).slice(0, 10) })) : [],
      envFiles: ['.env.local'],
      envIgnore: 'ignored',
    };
  };

  const record = (e) => { const line = { time: new Date(now()).toISOString(), ...e }; audit.push(line); if (e.action === 'push') onPush(line); };
  const pushAll = (name, dests) => dests.filter((d) => SINKS.includes(d)).map((d) => { record({ action: 'push', name, destination: d, ...(ENVS[d] ? { environments: ENVS[d] } : {}), via: 'gui' }); return { destination: d, ok: true, note: `demo: ${name} -> ${d}` }; });

  /** POST /api/secrets/:name: the value's shape is checked and the value dropped; only "it is set" is kept. */
  const store = (name, b = {}) => {
    if (!NAME.test(String(name))) return { status: 400, error: 'a secret\'s name is an env-var name (A-Z, 0-9 and _, starting with a letter)' };
    if (typeof b.value !== 'string' || !b.value) return { status: 400, error: `${name}: a value is a non-empty string` };
    if (!owner()) {
      if (Array.isArray(b.destinations) && b.destinations.some((d) => d !== 'local')) return { status: 403, error: 'a contributor checkout keeps its keys on this machine: sinks are the owner\'s' };
      const had = localKeys.has(name);
      localKeys.add(name);
      record({ action: had ? 'rotate' : 'set', name, destination: 'local', ring: 'local' });
      return { status: 200, ok: true, name, stored: true, ring: 'local', pushed: [], notes: [] };
    }
    let e = entries.find((x) => x.name === name);
    if (!e && b.declare === true) {
      e = { name, for: String(b.for || '').trim() || 'Added in the vault.', where: null, destinations: [...(b.local === false ? [] : ['local']), ...(b.destinations || []).filter((d) => SINKS.includes(d))], chunk: null };
      entries.unshift(e);
    }
    const had = set.has(name);
    set.add(name);
    record({ action: had ? 'rotate' : 'set', name, destination: 'local', ring: 'local' });
    const pushed = pushAll(name, (b.destinations || []).filter((d) => !e || e.destinations.includes(d) || b.declare === true));
    return { status: 200, ok: true, name, stored: true, ring: 'local', pushed, notes: [] };
  };

  /** POST /api/secrets/:name/remove: "it is set" is forgotten, as the repo's `unset` takes the value out. */
  const remove = (name) => {
    if (!NAME.test(String(name))) return { status: 400, error: 'a secret\'s name is an env-var name (A-Z, 0-9 and _, starting with a letter)' };
    const held = owner() ? set : localKeys;
    if (!held.has(name)) return { status: 200, ok: true, name, removed: [], still: [], notes: [] };
    held.delete(name);
    if (owner()) record({ action: 'remove', name, destination: 'local', ring: 'local' });
    const far = owner() && entries.find((e) => e.name === name)?.destinations.some((d) => d !== 'local');
    return { status: 200, ok: true, name, removed: ['local'], still: [], notes: far ? ['the places it was pushed to keep their copy: remove it there too if it should go'] : [] };
  };

  const push = (name, b = {}) => {
    const dests = Array.isArray(b.destinations) ? b.destinations.filter((d) => SINKS.includes(d)) : [];
    if (!dests.length) return { status: 400, error: `${name}: name the destinations to push to` };
    if (!owner()) return { status: 403, error: 'a contributor checkout keeps its keys on this machine: sinks are the owner\'s' };
    return { status: 200, ok: true, name, pushed: pushAll(name, dests) };
  };

  /** POST /api/secrets/import: names and their look from the posted text; the values are dropped as they are read. */
  const LOCAL_FILE = 'TIDES_SANDBOX_KEY=TESTONLY-dev-sandbox-1234\nDATABASE_URL=postgres://dev:TESTONLY@localhost:5432/fieldday\nMAP_STYLE_URL=https://tiles.example/style.json\nLOG_LEVEL=debug\n';
  const importEnv = (b = {}) => {
    const text = b.file === '.env.local' ? LOCAL_FILE : typeof b.text === 'string' ? b.text : '';
    const lines = text.split(/\r?\n/);
    const names = [];
    for (const l of lines) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(l);
      if (!m || !m[2].trim()) continue;
      const v = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
      const rings = (owner() ? set.has(m[1]) : localKeys.has(m[1])) ? ['local'] : [];
      names.push({ name: m[1], declared: entries.some((e) => e.name === m[1]), rings, looks: looksOf(m[1], v, shaped), ...(NAME.test(m[1]) ? {} : { skip: 'not an env-var name' }) });
    }
    if (!names.length) return { status: 400, error: 'no NAME=value lines to import' };
    if (b.confirm !== true) return { status: 200, preview: true, mode: owner() ? 'owner' : 'contributor', ...(b.file ? { file: b.file } : {}), comments: lines.filter((l) => /^\s*#/.test(l)).length, names };
    const want = new Set(Array.isArray(b.names) ? b.names : names.map((n) => n.name));
    const stored = names.filter((n) => !n.skip && want.has(n.name)).map((n) => n.name);
    const pushed = [];
    for (const n of stored) {
      const to = b.destinations && Array.isArray(b.destinations[n]) ? b.destinations[n] : ['local'];
      if (owner()) {
        if (!entries.some((e) => e.name === n)) entries.push({ name: n, for: 'Imported in the demo.', where: null, destinations: to.length ? to : ['local'], chunk: null });
        const had = set.has(n);
        set.add(n);
        record({ action: had ? 'rotate' : 'set', name: n, destination: 'local', ring: 'local' });
        pushed.push(...pushAll(n, to).map((p) => ({ name: n, ...p })));
      } else {
        const had = localKeys.has(n);
        localKeys.add(n);
        record({ action: had ? 'rotate' : 'set', name: n, destination: 'local', ring: 'local' });
      }
    }
    return { status: 200, ok: true, stored, failed: [], pushed, skipped: [], added: [], kept: [], mode: owner() ? 'owner' : 'contributor' };
  };

  /** The inbox's plan row for the request, marked the way server/secrets.mjs marks it, or null once it is set. */
  const mark = (d) => {
    const r = parseRequest(d?.text);
    if (!r) return d;
    const missing = r.names.filter((n) => !set.has(n));
    return missing.length ? { ...d, secret: { ...r, ...resolveRequest(r), missing } } : null;
  };
  const isSet = (n) => set.has(n);

  return { status, store, remove, push, importEnv, audit: () => ({ events: audit.slice(), nudges: status().nudges, rotateDays: 90 }), mark, isSet };
}
