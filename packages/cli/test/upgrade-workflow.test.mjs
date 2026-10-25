// The workflow merge (spec 58, A5): a v1 march.yml merged into the kit's v2 owner-job shape keeps the v1 cron,
// ceiling, model pin, extra env and concurrency group; its toolchain steps become .github/actions/setup; the result
// passes workflow-lint; and the report prints the NEXUS_LOOP_MODE owner line when the v1 loop pushed the default
// branch. The fixture is the v1.0.0 template as a live editorial loop wears it (hourly cron, ceiling 60, a model pin, a
// deploy token, its own concurrency group, a custom step, a custom prompt line). Offline: real git over a local bare
// remote in the temp folder; the kit is the nexus repo's templates/ and its kit-text snapshot.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARCH_YML, SETUP_ACTION, mergeWorkflow, readV1, packageManager, keptLine } from '../server/workflow-merge.mjs';
import { fromJson, mergeText, textOfPrompt, toJson } from '../server/kit-text.mjs';
import { kitSource, render, runUpgrade, upgrade, workflowMerge } from '../server/upgrade.mjs';
import { lintAction, lintWorkflow } from '../../../templates/scripts/workflow-lint.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEXUS = path.resolve(HERE, '..', '..', '..');
const lf = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const V1 = lf(path.join(HERE, 'fixtures', 'upgrade', 'march.v1.yml'));
const TEMPLATE = lf(path.join(NEXUS, 'templates', '.github', 'workflows', 'march.yml'));
const ACTION = lf(path.join(NEXUS, 'templates', '.github', 'actions', 'setup', 'action.yml'));
const SNAP = JSON.parse(fs.readFileSync(path.join(NEXUS, 'scripts', 'upgrade-kit-text.json'), 'utf8'));
const KIT_PROMPT = fromJson(toJson(mergeText(SNAP['march.yml'], textOfPrompt(TEMPLATE))));
const FILLS = { project: 'field-notes', pm: 'pnpm', branch: 'main' };

const scratch = [];
after(() => { for (const d of scratch) fs.rmSync(d, { recursive: true, force: true }); });
const tmp = (p) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); scratch.push(d); return d; };
const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' };
const git = (cwd, ...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd, env, encoding: 'utf8', stdio: 'pipe' }).trim();
const put = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const commit = (dir, msg) => { git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', msg); return git(dir, 'rev-parse', '--short', 'HEAD'); };

/** The lines of one job's block in a workflow. */
function job(text, id) {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l === `  ${id}:`);
  const end = lines.findIndex((l, i) => i > at && /^  [\w-]+:\s*$/.test(l));
  return lines.slice(at, end < 0 ? lines.length : end).join('\n');
}

test('readV1 finds the cron, ceiling, model pin, env, concurrency group, toolchain and custom steps', () => {
  const v1 = readV1(V1);
  assert.deepEqual(v1.crons, ['0 * * * *']);
  assert.equal(v1.ceiling, 60);
  assert.equal(v1.model, 'claude-opus-5-5');
  assert.deepEqual(v1.claudeEnv.map((e) => e.key), ['GH_TOKEN', 'VERCEL_TOKEN', 'GIT_AUTHOR_NAME']);
  assert.equal(v1.group, 'march-editorial');
  assert.deepEqual(v1.toolchain.map((s) => s.name), ['Set up pnpm', 'Set up Node 22', 'Install dependencies', 'Cache Playwright browsers', 'Install Playwright browsers (chromium only)']);
  assert.deepEqual(v1.custom.map((s) => s.name), ['Weekly trend snapshot']);
  assert.equal(readV1('name: x\non: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n'), null, 'no model step: not a march workflow');
});

test('the merge keeps cron, ceiling, model, env and concurrency in the v2 owner job, and passes workflow-lint', () => {
  const r = mergeWorkflow({ v1Text: V1, template: TEMPLATE, actionTemplate: ACTION, fills: FILLS, kitPrompt: KIT_PROMPT });
  const m = r.march;
  // The v2 shape: the owner job and the pull-request jobs.
  for (const id of ['owner', 'pick', 'build', 'land', 'release', 'quota']) assert.match(m, new RegExp(`^  ${id}:$`, 'm'), id);
  // The cron, with its comment; the kit's example is gone.
  assert.match(m, /^ {4}# Hourly: the editorial queue drains one item a tick\.\n {4}- cron: '0 \* \* \* \*'$/m);
  assert.equal([...m.matchAll(/- cron:/g)].length, 1);
  // The ceiling, the concurrency group.
  assert.match(job(m, 'owner'), /^ {10}ceiling=60$/m);
  assert.match(m, /^concurrency:\n(?:.*\n)*? {2}group: march-editorial$/m);
  assert.doesNotMatch(m, /^ {2}group: march$/m);
  // The model pin on the owner job's model step only; the build job and the no-op line keep theirs.
  const owner = job(m, 'owner');
  assert.match(owner, /--model claude-opus-5-5\n {12}--permission-mode bypassPermissions\n {12}--max-turns 80/);
  assert.match(owner, /--model "\$MODEL"/);
  assert.match(job(m, 'build'), /--model claude-sonnet-5/);
  // Every extra env entry, by name, on the owner job's model step; the kit's GH_TOKEN takes the v1 value.
  const step = owner.slice(owner.indexOf('- name: Run /march (cloud mode)'), owner.indexOf('- name: Quota read'));
  assert.match(step, /^ {10}GH_TOKEN: \$\{\{ secrets\.ACTIONS_PAT \}\}$/m);
  assert.match(step, /^ {10}VERCEL_TOKEN: \$\{\{ secrets\.VERCEL_TOKEN \}\}$/m);
  assert.match(step, /^ {10}GIT_AUTHOR_NAME: field-notes-bot$/m);
  assert.match(step, /^ {10}NEXUS_SESSION: cloud-/m, 'the kit\'s own entries stay');
  assert.doesNotMatch(job(m, 'build'), /VERCEL_TOKEN/, 'the pull-request build job holds no token');
  // The job's own env, extra permissions, the checkout token, the custom step ahead of the model.
  assert.match(owner, /^ {4}env:\n {6}TZ: America\/New_York\n {4}permissions:/m);
  assert.match(owner, /^ {6}actions: read/m);
  assert.match(owner, /^ {10}token: \$\{\{ secrets\.ACTIONS_PAT \}\}$/m);
  assert.ok(owner.indexOf('- name: Weekly trend snapshot') > owner.indexOf('- name: Idle probe'));
  assert.ok(owner.indexOf('- name: Weekly trend snapshot') < owner.indexOf('- name: Owner mode for this checkout'));
  assert.match(owner, / {6}- name: Project toolchain\n {8}uses: \.\/\.github\/actions\/setup/);
  // The prompt: the adopter's line carried; kit lines from any version (v1.0.0's included) and the filled <PROJECT> not.
  assert.match(owner, /Carried from the v1 march\.yml prompt by nexus upgrade[^\n]*\n\n {12}Editorial voice: plain, second person, no exclamation marks\.\n\n {12}Begin\. One tick\./);
  assert.equal(r.kept.prompt, 1);
  // Filled placeholders (the comment's <ISO> is prose); nothing for the linter.
  assert.doesNotMatch(m, /<PROJECT>|<PACKAGE_MANAGER>|<DEFAULT_BRANCH>/);
  assert.match(m, /`pnpm verify`/);
  assert.deepEqual(lintWorkflow(MARCH_YML, m), []);
  assert.deepEqual(r.kept.cron, ['0 * * * *']);
  assert.equal(keptLine(r.kept), "cron 0 * * * *; ceiling 60; model claude-opus-5-5; env GH_TOKEN, VERCEL_TOKEN, GIT_AUTHOR_NAME; concurrency march-editorial; 5 toolchain steps -> .github/actions/setup/action.yml; 1 custom step; 1 prompt line");
});

test('the v1 toolchain steps become the composite setup action, each run step given a shell', () => {
  const { action, kept, march } = mergeWorkflow({ v1Text: V1, template: TEMPLATE, actionTemplate: ACTION, fills: FILLS, kitPrompt: KIT_PROMPT });
  assert.equal(kept.toolchain, 5);
  assert.match(action, /^runs:\n {2}using: composite\n {2}steps:\n/m);
  const names = [...action.matchAll(/^ {4}- name: (.+)$/gm)].map((x) => x[1]);
  assert.deepEqual(names, ['Set up pnpm', 'Set up Node 22', 'Install dependencies', 'Cache Playwright browsers', 'Install Playwright browsers (chromium only)']);
  assert.match(action, /- name: Install dependencies\n {6}shell: bash\n {6}run: pnpm install --frozen-lockfile/);
  assert.match(action, /run: pnpm --filter "@acme\/e2e" e2e:install/);
  assert.doesNotMatch(action, /Detect lockfile|<PACKAGE_MANAGER>/);
  assert.deepEqual(lintAction(SETUP_ACTION, action), []);
  // The v1 job's own install steps are gone from the workflow: they run through the action.
  assert.doesNotMatch(job(march, 'owner'), /pnpm install --frozen-lockfile/);
});

// A smaller v1, customised the other ways: dispatch only, a workflow env with a secret, a toolchain step that reads a
// secret, the `-ge N` ceiling form, the model as an action input, an API key instead of the OAuth token.
const ODD = `name: march

on:
  workflow_dispatch:

env:
  NODE_OPTIONS: --max-old-space-size=4096
  SENTRY_TOKEN: \${{ secrets.SENTRY_TOKEN }}

jobs:
  tick:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Private registry
        run: echo "//npm.example/:_authToken=\${{ secrets.NPM_TOKEN }}" > ~/.npmrc
      - name: Install
        run: npm ci
      - name: Ceiling
        id: ceiling
        run: |
          count=$(git log --since="24 hours ago" --grep='Cloud-Run:' --oneline | wc -l)
          if [ "$count" -ge 40 ]; then echo "skip=true" >> "$GITHUB_OUTPUT"; fi
      - name: Run
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
          model: claude-haiku-5
          prompt: |
            Run one tick.
`;

test('the other shapes: no schedule, workflow-env secrets, a secret toolchain step, -ge ceilings, a model input', () => {
  const r = mergeWorkflow({ v1Text: ODD, template: TEMPLATE, actionTemplate: ACTION, fills: FILLS, kitPrompt: KIT_PROMPT });
  const m = r.march;
  assert.doesNotMatch(m, /schedule:|- cron:/, 'no v1 schedule: dispatch only');
  assert.ok(r.warnings.some((w) => /no schedule/.test(w)));
  assert.match(m, /^env:\n {2}NODE_OPTIONS: --max-old-space-size=4096\n\njobs:/m, 'a plain workflow env stays at the top');
  const owner = job(m, 'owner');
  assert.match(owner, /^ {10}SENTRY_TOKEN: \$\{\{ secrets\.SENTRY_TOKEN \}\}$/m, 'a secret moves to the model step');
  assert.ok(r.warnings.some((w) => /SENTRY_TOKEN moved/.test(w)));
  assert.match(owner, /^ {10}ceiling=40$/m);
  assert.match(owner, /--model claude-haiku-5/);
  assert.match(owner, /^ {10}anthropic_api_key: \$\{\{ secrets\.ANTHROPIC_API_KEY \}\}$/m);
  assert.doesNotMatch(owner, /claude_code_oauth_token/, 'the API key replaces the OAuth input');
  assert.match(owner, /- name: Private registry/, 'a toolchain step that reads a secret stays in the job');
  assert.ok(owner.indexOf('- name: Private registry') < owner.indexOf('- name: Project toolchain'), 'a stayed toolchain step runs before the setup action, as in v1');
  assert.deepEqual(r.kept.prompt, 1, '"Run one tick." is the adopter\'s');
  assert.match(r.action, /- name: Install\n {6}shell: bash\n {6}run: npm ci/);
  assert.doesNotMatch(r.action, /Private registry/);
  assert.ok(r.warnings.some((w) => /Private registry read a secret/.test(w)));
  assert.deepEqual(lintWorkflow(MARCH_YML, m), []);
  assert.deepEqual(lintAction(SETUP_ACTION, r.action), []);
});

test('the v1.0.0 template as it shipped carries no prompt line: every line is in the kit-text history', () => {
  const shipped = V1.replace(/\n {12}Editorial voice:[^\n]*\n/, '\n');
  const r = mergeWorkflow({ v1Text: shipped, template: TEMPLATE, actionTemplate: ACTION, fills: FILLS, kitPrompt: KIT_PROMPT });
  assert.equal(r.kept.prompt, 0, r.march.slice(r.march.indexOf('Carried from'), r.march.indexOf('Carried from') + 400));
  assert.ok(SNAP['march.yml'].paras.length > 20, 'the snapshot holds every prompt line the kit march.yml ever had');
});

test('nothing to merge: no march.yml, no model step, or already the v2 shape; the repo\'s own setup action is kept', () => {
  assert.match(mergeWorkflow({ v1Text: null, template: TEMPLATE, actionTemplate: ACTION, fills: FILLS }).skip, /no \.github\/workflows\/march\.yml/);
  assert.match(mergeWorkflow({ v1Text: TEMPLATE, template: TEMPLATE, actionTemplate: ACTION, fills: FILLS }).skip, /already the v2 shape/);
  const own = 'name: setup\nruns:\n  using: composite\n  steps:\n    - run: make deps\n      shell: bash\n';
  const r = mergeWorkflow({ v1Text: V1, template: TEMPLATE, actionTemplate: ACTION, repoAction: own, fills: FILLS, kitPrompt: KIT_PROMPT });
  assert.equal(r.action, null, 'the repo\'s action is never replaced');
  const ownerJob = job(r.march, 'owner');
  assert.match(ownerJob, /- name: Install dependencies/, 'the v1 toolchain stays in the job instead');
  assert.ok(ownerJob.indexOf('- name: Install dependencies') < ownerJob.indexOf('- name: Project toolchain'), 'the stayed toolchain runs before the setup action, as in v1');
  assert.ok(!r.kept.steps.includes('Install dependencies'), 'stayed toolchain steps are not counted as custom steps');
  // Older kit march.yml versions shipped this step after the ceiling check, ahead of the model step.
  const author = V1.replace(/\n( +)- name: Run \/march \(cloud mode\)\n/, '\n$1- name: Configure git author for cloud commits\n$1  run: git config user.name nexus\n\n$1- name: Run /march (cloud mode)\n');
  assert.notEqual(author, V1, 'the fixture has a model step to put the old kit step ahead of');
  const ra = mergeWorkflow({ v1Text: author, template: TEMPLATE, actionTemplate: ACTION, fills: FILLS, kitPrompt: KIT_PROMPT });
  assert.ok(!ra.kept.steps.includes('Configure git author for cloud commits'), 'a step an older kit march.yml shipped is not custom');
  assert.ok(r.warnings.some((w) => /has its own, kept/.test(w)));
  assert.equal(packageManager((f) => f === 'yarn.lock'), 'yarn');
  assert.equal(packageManager(() => false, 'The verify gate (`pnpm verify`)'), 'pnpm');
  assert.equal(packageManager(() => false), 'npm');
});

/** A live editorial v1 repo on a bare origin: the fixture march.yml, Cloud-Run commits, a pnpm lockfile. */
function repo() {
  const bare = tmp('nexus-wf-origin-');
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  const seed = tmp('nexus-wf-seed-');
  git(seed, 'init', '-q', '-b', 'main');
  git(seed, 'remote', 'add', 'origin', bare);
  put(seed, 'package.json', '{ "name": "@acme/field-notes" }\n');
  put(seed, 'pnpm-lock.yaml', "lockfileVersion: '9.0'\n");
  const one = commit(seed, 'feat: bootstrap\n\nCloud-Run: https://example.invalid/runs/1');
  put(seed, 'agents.md', '# Field notes — agents.md\n');
  put(seed, 'plan/README.md', '# Field notes plan\n');
  put(seed, 'plan/steps/01_build_plan.md', `# 01 — Build plan\n\n## Status (at-a-glance)\n\n- [x] Phase 1 — Bootstrap (commit ${one})\n- [ ] Phase 2 — Search\n\n## Phase log (commit hashes)\n\n`);
  put(seed, '.github/workflows/march.yml', V1);
  put(seed, '.github/workflows/night.yml', 'name: night\non:\n  workflow_dispatch:\njobs:\n  digest:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo plan/steps/01_build_plan.md\n');
  commit(seed, 'plan: the v1 plan\n\nCloud-Run: https://example.invalid/runs/2');
  git(seed, 'push', '-q', 'origin', 'main');
  const local = tmp('nexus-wf-local-');
  git(local, 'clone', '-q', bare, '.');
  return local;
}

test('the dry run merges march.yml in its worktree, gates it with workflow-lint, and reports what it kept', async () => {
  const local = repo();
  const { code, report } = await upgrade({ repo: local, today: '2026-10-25', keep: true });
  try {
    assert.equal(code, 0, JSON.stringify(report.gate, null, 2));
    const status = Object.fromEntries(report.files.map((f) => [f.path, f.status]));
    assert.equal(status[MARCH_YML], 'merged');
    assert.equal(status[SETUP_ACTION], 'merged');
    assert.equal(status['.github/workflows/night.yml'], 'rewritten (1 ref)', 'another workflow changes only by reference rewrites');
    assert.deepEqual(report.gate.map((g) => [g.name, g.ok]), [['plan-check', true], ['plan-check test', true], ['workflow-lint', true]]);
    const merged = fs.readFileSync(path.join(report.worktree, ...MARCH_YML.split('/')), 'utf8');
    assert.match(merged, /- cron: '0 \* \* \* \*'/);
    assert.match(merged, /^ {10}ceiling=60$/m);
    assert.match(merged, /group: march-editorial/);
    assert.match(merged, /`pnpm verify`/, 'the package manager from the lockfile');
    assert.match(fs.readFileSync(path.join(report.worktree, ...SETUP_ACTION.split('/')), 'utf8'), /pnpm install --frozen-lockfile/);
    assert.equal(report.workflow.kept.ceiling, 60);
    const text = render(report);
    for (const want of ['workflow (.github/workflows/march.yml merged into the v2 owner job, keeping', 'cron         0 * * * *', 'ceiling      60', 'model        claude-opus-5-5', 'env          GH_TOKEN, VERCEL_TOKEN, GIT_AUTHOR_NAME', 'concurrency  march-editorial', 'toolchain    5 steps -> .github/actions/setup/action.yml', 'custom steps Weekly trend snapshot', 'gh variable set NEXUS_LOOP_MODE --body owner']) {
      assert.ok(text.includes(want), `${want}\n---\n${text}`);
    }
  } finally {
    git(local, 'worktree', 'remove', '--force', report.worktree);
  }
});

test('--keep-workflow leaves march.yml as it is and reports what the merge would keep', async () => {
  const local = repo();
  const lines = [];
  const code = await runUpgrade(['--repo', local, '--keep-workflow', '--json'], { out: (s) => lines.push(s), err: (s) => lines.push(s) });
  assert.equal(code, 0, lines.join('\n'));
  const report = JSON.parse(lines.join('\n'));
  const row = report.files.find((f) => f.path === MARCH_YML);
  assert.equal(row.status, 'kept (--keep-workflow), rewritten (8 refs)', 'not merged; its v1 references are still rewritten');
  assert.match(row.note, /ceiling 60/);
  assert.equal(report.workflow.keep, true);
  assert.match(render(report), /march\.yml kept as it is \(--keep-workflow\); the merge would keep/);
});

test('the bundled kit carries the march.yml the merge reads, and the scripts it calls', async () => {
  const kit = await kitSource();
  assert.ok(fs.existsSync(path.join(kit.root, '.github', 'workflows', 'march.yml')));
  const listed = new Set(kit.files.map((f) => f.repo));
  for (const s of new Set([...TEMPLATE.matchAll(/(?<![\w./-])scripts\/([\w./-]+?\.mjs)/g)].map((x) => `scripts/${x[1]}`))) {
    assert.ok(listed.has(s), `${s}: the merged march.yml calls it, so the upgrade ships it`);
  }
  const d = tmp('nexus-wf-none-');
  const r = workflowMerge(d, kit, { branch: 'main' });
  assert.deepEqual(r.rows.map((x) => [x.path, x.status]), [[SETUP_ACTION, 'added']]);
  const action = fs.readFileSync(path.join(d, ...SETUP_ACTION.split('/')), 'utf8');
  assert.doesNotMatch(action, /<PACKAGE_MANAGER>|<PROJECT_PKG_PREFIX>|Playwright/, 'no v1 workflow: the kit\'s action, filled, no browser steps');
  assert.deepEqual(lintAction(SETUP_ACTION, action), []);
});
