// cloud/cadence.mjs (the cadence presets): NEXUS_CADENCE alone switches the ceiling, chain max, idle backoff and the
// heartbeat threshold, a per-field variable overrides its preset, unset leaves the workflow's literals; apply writes a
// preset's cron, ceiling and heartbeat literal into the files (off takes the schedule out and puts it back), and the
// workflows' steps read what the Cadence step outputs. node:test, pure.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  CADENCES, DEFAULT_CADENCE, OFF_MARKER, PRESETS, REALIZED_FLOOR, REALIZED_HOURS, applyPreset, cronOf, cronSlots,
  cronsOf, describe as line, main, parseCron, presetOf, realized, resolve, setCeiling, setCron, setHeartbeatHours,
} from '../cloud/cadence.mjs';
import { CADENCES as BOOTSTRAP_CADENCES, DEFAULT_CADENCE as BOOTSTRAP_DEFAULT } from '../bootstrap.mjs';

const TEMPLATES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tpl = (rel) => fs.readFileSync(path.join(TEMPLATES, rel), 'utf8').replace(/\r\n/g, '\n');

/** The Cadence step as the workflow runs it: its flags, the outputs it writes. */
function step(vars) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-'));
  const env = { GITHUB_OUTPUT: path.join(dir, 'out'), GITHUB_STEP_SUMMARY: path.join(dir, 'summary') };
  const argv = ['resolve', '--cadence', vars.NEXUS_CADENCE ?? '', '--ceiling', vars.NEXUS_DAILY_CEILING ?? '',
    '--chain-max', vars.NEXUS_CHAIN_MAX ?? '', '--idle-backoff', vars.NEXUS_IDLE_BACKOFF ?? '',
    '--heartbeat-hours', vars.NEXUS_HEARTBEAT_HOURS ?? ''];
  const logged = [];
  assert.equal(main(argv, { env, log: (s) => logged.push(s), warn: (s) => logged.push(s) }), 0);
  const out = Object.fromEntries(fs.readFileSync(env.GITHUB_OUTPUT, 'utf8').trim().split('\n').map((l) => l.split(/=(.*)/s).slice(0, 2)));
  return { out, summary: fs.readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8'), logged };
}

describe('the presets', () => {
  it('holds the spec 55 table, no cron at minute :00', () => {
    assert.deepEqual(CADENCES, ['calm', 'steady', 'eager', 'sprint', 'off']);
    assert.deepEqual(PRESETS.calm, { cron: '17 */6 * * *', heartbeatHours: 20, ceiling: 8, chainMax: 0, idleBackoff: 3 });
    assert.deepEqual(PRESETS.steady, { cron: '17 */3 * * *', heartbeatHours: 14, ceiling: 12, chainMax: 0, idleBackoff: 3 });
    assert.deepEqual(PRESETS.eager, { cron: '17 */3 * * *', heartbeatHours: 10, ceiling: 20, chainMax: 3, idleBackoff: 3 });
    assert.deepEqual(PRESETS.sprint, { cron: '17 */3 * * *', heartbeatHours: 10, ceiling: 30, chainMax: 8, idleBackoff: 3 });
    assert.deepEqual(PRESETS.off, { cron: null, heartbeatHours: null, ceiling: 12, chainMax: 0, idleBackoff: 0 });
    for (const p of Object.values(PRESETS)) if (p.cron) assert.notEqual(p.cron.split(' ')[0], '0');
    assert.equal(DEFAULT_CADENCE, 'steady');
  });

  it('the template workflows ship the default preset as written: applying steady changes nothing (spec 55, A11)', () => {
    const before = { march: tpl('.github/workflows/march.yml'), heartbeat: tpl('.github/workflows/heartbeat.yml') };
    const r = applyPreset(DEFAULT_CADENCE, before);
    assert.equal(cronOf(before.march), PRESETS.steady.cron);
    assert.equal(r.march, before.march);
    assert.equal(r.heartbeat, before.heartbeat);
  });

  it('bootstrap names the same five words and the same default', () => {
    assert.deepEqual(BOOTSTRAP_CADENCES, [...CADENCES]);
    assert.equal(BOOTSTRAP_DEFAULT, DEFAULT_CADENCE);
  });

  it('reads a preset word trimmed and in any case; anything else is null', () => {
    assert.equal(presetOf(' Eager '), 'eager');
    for (const v of ['', undefined, 'fast', 'toString', 'constructor']) assert.equal(presetOf(v), null, String(v));
  });
});

describe('resolve: the variable switches every field, no file edit', () => {
  for (const name of CADENCES) {
    it(`NEXUS_CADENCE=${name}`, () => {
      const p = PRESETS[name];
      const { out, summary } = step({ NEXUS_CADENCE: name });
      assert.deepEqual(out, {
        cadence: name, ceiling: String(p.ceiling), chain_max: String(p.chainMax), idle_backoff: String(p.idleBackoff),
        heartbeat_hours: p.heartbeatHours === null ? 'none' : String(p.heartbeatHours),
      });
      assert.match(summary, new RegExp(`^cadence: ${name} \\(ceiling ${p.ceiling}, chain max ${p.chainMax}, `));
    });
  }

  it('unset: every output empty, so the literals and the scripts\' defaults stand (and nothing chains)', () => {
    const { out, summary } = step({});
    assert.deepEqual(out, { cadence: '', ceiling: '', chain_max: '', idle_backoff: '', heartbeat_hours: '' });
    assert.match(summary, /NEXUS_CADENCE unset .*the workflow default/);
  });

  it('a per-field variable overrides its preset; the rest still follow the preset', () => {
    const { out, summary } = step({ NEXUS_CADENCE: 'eager', NEXUS_CHAIN_MAX: '0', NEXUS_DAILY_CEILING: '9', NEXUS_HEARTBEAT_HOURS: '30' });
    assert.deepEqual(out, { cadence: 'eager', ceiling: '9', chain_max: '0', idle_backoff: '3', heartbeat_hours: '30' });
    assert.match(summary, /set by NEXUS_DAILY_CEILING, NEXUS_CHAIN_MAX, NEXUS_HEARTBEAT_HOURS/);
  });

  it('a per-field variable works with no preset too', () => {
    assert.deepEqual(resolve({ idleBackoff: '0', chainMax: '2' }).idle_backoff, '0');
    assert.equal(resolve({ chainMax: '2' }).chain_max, '2');
    assert.equal(resolve({ ceiling: '15' }).ceiling, '15');
  });

  it('an unknown word warns and reads as unset; a bad ceiling or hours falls to the preset', () => {
    const r = resolve({ cadence: 'turbo' });
    assert.equal(r.cadence, '');
    assert.equal(r.ceiling, '');
    assert.match(r.warnings[0], /turbo/);
    const s = resolve({ cadence: 'calm', ceiling: 'lots', heartbeatHours: '0' });
    assert.equal(s.ceiling, '8');
    assert.equal(s.heartbeat_hours, '20');
    assert.equal(s.warnings.length, 2);
    assert.equal(resolve({ heartbeatHours: 'None' }).heartbeat_hours, 'none');
  });

  it('the summary line names what decided', () => {
    assert.equal(line(resolve({ cadence: 'steady' })), 'cadence: steady (ceiling 12, chain max 0, idle backoff 3, heartbeat 14h)');
    assert.match(line(resolve({ cadence: 'off' })), /heartbeat none\)$/);
  });
});

describe('apply: writing a preset into the files', () => {
  const MARCH = "on:\n  schedule:\n    # every 2h\n    - cron: '0 */2 * * *'\n  workflow_dispatch:\njobs:\n  x:\n    steps:\n      - run: |\n          ceiling=12\n          if [ -n \"$C\" ]; then ceiling=$C; fi\n";
  const HB = "        run: |\n          march_hours=14\n          check_cadence march \"$march_hours\"\n";

  it('sets the cron line, keeping the comments above it', () => {
    const r = setCron(MARCH, '17 */6 * * *');
    assert.ok(r.found && r.changed);
    assert.match(r.text, /  schedule:\n    # every 2h\n    - cron: '17 \*\/6 \* \* \*'\n/);
    assert.equal(cronOf(r.text), '17 */6 * * *');
  });

  it('reads and rewrites a cron line that carries its own trailing comment', () => {
    const commented = "on:\n  schedule:\n    - cron: '*/40 * * * *'   # every 40 min UTC\n  workflow_dispatch:\n";
    assert.equal(cronOf(commented), '*/40 * * * *');
    const r = setCron(commented, '17 */3 * * *');
    assert.ok(r.found && r.changed);
    assert.equal(cronOf(r.text), '17 */3 * * *');
  });

  it('off takes the schedule out behind the marker; a later preset puts it back', () => {
    const off = setCron(MARCH, null).text;
    assert.equal(cronOf(off), null);
    assert.ok(off.includes(`\n${OFF_MARKER}\n  workflow_dispatch:`));
    assert.ok(!/^\s+schedule:/m.test(off));
    assert.equal(setCron(off, null).changed, false);
    const back = setCron(off, '17 */3 * * *').text;
    assert.equal(cronOf(back), '17 */3 * * *');
    assert.ok(!back.includes(OFF_MARKER));
  });

  it('reports a file with no anchor instead of guessing', () => {
    assert.equal(setCron('on:\n  workflow_dispatch:\n', '17 * * * *').found, false);
    assert.equal(setCeiling('x', 3).found, false);
    assert.equal(setHeartbeatHours('x', 3).found, false);
  });

  it('sets the ceiling literal only (not the line that reads the Cadence output)', () => {
    const t = setCeiling(MARCH, 30).text;
    assert.match(t, /\n {10}ceiling=30\n/);
    assert.match(t, /then ceiling=\$C; fi/);
  });

  it('sets heartbeat\'s march_hours literal; none for off', () => {
    assert.match(setHeartbeatHours(HB, 10).text, /march_hours=10\n/);
    assert.match(setHeartbeatHours(HB, null).text, /march_hours=none\n/);
  });

  it('applyPreset: cron, ceiling and hours together; the manifest overrides win; an unknown preset throws', () => {
    const r = applyPreset('sprint', { march: MARCH, heartbeat: HB });
    assert.equal(cronOf(r.march), '17 */3 * * *');
    assert.match(r.march, /\n {10}ceiling=30\n/);
    assert.match(r.heartbeat, /march_hours=10\n/);
    assert.deepEqual(r.notes, []);
    const o = applyPreset('calm', { march: MARCH, cron: '45 4 * * *', ceiling: 5 });
    assert.equal(cronOf(o.march), '45 4 * * *');
    assert.match(o.march, /ceiling=5\n/);
    assert.equal(o.heartbeat, null);
    assert.throws(() => applyPreset('turbo', { march: MARCH }), /calm \| steady/);
    assert.equal(applyPreset('steady', { march: 'name: x\n' }).notes.length, 2);
  });

  it('the template march.yml and heartbeat.yml carry every anchor apply writes', () => {
    const r = applyPreset('eager', { march: tpl('.github/workflows/march.yml'), heartbeat: tpl('.github/workflows/heartbeat.yml') });
    assert.deepEqual(r.notes, []);
    assert.equal(cronOf(r.march), '17 */3 * * *');
    assert.match(r.heartbeat, /march_hours=10\n/);
    const off = applyPreset('off', { march: tpl('.github/workflows/march.yml') }).march;
    assert.equal(cronOf(off), null);
    assert.match(off, /\non:\n {2}# schedule: none[^\n]*\n {2}workflow_dispatch:/);
  });

  it('the command: a dry run changes nothing; --write writes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-apply-'));
    const m = path.join(dir, 'march.yml');
    fs.writeFileSync(m, MARCH);
    const logged = [];
    const io = { env: {}, log: (s) => logged.push(s), warn: (s) => logged.push(s) };
    assert.equal(main(['apply', 'calm', '--march', m, '--heartbeat', path.join(dir, 'none.yml')], io), 0);
    assert.equal(fs.readFileSync(m, 'utf8'), MARCH);
    assert.match(logged.join('\n'), /would write the calm preset/);
    assert.equal(main(['apply', 'calm', '--march', m, '--heartbeat', path.join(dir, 'none.yml'), '--write'], io), 0);
    assert.equal(cronOf(fs.readFileSync(m, 'utf8')), '17 */6 * * *');
    assert.equal(main(['apply', 'turbo', '--march', m], io), 2);
    assert.equal(main(['bogus'], io), 2);
  });
});

describe('the workflows read the Cadence step', () => {
  const march = tpl('.github/workflows/march.yml');
  const heartbeat = tpl('.github/workflows/heartbeat.yml');

  it('march: the ceiling step, the idle probe and every chain step read its outputs, never the raw variables', () => {
    assert.match(march, /CADENCE_CEILING: \$\{\{ steps\.cadence\.outputs\.ceiling \}\}/);
    assert.match(march, /if \[ -n "\$CADENCE_CEILING" \]; then ceiling=\$CADENCE_CEILING; fi/);
    assert.match(march, /BACKOFF: \$\{\{ steps\.cadence\.outputs\.idle_backoff \}\}/);
    assert.equal((march.match(/CHAIN_MAX: \$\{\{ steps\.cadence\.outputs\.chain_max \}\}/g) ?? []).length, 2);
    assert.ok(!/^ +(?:BACKOFF|CHAIN_MAX): \$\{\{ vars\./m.test(march.replace(/^ +- name: Cadence\n(?: {8}.*\n)+/gm, '')));
    // Each job that reads a cadence output runs its own Cadence step first.
    for (const job of march.split(/\n(?= {2}\w[\w-]*:\n)/)) {
      if (!job.includes('steps.cadence.outputs')) continue;
      assert.ok(job.indexOf('- name: Cadence\n') >= 0 && job.indexOf('- name: Cadence\n') < job.indexOf('steps.cadence.outputs'), job.slice(0, 40));
    }
  });

  it('heartbeat: the march threshold follows heartbeat_hours, and none skips it', () => {
    assert.match(heartbeat, /CADENCE_HOURS: \$\{\{ steps\.cadence\.outputs\.heartbeat_hours \}\}/);
    assert.match(heartbeat, /HEARTBEAT_HOURS: \$\{\{ vars\.NEXUS_HEARTBEAT_HOURS \}\}/);
    assert.ok(heartbeat.indexOf('- name: Cadence\n') < heartbeat.indexOf('CADENCE_HOURS'));
  });
});

// ---- the realized-cadence alarm (spec 55.8) --------------------------------------------------------------------

const FIXTURE = JSON.parse(fs.readFileSync(path.join(TEMPLATES, 'scripts', '__tests__', 'fixtures', 'realized-cadence-2026-09.json'), 'utf8'));
const asRuns = (loop) => loop.runs.map((createdAt) => ({ createdAt, event: 'schedule' }));
const H = 3600000;

describe('the cron reader', () => {
  it('counts the slots a cron promises, each minute once', () => {
    const day = [Date.UTC(2026, 8, 1), Date.UTC(2026, 8, 2)];
    assert.equal(cronSlots(['0 * * * *'], ...day), 24);
    assert.equal(cronSlots(['*/40 * * * *'], ...day), 48); // :00 and :40, not every 40 minutes
    assert.equal(cronSlots(['17 */3 * * *'], ...day), 8);
    assert.equal(cronSlots(['17 */6 * * *'], ...day), 4);
    assert.equal(cronSlots(['0 2,8,14,20 * * *'], ...day), 4);
    assert.equal(cronSlots(['0 1,3,5,7,9,11,23 * * *'], ...day), 7);
    assert.equal(cronSlots(['0 9-17/2 * * *'], ...day), 5);
    assert.equal(cronSlots(['0 * * * *', '0 */2 * * *'], ...day), 24);
    // 2026-09-01 is a Tuesday: weekdays only, by number and by name; Sunday as 0 and 7.
    assert.equal(cronSlots(['0 12 * * 1-5'], ...day), 1);
    assert.equal(cronSlots(['0 12 * * MON-FRI'], ...day), 1);
    assert.equal(cronSlots(['0 12 * * 0'], ...day), 0);
    assert.equal(cronSlots(['0 12 * * 7'], Date.UTC(2026, 8, 6), Date.UTC(2026, 8, 7)), 1);
    // Both day fields restricted: either matches (the 1st, or any Tuesday).
    assert.equal(cronSlots(['0 0 1 * 2'], Date.UTC(2026, 8, 1) - 1, Date.UTC(2026, 9, 1) - 1), 5);
    assert.equal(cronSlots(['0 0 1 jan *'], Date.UTC(2026, 0, 1) - 1, Date.UTC(2026, 0, 2)), 1);
  });

  it('refuses what it cannot read', () => {
    for (const bad of ['* * * *', '60 * * * *', '0 24 * * *', '*/0 * * * *', 'x * * * *']) assert.throws(() => parseCron(bad), /cron:/);
  });

  it('reads every cron line of a schedule, and none from a file without one', () => {
    assert.deepEqual(cronsOf(tpl('.github/workflows/march.yml')), [cronOf(tpl('.github/workflows/march.yml'))]);
    assert.deepEqual(cronsOf("on:\n  schedule:\n    # two\n    - cron: '0 * * * *'\n    - cron: \"30 1 * * *\"  # late\n  workflow_dispatch:\n"), ['0 * * * *', '30 1 * * *']);
    assert.deepEqual(cronsOf(`on:\n${OFF_MARKER}\n  workflow_dispatch:\n`), []);
  });
});

describe('realized cadence, replayed against September 2026', () => {
  /** Every 6h from 09-04 to 09-30: each window holds a full 72h of the month. */
  const windows = [];
  for (let t = Date.UTC(2026, 8, 4); t <= Date.UTC(2026, 8, 30, 18); t += 6 * H) windows.push(t);

  for (const name of ['adopter-hourly', 'adopter-40min']) {
    it(`${name}: every 72h window is under 40% of what the cron promised, and alarms`, () => {
      const loop = FIXTURE.loops[name];
      for (const now of windows) {
        const r = realized({ crons: [loop.cron], runs: asRuns(loop), now });
        assert.equal(r.measured, true);
        assert.ok(r.alarm && r.ratio < REALIZED_FLOOR, `${new Date(now).toISOString()}: ${r.runs}/${r.slots}`);
      }
    });
  }

  it("nexus's own schedule, late but delivered, never alarms", () => {
    const loop = FIXTURE.loops.nexus;
    for (const now of windows) {
      const r = realized({ crons: [loop.cron], runs: asRuns(loop), now });
      assert.equal(r.slots, 12);
      assert.equal(r.alarm, false, `${new Date(now).toISOString()}: ${r.runs}/${r.slots}`);
    }
  });

  it('counts schedule events only: dispatched, chained and nudged runs never mask a throttled schedule', () => {
    const loop = FIXTURE.loops['adopter-hourly'];
    const now = Date.UTC(2026, 8, 20);
    const extra = Array.from({ length: 72 }, (_, i) => ({ createdAt: new Date(now - i * H - 60000).toISOString(), event: 'workflow_dispatch' }));
    const r = realized({ crons: [loop.cron], runs: [...asRuns(loop), ...extra], now });
    assert.equal(r.runs, realized({ crons: [loop.cron], runs: asRuns(loop), now }).runs);
    assert.equal(r.alarm, true);
  });

  it('a cron line changed inside the window is measured from the change, and not before 24h of it', () => {
    const loop = FIXTURE.loops['adopter-hourly'];
    const now = Date.UTC(2026, 8, 20);
    const young = realized({ crons: [loop.cron], runs: asRuns(loop), now, since: new Date(now - 10 * H).toISOString() });
    assert.equal(young.measured, false);
    assert.equal(young.alarm, false);
    assert.match(young.why, /the cron line changed/);
    const cut = realized({ crons: [loop.cron], runs: asRuns(loop), now, since: new Date(now - 30 * H).toISOString() });
    assert.equal(cut.slots, 30);
    assert.equal(cut.measured, true);
  });

  it('no schedule (the off preset) is nothing to measure', () => {
    const r = realized({ crons: [], runs: [], now: Date.UTC(2026, 8, 20) });
    assert.deepEqual([r.measured, r.alarm], [false, false]);
  });
});

describe('cadence.mjs realized', () => {
  function cli(argv) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-realized-'));
    const env = { GITHUB_OUTPUT: path.join(dir, 'out'), GITHUB_STEP_SUMMARY: path.join(dir, 'summary') };
    const logged = [];
    const code = main(argv(dir), { env, log: (s) => logged.push(s), warn: (s) => logged.push(s) });
    const out = fs.existsSync(env.GITHUB_OUTPUT) ? fs.readFileSync(env.GITHUB_OUTPUT, 'utf8') : '';
    return { code, logged: logged.join('\n'), out };
  }
  const write = (dir, name, body) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, typeof body === 'string' ? body : JSON.stringify(body));
    return p;
  };

  it('exits 3 and writes its outputs when the schedule delivered under 40%', () => {
    const loop = FIXTURE.loops['adopter-40min'];
    const r = cli((dir) => ['realized', '--runs', write(dir, 'runs.json', asRuns(loop)), '--cron', loop.cron, '--now', '2026-09-20T00:00:00Z']);
    assert.equal(r.code, 3);
    assert.match(r.logged, /^march realized cadence: \d+ of 144 promised slots ran in 72h \(\d+%, alarm under 40%; cron '\*\/40 \* \* \* \*'\)$/);
    assert.match(r.out, /realized_slots=144\n/);
    assert.match(r.out, /realized_alarm=true\n/);
  });

  it('reads the cron from march.yml, and exits 0 when the schedule is delivered', () => {
    const loop = FIXTURE.loops.nexus;
    const r = cli((dir) => ['realized', '--runs', write(dir, 'runs.json', asRuns(loop)), '--march', write(dir, 'march.yml', `on:\n  schedule:\n    - cron: '${loop.cron}'\n`), '--now', '2026-09-20T00:00:00Z']);
    assert.equal(r.code, 0);
    assert.match(r.out, /realized_alarm=false\n/);
  });

  it('never alarms on what it cannot read', () => {
    for (const argv of [
      (dir) => ['realized', '--runs', path.join(dir, 'missing.json'), '--cron', '0 * * * *'],
      (dir) => ['realized', '--runs', write(dir, 'runs.json', '{"not": "a list"}'), '--cron', '0 * * * *'],
      (dir) => ['realized', '--runs', write(dir, 'runs.json', []), '--cron', 'not a cron'],
      (dir) => ['realized', '--runs', write(dir, 'runs.json', []), '--march', path.join(dir, 'no-march.yml')],
    ]) {
      const r = cli(argv);
      assert.equal(r.code, 0);
      assert.match(r.logged, /not measured/);
    }
  });
});

describe('heartbeat runs the realized-cadence alarm', () => {
  const heartbeat = tpl('.github/workflows/heartbeat.yml');
  it('after the flatline check, over schedule events, with the 72h window and the one title', () => {
    assert.ok(heartbeat.indexOf("- name: Alarm if march's realized cadence is below 40%") > heartbeat.indexOf('check_cadence night 48'));
    assert.match(heartbeat, /gh run list --workflow march --event schedule --created ">=\$from"/);
    assert.match(heartbeat, /node scripts\/cloud\/cadence\.mjs realized --march \.github\/workflows\/march\.yml/);
    assert.match(heartbeat, /--title "Heartbeat: march realized cadence below 40%"/);
    assert.equal(REALIZED_HOURS, 72);
    assert.equal(REALIZED_FLOOR, 0.4);
  });
});
