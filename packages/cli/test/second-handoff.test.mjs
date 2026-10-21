// The second and third handoffs' re-port outside the vault (41.10): the
// Vault rail item's words, the measured tray line, the step list every
// onboarding counter reads, Settings' secret counts, and nexus.css verbatim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { vaultRail, trayY } from '../src/ui/shell-rules.js';
import { STEPS, stepNo, stepCount, stepBefore, stepAfter } from '../src/ui/steps.js';
import { secretCounts, namesLabel, localKeysLabel, MANIFEST } from '../src/screens/cloud-settings/secrets.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('nexus.css is the handoff\'s, byte for byte', () => {
  assert.equal(read('../src/styles/nexus.css'), read('../design/handoff/nexus.css'));
});

test('the Vault rail item: the owner\'s names, a contributor\'s quiet item (revision 3 wording)', () => {
  assert.deepEqual(vaultRail(true), { tip: 'Vault: secret names for this repo', quiet: false });
  assert.deepEqual(vaultRail(false), { tip: "No project secrets needed: contributors open PRs; the owner's loop deploys.", quiet: true });
  // the same words every view board's rail carries
  assert.match(read('../design/handoff/Fleet.dc.html'), /No project secrets needed: contributors open PRs; the owner's loop deploys\./);
});

const box = (top, height) => ({ getBoundingClientRect: () => ({ top, height, bottom: top + height }) });

test('the tray line is measured from the tray\'s middle to the pane\'s bottom', () => {
  // the board's own dock: 14 + 120 + 10 + 171 + 10 + 36 = 361 above the bottom
  assert.equal(trayY(box(0, 900), box(900 - 361 - 36, 72)), 361);
  // a routed composer that grew past 156px pushes the tray up with it
  assert.equal(trayY(box(0, 900), box(900 - 420 - 36, 72)), 420);
  assert.equal(trayY(box(0, 900), null), null);
  assert.equal(trayY(null, box(0, 72)), null);
  assert.equal(trayY(box(0, 900), box(0, 0)), null, 'a tray with no height (not laid out) leaves the CSS value');
});

test('every onboarding counter, kicker and link reads the step list', () => {
  assert.equal(stepCount('welcome'), `1 of ${STEPS.length}`);
  assert.equal(stepNo('plot'), STEPS.findIndex((s) => s.id === 'plot') + 1);
  assert.equal(stepBefore('welcome'), null);
  assert.equal(stepAfter('launch'), null);
  // with the Secrets step in the list (42.8), the board's numbers fall out
  assert.equal(stepCount('welcome'), '1 of 7');
  assert.equal(stepCount('secrets'), '4 of 7');
  assert.equal(stepCount('plot'), '5 of 7');
  assert.equal(stepCount('cloud'), '6 of 7');
  assert.equal(stepCount('launch'), '7 of 7');
  assert.equal(stepAfter('shape'), 'secrets');
  assert.equal(stepBefore('plot'), 'secrets');
});

test('no onboarding step writes its number by hand', () => {
  for (const f of ['Welcome', 'Detect', 'Shape', 'Secrets', 'Plot', 'CloudSetup', 'Launch']) {
    const src = read(`../src/screens/onboarding/${f}.jsx`);
    assert.doesNotMatch(src, /ob-count">\d/, `${f}: the count comes from stepCount`);
    assert.doesNotMatch(src, /kicker">step \d/, `${f}: the kicker's number comes from stepNo`);
  }
});

test('Settings\' secret counts: names and local keys from secrets.mjs status --json, unknown until served', () => {
  assert.deepEqual(secretCounts(null), { names: null, localKeys: null });
  const owner = { mode: 'owner', secrets: [{ name: 'A', declared: true }, { name: 'B', declared: true }, { name: 'GITHUB_TOKEN', declared: false }], localKeys: [] };
  assert.deepEqual(secretCounts(owner), { names: 2, localKeys: 0 });
  assert.deepEqual(secretCounts({ mode: 'contributor', secrets: [], localKeys: [{ name: 'X', rings: ['local'] }, { name: 'Y', rings: [] }] }), { names: 0, localKeys: 2 });
  assert.equal(namesLabel(null), null);
  assert.equal(namesLabel(1), '1 name');
  assert.equal(namesLabel(6), '6 names');
  assert.equal(localKeysLabel(null), 'Local keys');
  assert.equal(localKeysLabel(1), '1 local key');
  assert.equal(localKeysLabel(2), '2 local keys');
  assert.equal(MANIFEST, 'nexus.secrets.json');
});

test('MISSING no longer lists GET /api/secrets: 42.7 serves it and the vault (42.8) draws it', () => {
  const hooks = read('../src/data/hooks.js');
  const at = hooks.indexOf('export const MISSING');
  assert.doesNotMatch(hooks.slice(at, hooks.indexOf('];', at)), /GET \/api\/secrets/);
});
