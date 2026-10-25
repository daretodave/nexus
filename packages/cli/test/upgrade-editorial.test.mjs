// The scratch proof's gaps, fixed (spec 58, A7). A dry run on a scratch clone of a live editorial v1 origin found:
// kit steps the fork renamed at the edges (`Step 3 — Dispatch`, `Failure modes — when to stop`) read as custom
// sections, swallowing the content queue and the refill into one lane and hiding the v1 pick step, so every lane
// became `pre`; the skill's purpose, invocation and failure-mode prose became lanes that ran; a `continue` lane was
// predicted as the first dispatch; and workflow-lint went red on a problem the repo's own watchdog workflow already
// had. The fixtures are modelled on that fork's format (renamed kit headers, a weekly snapshot gate ahead of the pick,
// a content queue and an empty-queue refill after it, a cross-link drain inside a kit step), on a 40-minute cron.
// Offline: real git over a local bare remote in the temp folder; the kit is the nexus repo's templates/.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { coreHeader, fromJson, isKitHeader, mergeText, sections, textOf, toJson } from '../server/kit-text.mjs';
import { carryTrain, copyKit, customTrain, kitSource, render, repoVerify, runRepoVerify, upgrade } from '../server/upgrade.mjs';
import { MARCH_YML } from '../server/workflow-merge.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures', 'upgrade');
const fixture = (n) => fs.readFileSync(path.join(FIX, n), 'utf8').replace(/\r\n/g, '\n');
const scratch = [];
after(() => { for (const d of scratch) fs.rmSync(d, { recursive: true, force: true }); });
const tmp = (p) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); scratch.push(d); return d; };
const put = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' };
const git = (cwd, ...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd, env, encoding: 'utf8', stdio: 'pipe' }).trim();
const commit = (dir, msg) => { git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', msg); return git(dir, 'rev-parse', '--short', 'HEAD'); };
const devKit = () => kitSource({ bundled: path.join(os.tmpdir(), 'nexus-no-bundle') });
const lanesLib = () => import(new URL('../../../templates/scripts/plan/lanes.mjs', import.meta.url).href);
const sectionText = (md, header) => {
  const s = sections(md).sections;
  const i = s.findIndex((x) => x.header === header);
  return [s[i].header, ...s[i].body].join('\n').replace(/\s+$/, '');
};

test('a kit header renamed at the edges is still the kit section: same core, or the core and a dash suffix', () => {
  const t = fromJson(toJson(mergeText(textOf('## 3. Procedure\n\n### Step 3 — Dispatch (first match wins)\n\n#### 3a. Pending phase?\n\n## 5. Failure modes\n'))));
  assert.equal(coreHeader('### Step 3 — Dispatch (first match wins)'), 'step 3 — dispatch');
  assert.ok(isKitHeader('### Step 3 — Dispatch', t), 'the parenthetical dropped');
  assert.ok(isKitHeader('### Step 3 — **Dispatch** (ours)', t));
  assert.ok(isKitHeader('## 5. Failure modes — when to stop', t), 'a dash suffix on a kit header');
  assert.ok(!isKitHeader('### Step 0.5 — Weekly snapshot gate (Phase 31 amendment)', t));
  assert.ok(!isKitHeader('#### 3b.5. Content queue? (post-phase-24)', t));
  assert.ok(!isKitHeader('## 5. Failure modesty', t), 'a prefix is no match without the dash');
});

test('the editorial fork: the snapshot gate is pre, the queue and the refill are queue lanes, prose is reference', async () => {
  const kit = await devKit();
  const d = tmp('nexus-ed-train-');
  const march = fixture('march.editorial-v1.md');
  const iterate = fixture('iterate.editorial-v1.md');
  put(d, 'skills/march.md', march);
  put(d, 'skills/iterate.md', iterate);
  const train = customTrain(d, kit);
  const refs = (skill) => train[skill].filter((u) => u.ref).map((u) => u.header);
  assert.deepEqual(refs('march.md'), ['# Skill: march', '## 1. Purpose', '## 2. Invocation', '## 5. Failure modes — when to stop']);
  assert.deepEqual(refs('iterate.md'), ['# Skill: iterate', '## 1. Purpose', '## 6. Failure modes — when to stop']);

  copyKit(d, kit);
  const { rows } = carryTrain(d, train, { today: '2026-10-25' });
  const { parseLanes } = await lanesLib();
  const lanesMd = read(d, 'skills/march.lanes.md');
  const m = parseLanes(lanesMd, 'march');
  assert.deepEqual(m.problems, []);
  assert.deepEqual(m.lanes.map((l) => [l.name, l.hook, l.return]), [
    ['sync-notes', 'pre', 'continue'],
    ['weekly-snapshot-gate-phase-31-amendment', 'pre', 'end-tick'],
    ['critique-gate-notes', 'pre', 'continue'],
    ['dispatch-notes', 'pre', 'continue'],
    ['pending-phase-notes', 'queue', 'continue'],
    ['content-queue-post-phase-24', 'queue', 'end-tick'],
    ['empty-queue-refill-post-phase-30', 'queue', 'end-tick'],
    ['done-notes', 'queue', 'continue'],
  ]);
  // Verbatim: the snapshot gate, the queue and the refill under their own headers.
  for (const h of ['### Step 0.5 — Weekly snapshot gate (Phase 31 amendment)', '#### 3b.5. Content queue? (post-phase-24)', '#### 3b.5a. Empty-queue refill (post-phase-30)']) {
    assert.ok(lanesMd.includes(sectionText(march, h)), h);
  }
  // The prose outside the procedure is kept, after the lanes, under one notes header: no lane runs it.
  const notesAt = lanesMd.indexOf('## Notes from the v1 skills/march.md (reference, not lanes)');
  assert.ok(notesAt > lanesMd.lastIndexOf('## lane:'), 'the notes follow every lane');
  assert.ok(lanesMd.indexOf('Deliveries first: a pending phase ships before the content queue') > notesAt);
  assert.ok(lanesMd.indexOf('2. **The queue file is unreadable.**') > notesAt);

  const itMd = read(d, 'skills/iterate.lanes.md');
  const it = parseLanes(itMd, 'iterate');
  assert.deepEqual(it.problems, []);
  assert.deepEqual(it.lanes.map((l) => l.name), ['content-gaps-notes', 'delegate-or-implement-notes', 'done-notes']);
  assert.match(itMd, /## lane: delegate-or-implement-notes[\s\S]*\*\*Cross-links \(cluster-aware\)\*\*: when the winning row/, 'the cross-link drain is a lane');
  assert.ok(itMd.indexOf('The site is never done') > itMd.indexOf('## Notes from the v1 skills/iterate.md'));

  const status = Object.fromEntries(rows.map((r) => [r.path, r]));
  assert.equal(status['skills/march.lanes.md'].status, 'moved-to-lane (8)');
  assert.match(status['skills/march.lanes.md'].note, /4 reference notes \(outside the procedure\)/);
});

/** A live editorial v1 origin on a 40-minute cron: Cloud-Run commits, a suffixed phase, the fork's skills. */
function editorial({ cron = '*/40 * * * *', yml = (t) => t } = {}) {
  const bare = tmp('nexus-ed-origin-');
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  const seed = tmp('nexus-ed-seed-');
  git(seed, 'init', '-q', '-b', 'main');
  git(seed, 'remote', 'add', 'origin', bare);
  put(seed, 'package.json', '{ "name": "@acme/field-notes", "scripts": { "verify": "node -e \\"process.exit(0)\\"" } }\n');
  put(seed, 'src/a.txt', 'one\n');
  const one = commit(seed, 'feat: bootstrap\n\nCloud-Run: https://example.invalid/runs/1');
  put(seed, 'src/b.txt', 'two\n');
  const two = commit(seed, 'fix: runtime\n\nCloud-Run: https://example.invalid/runs/2');
  put(seed, 'agents.md', '# Field notes — agents.md\n\nWhat ships next is plan/steps/01_build_plan.md.\n');
  put(seed, 'plan/README.md', '# Field notes plan\n');
  put(seed, 'plan/steps/01_build_plan.md', `# 01 — Build plan\n\n## Status (at-a-glance)\n\n- [x] Phase 1 — Bootstrap \`${one}\`\n- [x] Phase 1b — Runtime hotfix. Then the cleanup \`${two}\`\n\n## Phase log (commit hashes)\n\n`);
  // An older copy of a kit script and of the kit's test of it: the new script fails the old test (an enum grew).
  put(seed, 'scripts/loop-issue.mjs', 'export const VALID_CATEGORY = new Set([\'bug\'])\n');
  put(seed, 'scripts/__tests__/loop-issue.test.mjs', "import { test } from 'node:test'\n// Phase 15a brief locks these enums.\n");
  put(seed, 'skills/march.md', fixture('march.editorial-v1.md'));
  put(seed, 'skills/iterate.md', fixture('iterate.editorial-v1.md'));
  put(seed, MARCH_YML, yml(fixture('march.v1.yml').replace("- cron: '0 * * * *'", `- cron: '${cron}'`)));
  // The repo's own watchdog: its job env reads a token, a problem it had before any upgrade.
  put(seed, '.github/workflows/watch.yml', 'name: watch\non:\n  schedule:\n    - cron: "15 * * * *"\njobs:\n  watch:\n    runs-on: ubuntu-latest\n    env:\n      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n    steps:\n      - run: gh run list --workflow march --limit 1\n');
  commit(seed, 'plan: the v1 plan\n\nCloud-Run: https://example.invalid/runs/3');
  git(seed, 'push', '-q', 'origin', 'main');
  const local = tmp('nexus-ed-local-');
  git(local, 'clone', '-q', bare, '.');
  return local;
}

test('A7 on an editorial origin: every phase archived, no open spec, cron and ceiling kept, gate green, a lane dispatch', async () => {
  const local = editorial();
  const { code, report } = await upgrade({ repo: local, today: '2026-10-25', kit: await devKit(), keep: true });
  scratch.push(report.worktree);
  try {
    assert.equal(code, 0, JSON.stringify(report.gate, null, 2));
    assert.equal(report.archive.length, 2, 'the suffixed phase archived under its parent');
    assert.match(report.archive[1], / · 01 · 1b: Runtime hotfix · /);
    assert.deepEqual(fs.readdirSync(path.join(report.worktree, 'plan')).filter((n) => /^\d+-.*\.md$/.test(n)), [], 'no open spec');

    const merged = read(report.worktree, MARCH_YML);
    assert.match(merged, /- cron: '\*\/40 \* \* \* \*'/);
    assert.match(merged, /^ {10}ceiling=60$/m);

    // The kit's test replaces the repo's older copy; a kit test the repo never had is not added.
    const status = Object.fromEntries(report.files.map((f) => [f.path, f.status]));
    assert.equal(status['scripts/__tests__/loop-issue.test.mjs'], 'replaced');
    assert.equal(read(report.worktree, 'scripts/__tests__/loop-issue.test.mjs'), read(path.join(HERE, '..', '..', '..', 'templates'), 'scripts/__tests__/loop-issue.test.mjs'));
    assert.ok(!fs.existsSync(path.join(report.worktree, 'scripts', '__tests__', 'claims.test.mjs')));

    // The watchdog's own problem is the repo's, not the upgrade's: a warning, the gate green.
    const lint = report.gate.find((g) => g.name === 'workflow-lint');
    assert.ok(lint.ok, lint.out);
    assert.match(lint.note, /1 problem the repo's own workflow already had/);
    assert.ok(report.warnings.some((w) => /^workflow-lint \(already on origin, not the upgrade's\): \.github\/workflows\/watch\.yml: /.test(w)));
    // The repo's verify is named, not run, without --verify.
    const v = report.gate.find((g) => /^repo verify/.test(g.name));
    assert.deepEqual([v.name, v.ok, v.skipped], ['repo verify (npm run verify)', true, true]);

    // The first dispatch: the snapshot gate if it is due, else the queue, else the refill; never a continue lane.
    assert.equal(report.dispatch.kind, 'lane');
    assert.deepEqual(report.dispatch.lanes, ['weekly-snapshot-gate-phase-31-amendment', 'content-queue-post-phase-24', 'empty-queue-refill-post-phase-30']);
    assert.match(report.dispatch.text, /^lane weekly-snapshot-gate-phase-31-amendment \(pre: the section below, when as the section below says\); else lane content-queue/);
    assert.match(report.dispatch.text, /; else \/iterate/);
    assert.ok(report.dispatch.pr.idle, 'until NEXUS_LOOP_MODE=owner the pr-mode tick is idle');
    const text = render(report);
    assert.match(text, /green {2}workflow-lint {2}\(1 problem/);
    assert.match(text, /skip {3}repo verify \(npm run verify\)/);
  } finally {
    git(local, 'worktree', 'remove', '--force', report.worktree);
  }
});

test('--verify runs the repo\'s own verify in the worktree, its install first; a red one is a red gate row', async () => {
  const d = tmp('nexus-ed-verify-');
  put(d, 'package.json', '{ "name": "x", "scripts": { "verify": "node -e 1" }, "devDependencies": { "vitest": "^3.0.0" } }\n');
  put(d, 'pnpm-lock.yaml', "lockfileVersion: '9.0'\n");
  assert.deepEqual(repoVerify(d), { cmd: 'pnpm run verify', install: 'pnpm install --frozen-lockfile' });
  put(d, 'package.json', '{ "name": "x", "scripts": { "verify": "node -e 1" } }\n');
  assert.deepEqual(repoVerify(d), { cmd: 'pnpm run verify', install: null }, 'nothing to install');
  put(d, 'package.json', '{ "name": "x" }\n');
  assert.equal(repoVerify(d), null, 'no verify script, no row');
  const ok = runRepoVerify(d, { cmd: 'node -e "process.exit(0)"', install: 'node -e ""' });
  assert.equal(ok.ok, true);
  const bad = runRepoVerify(d, { cmd: 'node -e "console.log(\'e2e: 3 failed\');process.exit(1)"', install: 'node -e ""' });
  assert.equal(bad.ok, false);
  assert.match(bad.out, /^verify failed: [\s\S]*e2e: 3 failed/);

  const local = editorial({ cron: '0 * * * *' });
  const { code, report } = await upgrade({ repo: local, today: '2026-10-25', kit: await devKit(), verify: true });
  assert.equal(code, 0, JSON.stringify(report.gate, null, 2));
  const v = report.gate.find((g) => /^repo verify/.test(g.name));
  assert.deepEqual([v.ok, Boolean(v.skipped)], [true, false]);
  assert.equal(report.worktree, null, 'a green dry run removes its worktree');
});

test('an injection the v1 march.yml already had is the upgrade\'s to fix: the merged owner job ships it, the gate is red', async () => {
  const line = '            Issue in hand: ${{ github.event.issue.title }}\n';
  const local = editorial({ yml: (t) => t.replace(/^( {12}Read agents\.md first[^\n]*\n)/m, `$1${line}`) });
  const { code, report } = await upgrade({ repo: local, today: '2026-10-25', kit: await devKit() });
  if (report.worktree) scratch.push(report.worktree);
  assert.equal(code, 1, JSON.stringify(report.gate, null, 2));
  const lint = report.gate.find((g) => g.name === 'workflow-lint');
  assert.equal(lint.ok, false, 'a problem in a file the upgrade merges is fresh, whatever origin had');
  assert.match(lint.out, /march\.yml[^\n]*interpolates \$\{\{ ?github\.event\.issue\.title/);
  if (report.worktree) git(local, 'worktree', 'remove', '--force', report.worktree);
});
