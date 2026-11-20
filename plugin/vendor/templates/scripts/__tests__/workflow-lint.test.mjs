// workflow-lint.mjs: a secret runs on hosted runners only; run-name and env blocks read only the contexts that exist
// there, and never a secret or a token; a run script (a workflow's or a composite action's) never interpolates outsider
// text, nor does an agent's prompt input (with: prompt, direct_prompt, claude_args). node:test, no deps, no git (one temp
// dir for the directory walk).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RUNNER_VAR, contextsIn, lintAction, lintDirs, lintWorkflow, placesIn, promptInputs, runScripts } from '../workflow-lint.mjs';

const job = (runsOn, extra = '') => `jobs:\n  a:\n    runs-on: ${runsOn}\n    steps:\n      - run: echo hi${extra}\n`;

describe('runners', () => {
  it('passes hosted labels, with or without secrets', () => {
    assert.deepEqual(lintWorkflow('a.yml', job('ubuntu-latest', ' ${{ secrets.X }}')), []);
    assert.deepEqual(lintWorkflow('a.yml', job('macos-15')), []);
    assert.deepEqual(lintWorkflow('a.yml', job('windows-2025')), []);
  });

  it('allows the runner variable only for a secret-free workflow', () => {
    assert.deepEqual(lintWorkflow('a.yml', job(RUNNER_VAR)), []);
    assert.match(lintWorkflow('a.yml', job(RUNNER_VAR, ' ${{ secrets.X }}'))[0], /reads secrets\.\* but may run on NEXUS_RUNNER/);
  });

  it('counts the workflow token and an inherited secret set as secrets', () => {
    assert.equal(lintWorkflow('a.yml', job(RUNNER_VAR, ' ${{ github.token }}')).length, 1);
    assert.equal(lintWorkflow('a.yml', `${job(RUNNER_VAR)}  b:\n    uses: ./.github/workflows/x.yml\n    secrets: inherit\n`).length, 1);
  });

  it('refuses a self-hosted label, a list and an empty value', () => {
    assert.match(lintWorkflow('a.yml', job('self-hosted'))[0], /runs-on self-hosted is neither/);
    assert.match(lintWorkflow('a.yml', job('[self-hosted, linux]'))[0], /is neither/);
    assert.match(lintWorkflow('a.yml', job(''))[0], /runs-on \(a list\)/);
  });

  it('allows a matrix axis whose every value is hosted, and only that', () => {
    const m = (values) => `jobs:\n  a:\n    strategy:\n      matrix:\n        os: [${values}]\n    runs-on: \${{ matrix.os }}\n    steps: []\n`;
    assert.deepEqual(lintWorkflow('a.yml', m('ubuntu-latest, windows-latest')), []);
    assert.equal(lintWorkflow('a.yml', m('ubuntu-latest, self-hosted')).length, 1);
  });
});

describe('contexts', () => {
  it('reads context names, skipping strings, functions and properties', () => {
    assert.deepEqual(contextsIn(" inputs.request_id || 'runner.x' "), ['inputs']);
    assert.deepEqual(contextsIn(' format(\'{0}\', github.run_id) '), ['github']);
  });

  it('finds run-name, the workflow env and each job env', () => {
    const yml = 'run-name: x ${{ inputs.a }}\nenv:\n  A: ${{ vars.A }}\njobs:\n  j:\n    env:\n      B: ${{ needs.p.outputs.id }}\n    steps: []\n';
    assert.deepEqual(placesIn(yml).map((p) => p.where), ['run-name', 'env', 'jobs.<id>.env']);
  });

  it('flags a secret, a token and a missing context in a job env (the control)', () => {
    const yml = 'jobs:\n  j:\n    runs-on: ubuntu-latest\n    env:\n      T: ${{ secrets.T }}\n      G: ${{ github.token }}\n      OUT: ${{ runner.temp }}/x\n    steps: []\n';
    const p = lintWorkflow('w.yml', yml);
    assert.equal(p.length, 3);
    assert.match(p.join('\n'), /reads secrets/);
    assert.match(p.join('\n'), /reads github\.token/);
    assert.match(p.join('\n'), /reads runner/);
  });

  it('flags a secret in the workflow env and a step context in run-name', () => {
    assert.equal(lintWorkflow('w.yml', 'env:\n  T: ${{ secrets.T }}\njobs: {}\n').length, 1);
    assert.equal(lintWorkflow('w.yml', 'run-name: ${{ steps.a.outputs.b }}\njobs: {}\n').length, 1);
  });

  it('leaves a step env alone: that is where a secret belongs', () => {
    const yml = 'jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo\n        env:\n          T: ${{ secrets.T }}\n';
    assert.deepEqual(lintWorkflow('w.yml', yml), []);
  });
});

describe('injection', () => {
  it('reads inline and block run scripts', () => {
    assert.deepEqual(runScripts('steps:\n  - run: echo a\n  - run: |\n      echo b\n      echo c\n  - uses: x\n'), ['echo a', '      echo b\n      echo c']);
  });

  it('flags outsider text in a run script, and leaves ids and env reads alone', () => {
    const step = (s) => `jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: |\n          ${s}\n`;
    assert.equal(lintWorkflow('w.yml', step('echo "${{ github.event.pull_request.title }}"')).length, 1);
    assert.equal(lintWorkflow('w.yml', step('git push origin ${{ github.head_ref }}')).length, 1);
    assert.equal(lintWorkflow('w.yml', step('echo ${{ github.event.head_commit.message }}')).length, 1);
    assert.deepEqual(lintWorkflow('w.yml', step('echo ${{ github.run_id }} ${{ github.event.pull_request.number }} "$TITLE"')), []);
  });
});

describe('prompt inputs', () => {
  const agent = (inputs) => `on:\n  issues:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: anthropics/claude-code-action@v1\n        with:\n          anthropic_api_key: x\n${inputs}`;

  it('reads inline and block prompt inputs under with:, and only those keys', () => {
    const yml = agent('          prompt: |\n            Fix it.\n            ${{ inputs.reason }}\n          claude_args: --max-turns 5\n          other: y\n');
    assert.deepEqual(promptInputs(yml).map((p) => p.key), ['prompt', 'claude_args']);
    assert.match(promptInputs(yml)[0].text, /Fix it\./);
  });

  it('fails an issue body interpolated into with: prompt (the A1 fixture)', () => {
    const p = lintWorkflow('w.yml', agent('          prompt: |\n            Triage this issue:\n            ${{ github.event.issue.body }}\n'));
    assert.equal(p.length, 1);
    assert.match(p[0], /w\.yml: with: prompt interpolates \$\{\{ github\.event\.issue\.body \}\}/);
  });

  it('fails outsider text in direct_prompt and claude_args too', () => {
    assert.equal(lintWorkflow('w.yml', agent('          direct_prompt: "${{ github.event.comment.body }}"\n')).length, 1);
    assert.equal(lintWorkflow('w.yml', agent('          claude_args: >-\n            --append-system-prompt "${{ github.event.issue.title }}"\n')).length, 1);
  });

  it('passes the issue number and the run id: only the number crosses', () => {
    assert.deepEqual(lintWorkflow('w.yml', agent('          prompt: |\n            Triage issue #${{ github.event.issue.number }} (run ${{ github.run_id }}).\n')), []);
  });

  it('leaves a with: key outside the prompt inputs alone, and a nested prompt key', () => {
    assert.deepEqual(lintWorkflow('w.yml', agent('          title: ${{ github.event.issue.title }}\n')), []);
    assert.deepEqual(lintWorkflow('w.yml', agent('          settings:\n            prompt: ${{ github.event.issue.body }}\n')), []);
  });

  it('holds in a composite action', () => {
    const action = 'name: x\nruns:\n  using: composite\n  steps:\n    - uses: anthropics/claude-code-action@v1\n      with:\n        prompt: ${{ github.event.issue.body }}\n';
    assert.match(lintAction('a/action.yml', action)[0], /with: prompt interpolates/);
  });
});

describe('indentation', () => {
  it('finds a job env at any indentation (4-space jobs, 8-space keys)', () => {
    const yml = 'jobs:\n    j:\n        runs-on: ubuntu-latest\n        env:\n            T: ${{ secrets.T }}\n        steps:\n            - run: echo\n              env:\n                  S: ${{ secrets.S }}\n';
    assert.deepEqual(placesIn(yml).map((p) => p.where), ['jobs.<id>.env']);
    assert.match(lintWorkflow('w.yml', yml).join('\n'), /jobs\.<id>\.env reads secrets/);
    assert.equal(lintWorkflow('w.yml', yml).length, 1);
  });

  it('finds each job env in a 4-space workflow, and only job-level ones', () => {
    const yml = 'on: push\njobs:\n\n    # a comment\n    a:\n        env:\n            A: ${{ runner.temp }}\n    b:\n        container:\n            env:\n                X: ${{ secrets.X }}\n        env:\n            B: ${{ vars.B }}\n';
    assert.deepEqual(placesIn(yml).map((p) => p.where), ['jobs.<id>.env', 'jobs.<id>.env']);
    assert.equal(lintWorkflow('w.yml', yml).length, 1);
  });
});

describe('composite actions', () => {
  const action = (s) => `name: x\nruns:\n  using: composite\n  steps:\n    - shell: bash\n      run: |\n        ${s}\n`;

  it('flags outsider text in a composite action run script', () => {
    assert.match(lintAction('a/action.yml', action('echo "${{ github.event.issue.title }}"'))[0], /a\/action\.yml: a run script interpolates/);
    assert.deepEqual(lintAction('a/action.yml', action('echo ${{ inputs.x }} ${{ runner.os }}')), []);
  });

  it('flags a secret read in a composite action (inputs carry it in)', () => {
    assert.match(lintAction('a/action.yml', action('echo ${{ secrets.T }}'))[0], /secrets/);
  });

  it('lints .github/actions/*/action.yml beside the workflows', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-'));
    try {
      fs.mkdirSync(path.join(root, 'actions', 'setup'), { recursive: true });
      fs.writeFileSync(path.join(root, 'actions', 'setup', 'action.yml'), action('git push origin ${{ github.head_ref }}'));
      const { problems, files } = lintDirs([path.join(root, 'workflows'), path.join(root, 'actions')]);
      assert.equal(files, 1);
      assert.equal(problems.length, 1);
      assert.match(problems[0], /actions\/setup\/action\.yml: a run script interpolates/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
