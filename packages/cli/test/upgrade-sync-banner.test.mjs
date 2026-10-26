// The Sync banner (spec 58, A12): a v2 repo whose plan/nexus.lock is behind the kit this CLI carries gets "nexus
// <version> is out" and a Sync button on the repo view; the button runs the same dry run, which on v2 is the sync, and
// the banner reads the sync's report. A current repo, or one whose lock the CLI cannot tell is behind, gets nothing.
import './jsx.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { kitBehind, kitBuild, cliBuild } from '../server/sync.mjs';
import { kitSync, repoInfo } from '../server/repo.mjs';
import { bannerFor, reportView } from '../src/screens/fleet/upgrade.js';

const scratch = [];
after(() => { for (const d of scratch) fs.rmSync(d, { recursive: true, force: true }); });
const tmp = (p) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); scratch.push(d); return d; };
const put = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const html = (el) => renderToStaticMarkup(el);
const sha = (c) => c.repeat(40);
const lockText = (version, ref) => `kit: nexus\nversion: ${version}\nref: ${ref}\nshape: chunks\nadopted: 2026-10-20\n`;

test('kitBehind reads the build alone: the tag, the trail, the semver core; unknown is not behind', () => {
  const build = { ref: sha('b'), version: '2.0.0+bbbbbbb', trail: [sha('b').slice(0, 12), sha('a').slice(0, 12)] };
  assert.equal(kitBehind({ lock: { version: '2.0.0', ref: 'v2.0.0' }, build }), true, 'a lock at the tag is behind a build past it');
  assert.equal(kitBehind({ lock: { version: '2.0.0+aaaaaaa', ref: sha('a') }, build }), true, 'a lock sha in the trail');
  assert.equal(kitBehind({ lock: { version: '2.0.0+aaaaaaa', ref: null }, build }), true, 'the short sha its version carries');
  assert.equal(kitBehind({ lock: { version: '2.0.0+bbbbbbb', ref: sha('b') }, build }), false, 'on the build itself');
  assert.equal(kitBehind({ lock: { version: '2.0.0+ccccccc', ref: sha('c') }, build }), false, 'a sha the trail does not name: unknown');
  assert.equal(kitBehind({ lock: { version: '1.9.0', ref: 'v1.9.0' }, build }), true, 'an older core');
  assert.equal(kitBehind({ lock: { version: '2.1.0+ccccccc', ref: sha('c') }, build }), false, 'a newer core: the CLI is the old one');
  assert.equal(kitBehind({ lock: { version: '2.0.0', ref: 'v2.0.0' }, build: { ref: sha('d'), version: '2.0.0' } }), false, 'both at the tag');
  assert.equal(kitBehind({ lock: { version: '2.0.0+aaaaaaa', ref: sha('a') }, build: { ref: sha('d'), version: '2.0.0' } }), false, 'past the tag the build is at');
  assert.equal(kitBehind({ lock: null, build }), false);
  assert.equal(kitBehind({ lock: { version: '2.0.0', ref: 'v2.0.0' }, build: null }), false);
});

test('kitBehind asks a nexus checkout beside the CLI: an ancestor is behind, a descendant is not', () => {
  const d = tmp('nexus-sb-kit-');
  const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' };
  const git = (...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd: d, env, encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init', '-q', '-b', 'main');
  put(d, 'templates/a.md', 'one\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'one');
  const one = git('rev-parse', 'HEAD');
  git('tag', 'v2.0.0');
  put(d, 'templates/a.md', 'two\n');
  git('commit', '-q', '-am', 'two');
  const two = git('rev-parse', 'HEAD');
  // Versions that would read the other way: the checkout's history decides.
  assert.equal(kitBehind({ lock: { version: '9.9.9', ref: one }, build: { ref: two, version: '0.0.1' }, nexus: d }), true);
  assert.equal(kitBehind({ lock: { version: '0.0.1', ref: two }, build: { ref: one, version: '9.9.9' }, nexus: d }), false);
  assert.equal(kitBehind({ lock: { version: '2.0.0', ref: 'v2.0.0' }, build: { ref: two, version: '2.0.0+x' }, nexus: d }), true, 'a tag name resolves');
  // The bundle's trail: the commits past the tag, 12 characters each. A dev run reads the checkout instead.
  assert.deepEqual(kitBuild(d, { trail: true }).trail, [two.slice(0, 12)]);
  assert.equal(kitBuild(d).trail, undefined, 'no trail unless asked');
  const cli = cliBuild({ bundled: path.join(d, 'no-bundle'), nexus: d, fresh: true });
  assert.equal(cli.nexus, d);
  assert.equal(cli.build.ref, two);
  assert.equal(cli.build.version, `2.0.0+${two.slice(0, 7)}`);
});

test('cliBuild reads the bundled files.json build first, once per process', () => {
  const d = tmp('nexus-sb-bundle-');
  put(d, 'files.json', JSON.stringify({ files: [], build: { ref: sha('e'), version: '2.2.0', trail: [] } }));
  assert.deepEqual(cliBuild({ bundled: d, nexus: null, fresh: true }), { build: { ref: sha('e'), version: '2.2.0', trail: [] }, nexus: null });
  assert.equal(cliBuild({ bundled: path.join(d, 'none'), nexus: null, fresh: true }), null);
});

test('kitSync: { version, from } for a v2 repo behind the CLI\'s kit, null otherwise; GET /api/state\'s info carries it', async () => {
  const d = tmp('nexus-sb-repo-');
  const build = { build: { ref: sha('b'), version: '2.1.0', trail: [] }, nexus: null };
  assert.equal(kitSync(d, { build }), null, 'no lock');
  put(d, 'plan/nexus.lock', lockText('2.0.0', 'v2.0.0'));
  assert.deepEqual(kitSync(d, { build }), { version: '2.1.0', from: '2.0.0' });
  assert.equal(kitSync(d, { build: { build: { ref: sha('b'), version: '2.0.0', trail: [] }, nexus: null } }), null, 'current');
  assert.equal(kitSync(d, { build: null }), null, 'a CLI with no kit build');
  put(d, 'plan/steps/01_build_plan.md', '# 01 — Build plan\n');
  assert.equal(kitSync(d, { build }), null, 'half-done: the upgrade banner, not sync');
  fs.rmSync(path.join(d, 'plan', 'steps'), { recursive: true });
  assert.ok('sync' in await repoInfo(d), 'repoInfo carries sync');
});

test('the Sync banner\'s words, and none for a current v2 repo', () => {
  const b = bannerFor({ shape: 'v2', sync: { version: '2.1.0', from: '2.0.0' } });
  assert.equal(b.title, 'nexus 2.1.0 is out');
  assert.equal(b.action, 'Sync');
  assert.match(b.sub, /follows nexus 2\.0\.0/);
  assert.match(b.sub, /writes nothing/);
  assert.match(b.progress, /merging the kit three ways/);
  assert.equal(bannerFor({ shape: 'v2', sync: null }), null);
  assert.equal(bannerFor({ shape: 'none', sync: { version: '2.1.0' } }), null, 'only a v2 repo syncs');
  assert.match(bannerFor({ shape: 'v1' }).progress, /converting the plan/);
});

const SYNC = {
  repo: '/r', origin: { url: '/o.git', branch: 'main', sha: 'abcdef1234567' }, dry: true, shape: 'v2', why: 'plan/nexus.lock says chunks',
  files: [{ path: 'skills/next.md', status: 'replaced' }, { path: 'skills/march.md', status: 'assisted' }, { path: 'scripts/new.mjs', status: 'new' }, { path: 'skills/march.lanes.md', status: 'kept-custom' }],
  warnings: [], gate: [{ name: 'plan-check', ok: true }], knobs: [], available: [],
  sync: { from: { ref: 'v2.0.0', sha: sha('a') }, to: { ref: sha('b'), version: '2.1.0' }, counts: { replaced: 1, merged: 0, assisted: 1, new: 1, kept: 1, same: 9, held: 0, available: 0 }, assisted: [] },
  dispatch: { kind: 'chunk', text: '/next 4.2', idle: false, live: true },
};

test('the sync report reads as the banner shows it: what moves, the gate, the first tick; already current; an older CLI', () => {
  const ok = reportView({ code: 0, report: SYNC, text: 'nexus upgrade: dry run' });
  assert.equal(ok.tone, 'ok');
  assert.equal(ok.headline, 'Ready: sync to nexus 2.1.0. 3 files would change. Nothing was written.');
  assert.deepEqual(ok.chips.map((c) => `${c.k}=${c.v}`), ['files=3', 'replaced=1', 'assisted=1', 'new=1', 'warnings=0', 'gate=green']);
  assert.equal(ok.dispatch.text, '/next 4.2');
  assert.equal(ok.loop, null);
  const red = reportView({ code: 1, report: { ...SYNC, worktree: '/tmp/wt' } });
  assert.equal(red.tone, 'red');
  assert.match(red.headline, /sync to nexus 2\.1\.0/);
  assert.equal(red.worktree, '/tmp/wt');
  const same = reportView({ code: 0, report: { ...SYNC, files: [], message: 'already on nexus 2.1.0', why: 'x' } });
  assert.deepEqual([same.tone, same.headline], ['v2', 'Already on nexus 2.1.0: nothing to sync.']);
  const older = reportView({ code: 0, report: { ...SYNC, files: [], message: 'this CLI\'s kit (2.0.0) is older than the repo\'s (2.1.0)', why: 'x' } });
  assert.equal(older.tone, 'stop');
  assert.match(older.headline, /^This CLI's kit \(2\.0\.0\) is older than the repo's \(2\.1\.0\): run the newest CLI\.$/);
});

test('the Sync banner renders with its button, its green star and its motes, and keeps the colour', async () => {
  globalThis.window ||= { location: { href: 'http://localhost/' }, history: { replaceState() {} } };
  const { default: UpgradeBanner, UpgradeReport } = await import('../src/screens/fleet/UpgradeBanner.jsx');
  const out = html(createElement(UpgradeBanner, { info: { shape: 'v2', sync: { version: '2.1.0', from: '2.0.0' } } }));
  assert.match(out, /<section class="upg is-v2" aria-label="Sync">/);
  assert.match(out, /nexus 2\.1\.0 is out/);
  assert.match(out, /<button class="btn btn-s btn-primary upg-go" type="button">.*Sync<\/button>/);
  assert.match(out, /cstar is-lit upg-star/);
  assert.equal((out.match(/<i style=/g) || []).length, 8, 'the motes drift behind the words');
  assert.equal(html(createElement(UpgradeBanner, { info: { shape: 'v2' } })), '', 'a current v2 repo: no banner');
  const rep = html(createElement(UpgradeReport, { last: { code: 0, report: SYNC, text: 'nexus upgrade: dry run', at: 0 } }));
  assert.match(rep, /Ready: sync to nexus 2\.1\.0/);
  assert.match(rep, /first dispatch/);
  const css = fs.readFileSync(new URL('../src/styles/upgrade-banner.css', import.meta.url), 'utf8');
  assert.match(css, /\.upg\.is-v2 \{[^}]*var\(--st-done\)/, 'the Sync face has its own edge');
  assert.match(css, /\.upg\.is-v2 \.upg-star \{[^}]*var\(--st-done\)/, 'and its own star');
});
