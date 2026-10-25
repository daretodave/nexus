// Dimension H and the magic guard (spec 56.5, A4 and A5): scripts/plan/ui-rows.mjs reads H rows right, and the
// skills, bearings and the issue mirror say what the spec decided. Text checks only: nothing runs, nothing is fetched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { checkRows, cutsMagic, main, parseRows } from '../plan/ui-rows.mjs';
import { __test as loopIssue } from '../../templates/scripts/loop-issue.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const row = ({ head = '/inbox @ mobile (stack) — the composer overflows by 48px', next = 'packages/cli/src/styles/inbox.css:120 wraps the chip row', extra = '' } = {}) => [
  `### [H, 6.3] ${head}`,
  '- category: ui',
  '- impact: 7, ease: 9',
  '- evidence: overflowPx 48 in walk.json, inbox-mobile-stack.png,',
  '  https://github.com/o/r/actions/runs/123 (walk-123)',
  `- next: ${next}`,
  '- gate: npm test',
  extra,
].filter(Boolean).join('\n');

const audit = (...rows) => ['# Kit audit', '', '> Last pass: 2026-10-25', '', '## Pending', '', ...rows, '', '## Done', ''].join('\n');

describe('ui-rows: H rows', () => {
  it('parses the heading, the fields and a wrapped field', () => {
    const [r] = parseRows(audit(row()));
    assert.equal(r.score, 6.3);
    assert.equal(r.pending, true);
    assert.equal(r.fields.category, 'ui');
    assert.match(r.fields.evidence, /walk-123/);
  });

  it('a well-formed row is clean', () => {
    assert.deepEqual(checkRows(audit(row())).problems, []);
  });

  it('a local walk path is evidence too', () => {
    const local = row().replace(/https:\S+ \(walk-123\)/, '.scratch/walk/2026-10-25T10-00-00-000Z/walk.json');
    assert.deepEqual(checkRows(audit(local)).problems, []);
  });

  it('flags a bad heading, a bad viewport, no file:line, no artifact and the wrong gate', () => {
    const bad = [
      row({ head: 'the inbox looks cramped' }),
      row({ head: '/inbox @ tablet (stack) — cramped' }),
      row({ next: 'make the inbox roomier' }),
      row().replace(/https:\S+ \(walk-123\)/, 'seen by eye').replace('- gate: npm test', '- gate: node scripts/verify.mjs'),
    ];
    const { problems } = checkRows(audit(...bad).replace('## Pending', '## Pending\n'), 'A');
    assert.ok(problems.some((p) => /reads "### \[H, <score>\]/.test(p)));
    assert.ok(problems.some((p) => /viewport "tablet"/.test(p)));
    assert.ok(problems.some((p) => /next names a file:line/.test(p)));
    assert.ok(problems.some((p) => /no walk artifact/.test(p)));
    assert.ok(problems.some((p) => /gate is npm test/.test(p)));
    assert.ok(problems.some((p) => /4 H rows Pending/.test(p)));
  });

  it('at most 3 H rows Pending; Done rows do not count', () => {
    const three = audit(row(), row(), row());
    assert.deepEqual(checkRows(three).problems, []);
    const done = three.replace('## Done\n', `## Done\n\n${row().replace('### [H', '### [x] [H')}\n`);
    assert.deepEqual(checkRows(done).problems, []);
  });
});

describe('ui-rows: the magic guard', () => {
  const cuts = [
    'packages/cli/src/fx/effects.js:1 — delete src/fx/effects.js',
    'packages/cli/src/styles/fx.css:40 — remove the particle canvas',
    'packages/cli/src/styles/fleet-alive.css:12 — dim the background particles',
    'packages/cli/src/fx/runtime.js:30 — disable motion on the board',
    'packages/cli/src/styles/loading.css:8 — drop @keyframes shimmer',
    'packages/cli/src/styles/base.css:3 — strip the glow',
    'packages/cli/src/fx/host.js:20 — turn off fx on mobile',
  ];
  const cheaper = [
    'packages/cli/src/fx/budget.js:22 — lower the particle budget on a slow frame',
    'packages/cli/src/fx/pool.js:40 — drop the per-frame allocation in src/fx/pool.js',
    'packages/cli/src/fx/pref.js:12 — honour prefers-reduced-motion before the first frame',
    'packages/cli/src/views/Inbox.jsx:88 — remove the duplicate fetch',
    'packages/cli/src/styles/inbox.css:120 — wrap the chip row',
  ];

  for (const next of cuts) {
    it(`refuses: ${next.split(' — ')[1]}`, () => {
      assert.ok(cutsMagic(next), next);
      const { problems } = checkRows(audit(row({ next })));
      assert.ok(problems.some((p) => /the magic guard/.test(p)), problems.join('\n'));
    });
  }
  for (const next of cheaper) {
    it(`allows: ${next.split(' — ')[1]}`, () => {
      assert.equal(cutsMagic(next), null);
      assert.deepEqual(checkRows(audit(row({ next }))).problems, []);
    });
  }
});

describe('ui-rows: the command', () => {
  it('nexus\'s own plan/AUDIT.md is clean', () => {
    const lines = [];
    assert.equal(main(['check'], { root: ROOT, log: (l) => lines.push(l) }), 0, lines.join('\n'));
  });

  it('64 on bad usage', () => {
    assert.equal(main(['lint'], { root: ROOT, log: () => {} }), 64);
  });
});

describe('the skills say it', () => {
  const iterate = read('skills/iterate.md');
  const critique = read('skills/critique.md');
  const expand = read('skills/expand.md');
  const bearings = read('plan/bearings.md');

  it('iterate has dimension H with its row, cap, screenshot budget and focus word', () => {
    assert.match(iterate, /\*\*H\. ui\*\*/);
    assert.match(iterate, /### \[H, <score>\] <route> @ <viewport>\n\s*\(<scenario>\) — <line>/);
    assert.match(iterate, /At most 3 H rows a sweep/);
    assert.match(iterate, /at most \*\*8 PNGs\*\*/);
    assert.match(iterate, /lessons\|ui\)/);
    assert.match(iterate, /`> Bias: ui`/);
    assert.match(iterate, /`--category ui`/);
    assert.match(iterate, /`fix\(cli\):`/);
  });

  it('the /iterate command wrapper takes ui as a focus word', () => {
    const wrapper = read('.claude/commands/iterate.md');
    assert.match(wrapper, /lessons\|ui\)/);
    assert.match(wrapper, /lessons, ui\)/);
  });

  it('the magic guard is a hard rule in iterate and critique, and in the bearings GUI row', () => {
    const rules = (text) => text.slice(text.indexOf('## 4. Hard rules') >= 0 ? text.indexOf('## 4. Hard rules') : text.indexOf('## 5. Hard rules'));
    assert.match(rules(iterate), /\*\*The magic guard\.\*\*/);
    assert.match(rules(critique), /\*\*The magic guard\.\*\*/);
    assert.match(bearings, /\| GUI \|.*the magic guard/);
  });

  it('bearings names the demo scenarios H walks', () => {
    assert.match(bearings, /\*\*UI audit:\*\* `demo fleet-to-tug,stack,grill-me`/);
  });

  it('expand reads signal F, weighted as adopter-facing', () => {
    assert.match(expand, /\*\*F\.\*\* Product telemetry/);
    assert.match(expand, /signals A–F/);
    assert.match(expand, /signal F candidate counts/);
  });

  it('the issue mirror takes --category ui', () => {
    assert.ok(loopIssue.VALID_CATEGORY.has('ui'));
  });
});
