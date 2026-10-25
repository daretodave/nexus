// scripts/cloud/patch-v1.mjs (spec 55.10): the quota gate and an offset cron into a v1 repo's march.yml and
// night.yml, every other line kept. node:test; git is stubbed, files live in a temp dir, nothing touches a network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { andIf, gateSteps, main, offsetCron, patchWorkflow, readSteps, splitComment, unifiedDiff } from '../cloud/patch-v1.mjs';
import { lintWorkflow } from '../../templates/scripts/workflow-lint.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// The v1 template's shape: an every-2h cron at :00, a ceiling step, the claude step with an id, a crash step.
const MARCH_V1 = `name: march

on:
  schedule:
    # Every 2h, off-peak UTC.
    - cron: '0 1,3,5,7,9,11,23 * * *'
  workflow_dispatch:

concurrency:
  group: march
  cancel-in-progress: false

jobs:
  march:
    runs-on: ubuntu-latest
    timeout-minutes: 300
    permissions:
      contents: write   # push back to main
      issues: write     # /triage labels + cloud-failed issue
      id-token: write   # Claude Code Action's OIDC handshake
    steps:
      - name: Checkout (full history for /march dispatch)
        id: checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Daily commit ceiling check
        id: ceiling
        run: |
          count=$(git log --since="24 hours ago" --grep='Cloud-Run:' --oneline | wc -l)
          if [ "$count" -ge 12 ]; then echo "skip=true" >> "$GITHUB_OUTPUT"; else echo "skip=false" >> "$GITHUB_OUTPUT"; fi

      # Git author identity is set via env vars on the action step
      # below, not via git config.

      - name: Run /march (cloud mode)
        id: run_march
        if: steps.ceiling.outputs.skip != 'true'
        uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          claude_args: >-
            --model claude-sonnet-5
            --permission-mode bypassPermissions
          prompt: |
            Run one tick.
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}

      - name: Open cloud-failed issue if action crashed
        if: failure() && steps.ceiling.outputs.skip != 'true'
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: |
          existing=$(gh issue list --search 'in:title "Cloud march tick crashed" state:open' --json number --jq 'length')
          if [ "$existing" -eq 0 ]; then
            gh issue create --title "Cloud march tick crashed" --body "Run failed."
          fi
`;

// A customized v1 night: no step id, no if, issues: read, an off-hour cron already.
const NIGHT_V1 = `name: night

on:
  schedule:
    - cron: '30 10 * * *'   # daily
  workflow_dispatch:

concurrency:
  group: march
  cancel-in-progress: false

jobs:
  digest:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    permissions:
      contents: write
      issues: read
      actions: read         # gh run list: the pulse
      id-token: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run /digest (night shift)
        uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          prompt: |
            Run the digest.
        env:
          GH_TOKEN: \${{ secrets.ACTIONS_PAT }}

      - name: Open night-failed issue if action crashed
        if: failure()
        env:
          GH_TOKEN: \${{ secrets.ACTIONS_PAT }}
        run: |
          gh issue create --title "Night digest crashed" --body "Run failed."
`;

/** The original lines the patch dropped (as a multiset difference), in order. */
function dropped(before, after) {
  const have = new Map();
  for (const l of after.split('\n')) have.set(l, (have.get(l) ?? 0) + 1);
  const out = [];
  for (const l of before.split('\n')) {
    const n = have.get(l) ?? 0;
    if (n > 0) have.set(l, n - 1);
    else out.push(l);
  }
  return out;
}

const stepNames = (text) => [...text.matchAll(/^\s*- name: (.+)$/gm)].map((m) => m[1]);

describe('offsetCron', () => {
  it('moves :00 off the hour and keeps the hours', () => {
    assert.equal(offsetCron('0 * * * *').cron, '17 * * * *');
    assert.equal(offsetCron('0 1,3,5,7,9,11,23 * * *').cron, '17 1,3,5,7,9,11,23 * * *');
    assert.equal(offsetCron('0,30 * * * *').cron, '17,47 * * * *');
    assert.equal(offsetCron('0,50 * * * *').cron, '17,50 * * * *');
    assert.equal(offsetCron('*/30 * * * *').cron, '17,47 * * * *');
    assert.equal(offsetCron('0 */2 * * *', 5).cron, '5 */2 * * *');
  });
  it('leaves an off-hour minute alone, and notes what it cannot move', () => {
    assert.deepEqual(offsetCron('30 10 * * *'), { cron: '30 10 * * *', note: null });
    assert.equal(offsetCron('* * * * *').cron, '* * * * *');
    assert.match(offsetCron('* * * * *').note, /left as it is/);
    assert.match(offsetCron('0 1').note, /five-field/);
  });
});

describe('andIf', () => {
  it('appends, parenthesizes an ||, unwraps ${{ }} and never doubles', () => {
    assert.equal(andIf('failure()', 'x'), 'failure() && x');
    assert.equal(andIf("a == 'b' || c", 'x'), "(a == 'b' || c) && x");
    assert.equal(andIf('${{ always() }}', 'x'), 'always() && x');
    assert.equal(andIf('always() && x', 'x'), 'always() && x');
  });
  it('unquotes a wholly quoted value, and refuses one it cannot unquote', () => {
    assert.equal(andIf('"failure()"', 'x'), 'failure() && x');
    assert.equal(andIf("'failure()'", 'x'), 'failure() && x');
    assert.equal(andIf("'a == ''b'''", 'x'), "a == 'b' && x");
    assert.equal(andIf('"a == \\"b\\""', 'x'), 'a == "b" && x');
    assert.equal(andIf("'a' == 'b'", 'x'), null);
    assert.equal(andIf('"a\\nb"', 'x'), null);
  });
});

describe('splitComment', () => {
  it('splits a trailing comment outside quotes, never a # inside them', () => {
    assert.deepEqual(splitComment("a != 'true'   # skip"), ["a != 'true'", '   # skip']);
    assert.deepEqual(splitComment("a == '#x' # c"), ["a == '#x'", ' # c']);
    assert.deepEqual(splitComment('a == "x #y"'), ['a == "x #y"', '']);
    assert.deepEqual(splitComment('a#b'), ['a#b', '']);
  });
});

describe('patchWorkflow: commented and quoted ifs', () => {
  it('extends an if: ahead of its trailing comment, on the claude step and on a crash step', () => {
    const commented = MARCH_V1
      .replace("        if: steps.ceiling.outputs.skip != 'true'\n        uses: anth", "        if: steps.ceiling.outputs.skip != 'true'   # skip when over ceiling\n        uses: anth")
      .replace("        if: failure() && steps.ceiling.outputs.skip != 'true'\n", "        if: failure() && steps.ceiling.outputs.skip != 'true'  # crash only\n");
    const r = patchWorkflow(commented, { kind: 'march' });
    assert.match(r.text, /^ {8}if: steps\.ceiling\.outputs\.skip != 'true' && steps\.quota_gate\.outputs\.skip != 'true' {3}# skip when over ceiling$/m);
    assert.match(r.text, /^ {8}if: failure\(\) && steps\.ceiling\.outputs\.skip != 'true' && steps\.quota\.outputs\.status != 'rejected' {2}# crash only$/m);
    assert.deepEqual(lintWorkflow('march.yml', r.text), []);
  });
  it('unquotes a quoted crash if: and refuses a claude if: it cannot unquote', () => {
    const quoted = patchWorkflow(NIGHT_V1.replace('        if: failure()\n', '        if: "failure()"\n'), { kind: 'night' });
    assert.match(quoted.text, /^ {8}if: failure\(\) && steps\.quota\.outputs\.status != 'rejected'$/m);
    const bad = MARCH_V1.replace("        if: steps.ceiling.outputs.skip != 'true'\n        uses: anth", "        if: 'a' == 'b'\n        uses: anth");
    assert.throws(() => patchWorkflow(bad, { kind: 'march' }), /cannot extend/);
  });
});

describe('patchWorkflow: the v1 template march', () => {
  const r = patchWorkflow(MARCH_V1, { kind: 'march' });

  it('adds the gate before the model and the read, cache and pause after it', () => {
    assert.equal(r.changed, true);
    assert.deepEqual(stepNames(r.text), [
      'Checkout (full history for /march dispatch)',
      'Daily commit ceiling check',
      'Quota cache restore',
      'Quota gate',
      'Run /march (cloud mode)',
      'Quota read',
      'Quota cache save',
      'Pause on the weekly quota',
      'Open cloud-failed issue if action crashed',
    ]);
    assert.match(r.text, /if: always\(\) && \(steps\.run_march\.outcome == 'success' \|\| steps\.run_march\.outcome == 'failure'\)/);
    assert.match(r.text, /EXEC_FILE: \$\{\{ steps\.run_march\.outputs\.execution_file \}\}/);
  });

  it('keeps a comment that sits right on the claude step beside it', () => {
    const attached = patchWorkflow(MARCH_V1.replace('not via git config.\n\n', 'not via git config.\n'), { kind: 'march' }).text.split('\n');
    const at = attached.findIndex((l) => l.includes('- name: Run /march'));
    assert.match(attached[at - 1], /not via git config/);
    assert.match(attached[at - 2], /^\s+# Git author identity/);
    assert.equal(attached[at - 3], '');
    assert.match(attached[at - 4], /^\s+node scripts\/cloud\/quota\.mjs gate/);
  });

  it('changes only the cron, the claude if and the crash if; every other line stays', () => {
    assert.deepEqual(dropped(MARCH_V1, r.text), [
      "    - cron: '0 1,3,5,7,9,11,23 * * *'",
      "        if: steps.ceiling.outputs.skip != 'true'",
      "        if: failure() && steps.ceiling.outputs.skip != 'true'",
    ]);
    assert.match(r.text, /- cron: '17 1,3,5,7,9,11,23 \* \* \*'/);
    assert.match(r.text, /if: steps\.ceiling\.outputs\.skip != 'true' && steps\.quota_gate\.outputs\.skip != 'true'\n\s+uses: anthropics/);
    assert.match(r.text, /if: failure\(\) && steps\.ceiling\.outputs\.skip != 'true' && steps\.quota\.outputs\.status != 'rejected'/);
  });

  it('passes workflow-lint', () => {
    assert.deepEqual(lintWorkflow('march.yml', MARCH_V1), []);
    assert.deepEqual(lintWorkflow('march.yml', r.text), []);
  });

  it('is idempotent', () => {
    const again = patchWorkflow(r.text, { kind: 'march' });
    assert.equal(again.changed, false);
    assert.equal(again.already, true);
  });

  it('keeps CRLF files CRLF', () => {
    const crlf = patchWorkflow(MARCH_V1.replace(/\n/g, '\r\n'), { kind: 'march' });
    assert.equal(crlf.text, r.text.replace(/\n/g, '\r\n'));
  });
});

describe('patchWorkflow: a customized night', () => {
  const r = patchWorkflow(NIGHT_V1, { kind: 'night' });

  it('gives the claude step an id and the gate if, and the token issues: write', () => {
    assert.match(r.text, /- name: Run \/digest \(night shift\)\n {8}id: run_digest\n {8}if: steps\.quota_gate\.outputs\.skip != 'true'\n {8}uses: anthropics/);
    assert.match(r.text, /^ {6}issues: write$/m);
    assert.deepEqual(dropped(NIGHT_V1, r.text), ['      issues: read', '        if: failure()']);
    assert.ok(r.notes.some((n) => /issues: read -> write/.test(n)));
  });

  it('leaves an off-hour cron alone and passes workflow-lint', () => {
    assert.match(r.text, /- cron: '30 10 \* \* \*' {3}# daily/);
    assert.deepEqual(lintWorkflow('night.yml', r.text), []);
  });

  it('adds issues: write to a permissions block that has no issues scope', () => {
    const noIssues = patchWorkflow(NIGHT_V1.replace('      issues: read\n', ''), { kind: 'night' });
    assert.match(noIssues.text, /id-token: write\n {6}issues: write {3}# the quota gate and the pause issue\n {4}steps:/);
  });
});

describe('patchWorkflow: what it refuses', () => {
  it('a step id it would collide with', () => {
    assert.throws(() => patchWorkflow(MARCH_V1.replace('id: ceiling', 'id: quota'), { kind: 'march' }), /already has id quota/);
  });
  it('a block if: on the claude step', () => {
    const block = MARCH_V1.replace("        if: steps.ceiling.outputs.skip != 'true'\n        uses: anth", "        if: >-\n          steps.ceiling.outputs.skip != 'true'\n        uses: anth");
    assert.throws(() => patchWorkflow(block, { kind: 'march' }), /is a block/);
  });
  it('a workflow with no claude step changes only its cron', () => {
    const r = patchWorkflow("on:\n  schedule:\n    - cron: '0 3 * * *'\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n");
    assert.match(r.text, /'17 3 \* \* \*'/);
    assert.ok(!/Quota gate/.test(r.text));
    assert.ok(r.notes.some((n) => /no claude-code-action step/.test(n)));
  });
});

describe('the added steps match the template march.yml', () => {
  it('every line but the run kind and the step id is the template text', () => {
    const tpl = new Set(fs.readFileSync(path.join(ROOT, 'templates/.github/workflows/march.yml'), 'utf8').split('\n').map((l) => l.trim()));
    const own = [...gateSteps(), ...readSteps('run_march')].filter((l) => l.trim() && !l.trim().startsWith('#'));
    const differ = own.map((l) => l.trim()).filter((l) => !tpl.has(l));
    // v1 has no `reason` input, so the gate passes no --reason; everything else is the template's text.
    assert.deepEqual(differ, ['node scripts/cloud/quota.mjs gate --event "$EVENT" --max "$QUOTA_MAX" || echo "skip=false" >> "$GITHUB_OUTPUT"']);
  });
});

describe('unifiedDiff', () => {
  it('prints hunks with removals before additions', () => {
    const d = unifiedDiff('a\nb\nc\n', 'a\nB\nc\n', 'f.yml');
    assert.equal(d, '--- a/f.yml\n+++ b/f.yml\n@@ -1,4 +1,4 @@\n a\n-b\n+B\n c\n \n');
    assert.equal(unifiedDiff('x', 'x', 'f'), '');
  });
});

describe('main', () => {
  function scratch({ dirty = '', git = true } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-v1-'));
    fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.github/workflows/march.yml'), MARCH_V1);
    fs.writeFileSync(path.join(dir, '.github/workflows/night.yml'), NIGHT_V1);
    const calls = [];
    const run = (cmd, args) => {
      calls.push(args.join(' '));
      if (!git) return { ok: false, stdout: '', stderr: 'not a git repository' };
      if (args.includes('rev-parse')) return { ok: true, stdout: 'true\n', stderr: '' };
      if (args.includes('get-url')) return { ok: true, stdout: 'https://example.invalid/acme/app.git\n', stderr: '' };
      if (args.includes('status')) return { ok: true, stdout: dirty, stderr: '' };
      return { ok: false, stdout: '', stderr: 'not stubbed' };
    };
    const lines = [];
    return { dir, run, calls, lines, out: (s) => lines.push(s), read: (rel) => fs.readFileSync(path.join(dir, rel), 'utf8') };
  }

  it('dry run: prints the diff, writes nothing', () => {
    const s = scratch();
    assert.equal(main(['--repo', s.dir], { run: s.run, out: s.out }), 0);
    const text = s.lines.join('\n');
    assert.match(text, /dry run/);
    assert.match(text, /^\+ {6}- name: Quota gate$/m);
    assert.match(text, /^- {4}- cron: '0 1,3,5,7,9,11,23 \* \* \*'$/m);
    assert.match(text, /scripts\/cloud\/quota\.mjs: added/);
    assert.equal(s.read('.github/workflows/march.yml'), MARCH_V1);
    assert.ok(!fs.existsSync(path.join(s.dir, 'scripts/cloud/quota.mjs')));
    assert.ok(!s.calls.some((c) => /commit|push|add /.test(c)));
  });

  it('--write: patches both workflows and adds quota.mjs, never commits; the patched march passes workflow-lint', () => {
    const s = scratch();
    assert.equal(main(['--repo', s.dir, '--write'], { run: s.run, out: s.out }), 0);
    const march = s.read('.github/workflows/march.yml');
    assert.equal(march, patchWorkflow(MARCH_V1, { kind: 'march' }).text);
    assert.deepEqual(lintWorkflow('march.yml', march), []);
    assert.match(s.read('.github/workflows/night.yml'), /- name: Quota gate/);
    assert.equal(s.read('scripts/cloud/quota.mjs'), fs.readFileSync(path.join(ROOT, 'templates/scripts/cloud/quota.mjs'), 'utf8'));
    assert.ok(!s.calls.some((c) => /commit|push|add /.test(c)));
    // A second run finds nothing to do.
    const lines = [];
    assert.equal(main(['--repo', s.dir], { run: s.run, out: (l) => lines.push(l) }), 0);
    assert.match(lines.join('\n'), /nothing to change/);
  });

  it('refuses to write over uncommitted workflow changes, unless forced', () => {
    const s = scratch({ dirty: ' M .github/workflows/march.yml\n' });
    assert.equal(main(['--repo', s.dir, '--write'], { run: s.run, out: s.out }), 1);
    assert.match(s.lines.join('\n'), /uncommitted changes in \.github\/workflows\/march\.yml/);
    assert.equal(s.read('.github/workflows/march.yml'), MARCH_V1);
    assert.equal(main(['--repo', s.dir, '--write', '--force'], { run: s.run, out: s.out }), 0);
    assert.match(s.read('.github/workflows/march.yml'), /Quota gate/);
  });

  it('refuses a folder that is not a git working tree, and a missing march.yml', () => {
    const s = scratch({ git: false });
    assert.equal(main(['--repo', s.dir], { run: s.run, out: s.out }), 1);
    assert.match(s.lines.join('\n'), /not a git working tree/);
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-v1-'));
    assert.equal(main(['--repo', empty], { run: s.run, out: s.out }), 1);
  });

  it('usage errors', () => {
    const lines = [];
    const out = (l) => lines.push(l);
    assert.equal(main([], { out }), 2);
    assert.equal(main(['--repo', '.', '--minute', '0'], { out }), 2);
    assert.equal(main(['--repo', '.', '--bogus'], { out }), 2);
  });
});
