// refill.mjs (the refill lane) and the two generic generators under scripts/generators/: the `## Generators` list
// parses, a generator runs only while under its target, its weekly cap and its cadence, a failing generator is logged
// and the next one still runs; issue-age and stale-candidate honour the generator contract (a dry run writes nothing,
// a second --write run files nothing, the last line is `filed N` or `clean`); march's queue hook carries the stock
// refill lane only when generators are listed. node:test, no deps; gh and owner mode injected or stubbed by file.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { appendRows, cadenceDays, main, parseGenerators, plan, refill, spawnGenerator, stampLine, stamps, today } from '../plan/refill.mjs';
import { main as lanesMain, stockRefill } from '../plan/lanes.mjs';
import * as issueAge from '../generators/issue-age.mjs';
import * as staleCandidate from '../generators/stale-candidate.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TODAY = '2026-10-25';

function tmpRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'refill-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}

/** A repo laid out as an adopter's: the real generators and the scripts they import, under scripts/. */
function adopterRepo(files) {
  const root = tmpRepo(files);
  fs.cpSync(KIT, path.join(root, 'scripts'), { recursive: true, filter: (src) => !src.includes('__tests__') });
  return root;
}

const capture = (fn) => {
  const lines = [];
  const code = fn((l) => lines.push(l));
  return { code, out: lines.join('\n'), last: lines[lines.length - 1] };
};

const bearings = (gens, extra = '') => ['# Bearings', '', '## Plan expansion posture', '', extra, '', '## Generators', '', ...gens.map((g) => `- ${g}`), '', '## Hard rules', ''].join('\n');

const snapshot = (root) => {
  const out = {};
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else out[path.relative(root, abs)] = fs.readFileSync(abs, 'utf8');
    }
  };
  walk(root);
  return out;
};

describe('parseGenerators', () => {
  it('reads the contract lines, skips (none) and a commented example, and names a bad line', () => {
    const text = bearings(['issue-age · daily · target 3 · cap 5/wk', '`stale-candidate` · 3d · target 1 · cap 1/wk', '(none)', 'bad · hourly · target 1 · cap 1/wk', 'twice · tick · target 0 · cap 1/wk']) + '\n<!--\n- example · daily · target 1 · cap 1/wk\n-->\n';
    const { generators, problems } = parseGenerators(text);
    assert.deepEqual(generators.map((g) => [g.name, g.days, g.target, g.cap]), [['issue-age', 1, 3, 5], ['stale-candidate', 3, 1, 1]]);
    assert.equal(problems.length, 2, problems.join('\n'));
    assert.match(problems[0], /a cadence of tick, daily, weekly/);
    assert.match(problems[1], /target <n>, at least 1/);
    assert.deepEqual(parseGenerators('# Bearings\n').generators, []);
    assert.deepEqual([cadenceDays('tick'), cadenceDays('weekly'), cadenceDays('14d'), cadenceDays('6h')], [0, 7, 14, null]);
  });

  it('the template bearings lists no generator, so refill is a no-op for an adopter', () => {
    const tpl = fs.readFileSync(path.join(KIT, '..', 'plan', 'bearings.md'), 'utf8');
    assert.match(tpl, /^## Generators$/m);
    assert.deepEqual(parseGenerators(tpl), { generators: [], problems: [] });
    assert.equal(stockRefill(tpl), null);
  });
});

describe('plan (target, cap, cadence)', () => {
  const gen = { name: 'issue-age', cadence: 'daily', days: 1, target: 2, cap: 3 };
  const s = (date, pending = true) => ({ name: 'issue-age', date, pending });

  it('runs with the room left under the target and the cap', () => {
    assert.deepEqual(plan(gen, [], TODAY), { action: 'run', why: '0/2 Pending, 0/3 this week', limit: 2 });
    assert.equal(plan(gen, [s('2026-10-20', false), s('2026-10-21', false)], TODAY).limit, 1);
  });

  it('waits while the target holds, the cap is spent, or the cadence has not come round', () => {
    assert.match(plan(gen, [s('2026-10-01'), s('2026-10-02')], TODAY).why, /target held \(2\/2/);
    assert.match(plan(gen, [s('2026-10-20', false), s('2026-10-21', false), s('2026-10-22', false)], TODAY).why, /cap reached \(3\/3/);
    assert.match(plan(gen, [s(TODAY, false)], TODAY).why, /cadence daily/);
    assert.equal(plan(gen, [s('2026-10-24', false)], TODAY).action, 'run');
    assert.equal(plan({ ...gen, name: 'other' }, [s('2026-10-01'), s('2026-10-02')], TODAY).action, 'run', 'stamps are per generator');
  });

  it('reads stamps per section', () => {
    const text = ['# Audit', '', '## Pending', '', '### a', stampLine('x', '2026-10-01'), '', '## Done', '', '### b', stampLine('x', '2026-10-02'), ''].join('\n');
    assert.deepEqual(stamps(text), [{ name: 'x', date: '2026-10-01', pending: true }, { name: 'x', date: '2026-10-02', pending: false }]);
  });
});

describe('appendRows', () => {
  it('replaces the template placeholder with a Pending section, and appends under an existing one before Done', () => {
    const tpl = fs.readFileSync(path.join(KIT, '..', 'plan', 'AUDIT.md'), 'utf8');
    const once = appendRows(tpl, [['### one', '- x']]);
    assert.doesNotMatch(once, /\(empty/);
    assert.match(once, /## Pending\n\n### one\n- x\n$/);
    const withDone = '# Audit\n\n## Pending\n\n### old\n\n## Done\n\n### done\n';
    assert.equal(appendRows(withDone, [['### new']]), '# Audit\n\n## Pending\n\n### old\n\n### new\n\n## Done\n\n### done\n');
    assert.equal(appendRows('', [['### r']]), '# Audit\n\n## Pending\n\n### r\n');
  });
});

describe('refill (the runner)', () => {
  it('logs a failing generator and still runs the next; dry runs pass no --write', () => {
    const root = tmpRepo({ 'plan/bearings.md': bearings(['first · tick · target 2 · cap 2/wk', 'second · tick · target 2 · cap 2/wk', 'third · tick · target 2 · cap 2/wk']) });
    const calls = [];
    const spawn = (name, args) => {
      calls.push([name, args.join(' ')]);
      if (name === 'first') return { code: 2, out: 'half done\n', err: 'boom\n' };
      if (name === 'second') return { code: 0, out: 'would file x\nfiled 1 (dry run)\n', err: '' };
      return { code: 0, out: 'nonsense\n', err: '' };
    };
    const r = capture((log) => main(['--today', TODAY], { root, log, spawn }));
    assert.equal(r.code, 0);
    assert.deepEqual(calls.map((c) => c[0]), ['first', 'second', 'third'], 'a broken generator does not stop the next');
    assert.equal(calls[1][1], `--limit 2 --today ${TODAY}`);
    assert.match(r.out, /^broke first · exit 2: boom$/m);
    assert.match(r.out, /^filed second · filed 1 \(dry run\)$/m, "a generator's own (dry run) is not doubled");
    assert.match(r.out, /^broke third · last line "nonsense" is neither filed N nor clean$/m);
    assert.match(r.out, /2 generators broke: first, third/);
    assert.equal(r.last, 'filed 1 (dry run)');
  });

  it('a generator whose script is missing is broken, not fatal; with none listed refill is clean', () => {
    const root = tmpRepo({ 'plan/bearings.md': bearings(['ghost · tick · target 1 · cap 1/wk']) });
    const { results } = refill(root, { date: TODAY });
    assert.deepEqual(results.map((x) => [x.action, x.why]), [['broke', 'exit 127: no scripts/generators/ghost.mjs']]);
    assert.equal(capture((log) => main([], { root: tmpRepo({ 'plan/bearings.md': '# B\n' }), log })).out, 'clean');
    assert.equal(main(['--now'], { root, log: () => {} }), 64);
  });

  it('runs the real generators end to end: the dry run writes nothing, --write files, a second --write files nothing', () => {
    const cands = ['# Candidates', '', '## Pending', '', '### [ ] [score 7.5] Old idea', '- proposed: 2026-09-01', '', '### [ ] [score 5.0] Weak idea', '- proposed: 2026-08-01', ''].join('\n');
    const root = adopterRepo({
      'plan/bearings.md': bearings(['issue-age · tick · target 5 · cap 5/wk', 'stale-candidate · tick · target 5 · cap 5/wk'], '- Promote: owner'),
      'plan/CANDIDATES.md': cands,
      'plan/AUDIT.md': '# Audit\n\n(empty — run `/iterate audit` to populate)\n',
      'issues.json': JSON.stringify([{ number: 7, title: 'It crashes', createdAt: '2026-10-20T00:00:00Z', labels: [] }]),
    });
    // gh is stubbed by giving issue-age its own --issues file through a wrapper spawn.
    const real = spawnGenerator(root);
    const spawn = (name, args) => real(name, name === 'issue-age' ? [...args, '--issues', 'issues.json'] : args);
    const before = snapshot(root);
    const dry = capture((log) => main(['--today', TODAY], { root, log, spawn }));
    assert.equal(dry.last, 'filed 2 (dry run)');
    assert.deepEqual(snapshot(root), before, 'a dry run writes nothing');
    const wet = capture((log) => main(['--write', '--today', TODAY], { root, log, spawn }));
    assert.equal(wet.last, 'filed 2', wet.out);
    const audit = fs.readFileSync(path.join(root, 'plan/AUDIT.md'), 'utf8');
    assert.match(audit, /### \[user-issue #7\] \[HIGH\] "It crashes" open past the 24h SLA/);
    assert.match(audit, /### \[needs-user-call\] promote Old idea\?/);
    assert.doesNotMatch(audit, /Weak idea/);
    const again = capture((log) => main(['--write', '--today', TODAY], { root, log, spawn }));
    assert.equal(again.last, 'clean', again.out);
    assert.equal(fs.readFileSync(path.join(root, 'plan/AUDIT.md'), 'utf8'), audit, 'a second run files nothing');
  });
});

describe('issue-age', () => {
  const issues = [
    { number: 3, title: 'Old bug\nwith `ticks`', createdAt: '2026-10-20T00:00:00Z', labels: [{ name: 'bug' }] },
    { number: 4, title: 'Fresh', createdAt: '2099-01-01T00:00:00Z', labels: [] },
    { number: 5, title: 'Veto me', createdAt: '2026-10-01T00:00:00Z', labels: [{ name: 'loop:opened' }, { name: 'loop:veto' }] },
    { number: 6, title: 'Already rowed', createdAt: '2026-10-02T00:00:00Z', labels: [] },
    { number: 2, title: 'x'.repeat(200), createdAt: '2026-10-10T00:00:00Z', labels: [] },
  ];
  const repo = () => tmpRepo({ 'plan/bearings.md': '- sla_hours: 12\n', 'plan/AUDIT.md': '# Audit\n> pass mentions #3 in the header\n\n## Pending\n\n### [user-issue #6] [MED] Already rowed\n- category: external-issue\n\n## Done\n\n### [x] #61 something else\n' });
  const run = (root, argv) => capture((log) => issueAge.main(argv, { root, log, issues: () => issues }));

  it('files the overdue issues no row names, oldest first, skipping loop:opened, and dedups on a second run', () => {
    const root = repo();
    const before = fs.readFileSync(path.join(root, 'plan/AUDIT.md'), 'utf8');
    const dry = run(root, ['--today', TODAY]);
    assert.equal(dry.last, 'filed 2 (dry run)');
    assert.match(dry.out, /would file #2[\s\S]*would file #3/);
    assert.equal(fs.readFileSync(path.join(root, 'plan/AUDIT.md'), 'utf8'), before);
    assert.equal(run(root, ['--write', '--today', TODAY]).last, 'filed 2');
    const audit = fs.readFileSync(path.join(root, 'plan/AUDIT.md'), 'utf8');
    assert.match(audit, /### \[user-issue #3\] \[HIGH\] "Old bug with 'ticks'" open past the 12h SLA/);
    assert.match(audit, new RegExp(`"${'x'.repeat(117)}\\.\\.\\." open past`), 'a title is cut at 120 characters');
    assert.match(audit, /- generator: issue-age · filed 2026-10-25\n\n## Done/);
    assert.equal(run(root, ['--write', '--today', TODAY]).last, 'clean');
  });

  it('honours --limit, reads --issues from a file, and breaks (exit 1) when it cannot read issues', () => {
    const root = repo();
    fs.writeFileSync(path.join(root, 'issues.json'), JSON.stringify(issues));
    const r = capture((log) => issueAge.main(['--limit', '1', '--today', TODAY, '--issues', 'issues.json'], { root, log, issues: () => { throw new Error('unused'); } }));
    assert.equal(r.last, 'filed 1 (dry run)');
    assert.equal(issueAge.main(['--today', TODAY], { root, log: () => {}, issues: () => { throw new Error('gh: not logged in'); } }), 1);
    assert.equal(issueAge.main(['--limit', 'many'], { root, log: () => {} }), 64);
  });

  it('measures against the wall clock when --today is the real today (refill always passes it)', () => {
    const root = repo();
    const createdAt = new Date(Date.now() - 13 * 3600000).toISOString();
    const r = capture((log) => issueAge.main(['--today', today()], { root, log, issues: () => [{ number: 9, title: 'Yesterday', createdAt, labels: [] }] }));
    assert.match(r.out, /would file #9 · open 13h, SLA 12h/);
    assert.equal(r.last, 'filed 1 (dry run)');
  });

  it('defaults the SLA to 24h and never mistakes #61 for #6', () => {
    assert.equal(issueAge.slaHours(''), 24);
    assert.equal(issueAge.slaHours('- **sla_hours:** 12'), 12);
    assert.equal(issueAge.named('### #61 x', 6), false);
    assert.equal(issueAge.named('see #6.', 6), true);
  });

  it('runs as a CLI with a stubbed issue list', () => {
    const root = repo();
    fs.writeFileSync(path.join(root, 'issues.json'), JSON.stringify(issues));
    const r = spawnSync(process.execPath, [path.join(KIT, 'generators', 'issue-age.mjs'), '--today', TODAY, '--issues', 'issues.json'], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim().split('\n').pop(), 'filed 2 (dry run)');
  });
});

describe('stale-candidate', () => {
  const cands = ['# Candidates', '', '> Last pass: 2026-10-15', '', '## Pending', '',
    '### [ ] [score 6.4] Older strong', '- proposed: 2026-08-01', '',
    '### [ ] [score 8.0] Best', '- proposed: 2026-09-20', '',
    '### [ ] [score 9.0] Too young', '- proposed: 2026-10-20', '',
    '### [ ] [score 4.0] Weak', '- proposed: 2026-07-01', '',
    '## Rejected', '', '### [ ] [score 9.9] Gone', '- proposed: 2026-01-01', ''].join('\n');
  const repo = (promote) => tmpRepo({ 'plan/bearings.md': `- Promote: ${promote}\n- promote_after_days: 21\n`, 'plan/CANDIDATES.md': cands });
  const run = (root, argv, owner) => capture((log) => staleCandidate.main(argv, { root, log, owner: () => owner }));

  it('is clean where aged promotion reaches the candidates (Promote: aged, an owner checkout)', () => {
    const root = repo('aged');
    const r = run(root, ['--write', '--today', TODAY], true);
    assert.equal(r.last, 'clean');
    assert.equal(fs.existsSync(path.join(root, 'plan/AUDIT.md')), false);
  });

  it('asks about each aged strong candidate under Promote: owner, best first, once', () => {
    const root = repo('owner');
    const dry = run(root, ['--today', TODAY], true);
    assert.equal(dry.last, 'filed 2 (dry run)');
    assert.match(dry.out, /would ask promote Best\?[\s\S]*would ask promote Older strong\?/);
    assert.equal(fs.existsSync(path.join(root, 'plan/AUDIT.md')), false, 'a dry run writes nothing');
    assert.equal(run(root, ['--write', '--limit', '1', '--today', TODAY], true).last, 'filed 1');
    assert.equal(run(root, ['--write', '--today', TODAY], true).last, 'filed 1');
    const audit = fs.readFileSync(path.join(root, 'plan/AUDIT.md'), 'utf8');
    assert.match(audit, /### \[needs-user-call\] promote Best\?\n- category: needs-user\n- evidence: .*Promote: owner/);
    assert.match(audit, /### \[needs-user-call\] promote Older strong\?/);
    assert.doesNotMatch(audit, /Too young|Weak|Gone/);
    assert.equal(run(root, ['--write', '--today', TODAY], true).last, 'clean', 'a second run files nothing');
  });

  it('asks in a contributor checkout even under Promote: aged, and dedups against an ask /expand already wrote', () => {
    const root = repo('aged');
    fs.writeFileSync(path.join(root, 'plan/AUDIT.md'), '# Audit\n\n## Done\n\n### [x] [needs-user-call] promote Best?\n- resolved\n');
    const r = run(root, ['--write', '--today', TODAY], false);
    assert.equal(r.last, 'filed 1');
    assert.match(fs.readFileSync(path.join(root, 'plan/AUDIT.md'), 'utf8'), /promote Older strong\?\n- category: needs-user\n- evidence: .*contributor checkout/);
  });

  it('runs as a CLI (NEXUS_CONTRIBUTOR=1 is a contributor checkout)', () => {
    const root = repo('aged');
    const r = spawnSync(process.execPath, [path.join(KIT, 'generators', 'stale-candidate.mjs'), '--today', TODAY], { cwd: root, encoding: 'utf8', env: { ...process.env, NEXUS_CONTRIBUTOR: '1' } });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim().split('\n').pop(), 'filed 2 (dry run)');
  });
});

describe('the stock refill lane at march queue', () => {
  const lanes = async (root) => {
    const lines = [];
    await lanesMain(['march', 'queue'], { root, log: (l) => lines.push(l) });
    return lines.join('\n');
  };

  it('is absent with no generators, first with some, off by name, and replaced by a project lane of that name', async () => {
    assert.equal(await lanes(tmpRepo({ 'plan/bearings.md': bearings([]) })), 'stock');
    const listed = bearings(['issue-age · daily · target 3 · cap 5/wk']);
    assert.equal(await lanes(tmpRepo({ 'plan/bearings.md': listed })), 'run refill · stock: 1 generator in plan/bearings.md · run: node scripts/plan/refill.mjs --write · return: continue\n1 lane at queue');
    assert.match(await lanes(tmpRepo({ 'plan/bearings.md': `${listed}\n- Lanes off: refill\n` })), /^skip refill · off[\s\S]*stock$/);
    const own = tmpRepo({ 'plan/bearings.md': listed, 'skills/march.lanes.md': '## lane: refill\n- hook: queue\n- run: my refill\n' });
    assert.equal(await lanes(own), 'run refill · run: my refill · return: continue\n1 lane at queue');
    const pre = [];
    await lanesMain(['march', 'pre', '--asap', 'none'], { root: tmpRepo({ 'plan/bearings.md': listed }), log: (l) => pre.push(l) });
    assert.equal(pre.join('\n'), 'stock', 'refill sits at queue only');
  });
});
