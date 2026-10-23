// The stack hand-off's screens rendered on the server (test/jsx.mjs): the picker and presets, each card state's copy,
// a secret field that is a MaskField with no value in the markup, the env name chips' eye and lock, the token box, the
// rail's Next, the compact panel onboarding uses, and the hook-ins in the Vault and the onboarding step.
import './jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The data client reads its launch token from the page at import: a bare page for the screens imported here.
globalThis.window ||= { location: { href: 'http://localhost/' }, history: { replaceState() {} } };

const T = [{ id: 'vault', label: '.env (the vault)', on: true, locked: true }, { id: 'app', label: 'apps/web/.env.local', on: true, why: 'Next.js reads env from apps/web' }];
const NAMES = {
  'supabase.url': ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'], 'supabase.publishable': ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY'],
  'supabase.secret': ['SUPABASE_SECRET_KEY'], 'supabase.dbUrl': ['DATABASE_URL'], 'supabase.ref': ['SUPABASE_PROJECT_REF'], 'supabase.pat': ['SUPABASE_ACCESS_TOKEN'],
  'cloudflare.apiToken': ['CLOUDFLARE_API_TOKEN'], 'cloudflare.zoneId': ['CLOUDFLARE_ZONE_ID'], 'cloudflare.accountId': ['CLOUDFLARE_ACCOUNT_ID'],
  'vercel.token': ['VERCEL_TOKEN'], 'vercel.teamId': ['VERCEL_ORG_ID'], 'vercel.projectId': ['VERCEL_PROJECT_ID'],
};
function stack({ picked = ['cloudflare', 'supabase', 'vercel'], saved = [], checks = {}, actions = {}, ticks = {} } = {}) {
  const values = {};
  const names = {};
  for (const [k, ns] of Object.entries(NAMES)) {
    if (!picked.includes(k.split('.')[0])) continue;
    values[k] = { names: ns, saved: saved.includes(k) };
    for (const n of ns) names[n] = { service: k.split('.')[0], key: k.split('.')[1], vault: saved.includes(k), app: saved.includes(k), drift: false };
  }
  return {
    available: true, vaultState: 'ready', owner: true, picked, inputs: { domain: 'fieldday.dev' },
    apps: [{ dir: 'apps/web', framework: 'next', label: 'Next.js', prefix: 'NEXT_PUBLIC_' }], app: { dir: 'apps/web', framework: 'next', label: 'Next.js', prefix: 'NEXT_PUBLIC_' },
    targets: T, values, names, checks, actions, ticks,
  };
}
function ui(o = {}) {
  const fields = o.fields || {};
  return {
    field: (svc, key) => fields[`${svc}.${key}`] || {}, setField() {}, save() {}, saveAll() {}, resync() {}, check() {}, checks: {}, plan() {}, confirm() {}, plans: o.plans || {},
    toggleReplace() {}, pick() {}, tick() {}, busy: false, opened: o.opened || {}, setOpen() {}, go() {}, offer: o.offer || null, setOffer() {}, pasted() {}, fill() {}, repoll: o.repoll || {},
  };
}
const sp = (data, u = ui()) => ({ res: { status: 'ready', data, reload() {} }, stack: data, ui: u });
const SB = ['supabase.url', 'supabase.publishable', 'supabase.secret', 'supabase.dbUrl'];

test('the panel draws the presets, a search box, and a tile per service under its group', async () => {
  const { default: StackPanel } = await import('../src/screens/vault/stack/StackPanel.jsx');
  const { ORDER, SERVICES, GROUPS } = await import('../shared/stack/recipes.mjs');
  const html = renderToStaticMarkup(createElement(StackPanel, { sp: sp(stack({ picked: [] })) }));
  assert.match(html, /Set up a stack/);
  assert.match(html, /Supabase \+ Vercel \+ Cloudflare/);
  assert.match(html, /Supabase \+ Vercel</);
  for (const p of ['Next.js SaaS', 'AI app', 'Discord bot']) assert.match(html, new RegExp(`>${p}<`));
  assert.match(html, /aria-label="Search services"/);
  for (const id of ORDER) assert.match(html, new RegExp(`<b>${SERVICES[id].name.replace('.', '\\.')}</b>`), id);
  let at = -1;
  for (const g of GROUPS) { const i = html.indexOf(`aria-label="${g.label}"`); assert.ok(i > at, `${g.label} draws after the group before it`); at = i; }
  assert.doesNotMatch(html, /More services soon/);
  assert.match(html, /Pick a preset or the services your app uses/);
});

test('with the trinity picked: the domain, the app, where values go, and the next card open and lit', async () => {
  const { default: StackPanel } = await import('../src/screens/vault/stack/StackPanel.jsx');
  const html = renderToStaticMarkup(createElement(StackPanel, { sp: sp(stack()) }));
  assert.match(html, /aria-label="Your domain"/);
  assert.match(html, /Next\.js in <code>apps\/web<\/code>/);
  assert.match(html, /Writes to/);
  assert.match(html, /apps\/web\/\.env\.local/);
  assert.match(html, /class="stk-card is-not-started is-next is-open"/);
  assert.match(html, /The token to create/);
  assert.match(html, /A custom API token, for this one zone/);
  assert.match(html, /Zone Resources: Include, Specific zone, fieldday\.dev/);
  assert.match(html, /Cloudflare shows the token once/);
  assert.match(html, /href="https:\/\/dash\.cloudflare\.com\/profile\/api-tokens" target="_blank" rel="noreferrer"/);
});

test('each card state says what is true in its head', async () => {
  const { default: StackCard } = await import('../src/screens/vault/stack/StackCard.jsx');
  const head = (svc, s, u = ui({ opened: { cloudflare: false, supabase: false, vercel: false } })) => renderToStaticMarkup(createElement(StackCard, { svc, stack: s, ui: u }));
  assert.match(head('supabase', stack()), /stk-card-state">Start</);
  assert.match(head('supabase', stack({ saved: ['supabase.url', 'supabase.publishable'] })), /2 of 4 saved/);
  const pending = { cloudflare: { ok: true, summary: 'Token works.', facts: { zone: true, active: false, nameServers: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'] } } };
  const waiting = head('cloudflare', stack({ saved: ['cloudflare.apiToken', 'cloudflare.zoneId'], checks: pending }));
  assert.match(waiting, /is-waiting/);
  assert.match(waiting, /Waiting on nameservers/);
  assert.match(head('vercel', stack({ saved: ['vercel.token'], checks: { vercel: { ok: false, reason: 'Vercel says this token is not valid.' } } })), /is-failed[\s\S]*Check failed/);
  const all = stack({ picked: ['supabase'], saved: SB, ticks: { 'sb.auth': true } });
  const done = head('supabase', all, ui());
  assert.match(done, /is-done/);
  assert.match(done, />Open</);
  assert.match(done, /NEXT_PUBLIC_SUPABASE_URL/);
});

test('a waiting zone shows the two nameservers big, with copy buttons and the next check\'s countdown', async () => {
  const { default: StackCard } = await import('../src/screens/vault/stack/StackCard.jsx');
  const pending = { cloudflare: { ok: true, summary: 'Token works. fieldday.dev is waiting for the nameservers to change.', facts: { zone: true, active: false, nameServers: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'] } } };
  const html = renderToStaticMarkup(createElement(StackCard, { svc: 'cloudflare', stack: stack({ saved: ['cloudflare.apiToken'], checks: pending }), ui: ui({ opened: { cloudflare: true }, repoll: { cloudflare: 24 } }) }));
  assert.match(html, /<code>ada\.ns\.cloudflare\.com<\/code>/);
  assert.match(html, /Copy: bob\.ns\.cloudflare\.com/);
  assert.match(html, /Checking again in 24 s/);
});

test('a secret field is a MaskField with no value in the markup; env chips show the eye or the lock', async () => {
  const { default: StackCard } = await import('../src/screens/vault/stack/StackCard.jsx');
  const paste = 'sb_secret_TESTONLYmarkup000000';
  const html = renderToStaticMarkup(createElement(StackCard, { svc: 'supabase', stack: stack(), ui: ui({ opened: { supabase: true }, fields: { 'supabase.secret': { paste } } }) }));
  assert.ok(!html.includes('TESTONLY'), 'the paste never reaches the markup');
  assert.match(html, /aria-label="Paste the secret key"/);
  assert.match(html, /<input type="password"[^>]*aria-label="Paste the secret key"/);
  assert.match(html, /title="Ships to the browser"><svg[\s\S]*?<\/svg>NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(html, /title="Server only"><svg[\s\S]*?<\/svg>SUPABASE_SECRET_KEY/);
  assert.match(html, /Looks right\./, 'the shape note for a good paste');
  assert.match(html, /Optional token/);
  assert.match(html, /Not a classic token/);
});

test('paste-many offers to fill the Supabase values; a plan lists conflicts to tick', async () => {
  const { default: StackCard } = await import('../src/screens/vault/stack/StackCard.jsx');
  const offer = renderToStaticMarkup(createElement(StackCard, { svc: 'supabase', stack: stack(), ui: ui({ opened: { supabase: true }, offer: { svc: 'supabase', matches: [{ key: 'url' }, { key: 'publishable' }, { key: 'secret' }, { key: 'dbUrl' }] } }) }));
  assert.match(offer, /Looks like 4 values from Supabase&#x27;s Connect dialog\. Fill them in\?/);
  const plans = { 'cloudflare.dns': { plan: { lines: ['Create A fieldday.dev -> 76.76.21.21 (DNS only).'], conflicts: [{ key: 'c0', type: 'AAAA', name: 'fieldday.dev', content: '2606:4700::1', proxied: true }], count: 2, cta: 'Write 2 records' }, replace: [] } };
  const s = stack({ saved: ['cloudflare.apiToken', 'cloudflare.zoneId', 'vercel.token', 'vercel.projectId', 'vercel.teamId'] });
  const act = renderToStaticMarkup(createElement(StackCard, { svc: 'cloudflare', stack: s, ui: ui({ opened: { cloudflare: true }, plans }) }));
  assert.match(act, /Do it for me/);
  assert.match(act, /Point fieldday\.dev at Vercel/);
  assert.match(act, /Replace AAAA fieldday\.dev \(2606:4700::1, proxied\)\?/);
  assert.match(act, />Write 2 records</);
});

test('the rail shows progress, the next action with its button, and the names still missing', async () => {
  const { default: StackRail } = await import('../src/screens/vault/stack/StackRail.jsx');
  const s = stack({ saved: ['cloudflare.apiToken', 'cloudflare.zoneId', ...SB, 'vercel.token', 'vercel.teamId', 'vercel.projectId'], checks: { cloudflare: { ok: true, facts: { zone: true, active: false } } } });
  const html = renderToStaticMarkup(createElement(StackRail, { stack: s, ui: ui() }));
  assert.match(html, /Your stack/);
  assert.match(html, /2 of 8/);
  assert.match(html, /Next/);
  assert.match(html, /Send the 4 Supabase values to Vercel\./);
  assert.match(html, />Send to Vercel</);
  assert.match(html, /waiting on nameservers/);
  const miss = renderToStaticMarkup(createElement(StackRail, { stack: stack({ picked: ['vercel'], saved: ['vercel.token'] }), ui: ui() }));
  assert.match(miss, /Still missing:/);
  assert.match(miss, /VERCEL_ORG_ID/);
});

test('onboarding: the compact panel folds the rail to one line and hides the gotchas; the step offers the stack', async () => {
  const { default: StackPanel } = await import('../src/screens/vault/stack/StackPanel.jsx');
  const html = renderToStaticMarkup(createElement(StackPanel, { compact: true, sp: sp(stack()), onOpenVault() {} }));
  assert.match(html, /stk-rail-line/);
  assert.match(html, /0 of 8 · Next: Add fieldday\.dev to Cloudflare/);
  assert.doesNotMatch(html, /Good to know/);
  assert.match(html, /Writes to \.env \(the vault\), apps\/web\/\.env\.local\./);
  assert.match(html, /Open in the vault/);
  const step = fs.readFileSync(new URL('../src/screens/onboarding/Secrets.jsx', import.meta.url), 'utf8');
  assert.match(step, /\{ k: 'stack', label: 'Set up a stack'/);
  assert.match(step, /<StackPanel compact/);
  assert.match(step, /Vercel and Cloudflare connect here with Set up a stack, or later from the vault\./);
  const vault = fs.readFileSync(new URL('../src/screens/Vault.jsx', import.meta.url), 'utf8');
  assert.match(vault, /<Icon name="bolt" size=\{14\} \/>Set up a stack/);
  assert.match(vault, /params\.get\('panel'\) === 'stack'/);
});

test('stack.css keeps to theme tokens: no hex colours, and motion stops for reduced motion', () => {
  const css = fs.readFileSync(new URL('../src/styles/stack.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /#[0-9a-fA-F]{3,8}\b/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
});
