// lanes.mjs (project lanes): a lanes file parses into blocks, a commented example is no lane, a bad hook or return is
// a problem; `Lanes off` disables a lane by name; a `pre` lane yields to the Asap lane; a script `when` runs by exit
// code and a prose one is the agent's to judge; dimensions lanes letter back from Y; a re-sync of the kit's skills
// replaces the stock skills and never a lanes file. node:test, no deps, no gh; scripts injected.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { FILES, lanesOff, main, parseLanes, runWhen, select, sync, whenScript } from '../plan/lanes.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const block = (name, fields) => [`## lane: ${name}`, ...Object.entries(fields).map(([k, v]) => `- ${k}: ${v}`), ''].join('\n');

const MARCH = [
  '# March lanes', '', '> thesis', '', '---', '',
  '<!--', block('example', { hook: 'pre', run: 'nothing' }), '-->', '',
  block('snapshot', { hook: 'pre', when: 'script scripts/due.mjs', run: 'node scripts/snapshot.mjs', return: 'end-tick' }),
  block('survey', { hook: 'pre', when: 'the queue reads empty', run: 'skills/survey.md' }),
  block('content', { hook: 'queue', run: 'skills/ship-content.md', return: 'end-tick' }),
].join('\n');

function tmpRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lanes-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}

async function run(argv, opts) {
  const lines = [];
  const code = await main(argv, { log: (l) => lines.push(l), ...opts });
  return { code, out: lines.join('\n') };
}

describe('parseLanes', () => {
  it('reads each block with its defaults, and skips a commented or fenced example', () => {
    const { lanes, problems } = parseLanes(`${MARCH}\n\`\`\`md\n${block('fenced', { hook: 'pre', run: 'x' })}\`\`\`\n`, 'march');
    assert.deepEqual(problems, []);
    assert.deepEqual(lanes.map((l) => l.name), ['snapshot', 'survey', 'content']);
    assert.equal(lanes[1].return, 'continue');
    assert.equal(lanes[2].when, 'always');
    assert.equal(lanes[0].return, 'end-tick');
  });

  it('names a wrong hook, a missing run, a bad return, a bad name and a duplicate', () => {
    const text = [
      block('dims', { hook: 'dimensions', run: 'x' }),
      block('norun', { hook: 'pre' }),
      block('badret', { hook: 'queue', run: 'x', return: 'stop' }),
      block('Bad Name', { hook: 'pre', run: 'x' }),
      block('twice', { hook: 'pre', run: 'x' }),
      block('twice', { hook: 'queue', run: 'x' }),
    ].join('\n');
    const { problems } = parseLanes(text, 'march');
    assert.equal(problems.length, 5, problems.join('\n'));
    assert.match(problems.join('\n'), /hook dimensions is not one of pre \| queue/);
    assert.match(problems.join('\n'), /no run/);
    assert.match(problems.join('\n'), /return stop/);
    assert.match(problems.join('\n'), /lowercase words/);
    assert.match(problems.join('\n'), /a second lane/);
  });

  it('ships both kit lanes files empty apart from the commented example', () => {
    for (const kind of Object.keys(FILES)) {
      const text = fs.readFileSync(path.join(KIT, FILES[kind]), 'utf8');
      assert.match(text, /<!--[\s\S]*## lane:[\s\S]*-->/, `${kind}: the example lane`);
      assert.deepEqual(parseLanes(text, kind), { lanes: [], problems: [] });
    }
  });
});

describe('lanesOff', () => {
  it('reads the names in plain or bold form; none is none', () => {
    assert.deepEqual([...lanesOff('- Lanes off: snapshot, Survey')], ['snapshot', 'survey']);
    assert.deepEqual([...lanesOff('- **Lanes off:** content')], ['content']);
    assert.equal(lanesOff('- Lanes off: none').size, 0);
    assert.equal(lanesOff('').size, 0);
  });
});

describe('select', () => {
  const { lanes } = parseLanes(MARCH, 'march');

  it('runs a script lane on exit 0, skips it otherwise, and leaves prose to judge', () => {
    const asked = [];
    const got = select(lanes, { hook: 'pre', check: (p) => (asked.push(p), 0) });
    assert.deepEqual(asked, ['scripts/due.mjs']);
    assert.deepEqual(got.map((l) => [l.name, l.action]), [['snapshot', 'run'], ['survey', 'judge']]);
    assert.equal(select(lanes, { hook: 'pre', check: () => 1 })[0].action, 'skip');
    assert.equal(whenScript('the queue reads empty'), null);
  });

  it('yields every pre lane to a ready Asap item or support row, never a queue lane', () => {
    let called = false;
    const pre = select(lanes, { hook: 'pre', asapReady: true, check: () => ((called = true), 0) });
    assert.ok(pre.every((l) => l.action === 'skip' && /Asap/.test(l.why)));
    assert.equal(called, false, 'a yielding lane never runs its when script');
    assert.ok(select(lanes, { hook: 'pre', supportReady: true }).every((l) => /support/.test(l.why)));
    assert.equal(select(lanes, { hook: 'queue', asapReady: true })[0].action, 'run');
  });

  it('turns a lane off by name', () => {
    const got = select(lanes, { hook: 'pre', off: new Set(['snapshot']) });
    assert.deepEqual(got.map((l) => [l.name, l.action]), [['snapshot', 'skip'], ['survey', 'judge']]);
    assert.match(got[0].why, /Lanes off/);
  });

  it('letters dimensions back from Y in file order, an off lane keeping its letter', () => {
    const { lanes: dims } = parseLanes([block('links', { hook: 'dimensions', run: 'a' }), block('tone', { hook: 'dimensions', run: 'b' })].join('\n'), 'iterate');
    const got = select(dims, { hook: 'dimensions', off: new Set(['links']) });
    assert.deepEqual(got.map((l) => [l.name, l.letter, l.action]), [['links', 'Y', 'skip'], ['tone', 'X', 'run']]);
  });
});

describe('main', () => {
  it('is stock with no lanes file, or one holding only the example', async () => {
    const root = tmpRepo({ 'plan/bearings.md': '' });
    assert.deepEqual(await run(['march', 'pre', '--asap', 'none'], { root }), { code: 0, out: 'stock' });
    fs.mkdirSync(path.join(root, 'skills'));
    fs.copyFileSync(path.join(KIT, FILES.iterate), path.join(root, FILES.iterate));
    assert.deepEqual(await run(['iterate', 'dimensions'], { root }), { code: 0, out: 'stock' });
  });

  it('prints each lane at the hook, honours Lanes off and the Asap yield', async () => {
    const root = tmpRepo({ [FILES.march]: MARCH, 'plan/bearings.md': '- Lanes off: survey\n' });
    const ran = await run(['march', 'pre', '--asap', 'none'], { root, check: () => 0 });
    assert.equal(ran.out, ['run snapshot · run: node scripts/snapshot.mjs · return: end-tick', 'skip survey · off (Lanes off in plan/bearings.md)', '1 lane at pre'].join('\n'));
    const yielded = await run(['march', 'pre'], { root, check: () => 0, asap: async () => true });
    assert.match(yielded.out, /skip snapshot · yields to the Asap lane[\s\S]*stock$/);
    assert.match((await run(['march', 'queue'], { root })).out, /^run content · run: skills\/ship-content.md · return: end-tick\n1 lane at queue$/);
  });

  it('reads the Asap lane from the plan when not told', async () => {
    const spec = ['# 07 · Thing', '', '> x', '', '## Acceptance', '', '- **A1** it works', '', '## Chunks', '', 'Measure: 1 open · 0 closed · next A2', '', '- [ ] **07.1** Do it · S · closes A1 · needs —', ''].join('\n');
    const readme = (asap) => ['# Plan', '', '**Asap**', '', asap, '', '**Held**', '', '- (none)', '', '## Specs', '', '| # | Initiative | Spec | Status | Progress |', '|---|---|---|---|---|', '| 7 | Thing | [07-thing.md](07-thing.md) | planned | 1 left |', ''].join('\n');
    for (const [asap, want] of [['- 07.1', /yields to the Asap lane/], ['- (none)', /^run snapshot/]]) {
      const root = tmpRepo({ [FILES.march]: MARCH, 'plan/README.md': readme(asap), 'plan/07-thing.md': spec });
      assert.match((await run(['march', 'pre'], { root, check: () => 0 })).out, want);
    }
  });

  it('runs a when script from a folder whose name has a space', () => {
    const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lanes-')), 'a b');
    const win = process.platform === 'win32';
    const files = { 'due ok.mjs': 'process.exit(0)\n', 'due no.mjs': 'process.exit(3)\n', [win ? 'due ok.cmd' : 'due ok.sh']: win ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n', [win ? 'due no.cmd' : 'due no.sh']: win ? '@exit /b 4\r\n' : '#!/bin/sh\nexit 4\n' };
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(root, 'scripts', name), text, { mode: 0o755 });
    const check = runWhen(root);
    const ext = win ? 'cmd' : 'sh';
    assert.equal(check('scripts/due ok.mjs'), 0);
    assert.equal(check('scripts/due no.mjs'), 3);
    assert.equal(check(`scripts/due ok.${ext}`), 0);
    assert.equal(check(`scripts/due no.${ext}`), 4);
    assert.equal(check('scripts/missing.mjs'), 127);
  });

  it('check lints both files; bad usage is 64', async () => {
    const root = tmpRepo({ [FILES.iterate]: block('loose', { hook: 'pre', run: 'x' }) });
    const r = await run(['check'], { root });
    assert.equal(r.code, 1);
    assert.match(r.out, /skills\/iterate.lanes.md:1: lane loose: hook pre is not one of dimensions/);
    assert.equal((await run(['check'], { root: tmpRepo({}) })).out, 'clean');
    assert.equal(await main(['march', 'dimensions'], { root, log: () => {} }), 64);
    assert.equal(await main(['march', 'pre', '--asap', 'maybe'], { root, log: () => {} }), 64);
  });
});

describe('sync (a re-sync of the kit skills)', () => {
  it('replaces the stock skills and never a lanes file; a missing lanes file is created; dry runs write nothing', async () => {
    const kit = tmpRepo({ 'march.md': 'kit march v2', 'march.lanes.md': 'kit lanes', 'iterate.lanes.md': 'kit iterate lanes', 'next/land.md': 'kit land', 'ship-data.md': 'kit data' });
    const repo = tmpRepo({ 'skills/march.md': 'old march', 'skills/march.lanes.md': 'MY LANES', 'skills/next/land.md': 'kit land' });
    const before = fs.readFileSync(path.join(repo, 'skills/march.md'), 'utf8');
    const dry = sync(kit, path.join(repo, 'skills'));
    assert.deepEqual(dry, { replaced: ['march.md'], same: ['next/land.md'], kept: ['march.lanes.md'], created: ['iterate.lanes.md'], absent: ['ship-data.md'], added: [] });
    assert.equal(fs.readFileSync(path.join(repo, 'skills/march.md'), 'utf8'), before);
    assert.equal(fs.existsSync(path.join(repo, 'skills/iterate.lanes.md')), false);
    const r = await run(['sync', kit, '--write'], { root: repo });
    assert.match(r.out, /keep march.lanes.md/);
    assert.equal(fs.readFileSync(path.join(repo, 'skills/march.md'), 'utf8'), 'kit march v2');
    assert.equal(fs.readFileSync(path.join(repo, 'skills/march.lanes.md'), 'utf8'), 'MY LANES');
    assert.equal(fs.readFileSync(path.join(repo, 'skills/iterate.lanes.md'), 'utf8'), 'kit iterate lanes');
    assert.equal(fs.existsSync(path.join(repo, 'skills/ship-data.md')), false);
    sync(kit, path.join(repo, 'skills'), { write: true, add: true });
    assert.equal(fs.readFileSync(path.join(repo, 'skills/ship-data.md'), 'utf8'), 'kit data');
    assert.equal(fs.readFileSync(path.join(repo, 'skills/march.lanes.md'), 'utf8'), 'MY LANES');
  });

  it('syncing the real kit leaves a project lanes file byte for byte', () => {
    const repo = tmpRepo({ 'skills/march.lanes.md': block('mine', { hook: 'queue', run: 'x' }), 'skills/march.md': 'stale' });
    const r = sync(path.join(KIT, 'skills'), path.join(repo, 'skills'), { write: true });
    assert.ok(r.kept.includes('march.lanes.md') && r.replaced.includes('march.md'));
    assert.equal(fs.readFileSync(path.join(repo, 'skills/march.lanes.md'), 'utf8'), block('mine', { hook: 'queue', run: 'x' }));
  });
});
