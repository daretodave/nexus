// The GUI's pure rules: session naming order, star assignment, the theme
// pick, the run-mode toggle, and the plan board's model. No DOM, no React.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SESSIONS, TERM, nextSessionName, newSessionIdentity, sessionPlaces, sessionLook, sessClass, starOf, isStarName, otherLabel,
} from '../src/ui/stars.js';
import { parsePick, themeFor } from '../src/ui/theme-pick.js';
import { nextRunMode, prefsFromRunMode, runModeFromPrefs } from '../src/ui/run-mode.js';
import {
  normalizePlan, claimView, indexClaims, withClaim, rowModel, lanes, specProgress, specKey, specOf, meWhoFrom, railPeople, ownerLead,
} from '../src/screens/board/model.js';
import { norm, summary, trainOf } from '../src/screens/fleet/model.js';

// ---- session naming --------------------------------------------------------

test('star names, colours and marks are the handoff\'s, in order', () => {
  assert.deepEqual(SESSIONS.map((s) => s.name), ['vega', 'sirius', 'deneb', 'altair']);
  assert.deepEqual(SESSIONS.map((s) => [s.night, s.dawn]), [['#4CECE7', '#006E79'], ['#7FC8FF', '#1A609E'], ['#AC89FC', '#6338B9'], ['#E2C69F', '#74542C']]);
  assert.deepEqual(SESSIONS.map((s) => s.points), [4, 5, 6, 8]);
  assert.deepEqual(TERM, { night: '#AAACC1', dawn: '#3A3F5C' });
  assert.match(starOf('vega').star, /^M12 2C12\.6 8\.2/);
  assert.equal(starOf('polaris'), null);
});

test('a new session takes the first free name in order', () => {
  assert.equal(nextSessionName([]), 'vega');
  assert.equal(nextSessionName(undefined), 'vega');
  assert.equal(nextSessionName(['vega']), 'sirius');
  assert.equal(nextSessionName(['sirius', 'vega']), 'deneb');
  assert.equal(nextSessionName(['vega', 'deneb']), 'sirius');
  assert.equal(nextSessionName([{ name: 'vega' }, { name: 'sirius' }, { name: 'deneb' }]), 'altair');
  assert.equal(nextSessionName(['vega', 'sirius', 'deneb', 'altair']), null);
});

test('fallen and paused sessions keep their name; closed ones free it', () => {
  assert.equal(nextSessionName([{ name: 'vega', state: 'fallen' }]), 'sirius');
  assert.equal(nextSessionName([{ name: 'vega', state: 'paused' }]), 'sirius');
  assert.equal(nextSessionName([{ name: 'vega', state: 'closed' }]), 'vega');
  // a terminal session on this machine holds its name too
  assert.equal(nextSessionName([{ name: 'vega', kind: 'terminal', state: 'observing' }]), 'sirius');
});

test('branch and worktree count that name\'s sessions in this repo', () => {
  assert.deepEqual(sessionPlaces('vega', 1), { branch: 'nexus/vega-1', worktree: '../.nexus-wt/vega-1' });
  assert.deepEqual(newSessionIdentity([], []), { name: 'vega', n: 1, branch: 'nexus/vega-1', worktree: '../.nexus-wt/vega-1' });
  const history = [{ name: 'vega', state: 'closed' }, { name: 'vega', state: 'closed' }, { name: 'sirius', state: 'live' }];
  const held = history.filter((s) => s.state !== 'closed');
  assert.deepEqual(newSessionIdentity(held, history), { name: 'vega', n: 3, branch: 'nexus/vega-3', worktree: '../.nexus-wt/vega-3' });
  assert.equal(newSessionIdentity(['vega', 'sirius', 'deneb', 'altair']), null);
});

// ---- star assignment -------------------------------------------------------

test('a local star session gets its star and colour class', () => {
  assert.deepEqual(sessionLook({ name: 'deneb', kind: 'local' }), { glyph: 'star', cls: 'sess-deneb' });
  assert.equal(sessClass({ name: 'altair' }), 'sess-altair');
  assert.equal(isStarName('sirius'), true);
  assert.equal(isStarName('polaris'), false);
});

test('a terminal session gets the terminal glyph and the term colour, whatever its name', () => {
  assert.deepEqual(sessionLook({ name: 'polaris', kind: 'terminal' }), { glyph: 'terminal', cls: 'sess-term' });
  assert.equal(sessClass({ name: 'vega', kind: 'terminal' }), 'sess-term');
});

test('someone else\'s session never gets a colour: a neutral initial', () => {
  assert.deepEqual(sessionLook({ name: 'orion', kind: 'other', person: 'Jun' }), { glyph: 'initial', cls: '', initial: 'j' });
  assert.equal(sessClass({ name: 'vega', kind: 'other' }), '');
  assert.equal(sessClass(null), '');
  assert.equal(otherLabel('jun', 'orion'), 'jun · orion');
  assert.equal(otherLabel('jun'), 'jun');
});

// ---- theme -----------------------------------------------------------------

test('the theme pick: dark or light wins, anything else follows the system', () => {
  assert.equal(parsePick('dark'), 'dark');
  assert.equal(parsePick('light'), 'light');
  assert.equal(parsePick(null), 'system');
  assert.equal(parsePick('sepia'), 'system');
  assert.equal(themeFor('dark', true), 'dark');
  assert.equal(themeFor('light', false), 'light');
  assert.equal(themeFor('system', true), 'light');
  assert.equal(themeFor('system', false), 'dark');
  assert.equal(themeFor(undefined, false), 'dark');
  assert.equal(themeFor('nonsense', true), 'light');
});

// ---- run mode --------------------------------------------------------------

test('run mode: by size by default, and the boards\' toggle rule', () => {
  assert.equal(runModeFromPrefs({}), 'size');
  assert.equal(runModeFromPrefs({ agents: true }), 'sub');
  assert.equal(runModeFromPrefs({ workflows: true }), 'wf');
  assert.equal(runModeFromPrefs({ agents: true, workflows: true }), 'both');
  for (const rm of ['size', 'sub', 'wf', 'both']) assert.equal(runModeFromPrefs(prefsFromRunMode(rm)), rm);
  assert.equal(nextRunMode('size', 'sub'), 'sub');
  assert.equal(nextRunMode('size', 'wf'), 'wf');
  assert.equal(nextRunMode('sub', 'wf'), 'both');
  assert.equal(nextRunMode('both', 'sub'), 'wf');
  assert.equal(nextRunMode('sub', 'sub'), 'size');
  assert.equal(nextRunMode('wf', 'wf'), 'size');
});

// ---- the plan board model ---------------------------------------------------

const NOW = Date.parse('2026-10-21T12:00:00Z');
const PLAN = {
  repo: 'demo',
  specs: [
    { num: 4, title: 'Search', file: 'plan/specs/04-search.md', chunks: [
      { id: '04.1', title: 'Index', size: 'S', closed: true },
      { id: '04.2', title: 'Query', size: 'M' },
      { id: '04.3', title: 'Rank', size: 'L' },
    ] },
    { num: '05', title: 'Empty', unchunked: true },
  ],
  next: [{ id: '04.3', lane: 'asap' }, { id: '04.2' }],
};

test('normalizePlan flattens specs and reads the pick order', () => {
  const p = normalizePlan(PLAN);
  assert.deepEqual(p.specs.map((s) => s.id), ['04', '05']);
  assert.deepEqual(p.chunks.map((c) => [c.id, c.spec, c.state]), [['04.1', '04', 'closed'], ['04.2', '04', 'ready'], ['04.3', '04', 'ready']]);
  assert.deepEqual(p.order, ['04.3', '04.2']);
  assert.equal(p.chunks.find((c) => c.id === '04.3').asap, true);
  assert.equal(specKey(4), '04');
  assert.equal(specOf('06.24'), '06');
  assert.deepEqual(specProgress(p.chunks), { total: 3, done: 1, pct: 33, text: '1 of 3' });
});

test('claims: cloud, held, your star session, and someone else', () => {
  const at = new Date(NOW - 2 * 3600000).toISOString();
  const sessions = [{ id: 's1', name: 'vega', kind: 'local', state: 'live', chunk: '04.2' }];
  const ctx = { meWho: 'me', owner: false, sessions };
  assert.equal(claimView({ id: '04.2', session: 'cloud-418', at }, ctx, NOW).kind, 'cloud');
  assert.equal(claimView({ id: '04.2', held: 'dave', who: 'dave', at }, ctx, NOW).kind, 'held');
  const mine = claimView({ id: '04.2', who: 'me', session: 's1', at }, ctx, NOW);
  assert.equal(mine.kind, 'sess');
  assert.equal(mine.who, 'vega');
  assert.equal(mine.since, '2h 00m');
  const other = claimView({ id: '04.3', who: 'jun', session: 'orion', at }, ctx, NOW);
  assert.equal(other.kind, 'other');
  assert.equal(other.label, 'jun · orion');
  assert.equal(other.initial, 'j');
});

test('rows: a claim moves the moon, and actions follow owner and protection', () => {
  const p = normalizePlan(PLAN);
  const sessions = [{ id: 's1', name: 'vega', kind: 'local', state: 'live', chunk: '04.2' }];
  const claims = indexClaims([{ id: '04.2', who: 'me', session: 's1', at: new Date(NOW).toISOString() }], { meWho: 'me', sessions }, NOW);
  const building = withClaim(p.chunks[1], claims);
  assert.equal(building.state, 'building');
  const free = withClaim(p.chunks[2], claims);
  assert.equal(free.state, 'ready');
  const contrib = rowModel(free, null, { owner: false, prot: false });
  assert.equal(contrib.canClaim, true);
  assert.equal(contrib.canReassign, false);
  const prot = rowModel(free, null, { owner: false, prot: true });
  assert.equal(prot.canClaim, false);
  assert.equal(prot.canRequest, true);
  const ownerRow = rowModel(building, null, { owner: true, prot: false });
  assert.equal(ownerRow.canRelease, true);
  assert.equal(ownerRow.canReassign, true);
});

test('claims panel (A5): grouped by person and session, the star read from the claim tag', () => {
  const at = new Date(NOW - 3600000).toISOString();
  const rows = [
    { id: '04.2', who: 'me', session: 'ab12cd34', star: 'sirius', at, state: 'live', mine: false },
    { id: '04.3', who: 'me', session: 'ab12cd34', star: 'sirius', at, state: 'live', mine: false },
    { id: '04.4', who: 'me', session: 'ef56', at, state: 'live', mine: true },
    { id: '04', who: 'jun', session: 'j1', star: 'rigel', at, state: 'live' },
    { id: '05.1', who: 'Sam Lee', held: 'samlee', at, state: 'held' },
  ];
  const ctx = { meWho: meWhoFrom(rows, false, { who: 'me' }), owner: false, ownerName: 'dave', sessions: [] };
  assert.equal(ctx.meWho, 'me');
  // a star session with no live row still reads as that star (s:<session>~<star>)
  const v = claimView(rows[0], ctx, NOW);
  assert.equal(v.kind, 'sess');
  assert.equal(v.who, 'sirius');
  assert.equal(claimView(rows[3], ctx, NOW).label, 'jun · rigel');
  const people = railPeople(rows, ctx, { '04.2': { t: 'Two' } }, { '04': { title: 'Four' } }, NOW);
  assert.deepEqual(people.map((p) => p.name), ['you', 'jun', 'samlee']);
  const you = people[0];
  assert.deepEqual(you.sessions.map((s) => [s.name, s.star, s.claims.map((c) => c.id)]), [['sirius', 'sirius', ['04.2', '04.3']], ['ef56', '', ['04.4']]]);
  assert.equal(you.sessions[0].claims[0].t, 'Two');
  assert.deepEqual(people[1].sessions.map((s) => [s.name, s.claims.map((c) => c.id)]), [['rigel', ['spec 04']]]);
  assert.equal(people[2].sessions[0].name, 'held');
  // the server's whoami wins; without it, a mine row or the owner's privileged name
  assert.equal(meWhoFrom(rows, false), 'me');
  assert.equal(meWhoFrom([], true), 'privileged_agent_session');
  assert.equal(meWhoFrom([], false), null);
});

test('a hold is the owner\'s: contributors never see Hold', () => {
  const p = normalizePlan(PLAN);
  const free = withClaim(p.chunks[2], { chunk: {}, spec: {} });
  assert.equal(rowModel(free, null, { owner: false, prot: false }).canHold, false);
  assert.equal(rowModel(free, null, { owner: true, prot: false }).canHold, true);
});

test('lanes: next-up puts asap first and leaves closed chunks out', () => {
  const p = normalizePlan(PLAN);
  const out = lanes(p, p.chunks, 'next', {}, {});
  assert.deepEqual(out.map((l) => [l.title, l.rows.map(([c]) => c.id)]), [['asap', ['04.3']], ['Next up', ['04.2']]]);
  const bySize = lanes(p, p.chunks, 'size', {}, {});
  assert.deepEqual(bySize.map((l) => l.title), ['Size L', 'Size M']);
});

// ---- the fleet model --------------------------------------------------------

test('fleet: the topbar line and the reboot train', () => {
  const list = [
    { id: 'a', name: 'vega', state: 'live' },
    { id: 'b', name: 'sirius', state: 'asking' },
    { id: 'c', name: 'deneb', state: 'fallen' },
    { id: 'd', name: 'polaris', kind: 'terminal' },
  ].map(norm);
  assert.equal(summary([]), 'no sessions yet');
  assert.equal(summary(list), '4 sessions · 2 working · 1 needs you · 1 fell over');
  const t = trainOf(list, true);
  assert.equal(t.total, 2);
  assert.deepEqual(t.cars.map((c) => [c.session.name, c.state]), [['vega', 'pausing'], ['sirius', 'pausing'], ['deneb', 'skipped'], ['polaris', 'skipped']]);
  assert.equal(t.all, false);
});

// ---- fidelity review (night): shared ledger shape, tolerant inputs, the cascade repair ----

test('heads-down reads the one session ledger the cockpit documents', async () => {
  const { headsLedger } = await import('../src/screens/headsdown-inbox/headsLedger.js');
  const L = headsLedger({
    phase: 'review', budget: { label: '3–4h', ms: 14400000 }, closed: [{ id: '13.1' }, { id: '13.2' }],
    questions: [{ q: 'a', answer: 'x' }, { q: 'b', how: 'default' }, { q: 'c' }],
    spec: { line: '§12.3 keep both', ref: 'spec/12-sync.md' },
    git: { branch: 'nexus/vega-2', up: 7, down: 2, behind: true, pr: { num: 148, ci: 'green' } },
    parked: [{ who: 'spec', q: 'tie?', alts: ['Keep both', 'Last wins'] }],
    context: { room: 62, strata: [10, 12, 16], compactsAt: 10 }, base: { num: 148 },
  });
  assert.equal(L.phase, 'questions-end');
  assert.equal(L.budget, '3–4h');
  assert.equal(L.budgetMs, 14400000);
  assert.equal(L.closed, 2);
  assert.deepEqual(L.questions, { settled: 2, total: 3 });
  assert.equal(L.spec, 'spec/12-sync.md  §12.3 keep both');
  assert.equal(L.git.ahead, 7);
  assert.equal(L.git.behind, 2);
  assert.equal(L.git.pr.state, 'open');
  assert.equal(L.parked[0].assumed, 'Keep both');
  assert.deepEqual([L.context.pinned, L.context.spec, L.context.conversation, L.context.compactAt], [10, 12, 16, 10]);
  assert.equal(L.package.stacksOn, 148);
  assert.deepEqual(headsLedger(null), {});
});

test('the cockpit draws a chunk\'s elapsed ms as m:ss', async () => {
  const { mmss } = await import('../src/screens/cockpit/model.js');
  assert.equal(mmss(18 * 60000 + 42000), '18:42');
  assert.equal(mmss(null), '');
});

test('the plan tolerates next as one chunk or a list, and a held claim names its login', () => {
  const one = normalizePlan({ specs: [{ id: 14, chunks: [{ id: '14.2', size: 'S' }] }], next: { id: '14.2', lane: 'asap' } });
  assert.deepEqual(one.order, ['14.2']);
  assert.equal(one.chunks[0].asap, true);
  const v = claimView({ id: '14.4', who: 'mira', held: 'mira', state: 'held' }, { meWho: null, owner: false, ownerName: 'mira', sessions: [] });
  assert.equal(v.person, 'mira');
});

test('the nexus.css cascade repair wraps exactly the two element resets', async () => {
  const fs = await import('node:fs');
  const { repairCascade } = await import('../vite.config.mjs');
  const css = fs.readFileSync(new URL('../src/styles/nexus.css', import.meta.url), 'utf8');
  const out = repairCascade(css);
  assert.ok(out.includes(':where(.nx) :where(button, input, textarea, select) {'));
  assert.ok(out.includes(':where(.nx) :focus-visible {'));
  assert.ok(!out.includes('.nx button, .nx input, .nx textarea, .nx select {'));
  assert.equal(out.length - css.length, ':where(.nx) :where(button, input, textarea, select) {'.length - '.nx button, .nx input, .nx textarea, .nx select {'.length + ':where(.nx) :focus-visible {'.length - '.nx :focus-visible {'.length);
});

test('a note you pinned keeps its pinned flag in the conversation', async () => {
  const { convoItems } = await import('../src/screens/cockpit/model.js');
  const items = convoItems([{ kind: 'user', text: 'keep merge.ts pure', pinned: true }, { kind: 'user', text: 'and fast' }], null);
  assert.deepEqual(items.map((m) => m.pinned), [true, false]);
});

test('the fonts are never inlined, so the page CSP (font-src self) loads every subset', async () => {
  const cfg = (await import('../vite.config.mjs')).default;
  const inline = cfg.build.assetsInlineLimit;
  assert.equal(inline('x/jetbrains-mono-vietnamese-400-normal.woff2'), false);
  assert.equal(inline('x/fira-sans-latin-400-normal.woff'), false);
  assert.equal(inline('x/icon.svg'), undefined);
});

test('every @fontsource weight the UI imports keeps only latin and latin-ext, woff2 with its range', async () => {
  const fs = await import('node:fs');
  const { trimFontsource } = await import('../vite.config.mjs');
  const src = fs.readFileSync(new URL('../src/styles/fonts.js', import.meta.url), 'utf8');
  const files = [...src.matchAll(/import '(@fontsource\/[^']+\.css)'/g)].map((m) => m[1]);
  assert.ok(files.length >= 14);
  for (const f of files) {
    const out = trimFontsource(fs.readFileSync(new URL(`../node_modules/${f}`, import.meta.url), 'utf8'));
    const names = [...out.matchAll(/\/\* ([a-z0-9-]+) \*\//g)].map((m) => m[1]);
    assert.equal(names.length, 2, f);
    assert.ok(names.some((n) => /-latin-\d{3}-/.test(n)) && names.some((n) => /-latin-ext-\d{3}-/.test(n)), f);
    assert.equal((out.match(/unicode-range:/g) || []).length, 2, f);
    assert.ok(!/\.woff\)/.test(out) && !/cyrillic|greek|vietnamese/.test(out), f);
  }
});

test('the mono symbol faces point at the committed range cuts, not the full webfonts', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../src/styles/mono-symbols.css', import.meta.url), 'utf8');
  const urls = [...css.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]);
  assert.equal(urls.length, 3);
  for (const u of urls) {
    assert.match(u, /^\.\/fonts\/JetBrainsMono-\w+-symbols\.woff2$/);
    const size = fs.statSync(new URL(`../src/styles/${u}`, import.meta.url)).size;
    assert.ok(size < 24_000, `${u} is ${size} bytes`);
  }
});

test('the plan board reads progress.mjs\'s % done and a claimed chunk from it', () => {
  const p = normalizePlan({
    specs: [{ id: '07', title: 'Search', percent: 33, counts: { closed: 1, claimed: 1, open: 1, total: 3 }, chunks: [
      { id: '07.1', title: 'Box', state: 'closed' }, { id: '07.2', title: 'List', size: 'M', state: 'claimed' }, { id: '07.3', title: 'Empty', size: 'S', state: 'ready' },
    ] }],
    order: ['07.3'],
  });
  const s = p.specs[0];
  assert.deepEqual([s.percent, s.counts.total], [33, 3]);
  // the spec's own counts win over a recount, so the bar says what /next status says
  assert.deepEqual(specProgress(p.chunks.slice(0, 2), s), { total: 3, done: 1, pct: 33, text: '1 of 3' });
  assert.deepEqual(specProgress(p.chunks.slice(0, 2)), { total: 2, done: 1, pct: 50, text: '1 of 2' });
  assert.equal(p.chunks[1].state, 'claimed');
  // a claimed chunk with its session's claim reads as building, as a ready one does
  const claims = { chunk: { '07.2': { kind: 'sess', person: 'you', sess: { chunk: '07.2' } } }, spec: {} };
  assert.equal(withClaim(p.chunks[1], claims).state, 'building');
});

test('ownerLead capitalizes the fallback owner name at a sentence start, never a login', () => {
  assert.equal(ownerLead('the owner'), 'The owner');
  assert.equal(ownerLead('you'), 'You');
  assert.equal(ownerLead('daretodave'), 'daretodave');
});
