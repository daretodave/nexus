// The improvement dial's readers (spec 59, A2): every script that acts on an expansion knob reads it through
// scripts/plan/improve.mjs, so an `Improve:` line moves it, a knob line of its own still wins, and no line at all reads
// gentle, the loop as it ran. The cloud steps (the Cadence step, the nudge) take the dial only above or below gentle,
// and their repo variable always wins. node:test, no deps, no git, no network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { resolve as cadence, describe as cadenceLine } from '../cloud/cadence.mjs';
import { supportCheck } from '../cloud/nudge-check.mjs';
import { stockRefill } from '../plan/lanes.mjs';
import { loopOn } from '../plan/loop-rows.mjs';
import { effectiveAction, stallAction } from '../plan/motion.mjs';
import { knobs } from '../plan/promote.mjs';
import { effectiveGenerators, parseGenerators } from '../plan/refill.mjs';
import { supportLevel } from '../plan/support.mjs';
import { readUiKnobs } from '../ui-walk.mjs';

const posture = (lines) => ['# Bearings', '', '## Plan expansion posture', '', ...lines, ''].join('\n');
const names = (g) => g.generators.map((x) => x.name);

describe('no dial line reads gentle: every reader runs as it did', () => {
  const none = posture([]);
  it('support, promote, stall_action, loop, generators and the UI walk', () => {
    assert.deepEqual(supportLevel(none, {}), { level: 'triage-only', source: 'default', note: null });
    assert.equal(knobs(none).promote, 'owner');
    assert.equal(stallAction(none), 'alert');
    assert.deepEqual(loopOn(none), { on: false, why: 'no loop line in plan/bearings.md' });
    assert.deepEqual(effectiveGenerators(none), { generators: [], problems: [], from: 'dial' });
    assert.equal(stockRefill(none), null);
    const ui = readUiKnobs('**UI:** `url https://example.invalid`');
    assert.equal(ui.cadence, 'critique', 'a target with no cadence line walks at critique, as before the dial');
    assert.deepEqual(ui.walks, { critique: true, iterate: false });
  });
  it('gentle written out (what the upgrade writes) reads the same', () => {
    const gentle = posture(['- Improve: gentle']);
    assert.equal(supportLevel(gentle, {}).level, 'triage-only');
    assert.equal(supportLevel(gentle, {}).source, 'dial');
    assert.equal(knobs(gentle).promote, 'owner');
    assert.equal(loopOn(gentle).on, false);
  });
});

describe('the dial moves every reader', () => {
  it('steady: fix-small, aged, the generic generators, loop on, stall alert', () => {
    const steady = posture(['- Improve: steady']);
    assert.deepEqual(supportLevel(steady, {}), { level: 'fix-small', source: 'dial', note: null });
    assert.equal(knobs(steady).promote, 'aged');
    assert.equal(stallAction(steady), 'alert');
    assert.deepEqual(loopOn(steady), { on: true, why: 'Improve: steady sets loop on' });
    assert.deepEqual(names(effectiveGenerators(steady)), ['issue-age', 'stale-candidate', 'motion']);
    assert.equal(effectiveGenerators(steady).problems.length, 0, 'the dial\'s lines parse as the generator contract');
    assert.match(stockRefill(steady).stock, /3 generators from the Improve dial/);
  });
  it('bold: fix-all, stall promote (and it promotes, Promote aged), the repo\'s own generators, both UI walks', () => {
    const bold = posture(['- Improve: bold']);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-dial-'));
    try {
      fs.mkdirSync(path.join(root, 'scripts', 'generators'), { recursive: true });
      fs.writeFileSync(path.join(root, 'scripts', 'generators', 'docs-rot.mjs'), '');
      assert.equal(supportLevel(bold, {}).level, 'fix-all');
      assert.deepEqual(effectiveAction(bold).action, 'promote');
      assert.deepEqual(names(effectiveGenerators(bold, { root })), ['issue-age', 'stale-candidate', 'motion', 'docs-rot']);
      assert.equal(effectiveGenerators(bold, { root }).generators.at(-1).cadence, 'weekly');
      const ui = readUiKnobs(`${bold}\n**UI:** \`url https://example.invalid\`\n`);
      assert.deepEqual(ui.walks, { critique: true, iterate: true });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  it('off: support off, stall_action off, loop off', () => {
    const off = posture(['- Improve: off']);
    assert.equal(supportLevel(off, {}).level, 'off');
    assert.equal(stallAction(off), 'off');
    assert.equal(loopOn(off).on, false);
  });
});

describe('a knob line of its own beats the dial; the variable beats both', () => {
  it('overrides per knob', () => {
    const b = posture(['- Improve: bold', '- Promote: owner', '- loop: off', '- stall_action: alert', '- Support: triage-only']);
    assert.equal(knobs(b).promote, 'owner');
    assert.deepEqual(loopOn(b), { on: false, why: 'loop: off' });
    assert.equal(stallAction(b), 'alert');
    assert.deepEqual(supportLevel(b, {}), { level: 'triage-only', source: 'bearings', note: null });
    const s = supportLevel(b, { NEXUS_SUPPORT: 'fix-all' });
    assert.deepEqual([s.level, s.source], ['fix-all', 'env']);
    assert.match(s.note, /NEXUS_SUPPORT \(fix-all\) overrides Support: triage-only/);
    assert.match(supportLevel(posture(['- Improve: steady']), { NEXUS_SUPPORT: 'off' }).note, /overrides the dial \(Improve: steady sets fix-small\)/);
  });
  it('a ## Generators list (none included) beats the dial; prose there defers to it', () => {
    const listed = `${posture(['- Improve: bold'])}\n## Generators\n\n- motion · daily · target 1 · cap 1/wk\n`;
    assert.deepEqual(names(effectiveGenerators(listed)), ['motion']);
    assert.equal(effectiveGenerators(listed).from, 'bearings');
    assert.deepEqual(names(effectiveGenerators(`${posture(['- Improve: bold'])}\n## Generators\n\n- (none)\n`)), []);
    assert.deepEqual(names(effectiveGenerators(`${posture(['- Improve: steady'])}\n## Generators\n\nNone yet.\n`)), ['issue-age', 'stale-candidate', 'motion']);
    assert.deepEqual(parseGenerators(posture(['- Improve: steady'])).generators, [], 'parseGenerators stays the section alone');
  });
  it('UI cadence: a line wins, none walks nothing, and no target walks nothing whatever the dial', () => {
    const bold = posture(['- Improve: bold']);
    assert.deepEqual(readUiKnobs(`${bold}\n**UI:** \`url https://example.invalid\`\n\n**UI cadence:** \`iterate\`\n`).walks, { critique: false, iterate: true });
    assert.deepEqual(readUiKnobs(`${bold}\n**UI:** \`url https://example.invalid\`\n\n**UI cadence:** \`none\`\n`).walks, { critique: false, iterate: false });
    assert.deepEqual(readUiKnobs(bold).walks, { critique: false, iterate: false });
  });
});

describe('the cloud steps take the dial only when their variable is unset', () => {
  it('the Cadence step: --dial stands in for an unset NEXUS_CADENCE, never over a set one', () => {
    const r = cadence({ cadence: '', dial: 'eager' });
    assert.deepEqual([r.cadence, r.ceiling, r.chain_max, r.dial], ['eager', '20', '3', true]);
    assert.match(cadenceLine(r), /^cadence: eager \(the Improve dial; NEXUS_CADENCE unset\)/);
    const set = cadence({ cadence: 'calm', dial: 'eager' });
    assert.deepEqual([set.cadence, set.dial], ['calm', false]);
    const neither = cadence({ cadence: '', dial: '' });
    assert.deepEqual([neither.cadence, neither.ceiling], ['', ''], 'gentle prints nothing: the workflow literals stand');
  });
  it('the nudge: --dial stands in for an unset NEXUS_SUPPORT; off and nothing stay inert', () => {
    assert.equal(supportCheck({ support: null, dial: 'fix-small' }).ok, true);
    assert.equal(supportCheck({ support: null, dial: 'off' }).ok, false);
    assert.equal(supportCheck({ support: null, dial: null }).ok, false);
    assert.equal(supportCheck({ support: 'off', dial: 'fix-all' }).ok, false, 'the variable wins');
  });
});
