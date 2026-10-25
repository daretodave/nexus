// `nexus upgrade` (spec 58, A6): every knob specs 54-57 add is written at the value that keeps today's behaviour
// (Support triage-only, Promote owner, Generators empty, stall_action alert, dimension I off, UI none, cadence unset,
// chain 0, idle backoff 0, quota unset), from one registry; a kit template that names a knob the registry lacks fails
// here (and in the verify gate's upgrade leg). The written lines read back through the kit's own parsers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { KNOBS, templateKnobs, knobsMissing, writeKnobs, render } from '../server/upgrade.mjs';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEXUS = path.resolve(PKG, '..', '..');
const TEMPLATES = path.join(NEXUS, 'templates');
const inRepo = fs.existsSync(path.join(TEMPLATES, 'plan', 'bearings.md'));
const kitScript = (rel) => import(pathToFileURL(path.join(TEMPLATES, 'scripts', ...rel.split('/'))).href);

const CONSERVATIVE = {
  Support: 'triage-only', Promote: 'owner', Generators: '(none)', stall_action: 'alert', loop: 'off', UI: 'none',
  NEXUS_SUPPORT: null, NEXUS_CADENCE: null, NEXUS_CHAIN_MAX: '0', NEXUS_IDLE_BACKOFF: '0', NEXUS_QUOTA_MAX: null,
};

test('the registry holds every spec 54-57 knob at its conservative value, one row each', () => {
  const by = new Map(KNOBS.map((k) => [k.knob, k]));
  assert.equal(by.size, KNOBS.length, 'one row per knob');
  for (const [knob, value] of Object.entries(CONSERVATIVE)) {
    assert.ok(by.has(knob), knob);
    assert.equal(by.get(knob).write, true, `${knob} is written`);
    assert.equal(by.get(knob).value, value, knob);
  }
});

test('every knob a kit template names has a registry row', { skip: !inRepo && 'outside the nexus repo' }, () => {
  const named = templateKnobs(NEXUS).map((k) => k.knob);
  for (const want of ['Support', 'Promote', 'stall_action', 'loop', 'UI', 'Generators', 'NEXUS_CADENCE', 'NEXUS_CHAIN_MAX', 'NEXUS_IDLE_BACKOFF', 'NEXUS_QUOTA_MAX', 'NEXUS_SUPPORT']) {
    assert.ok(named.includes(want), `templateKnobs finds ${want}`);
  }
  assert.deepEqual(knobsMissing(NEXUS), [], 'a template knob with no row in KNOBS (packages/cli/server/upgrade.mjs)');
});

test('every knob the improvement dial sets has a value at every dial position (spec 59)', { skip: !inRepo && 'outside the nexus repo' }, async () => {
  const { registryGaps, DIAL, POSITIONS } = await kitScript('plan/improve.mjs');
  assert.deepEqual(registryGaps(KNOBS), [], 'a dial row in KNOBS with no value at some position (templates/scripts/plan/improve.mjs DIAL)');
  for (const k of KNOBS.filter((r) => r.write)) assert.equal(typeof k.dial, 'boolean', `${k.knob} says whether the dial sets it`);
  const gentle = Object.fromEntries(DIAL.map((r) => [r.knob, r.at.gentle]));
  assert.equal(POSITIONS.length, 4);
  for (const k of KNOBS.filter((r) => r.dial && r.at !== 'var' && r.value != null)) {
    assert.equal(gentle[k.knob], k.value === '(none)' ? 'none' : k.value, `${k.knob}: gentle is the conservative value the upgrade writes`);
  }
});

test('a template that grows a knob the registry lacks fails', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-knobs-'));
  try {
    fs.mkdirSync(path.join(root, 'templates', 'plan'), { recursive: true });
    fs.mkdirSync(path.join(root, 'templates', '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(root, 'templates', 'plan', 'bearings.md'), '# Bearings\n\n**Surface:** `<site | cli>`\n\n**UI:** `none`\n\n- Support: triage-only\n- turbo_mode: on\n\n## Generators\n\n- (none)\n');
    fs.writeFileSync(path.join(root, 'templates', '.github', 'workflows', 'march.yml'), 'env:\n  A: ${{ vars.NEXUS_CHAIN_MAX }}\n  B: ${{ vars.NEXUS_WARP || \'1\' }}\n');
    assert.deepEqual(knobsMissing(root).map((k) => [k.knob, k.at, k.from]), [
      ['NEXUS_WARP', 'var', 'templates/.github/workflows/march.yml'],
      ['turbo_mode', 'bearings', 'templates/plan/bearings.md'],
    ]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

const V1_BEARINGS = '# Field notes bearings\n\n## Hard rules\n\n- Never publish a draft.\n';

test('a v1 bearings gets every bearings knob, and the kit\'s parsers read them back conservative', { skip: !inRepo && 'outside the nexus repo' }, async () => {
  const { text, knobs } = writeKnobs(V1_BEARINGS, { today: '2026-10-25' });
  assert.ok(text.startsWith(V1_BEARINGS.trimEnd()), 'the repo\'s own text stays, first');
  assert.match(text, /^## Loop knobs$/m);
  assert.match(text, /nexus upgrade` \(2026-10-25\)/);
  const status = Object.fromEntries(knobs.map((k) => [k.knob, [k.status, k.value]]));
  assert.deepEqual(status, {
    Improve: ['written', 'gentle'], Support: ['written', 'triage-only'], NEXUS_SUPPORT: ['unset', null], Promote: ['written', 'owner'], Generators: ['written', '(none)'],
    stall_action: ['written', 'alert'], loop: ['written', 'off'], UI: ['written', 'none'], NEXUS_CADENCE: ['unset', null],
    NEXUS_CHAIN_MAX: ['set', '0'], NEXUS_IDLE_BACKOFF: ['set', '0'], NEXUS_QUOTA_MAX: ['unset', null],
  });
  assert.deepEqual(knobs.filter((k) => k.line).map((k) => k.line), ['gh variable set NEXUS_CHAIN_MAX --body 0', 'gh variable set NEXUS_IDLE_BACKOFF --body 0']);

  assert.match(text, /^- Improve: gentle$/m);
  const { resolve: dial } = await kitScript('plan/improve.mjs');
  assert.deepEqual(dial(text).improve, { value: 'gentle', source: 'bearings' }, 'the upgrade writes the dial at gentle');
  const { supportLevel } = await kitScript('plan/support.mjs');
  assert.deepEqual(supportLevel(text, {}).level, 'triage-only');
  const { knobs: promote } = await kitScript('plan/promote.mjs');
  assert.equal(promote(text).promote, 'owner');
  const { loopOn } = await kitScript('plan/loop-rows.mjs');
  assert.equal(loopOn(text).on, false);
  const { parseGenerators } = await kitScript('plan/refill.mjs');
  assert.deepEqual(parseGenerators(text), { generators: [], problems: [] });
  const { stallAction } = await kitScript('plan/motion.mjs');
  assert.equal(stallAction(text), 'alert');
  const { readUiKnobs } = await kitScript('ui-walk.mjs');
  assert.equal(readUiKnobs(text).mode, 'none');
  const { backoffOf } = await kitScript('cloud/idle.mjs');
  assert.equal(backoffOf('0'), 0, 'NEXUS_IDLE_BACKOFF 0: never skip');
});

test('a knob the repo already set is kept, never overwritten; a full bearings gains nothing', () => {
  const own = `${V1_BEARINGS}\n- Support: fix-all\n- loop: on\n\n**UI:** \`url https://example.invalid\`\n\n## Generators\n\n- motion · daily · target 1 · cap 1/wk\n`;
  const { text, knobs } = writeKnobs(own, { today: '2026-10-25' });
  const status = Object.fromEntries(knobs.filter((k) => k.at !== 'var').map((k) => [k.knob, [k.status, k.value]]));
  assert.deepEqual(status, {
    Improve: ['written', 'gentle'], Support: ['kept', 'fix-all'], Promote: ['written', 'owner'], Generators: ['kept', '(none)'],
    stall_action: ['written', 'alert'], loop: ['kept', 'on'], UI: ['kept', 'url'],
  });
  assert.equal((text.match(/^## Generators$/gm) || []).length, 1, 'no second Generators section');
  assert.match(text, /- Promote: owner\n- stall_action: alert\n?$/);
  const again = writeKnobs(text);
  assert.equal(again.text, text.replace(/\r\n/g, '\n'), 'idempotent');
});

test('a prose line under a knob name is not the repo\'s setting: the conservative line is written and reported', () => {
  const prose = `${V1_BEARINGS}\n- Support: email us at help@example.invalid\n- loop: maybe later\n`;
  const { text, knobs } = writeKnobs(prose, { today: '2026-10-25' });
  const support = knobs.find((k) => k.knob === 'Support');
  assert.deepEqual([support.status, support.value, support.ignored], ['written', 'triage-only', 'email']);
  assert.equal(knobs.find((k) => k.knob === 'loop').status, 'written');
  assert.match(text, /^- Support: triage-only$/m);
  assert.match(text, /^- loop: off$/m);
  assert.equal(writeKnobs(text).text, text, 'a second run keeps the written line');
  const out = render({ shape: 'v1', why: 'w', repo: '/r', files: [], archive: [], warnings: [], gate: [], knobs });
  assert.ok(out.includes('passed over      Support: email'), out);
});

test('no bearings at all: one is added holding only the knobs', () => {
  const { text } = writeKnobs(null, { today: '2026-10-25' });
  assert.match(text, /^# Bearings\n\n## Loop knobs\n/);
  assert.match(text, /\*\*UI:\*\* `none`/);
  assert.match(text, /## Generators\n[\s\S]*- \(none\)\n$/);
});

test('the report prints the knobs: lines written, the repo\'s kept, vars to leave unset and the gh lines', () => {
  const { knobs } = writeKnobs(`${V1_BEARINGS}\n- loop: on\n`);
  const out = render({ shape: 'v1', why: 'w', repo: '/r', files: [], archive: [], warnings: [], gate: [], knobs });
  for (const want of [
    'knobs (conservative: the v1 loop runs as it did; turn each up later)',
    'plan/bearings.md  Improve gentle, Support triage-only, Promote owner, ## Generators (none), stall_action alert, UI none',
    "kept (the repo's) loop on",
    'leave unset      NEXUS_SUPPORT, NEXUS_CADENCE, NEXUS_QUOTA_MAX',
    'gh variable set NEXUS_CHAIN_MAX --body 0',
    'gh variable set NEXUS_IDLE_BACKOFF --body 0',
  ]) assert.ok(out.includes(want), `${want}\n---\n${out}`);
});
