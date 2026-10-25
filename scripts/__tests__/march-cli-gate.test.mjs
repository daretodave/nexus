// nexus's march.yml (spec 56.4): the tick installs and builds packages/cli on Node 24 without lifecycle scripts, the
// switch is NEXUS_CLI_GATE, the walk leaves as a run artifact, prompt rule 10 gates a packages/cli diff with the CLI's
// own tests and never tags a release, and no comment calls nexus a docs-only kit. Text checks only: nothing runs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { lintWorkflow } from '../../templates/scripts/workflow-lint.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MARCH = fs.readFileSync(path.join(ROOT, '.github/workflows/march.yml'), 'utf8').replace(/\r\n/g, '\n');

/** One step's block: from its `- name:` line to the next step. */
function step(name) {
  const at = MARCH.indexOf(`- name: ${name}`);
  assert.ok(at >= 0, `march.yml: no step named ${name}`);
  const rest = MARCH.slice(at + 1);
  const next = rest.search(/\n {6}- name: /);
  return next < 0 ? rest : rest.slice(0, next);
}

const order = (...names) => names.map((n) => MARCH.indexOf(`- name: ${n}`));

describe('march.yml builds the CLI', () => {
  it('runs on Node 24', () => {
    assert.match(step('Set up Node 24'), /node-version: 24\b/);
    assert.doesNotMatch(MARCH, /node-version: 20\b/);
  });

  it('installs with --ignore-scripts and builds in packages/cli, behind NEXUS_CLI_GATE', () => {
    const s = step('Install and build the CLI');
    assert.match(s, /working-directory: packages\/cli/);
    assert.match(s, /npm ci --ignore-scripts\n/);
    assert.match(s, /npm run build/);
    assert.doesNotMatch(s, /npm (ci|install)(?! --ignore-scripts)/);
    assert.match(s, /\(vars\.NEXUS_CLI_GATE \|\| '1'\) == '1'/);
    assert.match(s, /continue-on-error: true/);
  });

  it('caches npm on the CLI lockfile, only when it installs', () => {
    const s = step('CLI npm cache');
    assert.match(s, /hashFiles\('packages\/cli\/package-lock\.json'\)/);
    assert.match(s, /vars\.NEXUS_CLI_GATE/);
  });

  it('builds after owner mode and before the model, and uploads after it', () => {
    const [owner, cache, build, model, upload] = order('Owner mode for this checkout', 'CLI npm cache', 'Install and build the CLI', 'Run /march (cloud mode)', 'Upload the walk');
    assert.ok(owner < cache && cache < build && build < model && model < upload, 'step order');
  });

  it('uploads the walk as walk-<run id> for 14 days, always', () => {
    const s = step('Upload the walk');
    assert.match(s, /if: always\(\)/);
    assert.match(s, /uses: actions\/upload-artifact@v4/);
    assert.match(s, /name: walk-\$\{\{ github\.run_id \}\}/);
    assert.match(s, /path: \.scratch\/walk\/\*\*/);
    assert.match(s, /retention-days: 14/);
  });
});

describe('march.yml gates a packages/cli diff', () => {
  const model = step('Run /march (cloud mode)');

  it('hands the model the gate switch from the build outcome', () => {
    assert.match(model, /NEXUS_CLI_GATE: \$\{\{ steps\.cli_build\.outcome == 'success' && '1' \|\| '0' \}\}/);
  });

  it('prompt rule 10: verify AND the CLI tests, foreground; never a version bump or a cli-v tag', () => {
    const rule = /\n {12}10\. ([\s\S]*?)\n\n/.exec(model);
    assert.ok(rule, 'no prompt rule 10');
    const text = rule[1].replace(/\s+/g, ' ');
    assert.match(text, /node scripts\/verify\.mjs AND npm --prefix packages\/cli test/);
    assert.match(text, /npm --prefix packages\/cli run build when packages\/cli\/src changed/);
    assert.match(text, /FOREGROUND/);
    assert.match(text, /never bump the CLI's version and never tag cli-v\*/);
    assert.match(text, /never commit a screenshot/);
  });

  it('never tags or publishes the CLI itself', () => {
    assert.doesNotMatch(MARCH, /git tag|npm publish|npm version/);
  });
});

describe('heartbeat.yml watches cli-ci', () => {
  // The red-gate step's shell runs in templates/scripts/__tests__/heartbeat-red.test.mjs (the scripts-git leg).
  const beat = fs.readFileSync(path.join(ROOT, '.github/workflows/heartbeat.yml'), 'utf8');
  const defaults = [...beat.matchAll(/NEXUS_HEARTBEAT_WATCH \|\| '([^']*)'/g)].map((m) => m[1]);

  it('every watch-list default is march night cli-ci, and the red-gate step reads one', () => {
    assert.ok(defaults.length >= 2, 'the wedged and red-gate steps both read the watch list');
    for (const d of defaults) assert.equal(d, 'march night cli-ci');
    assert.match(beat, /- name: Alarm if a watched gate is red on the default branch/);
  });
});

describe('march.yml wording', () => {
  it('no longer calls nexus a docs-only kit', () => {
    for (const stale of [/docs kit/i, /Docs ticks/, /No install step/, /zero-dependency by design/]) assert.doesNotMatch(MARCH, stale);
  });

  it('keeps the cloud-loop workflow rules', () => {
    assert.deepEqual(lintWorkflow('march.yml', MARCH), []);
  });
});
