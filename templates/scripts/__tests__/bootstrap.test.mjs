// bootstrap.mjs's cloud-loop slice: the manifest's cloud_loop.mode, the actions it plans from what the repo has, and
// the placeholders the copy fills. node:test, no gh, no network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { LOOP_FILES, PR_MODE_FILES, cloudLoopActions, fillPlaceholders, loopMode } from '../bootstrap.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const manifest = (cloud = {}, project = {}) => ({
  project: { name: 'acme', github_owner: 'o', github_repo: 'acme', default_branch: 'main', ...project },
  cloud_loop: { enabled: true, identity: 'bot', ...cloud },
});
const state = (o = {}) => ({ workflowPresent: true, claudeOauthSet: true, actionsPatSet: true, loopMode: '', prFilesMissing: [], ...o });
const verbs = (actions) => actions.map((a) => a.verb);

describe('bootstrap: cloud_loop.mode', () => {
  it('reads owner or pr, and nothing when the field is absent', () => {
    assert.equal(loopMode(manifest({ mode: 'owner' })), 'owner');
    assert.equal(loopMode(manifest({ mode: 'pr' })), 'pr');
    assert.equal(loopMode(manifest()), null);
    assert.equal(loopMode({}), null);
  });

  it('refuses any other value, naming the field', () => {
    assert.throws(() => loopMode(manifest({ mode: 'push' })), /cloud_loop\.mode/);
  });

  it('sets NEXUS_LOOP_MODE when the repo holds another value', () => {
    const owner = cloudLoopActions(state(), manifest({ mode: 'owner' }));
    assert.deepEqual(owner.filter((a) => a.verb === 'set-loop-mode').map((a) => a.mode), ['owner']);
    const pr = cloudLoopActions(state({ loopMode: 'owner' }), manifest({ mode: 'pr' }));
    assert.deepEqual(pr.filter((a) => a.verb === 'set-loop-mode').map((a) => a.mode), ['pr']);
  });

  it('plans nothing for the mode once the repo matches, or with no field', () => {
    assert.deepEqual(verbs(cloudLoopActions(state({ loopMode: 'owner' }), manifest({ mode: 'owner' }))), []);
    assert.deepEqual(verbs(cloudLoopActions(state({ loopMode: 'pr' }), manifest({ mode: 'pr' }))), []);
    assert.deepEqual(verbs(cloudLoopActions(state({ prFilesMissing: PR_MODE_FILES }), manifest())), []);
  });

  it('installs the pull-request files in pr mode only, when any is missing', () => {
    const missing = state({ loopMode: 'pr', prFilesMissing: ['.github/workflows/pr-resolve.yml'] });
    assert.deepEqual(verbs(cloudLoopActions(missing, manifest({ mode: 'pr' }))), ['install-pr-workflows']);
    assert.deepEqual(verbs(cloudLoopActions({ ...missing, loopMode: 'owner' }, manifest({ mode: 'owner' }))), []);
  });

  it('keeps the existing actions: the workflow, the OAuth token, the PAT for identity user', () => {
    const bare = state({ workflowPresent: false, claudeOauthSet: false, actionsPatSet: false });
    assert.deepEqual(verbs(cloudLoopActions(bare, manifest({ identity: 'user' }))), ['install-workflow', 'set-claude-oauth', 'set-actions-pat']);
    assert.deepEqual(verbs(cloudLoopActions(bare, manifest({ enabled: false }))), []);
  });

  it('lists the pull-request workflows and their scripts', () => {
    for (const f of ['.github/workflows/pr-flow.yml', '.github/workflows/pr-resolve.yml', 'scripts/cloud/tick.mjs', 'scripts/pr/resolve.mjs']) {
      assert.ok(PR_MODE_FILES.includes(f), f);
    }
  });

  it('installs every script the workflows it writes run (the quota governor)', () => {
    const templates = path.resolve(HERE, '..', '..');
    assert.ok(LOOP_FILES.includes('scripts/cloud/quota.mjs'));
    for (const wf of ['march.yml', 'night.yml']) {
      const yml = fs.readFileSync(path.join(templates, '.github', 'workflows', wf), 'utf8');
      for (const m of yml.matchAll(/node (scripts\/cloud\/[\w-]+\.mjs)/g)) {
        assert.ok(LOOP_FILES.includes(m[1]) || PR_MODE_FILES.includes(m[1]), `${wf} runs ${m[1]}, which bootstrap never installs`);
      }
    }
    for (const f of LOOP_FILES) assert.ok(fs.existsSync(path.join(templates, f)), f);
  });
});

describe('bootstrap: placeholders', () => {
  it('fills the default branch from the manifest, main when unset', () => {
    assert.equal(fillPlaceholders('on <DEFAULT_BRANCH>', manifest({}, { default_branch: 'trunk' })), 'on trunk');
    assert.equal(fillPlaceholders('on <DEFAULT_BRANCH>', manifest({}, { default_branch: undefined })), 'on main');
    assert.equal(fillPlaceholders('<PROJECT> <PROJECT_PKG_PREFIX>', manifest()), 'acme @acme');
  });

  it('fills the package manager from the manifest, pnpm when unset', () => {
    assert.equal(fillPlaceholders('<PACKAGE_MANAGER> install', manifest({}, { package_manager: 'npm' })), 'npm install');
    assert.equal(fillPlaceholders('<PACKAGE_MANAGER> install', manifest()), 'pnpm install');
  });

  it("fills pr-resolve.yml's push branch, so it follows a non-main default", () => {
    const yml = fs.readFileSync(path.join(HERE, '..', '..', '.github', 'workflows', 'pr-resolve.yml'), 'utf-8');
    assert.match(yml, /branches: \[<DEFAULT_BRANCH>\]/);
    const filled = fillPlaceholders(yml, manifest({}, { default_branch: 'trunk' }));
    assert.match(filled, /branches: \[trunk\]/);
    assert.doesNotMatch(filled, /<[A-Z_]+>/);
  });
});
