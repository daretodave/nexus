// order.mjs (the simulated pick order): the Asap lane first, then priority rows, then table order; a pick counts as
// done for the chunks that need it; held, plan-only and other-base specs, held chunks, chunks others claim and needs
// nothing will close are listed apart; a pending close counts as closed; the render marks just-plotted chunks; a bad
// --limit prints usage; a chunk whose secret the vault lacks parks (the owner), and one naming any secret is the
// owner's alone (a contributor skips it).
// node:test, no deps, no git (the usage test runs the script, which stops before git).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseSpec } from '../plan-check.mjs';
import { lanes, parseLimit, render, rows, secretsMissing, simulate } from '../plan/order.mjs';

const readme = (asap = '- (none)', held = '- (none)', extra = '') => [
  '## Lanes', '', '**Asap** (built before the table):', '', asap, '', '**Held** (waits):', '', held, '', '## Specs', '',
  '| # | Initiative | Spec | Status | Progress |', '|---|---|---|---|---|',
  '| 07 | Search, on a base layout | [07-search.md](07-search.md) | planned | 3 left |',
  '| 09 | Billing | [09-billing.md](09-billing.md) | planned · priority 1 | 2 left |',
  extra,
].join('\n');

const spec = (num, chunks) => parseSpec(`${num}-x.md`, ['## Acceptance', '- **A1** x', '## Chunks', 'Measure: 1 open · 0 closed · next A2', ...chunks].join('\n'));
const specs = () => [
  spec('07', ['- [ ] **07.1** Box · S · closes A1 · needs —', '- [ ] **07.2** Results · M · closes A1 · needs 07.1', '- [ ] **07.3** Empty · S · closes A1 · needs 09.2']),
  spec('09', ['- [ ] **09.1** Plans · L · closes A1 · needs —', '- [ ] **09.2** Invoices · S · closes A1 · needs 09.1']),
];
const ids = (list) => list.map((c) => c.id);

describe('reading the roadmap', () => {
  it('takes lane ids in order and spec numbers from a lane line with no chunk id', () => {
    assert.deepEqual(lanes(readme('- 07.3 (contract first)\n- 07.2', '- 09 (waits on the owner, 2026-10-20)')), { asap: ['07.3', '07.2'], held: ['09'] });
  });

  it('reads priority, plan only and base from the status column only', () => {
    const r = rows(readme('- (none)', '- (none)', '| 11 | Docs | [11-docs.md](11-docs.md) | idea · plan only · base next/docs | 0 left |'));
    assert.deepEqual(r.map((x) => [x.num, x.priority, x.planOnly, x.base]), [['07', null, false, null], ['09', 1, false, null], ['11', null, true, 'next/docs']]);
  });
});

describe('a template-shaped roadmap', () => {
  it('reads a row whose # column says 1 by its linked file, 01', () => {
    const r = rows('| 1 | Bootstrap | [01-bootstrap.md](01-bootstrap.md) | planned | 3 left |');
    assert.deepEqual(r.map((x) => [x.num, x.file]), [['01', '01-bootstrap.md']]);
  });

  it('takes a lane spec number as written or unpadded', () => {
    assert.deepEqual(lanes(readme('- 9 (billing first)', '- 7 (waits, 2026-10-20)')), { asap: ['09'], held: ['07'] });
  });
});

describe('the simulated order', () => {
  it('builds an Asap spec number from its first ready chunk on', () => {
    const sim = simulate({ readme: readme('- 07'), specs: specs() });
    assert.deepEqual(ids(sim.next), ['07.1', '07.2', '09.1', '09.2', '07.3']);
    assert.equal(sim.next[1].lane, 'asap');
  });

  it('builds priority rows before table order, a pick unblocking what needs it', () => {
    const sim = simulate({ readme: readme(), specs: specs() });
    assert.deepEqual(ids(sim.next), ['09.1', '09.2', '07.1', '07.2', '07.3']);
    // every pick names its spec, whichever lane found it (the GUI's plan board groups by it)
    assert.deepEqual(sim.next.map((c) => c.spec), ['09', '09', '07', '07', '07']);
    assert.deepEqual(simulate({ readme: readme('- 07'), specs: specs() }).next.map((c) => c.spec), ['07', '07', '09', '09', '07']);
    assert.deepEqual(sim.next.map((c) => c.eta), [5, 6, 7, 9.5, 10.5]);
    assert.deepEqual(sim.blocked, []);
  });

  it('puts the Asap lane first, once its needs are done', () => {
    const sim = simulate({ readme: readme('- 07.3\n- 07.1'), specs: specs() });
    assert.deepEqual(ids(sim.next), ['07.1', '09.1', '09.2', '07.3', '07.2']);
    assert.equal(sim.next[3].lane, 'asap');
  });

  it('lists held, claimed and unreachable chunks apart, and counts a pending close as closed', () => {
    const sim = simulate({ readme: readme('- (none)', '- 07.2'), specs: specs(), closed: new Set(['09.2']), claims: { '09.1': { who: 'sam', mine: false } } });
    assert.deepEqual(ids(sim.inFlight), ['09.1']);
    assert.deepEqual(ids(sim.next), ['07.1', '07.3']);
    assert.deepEqual(sim.blocked.map((c) => `${c.id}:${c.why}`), ['07.2:held']);
    const held = simulate({ readme: readme('- (none)', '- 09'), specs: specs() });
    assert.deepEqual(held.blocked.map((c) => `${c.id}:${c.why}`), ['09.1:held', '09.2:held', '07.3:needs 09.2']);
  });

  it("treats this session's own claims as still to build", () => {
    const sim = simulate({ readme: readme(), specs: specs(), claims: { '09.1': { who: 'me', mine: true } } });
    assert.equal(sim.next[0].id, '09.1');
  });

  it('marks the just-plotted chunks, also past the limit', () => {
    const out = render(simulate({ readme: readme(), specs: specs() }), { mark: new Set(['07.1', '07.3']), limit: 3 });
    assert.match(out, /3 {2}07\.1 .*<-- just plotted/);
    assert.match(out, /… 2 more \(07\.3 at 5: just plotted\)/);
  });
});

describe('the --limit flag', () => {
  it('takes a positive whole number, and 12 when the flag is absent', () => {
    assert.equal(parseLimit(undefined), 12);
    assert.equal(parseLimit('3'), 3);
    assert.equal(parseLimit('40'), 40);
  });

  it('refuses a word, zero, a negative, a fraction, a missing value or another flag', () => {
    for (const bad of ['abc', '0', '-2', '2.5', '1e2', '', '--json', null]) assert.equal(parseLimit(bad), null, String(bad));
  });

  it('prints usage and exits non-zero on a bad limit, before reading the plan', () => {
    const script = fileURLToPath(new URL('../plan/order.mjs', import.meta.url));
    for (const args of [['--limit', 'abc'], ['--limit', '0'], ['--limit']]) {
      const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd: os.tmpdir() });
      assert.equal(r.status, 64, args.join(' '));
      assert.equal(r.stdout, '');
      assert.match(r.stderr, /usage: node scripts\/plan\/order\.mjs/);
    }
  });
});

describe('a chunk that needs a secret', () => {
  it('carries its secret names (never values) into the simulated order, [] when it names none', () => {
    const withSecret = [spec('07', ['- [ ] **07.1** Deploy · S · closes A1 · needs — · secrets VERCEL_TOKEN, CF_API_TOKEN', '- [ ] **07.2** Results · M · closes A1 · needs 07.1'])];
    const sim = simulate({ readme: readme(), specs: withSecret });
    assert.deepEqual(sim.next.map((c) => [c.id, c.secrets]), [['07.1', ['VERCEL_TOKEN', 'CF_API_TOKEN']], ['07.2', []]]);
    assert.deepEqual(JSON.parse(JSON.stringify(sim)).next[0].secrets, ['VERCEL_TOKEN', 'CF_API_TOKEN']);
  });
});

describe('the secret gate (A10, A11)', () => {
  const withSecret = () => [spec('07', ['- [ ] **07.1** Deploy · S · closes A1 · needs — · secrets VERCEL_TOKEN, CF_API_TOKEN', '- [ ] **07.2** Results · M · closes A1 · needs 07.1', '- [ ] **07.3** Box · S · closes A1 · needs —'])];

  it("parks the owner's chunk whose secret the vault lacks, and what needs it, and picks the rest", () => {
    const sim = simulate({ readme: readme(), specs: withSecret(), secrets: { contributor: false, missing: (names) => names.filter((n) => n !== 'VERCEL_TOKEN') } });
    assert.deepEqual(ids(sim.next), ['07.3']);
    assert.deepEqual(sim.blocked.map((c) => `${c.id}:${c.why}`), ['07.1:needs secret CF_API_TOKEN', '07.2:needs 07.1']);
    assert.deepEqual(sim.blocked[0].needsSecret, ['CF_API_TOKEN']);
  });

  it('is ready again once every secret is set', () => {
    const sim = simulate({ readme: readme(), specs: withSecret(), secrets: { contributor: false, missing: () => [] } });
    assert.deepEqual(ids(sim.next), ['07.1', '07.2', '07.3']);
  });

  it("never gives a contributor a chunk with a secrets field, set or not, nor asks the vault", () => {
    let asked = false;
    const sim = simulate({ readme: readme('- 07.1'), specs: withSecret(), secrets: { contributor: true, missing: () => { asked = true; return []; } } });
    assert.deepEqual(ids(sim.next), ['07.3']);
    assert.deepEqual(sim.blocked.map((c) => `${c.id}:${c.why}`), ['07.1:owner only (secrets VERCEL_TOKEN, CF_API_TOKEN)', '07.2:needs 07.1']);
    assert.equal(asked, false);
  });

  it('leaves a held reason ahead of the secret, and a chunk naming no secret alone', () => {
    const sim = simulate({ readme: readme('- (none)', '- 07.1'), specs: withSecret(), secrets: { contributor: true, missing: (n) => n } });
    assert.equal(sim.blocked.find((c) => c.id === '07.1').why, 'held');
    assert.ok(sim.next.some((c) => c.id === '07.3'));
  });

  it('reads the vault by name: a name set in a ring or in the environment is not missing', () => {
    const vault = { status: (names) => names.map((name) => ({ name, rings: name === 'A_TOKEN' ? ['local'] : [] })) };
    const missing = secretsMissing(vault, { B_TOKEN: 'fake-env-0001', C_TOKEN: '' });
    assert.deepEqual(missing(['A_TOKEN', 'B_TOKEN', 'C_TOKEN', 'D_TOKEN']), ['C_TOKEN', 'D_TOKEN']);
  });

  it('renders the parked chunk with its reason', () => {
    const out = render(simulate({ readme: readme(), specs: withSecret(), secrets: { contributor: false, missing: (n) => n } }));
    assert.match(out, /07\.1 .*needs secret VERCEL_TOKEN, CF_API_TOKEN/);
  });
});
