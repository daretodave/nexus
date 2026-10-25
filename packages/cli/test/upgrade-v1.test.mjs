// `nexus upgrade` (spec 58, A3): the dry run works from a fresh fetch of origin in a temporary worktree, writes
// nothing (the local checkout's git status and worktree list are unchanged), and prints the per-file report, the
// archive diff, the warnings, the predicted first dispatch and the loop-mode line; a half-done repo finishes Step 5
// only; a v2 repo is "already on v2". Real git over a local bare remote in the temp folder, offline; the kit comes
// from the nexus repo's templates/ (kitSource's dev path), the same files the bundled kit/upgrade/ carries.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  detect, mergeRoadmap, rewriteText, projectName, flippedLock, isHistory, kitSource, copyKit, upgrade, render, runUpgrade, redactUrl,
} from '../server/upgrade.mjs';

const scratch = [];
after(() => { for (const d of scratch) fs.rmSync(d, { recursive: true, force: true }); });
const tmp = (p) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); scratch.push(d); return d; };

const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' };
const git = (cwd, ...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd, env, encoding: 'utf8', stdio: 'pipe' }).trim();
const put = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const commit = (dir, msg) => { git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', msg); return git(dir, 'rev-parse', '--short', 'HEAD'); };
const sink = () => { const lines = []; const f = (s) => lines.push(s); f.text = () => lines.join('\n'); return f; };

/** A bare origin and the working repo that pushes to it. */
function origin() {
  const bare = tmp('nexus-up-origin-');
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  const seed = tmp('nexus-up-seed-');
  git(seed, 'init', '-q', '-b', 'main');
  git(seed, 'remote', 'add', 'origin', bare);
  return { bare, seed, push: () => git(seed, 'push', '-q', 'origin', 'main') };
}

const buildPlan = (rows) => `# 01 — Build plan

## Status (at-a-glance)

${rows}

## Carry-overs / known gaps

(None.)

## Phase log (commit hashes)

`;

/** An editorial v1 repo: two shipped phases, an open one with a brief, a live cloud loop; cloned locally. */
function v1() {
  const o = origin();
  put(o.seed, 'package.json', '{ "name": "@acme/field-notes" }\n');
  put(o.seed, 'src/a.txt', 'one\n');
  const one = commit(o.seed, 'feat: bootstrap');
  put(o.seed, 'src/b.txt', 'two\n');
  const two = commit(o.seed, 'feat: the content queue\n\nCloud-Run: https://example.invalid/runs/1');
  put(o.seed, 'agents.md', '# Field notes — agents.md\n\nShip with /ship-a-phase; what ships next is plan/steps/01_build_plan.md.\n');
  put(o.seed, 'plan/README.md', '# Field notes plan\n\n> The v1 notes.\n\n---\n\n## Editorial calendar\n\nOur own section: it stays, in place.\n');
  put(o.seed, 'plan/steps/01_build_plan.md', buildPlan(`- [x] Phase 1 — Bootstrap (commit ${one})\n- [x] Phase 2 — Content queue \`${two}\`\n- [ ] Phase 3 — Search`));
  put(o.seed, 'plan/phases/phase_3_search.md', '# Phase 3 — Search\n\n## Scope\n\nA query finds a note.\n');
  put(o.seed, 'plan/PHASE_CANDIDATES.md', '# Phase candidates\n\n(None.)\n');
  put(o.seed, 'skills/ship-a-phase.md', '# ship-a-phase\n');
  put(o.seed, '.claude/commands/ship-a-phase.md', 'Read skills/ship-a-phase.md.\n');
  put(o.seed, 'skills/survey.md', '# survey\n\nWhen the queue is empty, refill it, then /ship-a-phase.\n');
  commit(o.seed, 'plan: the v1 plan\n\nCloud-Run: https://example.invalid/runs/2');
  o.push();
  const local = tmp('nexus-up-local-');
  git(local, 'clone', '-q', o.bare, '.');
  // origin moves on after the clone: the local checkout is stale, so only a fresh fetch sees phase 2a.
  put(o.seed, 'src/c.txt', 'three\n');
  const three = commit(o.seed, 'feat: cross-links');
  put(o.seed, 'plan/steps/01_build_plan.md', buildPlan(`- [x] Phase 1 — Bootstrap (commit ${one})\n- [x] Phase 2 — Content queue \`${two}\`\n- [x] Phase 2a — Cross-links \`${three}\`\n- [ ] Phase 3 — Search`));
  commit(o.seed, 'plan: phase 2a shipped');
  o.push();
  // ...and dirty: an edit and an untracked file the upgrade must not see or touch.
  put(local, 'agents.md', '# Field notes — agents.md\n\nA local edit, never committed.\n');
  put(local, 'scratch.txt', 'untracked\n');
  return { ...o, local };
}

const state = (dir) => ({ status: git(dir, 'status', '--porcelain'), worktrees: git(dir, 'worktree', 'list', '--porcelain'), head: git(dir, 'rev-parse', 'HEAD'), agents: fs.readFileSync(path.join(dir, 'agents.md'), 'utf8') });

test('detect: v1, pinned v1, half-done, v2, none', () => {
  const d = tmp('nexus-up-detect-');
  assert.equal(detect(d).shape, 'none');
  put(d, 'plan/steps/01_build_plan.md', buildPlan(''));
  assert.equal(detect(d).shape, 'v1');
  put(d, 'plan/nexus.lock', 'kit: nexus\nversion: 1.0.0\nref: v1.0.0\nshape: phases\n');
  assert.equal(detect(d).shape, 'v1');
  put(d, 'plan/nexus.lock', 'kit: nexus\nshape: chunks # v2\n');
  assert.equal(detect(d).shape, 'half');
  fs.rmSync(path.join(d, 'plan', 'steps'), { recursive: true });
  assert.equal(detect(d).shape, 'v2');
  put(d, 'plan/PHASE_CANDIDATES.md', '# c\n');
  assert.match(detect(d).why, /PHASE_CANDIDATES/);
  assert.equal(detect(d).shape, 'half');
});

test('the roadmap merge keeps the repo\'s sections in place, adds lanes and an empty spec table, fills <PROJECT>', () => {
  const template = fs.readFileSync(new URL('../../../templates/plan/README.md', import.meta.url), 'utf8');
  const mine = '# Field notes plan\n\n> Ours.\n\n---\n\n## Editorial calendar\n\nKept.\n\n## Voice\n\nAlso kept.\n';
  const merged = mergeRoadmap(mine, template, 'field-notes');
  assert.ok(merged.startsWith('# Field notes plan\n\n> Ours.\n\n---\n\n## Lanes\n'));
  assert.ok(merged.indexOf('## Specs') < merged.indexOf('## Editorial calendar'));
  assert.ok(merged.indexOf('## Editorial calendar') < merged.indexOf('## Voice'));
  assert.match(merged, /\| # \| Initiative \| Spec \| Status \| Progress \|\n\|---\|---\|---\|---\|---\|\n\n## Editorial calendar/);
  assert.doesNotMatch(merged, /01-bootstrap\.md/);
  assert.equal(mergeRoadmap(merged, template, 'x'), merged, 'a v2 roadmap stays as it is');
  const fresh = mergeRoadmap(null, template, 'field-notes');
  assert.match(fresh, /^# field-notes roadmap/);
  assert.doesNotMatch(fresh, /<PROJECT>/);
});

test('v1 references are rewritten where the v2 spelling is sure; history files are left alone', () => {
  const { text, n } = rewriteText('Run /ship-a-phase or plan-a-phase; see plan/steps/01_build_plan.md and plan/PHASE_CANDIDATES.md.');
  assert.equal(text, 'Run /ship-a-chunk or plan-a-spec; see plan/README.md and plan/CANDIDATES.md.');
  assert.equal(n, 4);
  for (const h of ['plan/ARCHIVE.md', 'plan/DIGEST.md', 'CHANGELOG.md', 'notes/2026-10-01-log.md']) assert.ok(isHistory(h), h);
  assert.ok(!isHistory('agents.md'));
});

test('the project name comes from package.json, else the agents.md title', () => {
  const d = tmp('nexus-up-name-');
  put(d, 'agents.md', '# Field notes — agents.md\n');
  assert.equal(projectName(d), 'Field notes');
  put(d, 'package.json', '{ "name": "@acme/field-notes" }');
  assert.equal(projectName(d), 'field-notes');
  assert.equal(flippedLock('kit: nexus\nversion: 2.0.0\nshape: phases\nadopted: YYYY-MM-DD\n', '2026-10-25'), 'kit: nexus\nversion: 2.0.0\nshape: chunks\nadopted: 2026-10-25\n');
});

test('the dry run reads a fresh fetch of origin in a temporary worktree and writes nothing to the local checkout', async () => {
  const r = v1();
  const before = state(r.local);
  const { code, report } = await upgrade({ repo: r.local, today: '2026-10-25' });
  assert.equal(code, 0, JSON.stringify(report.gate, null, 2));
  assert.deepEqual(state(r.local), before, 'git status, the worktree list, HEAD and the dirty file are as they were');
  assert.equal(report.worktree, null, 'a green dry run removes its worktree');
  assert.equal(report.shape, 'v1');

  // The archive diff: three shipped phases, 2a only on origin (the local clone is stale).
  assert.equal(report.archive.length, 3, report.archive.join('\n'));
  assert.ok(report.archive.some((l) => / · 02 · 2a: Cross-links · [0-9a-f]{7}$/.test(l)), report.archive.join('\n'));
  assert.ok(report.archive.some((l) => / · 02 · Content queue · [0-9a-f]{7}$/.test(l)));

  // The per-file report.
  const status = Object.fromEntries(report.files.map((f) => [f.path, f.status]));
  assert.equal(status['scripts/plan-check.mjs'], 'added');
  assert.equal(status['skills/next.md'], 'added');
  assert.equal(status['skills/march.lanes.md'], 'seeded');
  assert.equal(status['plan/README.md'], 'merged');
  assert.equal(status['plan/03-search.md'], 'converted');
  assert.equal(status['plan/ARCHIVE.md'], 'appended (3 lines)');
  assert.equal(status['plan/steps/01_build_plan.md'], 'retired');
  assert.equal(status['plan/phases/phase_3_search.md'], 'retired');
  assert.equal(status['skills/ship-a-phase.md'], 'retired');
  assert.equal(status['.claude/commands/ship-a-phase.md'], 'retired');
  assert.equal(status['plan/CANDIDATES.md'], 'renamed');
  assert.equal(new Set(report.files.map((f) => f.path)).size, report.files.length, 'one row per path');
  assert.equal(status['skills/survey.md'], 'kept-custom, rewritten (1 ref)', 'a custom skill stays');
  assert.equal(status['agents.md'], 'rewritten (2 refs)', 'origin\'s agents.md, not the dirty local one');
  assert.equal(status['plan/nexus.lock'], 'added');
  assert.ok(!report.files.some((f) => f.path === 'scratch.txt'));
  // The conservative knobs (A6): no v1 bearings, so one is added holding them; the vars are report lines.
  assert.equal(status['plan/bearings.md'], 'added');
  assert.deepEqual(report.knobs.filter((k) => k.status === 'written').map((k) => `${k.knob} ${k.value}`), ['Support triage-only', 'Promote owner', 'Generators (none)', 'stall_action alert', 'loop off', 'UI none']);

  // The gate, the warnings, the predicted first dispatch and the loop mode.
  assert.deepEqual(report.gate.map((g) => [g.name, g.ok]), [['plan-check', true], ['plan-check test', true], ['workflow-lint', true]]);
  assert.equal(status['.github/actions/setup/action.yml'], 'added', 'no v1 march.yml: the kit\'s setup action, filled in');
  assert.equal(report.workflow, null);
  assert.ok(Array.isArray(report.warnings));
  assert.equal(report.dispatch.kind, 'chunk');
  assert.match(report.dispatch.text, /spec 03/);
  assert.deepEqual([report.loop.mode, report.loop.pushes, report.loop.branch], ['owner', 2, 'main']);

  const text = render(report);
  for (const want of ['dry run (nothing written', `origin   ${r.bare}`, 'files (', 'retired', 'archive (+3 lines)', '+ - ', 'warnings (', 'gate', 'green  plan-check', 'first dispatch (predicted)', 'loop mode', 'gh variable set NEXUS_LOOP_MODE --body owner', 'knobs (conservative', 'gh variable set NEXUS_IDLE_BACKOFF --body 0', 'The worktree is removed']) {
    assert.ok(text.includes(want), `${want}\n---\n${text}`);
  }
});

test('a half-done repo finishes Step 5 only: retire, rename, rewrite; no kit copy, no conversion', async () => {
  const o = origin();
  const kit = await kitSource();
  copyKit(o.seed, kit);
  put(o.seed, 'plan/README.md', mergeRoadmap('# Half plan\n', fs.readFileSync(path.join(kit.root, 'plan', 'README.md'), 'utf8'), 'half'));
  put(o.seed, 'plan/ARCHIVE.md', '# Archive\n\n> Append-only.\n\n---\n\n');
  put(o.seed, 'plan/nexus.lock', 'kit: nexus\nversion: 2.0.0\nref: v2.0.0\nshape: chunks\nadopted: 2026-10-01\n');
  put(o.seed, 'plan/steps/01_build_plan.md', buildPlan('- [x] Phase 1 — Bootstrap'));
  put(o.seed, 'plan/PHASE_CANDIDATES.md', '# Candidates\n');
  put(o.seed, 'agents.md', '# Half — agents.md\n\nCandidates live in plan/PHASE_CANDIDATES.md.\n');
  commit(o.seed, 'plan: half an upgrade');
  o.push();
  const local = tmp('nexus-up-half-');
  git(local, 'clone', '-q', o.bare, '.');
  const { code, report } = await upgrade({ repo: local, today: '2026-10-25' });
  assert.equal(code, 0, JSON.stringify(report.gate, null, 2));
  assert.equal(report.shape, 'half');
  const status = Object.fromEntries(report.files.map((f) => [f.path, f.status]));
  assert.deepEqual(status, { 'agents.md': 'rewritten (1 ref)', 'plan/CANDIDATES.md': 'renamed', 'plan/steps/01_build_plan.md': 'retired' });
  assert.deepEqual(report.archive, []);
  assert.equal(report.loop.mode, 'pr');
  assert.equal(report.dispatch.kind, 'idle');
  assert.ok(!report.dispatch.live, 'no v1 loop was live, so idle is no red warning');
  assert.match(render(report), /half-done \(finishing Step 5 only\)/);
});

test('a live v1 loop with no pending phase: the first v2 tick in pr mode is idle, shown in red', async () => {
  const o = origin();
  put(o.seed, 'package.json', '{ "name": "@acme/done" }\n');
  put(o.seed, 'src/a.txt', 'one\n');
  const one = commit(o.seed, 'feat: bootstrap\n\nCloud-Run: https://example.invalid/runs/1');
  put(o.seed, 'agents.md', '# Done — agents.md\n');
  put(o.seed, 'plan/README.md', '# Done plan\n');
  put(o.seed, 'plan/steps/01_build_plan.md', buildPlan(`- [x] Phase 1 — Bootstrap (commit ${one})`));
  commit(o.seed, 'plan: the v1 plan\n\nCloud-Run: https://example.invalid/runs/2');
  o.push();
  const local = tmp('nexus-up-done-');
  git(local, 'clone', '-q', o.bare, '.');
  const { code, report } = await upgrade({ repo: local, today: '2026-10-25' });
  assert.equal(code, 0, JSON.stringify(report.gate, null, 2));
  assert.equal(report.loop.mode, 'owner');
  assert.ok(report.dispatch.live);
  assert.ok(report.dispatch.pr.idle, JSON.stringify(report.dispatch));
  assert.ok(!report.dispatch.idle, 'owner mode still has work');
  const text = render(report, { color: true });
  assert.ok(text.includes('\u001b[31midle until NEXUS_LOOP_MODE=owner is set: the v1 loop was live'), text);
  assert.match(text, /owner mode: /);
});

test('an origin URL with credentials is redacted before it reaches the report', () => {
  const u = redactUrl('https://u:secret@example.invalid/x.git');
  assert.ok(!u.includes('secret'), u);
  assert.equal(u, 'https://example.invalid/x.git');
  assert.ok(!redactUrl("fatal: unable to access 'https://tok@example.invalid/x.git/'").includes('tok@'));
  assert.equal(redactUrl('git@github.com:o/r.git'), 'git@github.com:o/r.git');
});

test('a v2 repo is already on v2 (exit 0); a repo with no plan exits 2; no origin exits 2', async () => {
  const o = origin();
  put(o.seed, 'plan/nexus.lock', 'kit: nexus\nshape: chunks\n');
  commit(o.seed, 'plan: v2');
  o.push();
  const local = tmp('nexus-up-v2-');
  git(local, 'clone', '-q', o.bare, '.');
  const out = sink();
  assert.equal(await runUpgrade(['--repo', local], { out, err: out }), 0);
  assert.match(out.text(), /already on v2/);

  const p = origin();
  put(p.seed, 'README.md', '# plain\n');
  commit(p.seed, 'docs: plain');
  p.push();
  const plain = tmp('nexus-up-plain-');
  git(plain, 'clone', '-q', p.bare, '.');
  const r = await upgrade({ repo: plain });
  assert.equal(r.code, 2);
  assert.match(r.report.error, /not a nexus v1 repo/);
  assert.equal(git(plain, 'worktree', 'list').split('\n').length, 1, 'the worktree is removed on every stop');

  const lone = tmp('nexus-up-lone-');
  git(lone, 'init', '-q', '-b', 'main');
  const n = await upgrade({ repo: lone });
  assert.equal(n.code, 2);
  assert.match(n.report.error, /no origin/);
});

test('flags a later release carries are refused, never ignored; --help prints the usage', async () => {
  const out = sink();
  for (const f of ['--pr']) assert.equal(await runUpgrade([f], { out, err: out }), 2, f);
  assert.match(out.text(), /not in this release yet/);
  assert.equal(await runUpgrade(['--bogus'], { out, err: out }), 2);
  const help = sink();
  assert.equal(await runUpgrade(['--help'], { out: help }), 0);
  assert.match(help.text(), /npx @usenexus\/cli upgrade --repo <dir>/);
});
