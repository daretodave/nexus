// `nexus upgrade` carries the train (spec 58, A4): a v1 repo's own march and iterate text moves verbatim into the
// lanes files, while kit text from any historical kit version is replaced (judged against kit-text: every header and
// paragraph the kit's skills ever held, never one tag); custom skills and commands stay, a command with no skill
// becomes one; the roadmap keeps the repo's sections with <PROJECT> filled; no v1 reference is left outside history
// files. The fixtures are kit skills forked before v1.0.0 (placeholders filled, a paragraph re-wrapped) plus custom
// sections. Real git over a local bare remote in the temp folder, offline; the kit is the nexus repo's templates/.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { customTrain, carryTrain, copyKit, keepCustom, kitSource, upgrade, V1_LEFT, isHistory, rewriteText } from '../server/upgrade.mjs';
import { customUnits, fromJson, laneName, normPara, sections, textOf, toJson } from '../server/kit-text.mjs';

const FIX = new URL('./fixtures/upgrade/', import.meta.url);
const fixture = (n) => fs.readFileSync(new URL(n, FIX), 'utf8');
const scratch = [];
after(() => { for (const d of scratch) fs.rmSync(d, { recursive: true, force: true }); });
const tmp = (p) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); scratch.push(d); return d; };
const put = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
/** The dev kit (the nexus repo's templates/ and its kit-text snapshot), never a stale bundled kit/. */
const devKit = () => kitSource({ bundled: path.join(os.tmpdir(), 'nexus-no-bundle') });

const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' };
const git = (cwd, ...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd, env, encoding: 'utf8', stdio: 'pipe' }).trim();
const commit = (dir, msg) => { git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', msg); return git(dir, 'rev-parse', '--short', 'HEAD'); };

const MARCH_CUSTOM = ['### Step 2.5 — Weekly trend snapshot gate', '#### 3b.5 Content queue'];
/** A custom section's text in the fixture, header to the next header. */
function sectionText(md, header) {
  const s = sections(md).sections;
  const i = s.findIndex((x) => x.header === header);
  return [s[i].header, ...s[i].body].join('\n').replace(/\s+$/, '');
}

async function lanesLib() {
  return import(new URL('../../../templates/scripts/plan/lanes.mjs', import.meta.url).href);
}

test('kit text: headers in a code fence are no headers; a re-wrapped or placeholder-filled kit paragraph is still kit text', () => {
  const kit = '# Skill: x\n\n## 1. Purpose\n\nThis means an overnight run can take <PROJECT> from\nscaffolded to shipped.\n\n```bash\n# not a header\ngh issue list\n```\n';
  const t = fromJson(toJson(textOf(kit)));
  assert.deepEqual([...t.headers].sort(), ['1. purpose', 'skill: x']);
  const fork = '# Skill: x\n\n## 1. Purpose\n\nThis means an overnight run can take Field notes from scaffolded\nto shipped.\n\n```bash\n# not a header\ngh issue list\n```\n\nOur own paragraph.\n';
  const units = customUnits(fork, t);
  assert.equal(units.length, 1);
  assert.equal(units[0].kind, 'paras');
  assert.equal(units[0].text, '## 1. Purpose\n\nOur own paragraph.', 'the custom paragraph, under its kit header');
  assert.equal(normPara('a\n  b'), 'a b');
});

test('A4: a march.md forked before v1.0.0 plus two custom sections yields exactly those two lanes, verbatim', async () => {
  const kit = await devKit();
  assert.ok(kit.text?.['march.md']?.paras.length > 60, 'the kit-text list holds every historical version');
  const d = tmp('nexus-train-');
  const march = fixture('march.pre-v1.md');
  const iterate = fixture('iterate.pre-v1.md');
  put(d, 'skills/march.md', march);
  put(d, 'skills/iterate.md', iterate);

  // Against one kit version (today's), the fork's drift reads as custom: the reason kit-text exists.
  const today = fromJson(toJson(textOf(read(kit.root, 'skills/march.md'))));
  assert.ok(customUnits(march, today).length > 2, 'judged against the current kit alone, old kit text looks custom');

  const train = customTrain(d, kit);
  assert.deepEqual(train['march.md'].map((u) => u.header), MARCH_CUSTOM);
  assert.deepEqual(train['iterate.md'].map((u) => u.header), ['#### H. Cross-link drain']);

  copyKit(d, kit);
  assert.equal(read(d, 'skills/march.md'), read(kit.root, 'skills/march.md'), 'kit text is replaced');
  const { rows, warnings } = carryTrain(d, train, { today: '2026-10-25' });
  const lanesMd = read(d, 'skills/march.lanes.md');
  const { parseLanes } = await lanesLib();
  const parsed = parseLanes(lanesMd, 'march');
  assert.deepEqual(parsed.problems, []);
  assert.deepEqual(parsed.lanes.map((l) => [l.name, l.hook, l.return]), [
    ['weekly-trend-snapshot-gate', 'pre', 'end-tick'],
    ['content-queue', 'queue', 'end-tick'],
  ]);
  // Verbatim, under the original header; only the v1 reference changed.
  assert.ok(lanesMd.includes(sectionText(march, MARCH_CUSTOM[0])));
  assert.ok(lanesMd.includes(rewriteText(sectionText(march, MARCH_CUSTOM[1])).text));
  assert.ok(lanesMd.startsWith(read(kit.root, 'skills/march.lanes.md').replace(/\s*$/, '')), 'appended after the seed, never over it');
  assert.doesNotMatch(lanesMd, V1_LEFT);

  const it = parseLanes(read(d, 'skills/iterate.lanes.md'), 'iterate');
  assert.deepEqual(it.problems, []);
  assert.deepEqual(it.lanes.map((l) => [l.name, l.hook]), [['cross-link-drain', 'dimensions']]);
  assert.ok(read(d, 'skills/iterate.lanes.md').includes(sectionText(iterate, '#### H. Cross-link drain')));

  const status = Object.fromEntries(rows.map((r) => [r.path, r.status]));
  assert.equal(status['skills/march.lanes.md'], 'moved-to-lane (2)');
  assert.equal(status['skills/iterate.lanes.md'], 'moved-to-lane (1)');
  assert.ok(warnings.some((w) => /2 custom sections moved to skills\/march\.lanes\.md/.test(w)));

  // A second run finds nothing custom in the kit's own skills, and never doubles a lane name.
  assert.deepEqual(customTrain(d, kit), { 'march.md': [], 'iterate.md': [] });
});

test('custom paragraphs inside a kit step move as a -notes lane that continues the tick', async () => {
  const kit = await devKit();
  const d = tmp('nexus-train-paras-');
  const march = read(kit.root, 'skills/march.md').replace(/\r\n/g, '\n').replace('#### 3b. Pending data?\n', '#### 3b. Pending data?\n\nAlso drain `content/QUEUE.md` first.\n');
  put(d, 'skills/march.md', march);
  const train = customTrain(d, kit);
  assert.equal(train['march.md'].length, 1);
  copyKit(d, kit);
  carryTrain(d, train, {});
  const { parseLanes } = await lanesLib();
  const { lanes } = parseLanes(read(d, 'skills/march.lanes.md'), 'march');
  assert.deepEqual(lanes.map((l) => [l.name, l.hook, l.return]), [['pending-data-notes', 'queue', 'continue']]);
  assert.match(read(d, 'skills/march.lanes.md'), /#### 3b\. Pending data\?\n\nAlso drain `content\/QUEUE\.md` first\./);
  assert.equal(laneName('### Dimension X — Pillars'), 'pillars');
});

test('custom skills and commands stay; a command with no skill becomes a skill it points at', async () => {
  const kit = await devKit();
  const d = tmp('nexus-train-cmds-');
  put(d, 'skills/survey.md', '# survey\n\nRefill the queue.\n');
  put(d, '.claude/commands/survey.md', 'Read skills/survey.md and do it.\n');
  put(d, '.claude/commands/publish.md', '---\ndescription: Publish the week\n---\n\nBuild the issue, then send it.\n\nArgument: $ARGUMENTS\n');
  put(d, '.claude/commands/ship-a-phase.md', 'v1 kit command\n');
  copyKit(d, kit);
  const rows = keepCustom(d, new Set(kit.files.map((f) => f.repo)));
  const status = Object.fromEntries(rows.map((r) => [r.path, r.status]));
  assert.deepEqual(status, {
    'skills/survey.md': 'kept-custom',
    '.claude/commands/survey.md': 'kept-custom',
    'skills/publish.md': 'moved-to-skill',
    '.claude/commands/publish.md': 'kept-custom',
  });
  assert.equal(read(d, 'skills/survey.md'), '# survey\n\nRefill the queue.\n', 'a custom skill is kept as it is');
  assert.match(read(d, 'skills/publish.md'), /^# Skill: publish\n[\s\S]*Build the issue, then send it\.\n\nArgument: \$ARGUMENTS\n$/);
  const cmd = read(d, '.claude/commands/publish.md');
  assert.ok(cmd.startsWith('---\ndescription: Publish the week\n---\n'), 'the command keeps its front matter');
  assert.match(cmd, /Read `skills\/publish\.md`/);
  assert.match(cmd, /Argument: \$ARGUMENTS/);
});

test('A4 end to end: the dry run carries the train, keeps custom files, merges the README, and leaves no v1 reference', async () => {
  const bare = tmp('nexus-train-origin-');
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  const seed = tmp('nexus-train-seed-');
  git(seed, 'init', '-q', '-b', 'main');
  git(seed, 'remote', 'add', 'origin', bare);
  put(seed, 'agents.md', '# Field notes — agents.md\n\nShip with /ship-a-phase; next is plan/steps/01_build_plan.md; briefs in plan/phases/.\n');
  const one = commit(seed, 'feat: bootstrap\n\nCloud-Run: https://example.invalid/runs/1');
  put(seed, 'plan/README.md', '# <PROJECT> plan\n\n> The v1 notes.\n\n---\n\n## Editorial calendar\n\nKept, in place.\n');
  put(seed, 'plan/steps/01_build_plan.md', `# 01 — Build plan\n\n## Status (at-a-glance)\n\n- [x] Phase 1 — Bootstrap (commit ${one})\n\n## Phase log (commit hashes)\n\n`);
  put(seed, 'plan/ARCHIVE.md', '# Archive\n\nPhase 1 shipped from plan/steps/01_build_plan.md.\n');
  put(seed, 'skills/march.md', fixture('march.pre-v1.md'));
  put(seed, 'skills/iterate.md', fixture('iterate.pre-v1.md'));
  put(seed, 'skills/survey.md', '# survey\n\nRefill the queue, then /ship-a-phase.\n');
  put(seed, '.claude/commands/publish.md', 'Publish what plan/phases/ says is ready.\n');
  put(seed, '.github/workflows/march.yml', 'name: march\non:\n  schedule:\n    - cron: "0 * * * *"\njobs:\n  tick:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "read plan/steps/01_build_plan.md, then /ship-a-phase"\n');
  commit(seed, 'plan: the v1 plan\n\nCloud-Run: https://example.invalid/runs/2');
  git(seed, 'push', '-q', 'origin', 'main');
  const local = tmp('nexus-train-local-');
  git(local, 'clone', '-q', bare, '.');

  const { code, report } = await upgrade({ repo: local, today: '2026-10-25', kit: await devKit(), keep: true });
  assert.equal(code, 0, JSON.stringify(report.gate, null, 2));
  const wt = report.worktree;
  scratch.push(wt);
  try {
    const status = Object.fromEntries(report.files.map((f) => [f.path, f.status]));
    assert.equal(status['skills/march.lanes.md'], 'seeded, moved-to-lane (2)');
    assert.equal(status['skills/iterate.lanes.md'], 'seeded, moved-to-lane (1)');
    assert.equal(status['skills/march.md'], 'replaced');
    assert.equal(status['skills/survey.md'], 'kept-custom, rewritten (1 ref)');
    assert.equal(status['skills/publish.md'], 'moved-to-skill, rewritten (1 ref)');
    assert.equal(status['.github/workflows/march.yml'], 'rewritten (2 refs)', 'workflow prompt text included');

    // The README keeps its own sections, <PROJECT> filled.
    const roadmap = read(wt, 'plan/README.md');
    assert.match(roadmap, /^# Field notes plan/);
    assert.ok(roadmap.indexOf('## Specs') < roadmap.indexOf('## Editorial calendar'));

    // No v1 reference outside history files (the kit's own files name v1 on purpose: the converter reads it).
    const kitFiles = new Set((await devKit()).files.map((f) => f.repo));
    const left = [];
    const walk = (rel) => {
      for (const e of fs.readdirSync(path.join(wt, rel), { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.name === '.git') continue;
        if (e.isDirectory()) walk(r);
        else if (!isHistory(r) && !kitFiles.has(r) && V1_LEFT.test(read(wt, r))) left.push(r);
      }
    };
    walk('');
    assert.deepEqual(left, []);
    assert.match(read(wt, 'plan/ARCHIVE.md'), /plan\/steps\/01_build_plan\.md/, 'history files keep their v1 words');

    // The first dispatch is the carried pre lane, not an idle tick.
    assert.equal(report.dispatch.kind, 'lane');
    assert.match(report.dispatch.text, /weekly-trend-snapshot-gate/);
  } finally {
    git(local, 'worktree', 'remove', '--force', wt);
  }
});
