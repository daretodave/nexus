// workflow-lint.mjs: a secret runs on hosted runners only; run-name and env blocks read only the contexts that exist
// there, and never a secret or a token; a run script never interpolates outsider text. node:test, no deps, no git.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RUNNER_VAR, contextsIn, lintWorkflow, placesIn, runScripts } from '../workflow-lint.mjs';

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
