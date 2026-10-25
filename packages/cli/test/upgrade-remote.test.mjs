// `nexus upgrade --repo owner/name [--pr]` (spec 58, A13): a repo on GitHub upgraded with no local checkout. A
// blobless temporary clone, the same report as a local run, and with --pr a pushed `nexus/upgrade-<version>` branch
// and a pull request whose body is the report; without push access it forks; a second run updates the open pull
// request in place (branch force-updated, a comment saying what changed), never a second one; a red gate opens
// nothing and keeps the clone. Real git over local bare remotes (file:// URLs, filters allowed), a local kit repo and a
// stubbed gh that records every call and keeps the pull requests it was asked to open. Nothing reaches GitHub.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runUpgrade, upgrade } from '../server/upgrade.mjs';
import { BODY_MAX, parseRemote, prBody, upgradeAt } from '../server/upgrade-remote.mjs';
import { syncBranch, syncSubject } from '../server/sync.mjs';

const scratch = [];
after(() => { for (const d of scratch) fs.rmSync(d, { recursive: true, force: true, maxRetries: 5 }); });
const tmp = (p) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); scratch.push(d); return d; };

const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' };
const git = (cwd, ...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd, env, encoding: 'utf8', stdio: 'pipe' }).trim();
const put = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const commit = (dir, msg) => { git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', msg); return git(dir, 'rev-parse', 'HEAD'); };
const sink = () => { const lines = []; const f = (s) => lines.push(s); f.text = () => lines.join('\n'); return f; };
const branchOf = (bare, b) => { try { return git(bare, 'rev-parse', '--verify', '--quiet', `refs/heads/${b}`); } catch { return null; } };

const BASE = {
  'scripts/a.mjs': "export const a = 'the kit at v2.0.0';\n",
  'scripts/c.mjs': "export const mode = 'one';\nexport const keep = 'the kit keeps this line as it is';\n",
  'skills/march.md': "# march\n\nThe kit's march.\n",
  'plan/nexus.lock': 'kit: nexus\nversion: 2.0.0\nref: v2.0.0\nshape: chunks\nadopted: YYYY-MM-DD\n',
  'plan/bearings.md': '# Bearings\n\n- Support: triage-only\n',
};
const NOW = {
  ...BASE,
  'scripts/a.mjs': "export const a = 'the kit now';\n",
  'scripts/c.mjs': "export const mode = 'two';\nexport const keep = 'the kit keeps this line as it is';\n",
  'skills/fresh.md': '# fresh\n\nA skill the kit added after v2.0.0.\n',
};
const FILES = [['scripts/a.mjs', 'script'], ['scripts/c.mjs', 'script'], ['skills/march.md', 'skill'], ['skills/fresh.md', 'skill']]
  .map(([rel, kind]) => ({ kit: `templates/${rel}`, repo: rel, kind }));
const OURS_C = "export const mode = 'acme'; // acme patch: our mode\nexport const keep = 'the kit keeps this line as it is';\n";
const MERGED_C = "// the kit moved one -> two; the repo's acme mode stays\nexport const mode = 'acme'; // acme patch: our mode\nexport const keep = 'the kit keeps this line as it is';\n";
const assist = async () => ({ text: MERGED_C, reasons: ["mode: kept the repo's acme mode over the kit's 'two'"] });
const green = () => [{ name: 'stub gate', ok: true, out: '' }];
const VERSION = '2.1.0';
const BRANCH = syncBranch(VERSION);

/** A nexus-like kit repo: templates/ at a v2.0.0 tag, then the kit now. */
function kitRepo() {
  const dir = tmp('nexus-remote-kit-');
  git(dir, 'init', '-q', '-b', 'main');
  for (const [rel, text] of Object.entries(BASE)) put(dir, `templates/${rel}`, text);
  commit(dir, 'feat: the kit at v2.0.0');
  git(dir, 'tag', 'v2.0.0');
  for (const [rel, text] of Object.entries(NOW)) put(dir, `templates/${rel}`, text);
  const head = commit(dir, 'feat: the kit now');
  return { root: path.join(dir, 'templates'), files: FILES, sync: [], build: { ref: head, version: VERSION }, nexus: dir, text: null, from: 'templates' };
}

/** A v2 adopter on a bare origin that serves filtered (blobless) clones; `seed` pushes to it. */
function adopter() {
  const bare = tmp('nexus-remote-origin-');
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  git(bare, 'config', 'uploadpack.allowFilter', 'true');
  git(bare, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
  const seed = tmp('nexus-remote-seed-');
  git(seed, 'init', '-q', '-b', 'main');
  git(seed, 'remote', 'add', 'origin', bare);
  put(seed, 'package.json', '{ "name": "acme" }\n');
  put(seed, 'plan/nexus.lock', 'kit: nexus\nversion: 2.0.0\nref: v2.0.0\nshape: chunks\nadopted: 2026-10-21\n');
  put(seed, 'plan/bearings.md', '# Acme bearings\n\n- Support: triage-only\n');
  put(seed, 'scripts/a.mjs', BASE['scripts/a.mjs']);
  put(seed, 'scripts/c.mjs', OURS_C);
  put(seed, 'skills/march.md', BASE['skills/march.md']);
  put(seed, 'skills/custom.md', '# custom\n\nOur own skill.\n');
  commit(seed, 'plan: adopt nexus v2');
  git(seed, 'push', '-q', 'origin', 'main');
  return { bare, seed };
}

/**
 * A stubbed gh: `perm` is the viewer's permission on acme/app; `fork()` makes the fork's bare remote (gh repo fork).
 * It keeps the pull requests it opened and answers `pr list` from them. Every call is in `calls`; a --body-file is
 * read at the call (the upgrade removes it after).
 */
function fakeGh({ perm = 'WRITE', login = 'me', fork = () => {} } = {}) {
  const calls = [];
  const prs = [];
  const comments = [];
  const ok = (out = '') => ({ ok: true, out, err: '' });
  const opt = (args, name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const body = (args) => fs.readFileSync(opt(args, '--body-file'), 'utf8');
  const gh = (args, o = {}) => {
    calls.push({ args, cwd: o.cwd });
    const [a, b] = args;
    if (a === 'repo' && b === 'view') return ok(JSON.stringify({ nameWithOwner: args[2] && !args[2].startsWith('-') ? args[2] : 'acme/app', viewerPermission: perm }));
    if (a === 'repo' && b === 'fork') { fork(); return ok(''); }
    if (a === 'api') return ok(login);
    if (a === 'pr' && b === 'list') return ok(JSON.stringify(prs.filter((p) => p.state === 'OPEN').map(({ number, url, headRefName, headRepositoryOwner, title }) => ({ number, url, headRefName, headRepositoryOwner, title }))));
    if (a === 'pr' && b === 'create') {
      const head = opt(args, '--head');
      const [owner, ref] = head.includes(':') ? head.split(':') : ['acme', head];
      const number = prs.length + 1;
      prs.push({ number, url: `https://github.com/acme/app/pull/${number}`, headRefName: ref, headRepositoryOwner: { login: owner }, title: opt(args, '--title'), base: opt(args, '--base'), body: body(args), state: 'OPEN' });
      return ok(`Creating pull request for ${head} into main\n\nhttps://github.com/acme/app/pull/${number}`);
    }
    if (a === 'pr' && b === 'edit') { const p = prs.find((x) => x.number === Number(args[2])); p.title = opt(args, '--title'); p.body = body(args); return ok(''); }
    if (a === 'pr' && b === 'comment') { comments.push({ number: Number(args[2]), body: body(args) }); return ok(''); }
    return { ok: false, out: '', err: `the stub has no answer for gh ${args.join(' ')}` };
  };
  return { gh, calls, prs, comments, made: () => calls.filter((c) => c.args[0] === 'pr' && c.args[1] === 'create').length };
}

const fileUrl = (dir) => pathToFileURL(dir).href;
const opts = (extra) => ({ kit: kitRepo(), assist, gateFn: green, today: '2026-10-25', ...extra });
const clones = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('nexus-upgrade-clone-')).length;

test('parseRemote: owner/name and GitHub URLs; anything else is not a GitHub repo', () => {
  for (const s of ['acme/app', 'https://github.com/acme/app', 'https://github.com/acme/app.git', 'git@github.com:acme/app.git', 'github.com/acme/app/', 'ssh://git@github.com/acme/app.git', 'https://x-access-token:t@github.com/acme/app.git']) {
    assert.deepEqual(parseRemote(s), { owner: 'acme', name: 'app', slug: 'acme/app' }, s);
  }
  assert.equal(parseRemote('acme/my.site').slug, 'acme/my.site');
  for (const s of ['a/b/c', './x', 'C:\\work\\app', 'https://gitlab.com/acme/app', 'acme/..', '', 'acme']) assert.equal(parseRemote(s), null, s);
});

test('a GitHub repo, dry: a blobless temporary clone, the same report as a local run, the clone removed', async () => {
  const a = adopter();
  const kit = kitRepo();
  const local = tmp('nexus-remote-local-');
  git(local, 'clone', '-q', a.bare, '.');
  const near = await upgrade({ repo: local, kit, assist, gateFn: green, today: '2026-10-25' });
  assert.equal(near.code, 0, JSON.stringify(near.report.error || near.report.gate));
  const before = clones();
  const f = fakeGh();
  const far = await upgradeAt({ remote: parseRemote('acme/app'), kit, assist, gateFn: green, today: '2026-10-25', gh: f.gh, urlOf: () => fileUrl(a.bare) });
  assert.equal(far.code, 0, JSON.stringify(far.report.error || far.report.gate));
  for (const k of ['shape', 'files', 'warnings', 'gate', 'knobs', 'available', 'dispatch']) assert.deepEqual(far.report[k], near.report[k], k);
  assert.deepEqual(far.report.sync.counts, near.report.sync.counts);
  assert.deepEqual(far.report.sync.assisted, near.report.sync.assisted);
  assert.equal(far.report.repo, 'acme/app');
  assert.deepEqual(far.report.remote, { slug: 'acme/app', clone: null });
  assert.equal(clones(), before, 'the temporary clone is removed');
  assert.equal(f.calls.length, 0, 'a dry run asks gh nothing');
  assert.equal(branchOf(a.bare, BRANCH), null, 'nothing pushed');

  const out = sink();
  assert.equal(await runUpgrade(['--repo', 'https://github.com/acme/app'], { out, err: out, today: '2026-10-25', opts: { kit, assist, gateFn: green, gh: f.gh, urlOf: () => fileUrl(a.bare) } }), 0, out.text());
  assert.match(out.text(), /dry run \(nothing written; no local checkout: a blobless temporary clone of the GitHub repo\)/);
  assert.match(out.text(), /repo {5}acme\/app/);
  assert.match(out.text(), /--pr commits this, pushes it as a branch and opens a pull request/);
});

test('--pr with push access: the branch on the repo, a pull request whose body is the report', async () => {
  const a = adopter();
  const f = fakeGh();
  const out = sink();
  const code = await runUpgrade(['--repo', 'acme/app', '--pr'], { out, err: out, opts: opts({ gh: f.gh, urlOf: () => fileUrl(a.bare) }) });
  assert.equal(code, 0, out.text());
  const head = branchOf(a.bare, BRANCH);
  assert.ok(head, 'nexus/upgrade-<version> pushed to the repo');
  assert.equal(git(a.bare, 'rev-list', '--count', `main..${BRANCH}`), '1');
  assert.equal(git(a.bare, 'log', '-1', '--format=%s', BRANCH), syncSubject(VERSION));
  assert.equal(f.made(), 1);
  const [pr] = f.prs;
  assert.equal(pr.headRefName, BRANCH);
  assert.equal(pr.base, 'main');
  assert.equal(pr.title, syncSubject(VERSION));
  assert.match(pr.body, /^Opened by `npx @usenexus\/cli upgrade --repo acme\/app --pr`: the sync of this repo's nexus kit from `v2\.0\.0` to 2\.1\.0/);
  assert.match(pr.body, /\| assisted \| `scripts\/c\.mjs` \| 1 conflicting hunk merged by the helper \|/);
  assert.match(pr.body, /\| replaced \| `scripts\/a\.mjs` \|/);
  assert.match(pr.body, /## Assisted merge: `scripts\/c\.mjs`\n\nKept from the repo:\n\n- mode: kept the repo's acme mode over the kit's 'two'\n\n```diff\n--- a\/scripts\/c\.mjs/);
  assert.match(pr.body, /## New content \(1 added, 0 available\)\n\n- added `skills\/fresh\.md` \(new since v2\.0\.0\)/);
  assert.match(pr.body, /## Gate\n\n- green: stub gate/);
  assert.match(pr.body, /## First tick \(predicted\)\n\n- /);
  assert.ok(!f.calls.some((c) => c.args[0] === 'repo' && c.args[1] === 'fork'), 'no fork with push access');
  assert.match(out.text(), /pull request\n {2}opened #1 {2}https:\/\/github\.com\/acme\/app\/pull\/1\n {2}nexus\/upgrade-2\.1\.0 pushed to the repo/);
  assert.equal(branchOf(a.bare, 'main'), git(a.seed, 'rev-parse', 'HEAD'), 'the default branch is untouched');
});

test('a second run updates the open pull request in place: branch force-updated, a comment, never a second one', async () => {
  const a = adopter();
  const f = fakeGh();
  const kit = kitRepo();
  const run = async () => { const out = sink(); const code = await runUpgrade(['--repo', 'acme/app', '--pr'], { out, err: out, opts: opts({ kit, gh: f.gh, urlOf: () => fileUrl(a.bare) }) }); assert.equal(code, 0, out.text()); return out.text(); };
  await run();
  const first = branchOf(a.bare, BRANCH);
  // The repo moves on before the next run.
  put(a.seed, 'README.md', '# acme\n');
  const tip = commit(a.seed, 'docs: a readme');
  git(a.seed, 'push', '-q', 'origin', 'main');
  const text = await run();
  assert.equal(f.made(), 1, 'never a second pull request');
  const second = branchOf(a.bare, BRANCH);
  assert.notEqual(second, first, 'the branch is force-updated');
  assert.equal(git(a.bare, 'rev-parse', `${BRANCH}^`), tip, 'the new result sits on the default branch\'s new tip');
  assert.equal(f.comments.length, 1);
  assert.match(f.comments[0].body, new RegExp(`force-updated \`${BRANCH.replace(/[.+]/g, '\\$&')}\`: \`${first.slice(0, 7)}\` -> \`${second.slice(0, 7)}\``));
  assert.match(f.comments[0].body, /Files that differ from the last run's result \(1\):\n\n- A `README\.md`/);
  assert.ok(f.calls.some((c) => c.args[0] === 'pr' && c.args[1] === 'edit' && c.args[2] === '1'), 'title and body rewritten');
  assert.match(text, /updated #1 {2}https:\/\/github\.com\/acme\/app\/pull\/1/);

  // Nothing new since: the branch already holds this result; nothing pushed, no comment.
  const third = await run();
  assert.equal(branchOf(a.bare, BRANCH), second);
  assert.equal(f.comments.length, 1);
  assert.equal(f.made(), 1);
  assert.match(third, /#1 already holds this result/);
});

test('no push access: it forks and opens the pull request from the fork; the next run updates that one', async () => {
  const a = adopter();
  const forkBare = tmp('nexus-remote-fork-');
  const f = fakeGh({ perm: 'READ', fork: () => { if (!fs.existsSync(path.join(forkBare, 'HEAD'))) git(forkBare, 'clone', '-q', '--bare', a.bare, '.'); } });
  const urlOf = (slug) => fileUrl(slug === 'me/app' ? forkBare : a.bare);
  const out = sink();
  assert.equal(await runUpgrade(['--repo', 'acme/app', '--pr'], { out, err: out, opts: opts({ gh: f.gh, urlOf }) }), 0, out.text());
  assert.equal(branchOf(a.bare, BRANCH), null, 'nothing pushed to the repo itself');
  assert.ok(branchOf(forkBare, BRANCH), 'the branch is on the fork');
  const create = f.calls.find((c) => c.args[0] === 'pr' && c.args[1] === 'create').args;
  assert.equal(create[create.indexOf('--head') + 1], `me:${BRANCH}`);
  assert.equal(create[create.indexOf('--repo') + 1], 'acme/app');
  assert.match(out.text(), /pushed to your fork \(no push access to the repo\)/);

  put(a.seed, 'README.md', '# acme\n');
  commit(a.seed, 'docs: a readme');
  git(a.seed, 'push', '-q', 'origin', 'main');
  const again = sink();
  assert.equal(await runUpgrade(['--repo', 'acme/app', '--pr'], { out: again, err: again, opts: opts({ gh: f.gh, urlOf }) }), 0, again.text());
  assert.equal(f.made(), 1);
  assert.match(again.text(), /updated #1/);
  assert.equal(branchOf(a.bare, BRANCH), null);
});

test('a red gate opens nothing: no push, no pull request, the blobless clone kept and its path printed', async () => {
  const a = adopter();
  const f = fakeGh();
  const out = sink();
  const red = () => [{ name: 'stub gate', ok: false, out: 'no' }];
  const code = await runUpgrade(['--repo', 'acme/app', '--pr'], { out, err: out, opts: opts({ gh: f.gh, urlOf: () => fileUrl(a.bare), gateFn: red, assist: null }) });
  assert.equal(code, 1, out.text());
  assert.equal(branchOf(a.bare, BRANCH), null);
  assert.ok(!f.calls.some((c) => c.args[0] === 'pr'), 'no pull request call');
  assert.match(out.text(), /none opened: the gate is red: nothing pushed, nothing opened/);
  const kept = /clone kept: (.+)$/m.exec(out.text())?.[1];
  assert.ok(kept && fs.existsSync(kept), out.text());
  scratch.push(kept);
  assert.equal(git(kept, 'config', 'remote.origin.promisor'), 'true', 'a partial clone');
  assert.equal(git(kept, 'config', 'remote.origin.partialclonefilter'), 'blob:none', 'blobless');
  const wt = /worktree kept: (.+)$/m.exec(out.text())?.[1];
  if (wt) { git(kept, 'worktree', 'remove', '--force', wt); }
});

test('--pr from a local checkout pushes to its origin; --write on a GitHub repo without --pr is refused', async () => {
  const a = adopter();
  const local = tmp('nexus-remote-here-');
  git(local, 'clone', '-q', a.bare, '.');
  const f = fakeGh();
  const out = sink();
  assert.equal(await runUpgrade(['--repo', local, '--pr'], { out, err: out, opts: opts({ gh: f.gh, urlOf: () => { throw new Error('a local --pr pushes to its own origin'); } }) }), 0, out.text());
  assert.ok(branchOf(a.bare, BRANCH));
  assert.ok(f.calls.some((c) => c.args[0] === 'repo' && c.args[1] === 'view' && c.cwd === local), 'the slug from gh in the checkout (its origin is not a GitHub URL)');
  assert.match(out.text(), /opened #1/);
  assert.equal(git(local, 'status', '--porcelain'), '', 'the checkout is untouched');

  const no = sink();
  assert.equal(await runUpgrade(['--repo', 'acme/app', '--write'], { out: no, err: no, opts: opts({ gh: f.gh }) }), 2);
  assert.match(no.text(), /--pr commits, pushes the branch and opens a pull request/);
  const bad = sink();
  assert.equal(await runUpgrade(['--repo', 'not a repo'], { out: bad, err: bad }), 2);
  assert.match(bad.text(), /is not a folder, and not a repo is not a GitHub owner\/name or URL/);
});

test('prBody stays under GitHub\'s limit: the diffs go first', () => {
  const report = {
    origin: { branch: 'main', sha: 'a'.repeat(40) }, files: [{ path: 'x | y.md', status: 'assisted', note: 'a|b' }], warnings: [], gate: [], knobs: [], available: [],
    sync: { from: { ref: 'v2.0.0' }, to: { version: '2.1.0' }, assisted: [{ path: 'x.md', reasons: ['kept ours'], diff: `${'+'.repeat(100)}\n`.repeat(1000), applied: true }] },
  };
  const body = prBody(report);
  assert.ok(body.length <= BODY_MAX);
  assert.match(body, /\(diff left out: the body would pass GitHub's limit; the dry run prints it\)/);
  assert.match(body, /\| assisted \| `x \\\| y\.md` \| a\\\|b \|/, 'pipes escaped in the table');
  assert.match(prBody({ ...report, sync: { ...report.sync, assisted: [{ ...report.sync.assisted[0], diff: '```\n+x' }] } }), /````diff\n```\n\+x\n````/, 'a fence longer than any in the diff');
});
