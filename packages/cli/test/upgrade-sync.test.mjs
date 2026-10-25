// `nexus upgrade` on a v2 repo: the sync to the current kit (spec 58, A11). Every kit file three ways (the kit at the
// lock's ref, the kit now, the repo's copy): an untouched file is replaced, a customised one merged three-way, a
// conflict goes to the assisted merge (a stubbed helper here), shown as a diff and applied only with the gate green;
// new kit content is listed and added, new knobs at their conservative values; lanes files and custom skills are not
// touched; a vendored copy at another path keeps its marked local patch; the lock's ref moves in one
// `plan: sync to nexus <version>` commit, its comments kept. Real git over a local bare remote and a local kit repo
// with a v2.0.0 tag, offline; the gate and the helper model are injected seams.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { detect, render, runUpgrade, upgrade } from '../server/upgrade.mjs';
import { bumpLock, fillKit, kitAhead, kitAt, kitBuild, likeness, merge3, modelAssist, parseAssist, relocated, syncBranch, syncSubject } from '../server/sync.mjs';

const scratch = [];
after(() => { for (const d of scratch) fs.rmSync(d, { recursive: true, force: true }); });
const tmp = (p) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); scratch.push(d); return d; };

const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' };
const git = (cwd, ...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd, env, encoding: 'utf8', stdio: 'pipe' }).trim();
const put = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const get = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const commit = (dir, msg) => { git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', msg); return git(dir, 'rev-parse', 'HEAD'); };
const sink = () => { const lines = []; const f = (s) => lines.push(s); f.text = () => lines.join('\n'); return f; };
const lines = (n, tag) => Array.from({ length: n }, (_, i) => `export const line${i} = 'the kit line number ${i}';${tag && i === 0 ? ` // ${tag}` : ''}`).join('\n');

// The kit at v2.0.0 (base) and now (theirs), as the nexus repo's templates/ holds them.
const BASE = {
  'scripts/a.mjs': `${lines(6)}\n`,
  'scripts/b.mjs': `${lines(12)}\n`,
  'scripts/c.mjs': "export const mode = 'one';\nexport const keep = 'the kit keeps this line as it is';\n",
  'scripts/vend.mjs': `${lines(10)}\n`,
  'scripts/e.mjs': 'export const e = 1;\n',
  'skills/march.md': '# march\n\nThe kit\'s march.\n',
  'skills/march.lanes.md': '# march lanes\n\n(none)\n',
  '.github/workflows/march.yml': "name: march\n# <PROJECT>'s loop on <DEFAULT_BRANCH>\non:\n  schedule:\n    - cron: '0 */3 * * *'\n",
  'plan/bearings.md': '# Bearings\n\n- Support: triage-only\n',
  'plan/nexus.lock': 'kit: nexus\nversion: 2.0.0\nref: v2.0.0\nshape: chunks\nadopted: YYYY-MM-DD\n',
};
const NOW = {
  ...BASE,
  'scripts/a.mjs': `${lines(6)}\nexport const added = 'by the kit';\n`,
  'scripts/b.mjs': `${lines(12).replace("line11 = 'the kit line number 11'", "line11 = 'the kit moved line 11'")}\n`,
  'scripts/c.mjs': "export const mode = 'two';\nexport const keep = 'the kit keeps this line as it is';\n",
  'scripts/vend.mjs': `${lines(10).replace("line9 = 'the kit line number 9'", "line9 = 'the kit moved line 9'")}\n`,
  'scripts/e.mjs': "import { d } from './d.mjs';\nexport const e = d;\n",
  'scripts/d.mjs': 'export const d = 1;\n',
  'scripts/z.mjs': 'export const z = 1;\n',
  'skills/fresh.md': '# fresh\n\nA skill the kit added after v2.0.0.\n',
  'skills/march.lanes.md': '# march lanes\n\n(none, and a newer seed)\n',
  '.github/workflows/march.yml': "name: march\n# <PROJECT>'s loop on <DEFAULT_BRANCH>\non:\n  schedule:\n    - cron: '17 */3 * * *'\nenv:\n  CHAIN: ${{ vars.NEXUS_CHAIN_MAX }}\n",
  'plan/bearings.md': '# Bearings\n\n- Support: triage-only\n- loop: on\n',
};
const FILES = [
  ['scripts/a.mjs', 'script'], ['scripts/b.mjs', 'script'], ['scripts/c.mjs', 'script'], ['scripts/vend.mjs', 'script'],
  ['scripts/d.mjs', 'script'], ['scripts/e.mjs', 'script'], ['scripts/z.mjs', 'script'], ['skills/march.md', 'skill'], ['skills/march.lanes.md', 'lane'], ['skills/fresh.md', 'skill'],
].map(([rel, kind]) => ({ kit: `templates/${rel}`, repo: rel, kind }));
const SYNC = [{ kit: 'templates/.github/workflows/march.yml', repo: '.github/workflows/march.yml', kind: 'workflow' }];

/** A nexus-like kit repo: templates/ at a v2.0.0 tag, then the kit now. */
function kitRepo() {
  const dir = tmp('nexus-sync-kit-');
  git(dir, 'init', '-q', '-b', 'main');
  for (const [rel, text] of Object.entries(BASE)) put(dir, `templates/${rel}`, text);
  commit(dir, 'feat: the kit at v2.0.0');
  git(dir, 'tag', 'v2.0.0');
  for (const [rel, text] of Object.entries(NOW)) put(dir, `templates/${rel}`, text);
  const head = commit(dir, 'feat: the kit now');
  return { dir, head, kit: { root: path.join(dir, 'templates'), files: FILES, sync: SYNC, build: { ref: head, version: '2.1.0' }, nexus: dir, text: null, from: 'templates' } };
}

const LOCK = `# plan/nexus.lock: the nexus kit version this repo follows.
# Vendored in place: scripts/a.mjs, lib/vend.mjs (moved). Local patches are marked \`acme patch\`
# in each file and listed here; plan/settle.json holds the repo's settle config.
kit: nexus
version: 2.0.0
ref: v2.0.0 # the kit tag adopted
shape: chunks
adopted: 2026-10-21
`;
const SETTLE = '{\n  "queue": "plan/steps/01_build_plan.md",\n  "standing": ["00"]\n}\n';
// The repo's c.mjs: two marked patches, one of them an import of e.mjs (so c and e move together or not at all).
const OURS_C = "import { e } from './e.mjs'; // acme patch: c reads e\nexport const mode = 'acme'; // acme patch: our mode\nexport const keep = 'the kit keeps this line as it is';\n";

/**
 * A v2 adopter: vendored kit files, two with marked local patches (one moved), its own lanes and skills; cloned.
 * `partial`: it vendored only c.mjs and e.mjs of the kit's scripts (it takes no kit scripts wholesale).
 */
function adopter({ partial = false } = {}) {
  const bare = tmp('nexus-sync-origin-');
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  const seed = tmp('nexus-sync-seed-');
  git(seed, 'init', '-q', '-b', 'main');
  git(seed, 'remote', 'add', 'origin', bare);
  put(seed, 'package.json', '{ "name": "acme" }\n');
  put(seed, 'plan/nexus.lock', LOCK);
  put(seed, 'plan/settle.json', SETTLE);
  put(seed, 'plan/steps/01_build_plan.md', '# 01 — Build plan\n\n- [ ] Phase 00 — Bugs\n');
  put(seed, 'plan/bearings.md', '# Acme bearings\n\n- Support: triage-only\n');
  if (!partial) {
    put(seed, 'scripts/a.mjs', BASE['scripts/a.mjs']);
    put(seed, 'scripts/b.mjs', BASE['scripts/b.mjs'].replace("line0 = 'the kit line number 0';", "line0 = 'ours'; // acme patch: our own first line"));
    put(seed, 'lib/vend.mjs', BASE['scripts/vend.mjs'].replace("line2 = 'the kit line number 2';", "line2 = 'patched'; // acme patch: a vendored fix"));
  }
  put(seed, 'scripts/c.mjs', OURS_C);
  put(seed, 'scripts/e.mjs', BASE['scripts/e.mjs']);
  put(seed, 'skills/march.md', BASE['skills/march.md']);
  put(seed, 'skills/march.lanes.md', '# march lanes\n\n## lane: weekly\n\nOur own weekly step.\n');
  put(seed, 'skills/custom.md', '# custom\n\nOur own skill; the kit never shipped it.\n');
  put(seed, '.github/workflows/march.yml', fillKit(BASE['.github/workflows/march.yml'], { project: 'acme', branch: 'main' }));
  commit(seed, 'plan: adopt nexus v2');
  git(seed, 'push', '-q', 'origin', 'main');
  const local = tmp('nexus-sync-local-');
  git(local, 'clone', '-q', bare, '.');
  return { bare, seed, local };
}

const MERGED_C = "import { e } from './e.mjs'; // acme patch: c reads e\n// the kit moved one -> two; the repo's acme mode stays\nexport const mode = 'acme'; // acme patch: our mode\nexport const keep = 'the kit keeps this line as it is';\n";
const stubAssist = (calls = []) => async (input) => { calls.push(input); return { text: MERGED_C, reasons: ["mode: kept the repo's acme mode over the kit's 'two'"] }; };
const green = () => [{ name: 'stub gate', ok: true, out: '' }];
const byPath = (report) => Object.fromEntries(report.files.map((f) => [f.path, f]));
const state = (dir) => ({ status: git(dir, 'status', '--porcelain'), head: git(dir, 'rev-parse', 'HEAD'), worktrees: git(dir, 'worktree', 'list', '--porcelain') });

test('the dry sync: replaced, merged, assisted (a diff), new, kept; the local checkout untouched', async () => {
  const k = kitRepo();
  const a = adopter();
  const before = state(a.local);
  const calls = [];
  const { code, report } = await upgrade({ repo: a.local, kit: k.kit, assist: stubAssist(calls), gateFn: green, today: '2026-10-25' });
  assert.equal(code, 0, JSON.stringify(report.error || report.gate));
  assert.equal(report.shape, 'v2');
  assert.match(report.why, /plan\/settle\.json keeps plan\/steps\/01_build_plan\.md/);
  const f = byPath(report);
  assert.equal(f['scripts/a.mjs'].status, 'replaced');
  assert.equal(f['scripts/b.mjs'].status, 'merged');
  assert.equal(f['scripts/c.mjs'].status, 'assisted');
  assert.equal(f['lib/vend.mjs'].status, 'merged');
  assert.match(f['lib/vend.mjs'].note, /vendored at lib\/vend\.mjs/);
  assert.ok(!f['scripts/vend.mjs'], 'a vendored copy at another path is the repo\'s copy, never re-added');
  assert.equal(f['skills/fresh.md'].status, 'new');
  assert.match(f['skills/fresh.md'].note, /new since v2\.0\.0/);
  assert.equal(f['skills/march.lanes.md'].status, 'kept-custom');
  assert.equal(f['skills/custom.md'].status, 'kept-custom');
  assert.equal(f['.github/workflows/march.yml'].status, 'replaced', 'a filled-in copy of the template reads as untouched');
  assert.ok(!f['skills/march.md'], 'unchanged in the kit and in the repo: no row');
  assert.ok(!f['plan/settle.json'], 'settle.json is never touched');
  assert.equal(f['plan/nexus.lock'].status, 'ref moved');
  // The helper got the three versions and the conflicted merge.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, 'scripts/c.mjs');
  assert.match(calls[0].conflicted, /^<{7} /m);
  assert.equal(calls[0].base, BASE['scripts/c.mjs']);
  assert.equal(calls[0].theirs, NOW['scripts/c.mjs']);
  const [as] = report.sync.assisted;
  assert.equal(as.applied, true);
  assert.match(as.diff, /^--- a\/scripts\/c\.mjs$/m);
  assert.match(as.diff, /^\+\/\/ the kit moved one -> two; the repo's acme mode stays$/m);
  assert.deepEqual(as.reasons, ["mode: kept the repo's acme mode over the kit's 'two'"]);
  // A knob the kit grew since the ref arrives conservative; one it had is not rewritten.
  const kn = Object.fromEntries(report.knobs.map((x) => [x.knob, x]));
  assert.equal(kn.loop.status, 'written');
  assert.equal(kn.loop.value, 'off');
  assert.equal(kn.NEXUS_CHAIN_MAX.line, 'gh variable set NEXUS_CHAIN_MAX --body 0');
  assert.ok(!kn.Support, 'Support was a knob at the ref: not new');
  assert.equal(f['scripts/e.mjs'].status, 'replaced');
  assert.equal(f['scripts/d.mjs'].status, 'new');
  assert.equal(f['scripts/z.mjs'].status, 'new', 'the repo takes the kit\'s scripts: a new one comes in');
  assert.deepEqual(report.available, []);
  assert.deepEqual(report.sync.counts, { replaced: 3, merged: 2, assisted: 1, new: 3, kept: 1, same: 1, held: 0, available: 0 });
  const text = render(report);
  assert.match(text, /sync {5}nexus v2\.0\.0 \([0-9a-f]{7}\) -> 2\.1\.0/);
  assert.match(text, /new content \(3 added, 0 available[^\n]*\n {2}\+ scripts\/d\.mjs {2}\(new since v2\.0\.0\)/);
  assert.match(text, /assisted merge: scripts\/c\.mjs\n {2}kept: mode:/);
  assert.match(text, /--write commits this as one commit, plan: sync to nexus <version>/);
  assert.deepEqual(state(a.local), before, 'the local checkout\'s files, index, HEAD and worktree list are unchanged');
  assert.equal(git(a.local, 'branch', '--list', 'nexus/*'), '', 'a dry run makes no branch');
});

test('--write: one `plan: sync to nexus <version>` commit; patches kept, lock comments kept, settle.json untouched', async () => {
  const k = kitRepo();
  const a = adopter();
  const out = sink();
  const code = await runUpgrade(['--repo', a.local, '--write'], { out, err: out, today: '2026-10-25', opts: { kit: k.kit, assist: stubAssist(), gateFn: green } });
  assert.equal(code, 0, out.text());
  const b = syncBranch('2.1.0');
  assert.match(out.text(), new RegExp(`committed [0-9a-f]{7} on ${b.replace(/[.+]/g, '\\$&')}: plan: sync to nexus 2\\.1\\.0`));
  assert.equal(git(a.local, 'rev-list', '--count', `origin/main..${b}`), '1', 'one commit');
  assert.equal(git(a.local, 'log', '-1', '--format=%s', b), syncSubject('2.1.0'));
  const at = (rel) => git(a.local, 'show', `${b}:${rel}`);
  assert.equal(`${at('scripts/a.mjs')}\n`, NOW['scripts/a.mjs'], 'untouched: the kit now');
  assert.match(at('scripts/b.mjs'), /acme patch: our own first line/, 'the local patch survives the clean merge');
  assert.match(at('scripts/b.mjs'), /the kit moved line 11/, '...and the kit change lands');
  assert.equal(`${at('scripts/c.mjs')}\n`, MERGED_C, 'the assisted merge, applied with the gate green');
  assert.match(at('lib/vend.mjs'), /acme patch: a vendored fix/);
  assert.match(at('lib/vend.mjs'), /the kit moved line 9/);
  assert.equal(`${at('skills/fresh.md')}\n`, NOW['skills/fresh.md']);
  assert.equal(at('skills/march.lanes.md'), '# march lanes\n\n## lane: weekly\n\nOur own weekly step.', 'lanes untouched');
  assert.equal(at('skills/custom.md'), '# custom\n\nOur own skill; the kit never shipped it.', 'custom skill untouched');
  assert.match(at('.github/workflows/march.yml'), /# acme's loop on main\n[\s\S]*cron: '17 \*\/3 \* \* \*'/);
  assert.equal(`${at('plan/settle.json')}\n`, SETTLE, 'settle.json untouched');
  const lock = `${at('plan/nexus.lock')}\n`;
  assert.equal(lock, LOCK.replace('version: 2.0.0', 'version: 2.1.0').replace('ref: v2.0.0 #', `ref: ${k.head} #`), 'only ref and version move; the header comments stay');
  assert.match(at('plan/bearings.md'), /^- loop: off$/m);
  const changed = git(a.local, 'diff', '--name-only', `origin/main..${b}`).split('\n').sort();
  assert.deepEqual(changed, ['.github/workflows/march.yml', 'lib/vend.mjs', 'plan/bearings.md', 'plan/nexus.lock', 'scripts/a.mjs', 'scripts/b.mjs', 'scripts/c.mjs', 'scripts/d.mjs', 'scripts/e.mjs', 'scripts/z.mjs', 'skills/fresh.md']);
  assert.equal(git(a.local, 'worktree', 'list').split('\n').length, 1, 'the temporary worktree is gone');
  assert.equal(git(a.local, 'status', '--porcelain'), '');
});

test('a repo that vendored only some kit scripts: the rest stay available, unless code it keeps now imports one', async () => {
  const k = kitRepo();
  const a = adopter({ partial: true });
  const { code, report } = await upgrade({ repo: a.local, kit: k.kit, assist: stubAssist(), gateFn: green, write: true, today: '2026-10-25' });
  assert.equal(code, 0, JSON.stringify(report.error || report.gate));
  const f = byPath(report);
  assert.equal(f['scripts/e.mjs'].status, 'replaced');
  assert.equal(f['scripts/d.mjs'].status, 'new');
  assert.equal(f['scripts/d.mjs'].note, 'needed by scripts/e.mjs', 'the kit\'s e.mjs now imports d.mjs: it comes in');
  assert.equal(f['skills/fresh.md'].status, 'new', 'the repo takes the kit\'s skills: a new one comes in');
  assert.deepEqual(report.available, [
    { path: 'scripts/a.mjs', note: 'the repo did not take it at v2.0.0' },
    { path: 'scripts/b.mjs', note: 'the repo did not take it at v2.0.0' },
    { path: 'scripts/vend.mjs', note: 'the repo did not take it at v2.0.0' },
    { path: 'scripts/z.mjs', note: 'new since v2.0.0; the repo takes no kit script files' },
  ]);
  const b = syncBranch('2.1.0');
  const changed = git(a.local, 'diff', '--name-only', `origin/main..${b}`).split('\n').sort();
  assert.deepEqual(changed, ['.github/workflows/march.yml', 'plan/bearings.md', 'plan/nexus.lock', 'scripts/c.mjs', 'scripts/d.mjs', 'scripts/e.mjs', 'skills/fresh.md']);
  assert.match(render(report), /new content \(2 added, 4 available: the kit has them, the repo has not taken them\)[\s\S]*\n {2}\? scripts\/z\.mjs {2}\(new since v2\.0\.0; the repo takes no kit script files; copy it by hand to take it\)/);
});

test('a red gate with the assisted merge applied leaves that file as the repo\'s and lists it', async () => {
  const k = kitRepo();
  const a = adopter();
  const gateFn = (dir) => (get(dir, 'scripts/c.mjs').includes('the kit moved one') ? [{ name: 'stub gate', ok: false, out: 'c.mjs broke it' }] : green());
  const { code, report } = await upgrade({ repo: a.local, kit: k.kit, assist: stubAssist(), gateFn, write: true, today: '2026-10-25' });
  assert.equal(code, 0, 'green without it');
  assert.equal(byPath(report)['scripts/c.mjs'].status, 'assisted, not applied (gate red with it)');
  assert.equal(report.sync.assisted[0].applied, false);
  assert.ok(report.warnings.some((w) => /gate was red with every assisted merge applied \(stub gate\); 0 of 1 pass it, and scripts\/c\.mjs stays as the repo's/.test(w)), report.warnings.join('\n'));
  assert.match(render(report), /gate with every assisted merge applied \(why some stay as the repo's\)\n {2}RED {4}stub gate\n {9}c\.mjs broke it/);
  const b = syncBranch('2.1.0');
  assert.match(git(a.local, 'show', `${b}:scripts/c.mjs`), /acme patch: our mode$/m, 'left as ours');
  const changed = git(a.local, 'diff', '--name-only', `origin/main..${b}`).split('\n');
  assert.ok(!changed.includes('scripts/c.mjs'));
  assert.equal(byPath(report)['scripts/e.mjs'].status, 'held back', 'the code c.mjs imports waits with it');
  assert.ok(!changed.includes('scripts/e.mjs'));
  assert.match(render(report), /not applied: the gate was red with it/);
});

test('a red gate with several assisted merges keeps the ones it passes: families tried by halves', async () => {
  const k = kitRepo();
  put(k.dir, 'templates/skills/march.md', "# march\n\nThe kit's march, moved on.\n");
  k.kit.build.ref = commit(k.dir, 'feat: the kit\'s march moves');
  const a = adopter();
  put(a.seed, 'skills/march.md', "# march\n\nThe kit's march, as acme runs it.\n");
  commit(a.seed, 'docs: our march');
  git(a.seed, 'push', '-q', 'origin', 'main');
  const MERGED_MARCH = "# march\n\nThe kit's march, as acme runs it.\n\n(The kit's march moved on.)\n";
  const assist = async (x) => (x.path === 'skills/march.md' ? { text: MERGED_MARCH, reasons: ['the line: kept acme\'s'] } : { text: MERGED_C, reasons: ['mode: kept acme\'s'] });
  let runs = 0;
  const gateFn = (dir) => { runs += 1; return get(dir, 'scripts/c.mjs').includes('the kit moved one') ? [{ name: 'stub gate', ok: false, out: 'c.mjs broke it' }] : green(); };
  const { code, report } = await upgrade({ repo: a.local, kit: k.kit, assist, gateFn, write: true, today: '2026-10-25' });
  assert.equal(code, 0, JSON.stringify(report.error || report.gate));
  const f = byPath(report);
  assert.equal(f['skills/march.md'].status, 'assisted', 'the gate passes it alone');
  assert.equal(f['scripts/c.mjs'].status, 'assisted, not applied (gate red with it)');
  assert.equal(f['scripts/e.mjs'].status, 'held back');
  assert.equal(runs, 3, 'all (red), then each half: c.mjs (red), march.md (green, the state that stays)');
  assert.ok(report.warnings.some((w) => /1 of 2 pass it, and scripts\/c\.mjs stays as the repo's/.test(w)), report.warnings.join('\n'));
  const b = syncBranch('2.1.0');
  assert.equal(`${git(a.local, 'show', `${b}:skills/march.md`)}\n`, MERGED_MARCH);
  assert.match(git(a.local, 'show', `${b}:scripts/c.mjs`), /acme patch: our mode$/m);
});

test('a gate red without any assisted merge exits 1, keeps the worktree, commits nothing', async () => {
  const k = kitRepo();
  const a = adopter();
  const { code, report } = await upgrade({ repo: a.local, kit: k.kit, assist: null, gateFn: () => [{ name: 'stub gate', ok: false, out: 'no' }], write: true });
  assert.equal(code, 1);
  assert.ok(report.worktree && fs.existsSync(report.worktree));
  assert.equal(git(a.local, 'branch', '--list', 'nexus/*'), '');
  assert.equal(byPath(report)['scripts/c.mjs'].status, 'conflict, left as ours', '--no-assist');
  git(a.local, 'worktree', 'remove', '--force', report.worktree);
});

test('no helper (--no-assist), or a helper that fails: the conflict stays as the repo\'s, with a warning', async () => {
  const k = kitRepo();
  const a = adopter();
  const out = sink();
  assert.equal(await runUpgrade(['--repo', a.local, '--no-assist'], { out, err: out, opts: { kit: k.kit, gateFn: green } }), 0, out.text());
  assert.match(out.text(), /conflict, left as ours\s+scripts\/c\.mjs {2}\(1 conflicting hunk; no assisted merge \(--no-assist\)\)/);
  // c.mjs imports e.mjs: code moves as a family, so the kit's e.mjs waits for c.mjs (else c would run on a moved e).
  assert.match(out.text(), /held back\s+scripts\/e\.mjs {2}\(coupled by imports to scripts\/c\.mjs, which stays as the repo's\)/);
  assert.match(out.text(), /1 kit file held back with the code it is coupled to \(scripts\/c\.mjs\)/);
  const bad = await upgrade({ repo: a.local, kit: k.kit, assist: async () => ({ text: '<<<<<<< x\n', reasons: [] }), gateFn: green });
  assert.match(byPath(bad.report)['scripts/c.mjs'].note, /still holds conflict markers/);
  // A merge that loses a line the repo wrote (its marked patch) is not applied: nothing the adopter wrote is dropped.
  const lossy = await upgrade({ repo: a.local, kit: k.kit, assist: async () => ({ text: NOW['scripts/c.mjs'], reasons: ['took the kit'] }), gateFn: green });
  assert.equal(byPath(lossy.report)['scripts/c.mjs'].status, 'conflict, left as ours');
  assert.match(byPath(lossy.report)['scripts/c.mjs'].note, /dropped 2 lines the repo wrote \("import \{ e \} from '\.\/e\.mjs'; \/\/ acme patch: c reads e", \.\.\.\)/);
  const thrown = await upgrade({ repo: a.local, kit: k.kit, assist: async () => { throw new Error('no login'); }, gateFn: green });
  assert.match(byPath(thrown.report)['scripts/c.mjs'].note, /assisted merge failed: no login/);
});

test('a lock already at the kit\'s ref is current; a lock with no ref is already on v2; a ref out of reach exits 2', async () => {
  const k = kitRepo();
  const a = adopter();
  put(a.seed, 'plan/nexus.lock', LOCK.replace('ref: v2.0.0', `ref: ${k.head}`));
  commit(a.seed, 'plan: sync');
  git(a.seed, 'push', '-q', 'origin', 'main');
  const cur = await upgrade({ repo: a.local, kit: k.kit, gateFn: green });
  assert.equal(cur.code, 0);
  assert.match(render(cur.report), /already on nexus 2\.1\.0: .*Nothing to sync\./);
  put(a.seed, 'plan/nexus.lock', 'kit: nexus\nshape: chunks\n');
  commit(a.seed, 'plan: no ref');
  git(a.seed, 'push', '-q', 'origin', 'main');
  assert.match(render((await upgrade({ repo: a.local, kit: k.kit })).report), /already on v2: .*names no ref: to sync from/);
  put(a.seed, 'plan/nexus.lock', LOCK.replace('ref: v2.0.0', 'ref: v9.9.9'));
  commit(a.seed, 'plan: a ref the kit never had');
  git(a.seed, 'push', '-q', 'origin', 'main');
  const far = await upgrade({ repo: a.local, kit: k.kit, baseOpts: { nexus: k.dir, url: path.join(k.dir, 'nowhere') } });
  assert.equal(far.code, 2);
  assert.match(far.report.error, /cannot read the kit at v9\.9\.9/);
});

test('an older CLI on a repo a newer one already moved: refused, nothing written', async () => {
  const k = kitRepo();
  const a = adopter();
  put(a.seed, 'plan/nexus.lock', LOCK.replace('ref: v2.0.0', `ref: ${k.head}`).replace('version: 2.0.0', 'version: 2.1.0'));
  commit(a.seed, 'plan: sync to nexus 2.1.0');
  git(a.seed, 'push', '-q', 'origin', 'main');
  const tagged = git(k.dir, 'rev-parse', 'v2.0.0^{commit}');
  const old = { ...k.kit, build: { ref: tagged, version: '2.0.0' } };
  const before = state(a.local);
  const originBefore = git(a.bare, 'rev-parse', 'main');
  const calls = [];
  const r = await upgrade({ repo: a.local, kit: old, write: true, assist: stubAssist(calls), gateFn: green });
  assert.equal(r.code, 0);
  assert.match(render(r.report), /this CLI's kit \(2\.0\.0\) is older than the repo's \(2\.1\.0\)/);
  assert.equal(r.report.commit, null);
  assert.equal(calls.length, 0);
  assert.deepEqual(state(a.local), before);
  assert.equal(git(a.bare, 'rev-parse', 'main'), originBefore);
  assert.doesNotMatch(git(a.local, 'branch', '--list', 'nexus/*'), /nexus\/upgrade/);
  // A fetched kit (no nexus checkout to ask): the lock's version core against the build's.
  assert.equal(kitAhead({ at: { sha: 'a'.repeat(40), from: 'fetched' }, build: { ref: 'b'.repeat(40), version: '2.0.0+abc1234' }, lockVersion: '2.1.0+def5678' }), true);
  assert.equal(kitAhead({ at: { sha: 'a'.repeat(40), from: 'fetched' }, build: { ref: 'b'.repeat(40), version: '2.1.0' }, lockVersion: '2.0.0' }), false);
});

test('kitAt: the local history, else a shallow fetch of the kit repo', () => {
  const k = kitRepo();
  const local = kitAt('v2.0.0', { nexus: k.dir });
  assert.equal(local.from, 'local');
  assert.equal(local.read('templates/scripts/c.mjs'), BASE['scripts/c.mjs']);
  assert.equal(local.read('templates/skills/fresh.md'), null, 'not at the ref');
  assert.deepEqual(local.list('templates/.github/workflows'), ['march.yml']);
  const fetched = kitAt('v2.0.0', { nexus: null, url: pathToFileURL(k.dir).href });
  try {
    assert.equal(fetched.from, 'fetched');
    assert.equal(fetched.sha, local.sha);
    assert.equal(fetched.read('templates/scripts/c.mjs'), BASE['scripts/c.mjs']);
    assert.equal(fetched.read('templates/skills/fresh.md'), null);
    assert.deepEqual(fetched.list('templates/.github/workflows'), ['march.yml']);
  } finally { fetched.remove(); }
  assert.throws(() => kitAt('v9.9.9', { nexus: k.dir, url: pathToFileURL(k.dir).href }), /cannot read the kit at v9\.9\.9/);
  const b = kitBuild(k.dir);
  assert.equal(b.ref, k.head);
  assert.equal(b.version, `2.0.0+${k.head.slice(0, 7)}`, 'past the tag: the tag plus the short sha');
});

test('the pieces: bumpLock, merge3, likeness and relocation, the helper\'s answer, detect', async () => {
  assert.equal(bumpLock(LOCK, { ref: 'abc', version: '2.1.0' }), LOCK.replace('version: 2.0.0', 'version: 2.1.0').replace('ref: v2.0.0 #', 'ref: abc #'));
  assert.equal(bumpLock('kit: nexus\nshape: chunks\n', { ref: 'abc', version: '2.1.0' }), 'kit: nexus\nshape: chunks\nversion: 2.1.0\nref: abc\n');
  const clean = merge3({ ours: 'a1\nb\nc\nd\ne\n', base: 'a\nb\nc\nd\ne\n', theirs: 'a\nb\nc\nd\ne1\n' });
  assert.deepEqual(clean, { text: 'a1\nb\nc\nd\ne1\n', conflicts: 0 });
  assert.equal(merge3({ ours: 'x\n', base: 'a\n', theirs: 'y\n' }).conflicts, 1);
  assert.ok(likeness(BASE['scripts/vend.mjs'], BASE['scripts/vend.mjs'].replace('line2', 'lineX')) > 0.8);
  assert.equal(likeness(BASE['scripts/vend.mjs'], 'nothing alike at all, not one line\n'), 0);
  const d = tmp('nexus-sync-reloc-');
  put(d, 'lib/vend.mjs', BASE['scripts/vend.mjs']);
  put(d, 'other/vend.mjs', 'export const unrelated = "a file that only shares the name";\n');
  const index = new Map([['vend.mjs', ['lib/vend.mjs', 'other/vend.mjs']]]);
  assert.equal(relocated(d, { repo: 'scripts/vend.mjs' }, BASE['scripts/vend.mjs'], { index, taken: new Set() }), 'lib/vend.mjs');
  assert.equal(relocated(d, { repo: 'scripts/vend.mjs' }, BASE['scripts/vend.mjs'], { index, taken: new Set(['lib/vend.mjs']) }), null);
  assert.deepEqual(parseAssist('chatter\n<<<MERGED\nx\ny\nMERGED>>>\nREASONS:\n- top: kept ours\n- end: kept ours too\n'), { text: 'x\ny\n', reasons: ['top: kept ours', 'end: kept ours too'] });
  assert.equal(parseAssist('no shape'), null);
  // The default helper is one headless turn; its answer is parsed the same way (the Agent SDK stubbed).
  let prompt = null;
  const query = ({ prompt: q }) => (async function* run() {
    for await (const m of q) { prompt = m.message.content; break; }
    yield { type: 'result', subtype: 'success', is_error: false, result: '<<<MERGED\nmerged\nMERGED>>>\nREASONS:\n- a: b\n', session_id: 's' };
  })();
  const r = await modelAssist({ path: 'scripts/c.mjs', base: 'b\n', theirs: 't\n', ours: 'o\n', conflicted: '<<<<<<< x\n' }, { query });
  assert.deepEqual(r, { text: 'merged\n', reasons: ['a: b'] });
  assert.match(JSON.stringify(prompt), /<<<BASE\\nb\\nBASE>>>/);
  // A lock saying chunks beside plan/steps is half-done, unless plan/settle.json keeps a queue there.
  const h = tmp('nexus-sync-detect-');
  put(h, 'plan/nexus.lock', 'kit: nexus\nshape: chunks\n');
  put(h, 'plan/steps/01_build_plan.md', '# q\n');
  assert.equal(detect(h).shape, 'half');
  put(h, 'plan/settle.json', SETTLE);
  assert.equal(detect(h).shape, 'v2');
});

test('--write on a v1 repo takes the v1 path (one upgrade commit on nexus/upgrade-v2), not the sync', async () => {
  const bare = tmp('nexus-sync-v1-origin-');
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  const seed = tmp('nexus-sync-v1-seed-');
  git(seed, 'init', '-q', '-b', 'main');
  git(seed, 'remote', 'add', 'origin', bare);
  put(seed, 'plan/steps/01_build_plan.md', '# 01 — Build plan\n\n## Status (at-a-glance)\n\n- [ ] Phase 1 — One\n');
  commit(seed, 'plan: v1');
  git(seed, 'push', '-q', 'origin', 'main');
  const local = tmp('nexus-sync-v1-local-');
  git(local, 'clone', '-q', bare, '.');
  const r = await upgrade({ repo: local, write: true });
  assert.equal(r.code, 0, JSON.stringify(r.report.gate, null, 2) + (r.report.error || ''));
  assert.equal(r.report.sync, undefined);
  assert.deepEqual([r.report.commit.branch, r.report.commit.subject], ['nexus/upgrade-v2', 'plan: upgrade to nexus v2 (specs + chunks)']);
  assert.equal(git(local, 'worktree', 'list').split('\n').length, 1);
});
