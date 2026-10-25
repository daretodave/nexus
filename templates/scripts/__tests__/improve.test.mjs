// improve.mjs (spec 59, A1): the improvement dial. `Improve:` in plan/bearings.md sets every expansion knob's default
// per the table; a knob line of its own (or a set repo variable) wins for that knob only; no line reads gentle; the
// resolver prints each knob's value and source, warns when a variable disagrees with bearings, and the upgrade's knob
// registry (packages/cli/server/upgrade.mjs, in the nexus repo) has a value at every dial position or this fails.
// node:test, no deps, no git, no network: gh is injected.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DIAL, GENERIC_GENERATORS, POSITIONS, cloudValue, dialOf, dialRow, knobOf, generatorsSection, lineValues, main, parseVars, projectGenerators, pulseLine, registryGaps, render, resolve, uiTarget } from '../plan/improve.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEXUS = path.resolve(HERE, '..', '..', '..');
const UPGRADE = path.join(NEXUS, 'packages', 'cli', 'server', 'upgrade.mjs');
const inNexus = fs.existsSync(UPGRADE);

const TABLE = {
  off: { Support: 'off', Promote: 'owner', Generators: 'none', stall_action: 'off', loop: 'off', UI: 'none', Research: 'off', Cadence: 'calm' },
  gentle: { Support: 'triage-only', Promote: 'owner', Generators: 'none', stall_action: 'alert', loop: 'off', UI: 'none', Research: 'off', Cadence: 'steady' },
  steady: { Support: 'fix-small', Promote: 'aged', Generators: 'issue-age,stale-candidate,motion', stall_action: 'alert', loop: 'on', UI: 'critique', Research: 'monthly', Cadence: 'steady' },
  bold: { Support: 'fix-all', Promote: 'aged', Generators: 'issue-age,stale-candidate,motion,cli-deps,docs-rot', stall_action: 'promote', loop: 'on', UI: 'both', Research: 'weekly', Cadence: 'eager' },
};
const values = (r) => Object.fromEntries(r.knobs.map((k) => [k.knob, k.value]));
const sources = (r) => Object.fromEntries(r.knobs.map((k) => [k.knob, k.source]));
const posture = (lines) => ['# Bearings', '', '## Plan expansion posture', '', ...lines, ''].join('\n');

describe('the dial', () => {
  it('sets every knob per the table at each position, every source dial', () => {
    for (const pos of POSITIONS) {
      const r = resolve(posture([`- Improve: ${pos}`]), { project: ['cli-deps', 'docs-rot', 'motion'] });
      assert.deepEqual(r.improve, { value: pos, source: 'bearings' });
      assert.deepEqual(values(r), TABLE[pos], pos);
      assert.ok(r.knobs.every((k) => k.source === 'dial' && k.from === 'dial'), pos);
      assert.deepEqual(r.warnings, []);
    }
  });

  it('reads gentle when the line is absent, and warns on a value that is no position', () => {
    assert.deepEqual(resolve('').improve, { value: 'gentle', source: 'default' });
    assert.deepEqual(values(resolve('# Bearings\n')), TABLE.gentle);
    const r = resolve(posture(['Improve: loud']));
    assert.equal(r.improve.value, 'gentle');
    assert.match(r.warnings[0], /Improve: loud is not a dial position/);
  });

  it('reads the line bulleted, bold or backticked, and never from a comment, a code fence or a run-on prose line', () => {
    assert.equal(dialOf('**Improve:** `bold`').value, 'bold');
    assert.equal(dialOf('* Improve: steady  # the default for new adoptions').value, 'steady');
    assert.equal(dialOf('<!--\n- Improve: bold\n-->\n').source, 'default');
    assert.equal(dialOf('```\nImprove: off | gentle | steady | bold\n```\n').source, 'default');
    assert.equal(dialOf('Improve: off | gentle | steady | bold').source, 'default');
    assert.deepEqual(lineValues('- improve: bold', 'Improve'), [], 'the key is case-sensitive');
  });

  it('has a value at every position for every knob', () => {
    for (const row of DIAL) for (const p of POSITIONS) assert.ok(row.at[p], `${row.knob} at ${p}`);
    assert.deepEqual(registryGaps([], DIAL).filter((g) => /no value at/.test(g)), []);
  });
});

describe('overrides', () => {
  it('a knob line wins for its knob only', () => {
    const r = resolve(posture(['- Improve: bold', '- Promote: owner', '- loop: off']));
    assert.equal(values(r).Promote, 'owner');
    assert.equal(values(r).loop, 'off');
    assert.deepEqual(sources(r), { Support: 'dial', Promote: 'override', Generators: 'dial', stall_action: 'dial', loop: 'override', UI: 'dial', Research: 'dial', Cadence: 'dial' });
    assert.equal(values(r).Support, 'fix-all');
    assert.equal(r.knobs.find((k) => k.knob === 'Promote').dial, 'aged', 'the dial value is kept beside the override');
  });

  it('a line the knob does not take is prose, not an override', () => {
    const r = resolve(posture(['- Improve: steady', 'Support: email us any time', 'Research: maybe']));
    assert.equal(values(r).Support, 'fix-small');
    assert.equal(sources(r).Support, 'dial');
    assert.equal(values(r).Research, 'monthly');
  });

  it('a Generators list overrides; `- (none)` overrides to none; prose or a commented example defers to the dial', () => {
    const listed = resolve(posture(['- Improve: gentle', '', '## Generators', '', '- motion · daily · target 1 · cap 1/wk']));
    assert.deepEqual([values(listed).Generators, sources(listed).Generators], ['motion', 'override']);
    assert.deepEqual(listed.knobs.find((k) => k.knob === 'Generators').list, ['motion · daily · target 1 · cap 1/wk']);
    const none = resolve(posture(['- Improve: bold', '', '## Generators', '', '- (none)']));
    assert.deepEqual([values(none).Generators, sources(none).Generators], ['none', 'override']);
    const prose = resolve(posture(['- Improve: steady', '', '## Generators', '', 'None listed means refill is a no-op.', '<!--', '- motion · daily · target 1 · cap 1/wk', '-->']));
    assert.deepEqual([values(prose).Generators, sources(prose).Generators], ['issue-age,stale-candidate,motion', 'dial']);
    assert.deepEqual(prose.knobs.find((k) => k.knob === 'Generators').list, GENERIC_GENERATORS);
    assert.equal(generatorsSection('# Bearings\n'), null);
  });

  it('the bold dial adds the repo\'s own generators at the project line', () => {
    const r = resolve('Improve: bold', { project: ['zeta', 'issue-age'] });
    assert.deepEqual(r.knobs.find((k) => k.knob === 'Generators').list.slice(3), ['zeta · weekly · target 2 · cap 2/wk']);
  });

  it('UI: the dial sets the cadence; UI: none wins; a target with no cadence line walks at critique under a none dial', () => {
    const ui = (lines) => resolve(posture(lines)).knobs.find((k) => k.knob === 'UI');
    assert.deepEqual([ui(['Improve: bold']).value, ui(['Improve: bold']).target], ['both', 'none']);
    assert.deepEqual([ui(['Improve: bold', '**UI:** `none`', '**UI cadence:** `critique`']).value, ui(['Improve: bold', '**UI:** `none`']).source], ['none', 'override']);
    assert.deepEqual([ui(['Improve: gentle', '**UI:** `url https://example.invalid`']).value, ui(['Improve: gentle', '**UI:** `url https://example.invalid`']).source], ['critique', 'override']);
    assert.deepEqual([ui(['Improve: bold', '**UI:** `url https://example.invalid`']).value, ui(['Improve: bold', '**UI:** `url https://example.invalid`']).source], ['both', 'dial']);
    assert.deepEqual([ui(['Improve: bold', '**UI:** `url https://example.invalid`', '**UI cadence:** `iterate`']).value], ['iterate']);
    assert.equal(uiTarget('**UI audit:** `demo a,b`'), null, 'another knob named UI-something is no target');
  });
});

describe('the repo variables', () => {
  it('a set variable wins and warns when it disagrees with the dial', () => {
    const r = resolve('- Improve: gentle', { vars: { NEXUS_SUPPORT: 'fix-all', NEXUS_CADENCE: 'steady' } });
    const support = r.knobs.find((k) => k.knob === 'Support');
    assert.deepEqual([support.value, support.source, support.from, support.var], ['fix-all', 'override', 'var', 'NEXUS_SUPPORT']);
    assert.deepEqual(r.warnings, ['NEXUS_SUPPORT=fix-all disagrees with the dial (Improve: gentle sets Support triage-only); the variable wins in cloud']);
  });

  it('warns against a bearings override line, and is quiet when they agree', () => {
    const r = resolve('- Improve: gentle\n- Support: fix-small', { vars: { NEXUS_SUPPORT: 'fix-all' } });
    assert.match(r.warnings[0], /NEXUS_SUPPORT=fix-all disagrees with Support: fix-small in plan\/bearings\.md/);
    assert.deepEqual(resolve('- Improve: bold', { vars: { NEXUS_SUPPORT: 'FIX-ALL', NEXUS_CADENCE: 'eager' } }).warnings, []);
  });

  it('ignores an unknown value with a warning, and reads the cadence variable the same way', () => {
    const r = resolve('Improve: bold', { vars: { NEXUS_CADENCE: 'warp', NEXUS_SUPPORT: '' } });
    assert.equal(values(r).Cadence, 'eager');
    assert.match(r.warnings[0], /NEXUS_CADENCE=warp is not a Cadence value/);
    const calm = resolve('Improve: bold', { vars: { NEXUS_CADENCE: 'calm' } });
    assert.deepEqual([values(calm).Cadence, sources(calm).Cadence], ['calm', 'override']);
    assert.match(calm.warnings[0], /NEXUS_CADENCE=calm disagrees with the dial \(Improve: bold sets Cadence eager\)/);
  });

  it('parses gh variable list JSON, and nothing from junk', () => {
    assert.deepEqual(parseVars('[{"name":"NEXUS_SUPPORT","value":"fix-all"},{"name":"X","value":"1"}]'), { NEXUS_SUPPORT: 'fix-all', X: '1' });
    assert.deepEqual(parseVars('not json'), {});
  });
});

describe('the output', () => {
  const r = resolve(posture(['- Improve: bold', '- Promote: owner', '', '## Generators', '', '- motion · daily · target 1 · cap 1/wk', '- issue-age · daily · target 3 · cap 5/wk']), { vars: { NEXUS_SUPPORT: 'fix-small' } });

  it('prints the dial, one `<knob> <value> (dial|override)` line per knob, then the warnings', () => {
    const lines = render(r).split('\n');
    assert.equal(lines[0], 'Improve bold (bearings)');
    assert.equal(lines.length, 1 + DIAL.length + 1);
    for (const l of lines.slice(1, 1 + DIAL.length)) assert.match(l, /^\S+ \S+ \((dial|override)\)$/);
    assert.ok(lines.includes('Promote owner (override)'));
    assert.match(lines.at(-1), /^warn: NEXUS_SUPPORT=fix-small/);
  });

  it('prints /digest\'s pulse line: the dial and every override', () => {
    assert.equal(pulseLine(r), 'Improve: bold · overrides: Support fix-small, Promote owner, Generators 2 listed');
    assert.equal(pulseLine(resolve('')), 'Improve: gentle (no line) · no overrides');
  });
});

describe('the CLI', () => {
  const repo = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-improve-'));
    fs.mkdirSync(path.join(dir, 'plan'));
    fs.mkdirSync(path.join(dir, 'scripts', 'generators'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'plan', 'bearings.md'), posture(['- Improve: bold']));
    fs.writeFileSync(path.join(dir, 'scripts', 'generators', 'docs-rot.mjs'), '');
    fs.writeFileSync(path.join(dir, 'scripts', 'generators', 'README.md'), '');
    // research is gated by its own Research knob, so bold's `project` set never lists it.
    fs.writeFileSync(path.join(dir, 'scripts', 'generators', 'research.mjs'), '');
    return dir;
  };
  const run = (argv, io = {}) => {
    const lines = [];
    const errs = [];
    const code = main(argv, { out: (s) => lines.push(s), err: (s) => errs.push(s), env: {}, gh: () => null, ...io });
    return { code, out: lines.join('\n'), err: errs.join('\n') };
  };

  it('reads plan/bearings.md and the repo\'s generators under --root, as text or JSON', () => {
    const dir = repo();
    try {
      assert.deepEqual(projectGenerators(dir), ['docs-rot']);
      const text = run(['--root', dir]);
      assert.equal(text.code, 0);
      assert.match(text.out, /^Generators issue-age,stale-candidate,motion,docs-rot \(dial\)$/m);
      const json = JSON.parse(run(['--root', dir, '--json']).out);
      assert.deepEqual(json.improve, { value: 'bold', source: 'bearings' });
      assert.equal(json.knobs.length, DIAL.length);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('takes the variables from the environment, or from --vars / --gh, which replace it', () => {
    const dir = repo();
    try {
      assert.match(run(['--root', dir], { env: { NEXUS_SUPPORT: 'off' } }).out, /^Support off \(override\)$/m);
      const file = path.join(dir, 'vars.json');
      fs.writeFileSync(file, JSON.stringify([{ name: 'NEXUS_CADENCE', value: 'calm' }]));
      const viaFile = run(['--root', dir, '--vars', file], { env: { NEXUS_SUPPORT: 'off' } }).out;
      assert.match(viaFile, /^Support fix-all \(dial\)$/m);
      assert.match(viaFile, /^Cadence calm \(override\)$/m);
      let asked = 0;
      const viaGh = run(['--root', dir, '--gh', '--line'], { gh: () => { asked++; return '[{"name":"NEXUS_SUPPORT","value":"fix-small"}]'; } });
      assert.equal(asked, 1);
      assert.equal(viaGh.out, 'Improve: bold · overrides: Support fix-small');
      assert.match(run(['--root', dir, '--gh'], { gh: () => null }).out, /^Support fix-all \(dial\)$/m, 'gh unavailable: the environment stands');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('reads gentle with no bearings at all, and exits 64 on a bad argument', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-improve-'));
    try {
      assert.match(run(['--root', dir]).out, /^Improve gentle \(default\)$/m);
      assert.equal(run(['--loud']).code, 64);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('one knob (spec 59, A2: what the skills, scripts and cloud steps read)', () => {
  it('knobOf gives one knob entry by its name or its variable, with the dial and the warnings', () => {
    const k = knobOf(posture(['- Improve: steady', '- Promote: owner']), 'promote');
    assert.deepEqual([k.knob, k.value, k.source, k.dial, k.improve.value], ['Promote', 'owner', 'override', 'aged', 'steady']);
    assert.equal(knobOf(posture(['- Improve: bold']), 'NEXUS_CADENCE').value, 'eager');
    assert.equal(knobOf('', 'loop').value, 'off', 'no line: gentle');
    assert.match(knobOf(posture(['- Support: off']), 'Support', { vars: { NEXUS_SUPPORT: 'fix-all' } }).warnings[0], /disagrees/);
    assert.equal(dialRow('nope'), null);
    assert.throws(() => knobOf('', 'nope'), /no knob nope/);
  });

  it('cloudValue speaks only under a dial above or below gentle, and never reads the variables', () => {
    assert.equal(cloudValue('', 'Cadence'), '', 'no line: the step default stands');
    assert.equal(cloudValue(posture(['- Improve: gentle']), 'Support'), '', 'gentle is the loop as it ran');
    assert.equal(cloudValue(posture(['- Improve: gentle', '- Support: fix-all']), 'Support'), '', 'an override under gentle stays out of the cloud');
    assert.equal(cloudValue(posture(['- Improve: bold']), 'Cadence'), 'eager');
    assert.equal(cloudValue(posture(['- Improve: off']), 'Support'), 'off');
    assert.equal(cloudValue(posture(['- Improve: steady', '- Support: triage-only']), 'Support', { vars: { NEXUS_SUPPORT: 'fix-all' } }), 'triage-only');
  });

  it('the CLI prints one knob with --knob, the cloud value with --cloud, and 64 on an unknown knob', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-improve-'));
    try {
      fs.mkdirSync(path.join(dir, 'plan'));
      fs.writeFileSync(path.join(dir, 'plan', 'bearings.md'), posture(['- Improve: steady']));
      const out = [];
      const err = [];
      const io = { out: (s) => out.push(s), err: (s) => err.push(s), env: {}, gh: () => null };
      assert.equal(main(['--root', dir, '--knob', 'Support'], io), 0);
      assert.equal(main(['--root', dir, '--cloud', 'Cadence'], io), 0);
      assert.equal(main(['--root', dir, '--knob', 'loop'], { ...io, env: { NEXUS_SUPPORT: 'off' } }), 0);
      assert.deepEqual(out, ['fix-small', 'steady', 'on']);
      assert.match(err.join(' '), /NEXUS_SUPPORT=off disagrees/, 'warnings go to stderr, the value stays alone on stdout');
      assert.equal(main(['--root', dir, '--knob', 'nope'], io), 64);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('the knob registry', () => {
  it('fails a written row that says nothing about the dial, a dial row the table lacks, and a missing position', () => {
    const table = [{ knob: 'Support', var: 'NEXUS_SUPPORT', at: { off: 'off', gentle: 'triage-only', steady: 'fix-small' } }];
    const gaps = registryGaps([
      { knob: 'Support', at: 'bearings', value: 'triage-only', write: true, dial: true },
      { knob: 'NEXUS_SUPPORT', at: 'var', value: null, write: true, dial: true },
      { knob: 'turbo_mode', at: 'bearings', value: 'off', write: true },
      { knob: 'warp', at: 'bearings', value: 'off', write: true, dial: true },
    ], table);
    assert.deepEqual(gaps, [
      'Support: no value at dial position bold',
      'turbo_mode: a written knob says dial: true (the dial sets it) or dial: false',
      'warp: dial: true, but the dial table (scripts/plan/improve.mjs DIAL) has no row for it',
    ]);
  });

  it('fails a gentle value that is not the upgrade\'s conservative one, and a table row no registry row marks', () => {
    const table = [{ knob: 'loop', at: { off: 'off', gentle: 'on', steady: 'on', bold: 'on' } }, { knob: 'Research', at: { off: 'off', gentle: 'off', steady: 'monthly', bold: 'weekly' } }];
    assert.deepEqual(registryGaps([{ knob: 'loop', at: 'bearings', value: 'off', write: true, dial: true }], table), [
      'loop: gentle reads on, the upgrade\'s conservative value is off (gentle is the loop as it ran)',
      'Research: in the dial table, but no registry row marks it dial: true',
    ]);
  });

  it('the upgrade\'s registry has a value at every dial position', { skip: !inNexus && 'outside the nexus repo' }, async () => {
    const { KNOBS } = await import(pathToFileURL(UPGRADE).href);
    assert.deepEqual(registryGaps(KNOBS), []);
  });
});
