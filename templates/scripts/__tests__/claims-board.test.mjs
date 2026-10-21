// claims-board.mjs: the board's body (a markdown table of the live claims) and its one issue, found by its open
// title and edited in place, else created. The issue calls go through an injected runner: no test reaches a real gh.
// node:test, no deps.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from '../claims-codec.mjs';
import { TITLE, cell, main, renderBoard, since, upsertIssue } from '../claims-board.mjs';

const NOW = Date.parse('2026-10-21T12:00:00Z');
const at = (h) => new Date(NOW - h * 3600_000).toISOString();
const sam = { who: 'sam', ip: '10.0.0.2', host: 'sam-pc', session: '9f2c41aa', star: 'vega' };

describe('renderBoard', () => {
  it('says so when nothing is claimed', () => {
    const body = renderBoard({}, { now: NOW });
    assert.match(body, /No claims\./);
    assert.doesNotMatch(body, /\| Chunk \|/);
    assert.match(body, /2026-10-21 12:00 UTC/);
  });

  it('draws one row per claim, in plan order, with state, session~star, since and PR', () => {
    const map = {
      '16.10': format({ ...sam, at: at(2) }),
      '16.3': format({ ...sam, at: at(30) }),
      '9.1': format({ ...sam, session: 'cloud-77', star: '', at: at(300), pr: 42 }),
      '16': format({ ...sam, who: 'Sam Lee', at: at(500), held: 'samlee', base: 'next/16' }),
    };
    const body = renderBoard(map, { now: NOW });
    const rows = body.split('\n').filter((l) => /^\| \d/.test(l));
    assert.deepEqual(rows.map((r) => r.split('|')[1].trim()), ['9.1', '16', '16.3', '16.10']);
    assert.match(rows[0], /\| pr \| sam \| cloud-77 \| 2026-10-09 00:00 UTC \(12d\) \| #42 \| - \|$/);
    assert.match(rows[1], /\| held for @samlee \| Sam Lee \| 9f2c41aa~vega \|.*\| - \| next\/16 \|$/);
    assert.match(rows[2], /\| stale \| sam \| 9f2c41aa~vega \| 2026-10-20 06:00 UTC \(30h\) \|/);
    assert.match(rows[3], /\| live \| sam \| 9f2c41aa~vega \| 2026-10-21 10:00 UTC \(2h\) \|/);
    assert.match(body, /4 claims/);
  });

  it('never lets a claim break the table', () => {
    assert.equal(cell('a|b\nc'), 'a\\|b c');
    assert.equal(cell(''), '-');
  });
});

describe('since', () => {
  it('reads minutes, hours, then days', () => {
    assert.equal(since(at(0.5), NOW), '2026-10-21 11:30 UTC (30m)');
    assert.equal(since(at(47), NOW), '2026-10-19 13:00 UTC (47h)');
    assert.equal(since(at(48), NOW), '2026-10-19 12:00 UTC (2d)');
    assert.equal(since('not a time', NOW), 'not a time');
  });
});

/** A fake gh: records each call, answers `issue list` with `open`. */
function fakeGh(open = []) {
  const calls = [];
  const inputs = [];
  const run = (cmd, args, opts = {}) => {
    calls.push([cmd, ...args]);
    inputs.push(opts.input);
    if (args[1] === 'list') return { status: 0, stdout: JSON.stringify(open) };
    return { status: 0, stdout: 'https://github.com/o/r/issues/7\n' };
  };
  return { calls, inputs, run };
}

describe('upsertIssue', () => {
  it('creates the issue when none is open by its title', () => {
    const gh = fakeGh([{ number: 3, title: `${TITLE} (old)` }]);
    assert.deepEqual(upsertIssue('body', { run: gh.run }), { action: 'created', number: 7 });
    assert.equal(gh.calls.length, 2);
    assert.deepEqual(gh.calls[1].slice(0, 4), ['gh', 'issue', 'create', '--title']);
    assert.equal(gh.calls[1][4], TITLE);
    assert.equal(gh.inputs[1], 'body');
  });

  it('edits the open one in place, the lowest number when there are two', () => {
    const gh = fakeGh([{ number: 12, title: TITLE }, { number: 5, title: TITLE }]);
    assert.deepEqual(upsertIssue('body', { run: gh.run }), { action: 'edited', number: 5 });
    assert.deepEqual(gh.calls[1].slice(0, 4), ['gh', 'issue', 'edit', '5']);
    assert.equal(gh.inputs[1], 'body');
  });

  it('throws with gh\'s words when gh fails', () => {
    const run = () => ({ status: 1, stderr: 'HTTP 403: Resource not accessible\nmore' });
    assert.throws(() => upsertIssue('body', { run }), /gh issue list: HTTP 403: Resource not accessible$/);
  });
});

describe('main', () => {
  const map = { '16.3': format({ ...sam, at: at(2) }) };
  const read = () => ({ tip: 'abc', map });

  it('prints the body and touches no issue without --issue', () => {
    const out = [];
    const gh = fakeGh();
    assert.equal(main([], { read, run: gh.run, out: (s) => out.push(s), now: NOW }), 0);
    assert.equal(gh.calls.length, 0);
    assert.match(out.join('\n'), /\| 16\.3 \| live \|/);
  });

  it('redraws the issue with --issue', () => {
    const out = [];
    const gh = fakeGh([{ number: 9, title: TITLE }]);
    assert.equal(main(['--issue'], { read, run: gh.run, out: (s) => out.push(s), now: NOW }), 0);
    assert.deepEqual(gh.calls[1].slice(0, 4), ['gh', 'issue', 'edit', '9']);
    assert.match(out.join('\n'), /edited #9/);
  });

  it('takes another title with --title', () => {
    const gh = fakeGh();
    main(['--issue', '--title', 'Who builds what'], { read, run: gh.run, out: () => {}, now: NOW });
    assert.equal(gh.calls[1][4], 'Who builds what');
  });
});
