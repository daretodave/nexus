// loop-rows.mjs (/iterate's dimension I): a loop-config row names one concrete lever (a repo variable or a
// plan/bearings.md line), keeps ease at 6 or under, a YAML tuning is a [needs-user-call] ask with a lock, and at most
// one I row ships per 7 days. node:test, no deps, no network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { EASE_CAP, SHIP_DAYS, checkRows, easeOf, levers, loopOn, main, parseRows, room } from '../plan/loop-rows.mjs';

const row = ({ head = '[I, 3.6] 64% of last week\'s ticks were idle no-ops', next = 'set the repo variable NEXUS_IDLE_BACKOFF to 2', ease = '6', extra = [] } = {}) => [
  `### ${head}`,
  '- category: loop-config',
  `- impact: 6, ease: ${ease}`,
  '- evidence: "idle ticks 64% (18 of 28)" from node scripts/pulse.mjs --motion',
  `- next: ${next}`,
  ...extra,
].join('\n');

const ask = (extra = ['- lock: loop-cron · since: 2026-10-25 · until: the owner edits march.yml · max_age: 14d']) => row({
  head: '[I, 3.0] [needs-user-call] the schedule fires on the hour, when the queue is busiest',
  next: 'move the cron in .github/workflows/march.yml to 17 */3 * * *',
  ease: '5',
  extra,
});

const audit = (pending = [], done = []) => ['# Site audit', '', '> Last pass: 2026-10-25', '', '## Pending', '', ...pending, '', '## Done', '', ...done, ''].join('\n');

const shippedRow = (date, title = 'idle backoff to 2') => [`### [x] [I, 3.6] ${title} — closed ${date}`, '- category: loop-config'].join('\n');

describe('parseRows', () => {
  it('reads the heading, the ask tag, the close date and the fields', () => {
    const rows = parseRows(audit([row(), ask()], [shippedRow('2026-10-20')]));
    assert.equal(rows.length, 3);
    assert.equal(rows[0].score, 3.6);
    assert.equal(rows[0].pending, true);
    assert.equal(rows[1].ask, true);
    assert.equal(rows[1].title, 'the schedule fires on the hour, when the queue is busiest');
    assert.equal(rows[2].done, true);
    assert.equal(rows[2].closed, '2026-10-20');
  });

  it('skips a fenced example and other letters', () => {
    const text = audit(['```md', row(), '```', '### [H, 6.3] /inbox @ mobile (stack) — overflow', '- category: ui']);
    assert.equal(parseRows(text).length, 0);
  });
});

describe('levers', () => {
  it('a known repo variable is one lever; an unknown one is named', () => {
    assert.deepEqual(levers('set NEXUS_CHAIN_MAX to 2'), { levers: ['NEXUS_CHAIN_MAX'], unknown: [] });
    assert.deepEqual(levers('set NEXUS_TURBO to 1').unknown, ['NEXUS_TURBO']);
  });

  it('a backticked plan/bearings.md line is one lever, a generator line too', () => {
    assert.deepEqual(levers('in plan/bearings.md set `stall_action: promote`').levers, ['stall_action']);
    assert.deepEqual(levers('in plan/bearings.md, `Motion floor` to 40%').levers, ['Motion floor']);
    assert.deepEqual(levers('plan/bearings.md: `- issue-age · daily · target 3 · cap 5/wk`').levers, ['generator issue-age']);
  });

  it('a bearings key without the file, or prose, names nothing', () => {
    assert.deepEqual(levers('set `stall_action` to promote').levers, []);
    assert.deepEqual(levers('make the loop busier').levers, []);
  });
});

describe('easeOf and loopOn', () => {
  it('reads ease from either field shape', () => {
    assert.equal(easeOf({ impact: '6, ease: 5' }), 5);
    assert.equal(easeOf({ ease: '4' }), 4);
    assert.equal(easeOf({ impact: '6' }), null);
  });

  it('loop: on turns it on; off or a missing line reads off', () => {
    assert.equal(loopOn('## Plan expansion posture\n\n- loop: on\n').on, true);
    assert.equal(loopOn('- **loop:** off\n').on, false);
    assert.equal(loopOn('- Promote: aged\n').on, false);
    assert.match(loopOn('').why, /no loop line/);
  });
});

describe('checkRows', () => {
  it('a row turning one lever, and a YAML ask with its lock, are clean', () => {
    const pending = [
      row(),
      row({ next: 'in plan/bearings.md set `stall_action: promote`' }),
      ask(),
    ];
    assert.deepEqual(checkRows(audit(pending, [shippedRow('2026-10-20'), shippedRow('2026-10-10')])).problems, []);
  });

  it('flags no lever, two levers, an unknown variable, the wrong category and ease over the cap', () => {
    const bad = [
      row({ next: 'make the loop busier' }),
      row({ next: 'set NEXUS_CHAIN_MAX to 2 and NEXUS_DAILY_CEILING to 30' }),
      row({ next: 'set NEXUS_TURBO to 1' }),
      row({ ease: String(EASE_CAP + 2) }),
      row().replace('loop-config', 'docs'),
    ];
    const { problems } = checkRows(audit(bad), 'A');
    assert.ok(problems.some((p) => /names no lever/.test(p)));
    assert.ok(problems.some((p) => /turns 2 levers/.test(p)));
    assert.ok(problems.some((p) => /NEXUS_TURBO is not a repo variable/.test(p)));
    assert.ok(problems.some((p) => /ease 8 over the cap of 6/.test(p)));
    assert.ok(problems.some((p) => /category is loop-config/.test(p)));
  });

  it('a YAML tuning is a [needs-user-call], never made; the ask carries its lock', () => {
    const made = row({ next: 'move the cron in .github/workflows/march.yml to 17 */3 * * *' });
    const { problems } = checkRows(audit([made, ask([])]), 'A');
    assert.ok(problems.some((p) => /edits YAML is filed "### \[I, <score>\] \[needs-user-call\]/.test(p)));
    assert.ok(problems.some((p) => /carries "- lock: <slug>/.test(p)));
  });

  it('two shipped within 7 days is a breach; a shipped row must carry its close date', () => {
    const { problems } = checkRows(audit([], [shippedRow('2026-10-20'), shippedRow('2026-10-16'), '### [x] [I, 3.0] undated'].flat()), 'A');
    assert.ok(problems.some((p) => /shipped 4d after/.test(p)));
    assert.ok(problems.some((p) => /closed <YYYY-MM-DD>/.test(p)));
  });

  it('an owner-answered ask is not a shipment', () => {
    const answered = '### [x] [I, 3.0] [needs-user-call] cron moved by the owner — closed 2026-10-21';
    assert.deepEqual(checkRows(audit([], [shippedRow('2026-10-20'), answered])).problems, []);
  });
});

describe('room: one ship per 7 days', () => {
  const rows = parseRows(audit([], [shippedRow('2026-10-20')]));
  it('waits until 7 days after the last ship, then has room', () => {
    assert.deepEqual(room(rows, '2026-10-25'), { room: false, last: '2026-10-20', until: '2026-10-27' });
    assert.equal(room(rows, `2026-10-${20 + SHIP_DAYS}`).room, true);
    assert.equal(room([], '2026-10-25').room, true);
  });
});

describe('the command', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-loop-rows-'));
  fs.mkdirSync(path.join(dir, 'plan'));
  fs.writeFileSync(path.join(dir, 'plan/AUDIT.md'), audit([row()], [shippedRow('2026-10-20')]));
  fs.writeFileSync(path.join(dir, 'plan/bearings.md'), '## Plan expansion posture\n\n- loop: on\n');
  const run = (argv) => {
    const lines = [];
    const code = main(argv, { root: dir, log: (l) => lines.push(l) });
    return { code, lines };
  };

  it('check: clean, 0', () => {
    assert.deepEqual(run(['check']), { code: 0, lines: ['clean (2 I rows)'] });
  });

  it('status: on, and wait until the 7 days pass', () => {
    assert.deepEqual(run(['status', '--today', '2026-10-25']).lines, ['loop: on (loop: on)', 'ship: wait until 2026-10-27 (last shipped 2026-10-20)']);
    assert.deepEqual(run(['status', '--today', '2026-10-28']).lines[1], 'ship: room (last shipped 2026-10-20)');
  });

  it('check: 1 on a breach; 64 on bad usage', () => {
    fs.writeFileSync(path.join(dir, 'plan/broken.md'), audit([row({ next: 'busier' })]));
    assert.equal(run(['check', '--file', 'plan/broken.md']).code, 1);
    assert.equal(run(['lint']).code, 64);
    assert.equal(run(['status', '--today', 'soon']).code, 64);
  });
});
