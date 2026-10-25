// The GUI's Upgrade banner (spec 58, A9): GET /api/state reads a v1 repo's shape, the repo view shows "This repo is on
// nexus v1" with an Upgrade button, the button runs the dry run on the server (a child `nexus upgrade --json`, one
// at a time, its last result kept) and the banner shows its report; the banner keeps the GUI's colour and motion.
import './jsx.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { startServer } from '../server/server.mjs';
import { kitShape, repoInfo } from '../server/repo.mjs';
import { createUpgradeView, dryRunChild } from '../server/upgrade-view.mjs';
import { bannerFor, ranAgo, reportView } from '../src/screens/fleet/upgrade.js';
import { removeTree } from './helpers/tmp.mjs';
import { tmpRepo, call } from './helpers/restart.mjs';

const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
const scratch = [];
after(() => { for (const d of scratch) fs.rmSync(d, { recursive: true, force: true }); });
const tmp = (p) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); scratch.push(d); return d; };
const put = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const html = (el) => renderToStaticMarkup(el);
const BUILD_PLAN = '# 01 — Build plan\n\n## Status (at-a-glance)\n\n- [x] Phase 1 — Bootstrap (commit abc1234)\n- [ ] Phase 2 — Search\n\n## Phase log (commit hashes)\n\n';

/** A dry run's report as upgrade.mjs returns it, for a live v1 loop with one warning and a green gate. */
const REPORT = {
  repo: '/r', origin: { url: '/o.git', branch: 'main', sha: 'abcdef1234567' }, dry: true, shape: 'v1', why: 'no plan/nexus.lock, and plan/steps/01_build_plan.md is there',
  files: [{ path: 'plan/README.md', status: 'merged' }, { path: 'skills/march.lanes.md', status: 'moved-to-lane' }],
  archive: ['- 2026-10-25 · 1 · Bootstrap · abc1234'], warnings: ['Phase 2 has no brief; its stub spec says so'],
  gate: [{ name: 'plan-check', ok: true }], dispatch: { kind: 'chunk', text: '/next 2.1', idle: false, live: true, pr: { kind: 'idle', text: 'idle', idle: true } },
  loop: { mode: 'owner', pushes: 3, branch: 'main' }, worktree: null,
};

test('the repo\'s shape: v1, half, v2 and none, in GET /api/state\'s info', async () => {
  const d = tmp('nexus-ub-shape-');
  assert.equal(kitShape(d), 'none');
  put(d, 'plan/steps/01_build_plan.md', BUILD_PLAN);
  assert.equal(kitShape(d), 'v1');
  put(d, 'plan/nexus.lock', 'kit: nexus\nversion: 2.0.0\nshape: chunks\n');
  assert.equal(kitShape(d), 'half');
  fs.rmSync(path.join(d, 'plan', 'steps'), { recursive: true });
  assert.equal(kitShape(d), 'v2');
  assert.equal((await repoInfo(d)).shape, 'v2');
});

test('the banner shows for v1 and half only, with the button the spec names', () => {
  assert.deepEqual([bannerFor({ shape: 'v1' })?.title, bannerFor({ shape: 'v1' })?.action], ['This repo is on nexus v1', 'Upgrade']);
  assert.match(bannerFor({ shape: 'half' }).action, /Finish/);
  for (const shape of ['v2', 'none', undefined]) assert.equal(bannerFor({ shape }), null, String(shape));
  assert.equal(bannerFor(undefined), null);
});

test('the report reads as the banner shows it: headline, chips, dispatch, loop line, warnings; red and stop tones', () => {
  const ok = reportView({ code: 0, report: REPORT, text: 'nexus upgrade: dry run', at: 1 });
  assert.equal(ok.tone, 'ok');
  assert.match(ok.headline, /^Ready: v1 \(phases\) to v2 \(specs \+ chunks\)\. 2 files would change\. Nothing was written\.$/);
  assert.deepEqual(ok.chips.map((c) => `${c.k}=${c.v}`), ['files=2', 'archive=+1', 'warnings=1', 'gate=green']);
  assert.equal(ok.dispatch.bad, true, 'a live v1 loop idle in pr mode reads red');
  assert.equal(ok.dispatch.also, 'owner mode: /next 2.1');
  assert.equal(ok.loop.command, 'gh variable set NEXUS_LOOP_MODE --body owner');
  assert.deepEqual(ok.warnings, REPORT.warnings);
  const red = reportView({ code: 1, report: { ...REPORT, gate: [{ name: 'plan-check', ok: false, out: 'x' }], worktree: '/tmp/wt' } });
  assert.equal(red.tone, 'red');
  assert.equal(red.worktree, '/tmp/wt');
  assert.equal(red.chips.find((c) => c.k === 'gate').tone, 'bad');
  assert.equal(reportView({ code: 2, report: { error: 'not a nexus v1 repo: no build plan' } }).headline, 'not a nexus v1 repo: no build plan');
  assert.equal(reportView({ code: 0, report: { ...REPORT, message: 'already on v2', why: 'plan/nexus.lock says chunks' } }).tone, 'v2');
  assert.equal(reportView(null), null);
  assert.equal(ranAgo(1000, 1000 + 125000), '2m ago');
});

test('the banner renders on a v1 repo with its button, its star and its motes; nothing on v2', async () => {
  // data/client.js reads the launch token from the page's URL as it loads: a page stub for this process.
  globalThis.window ||= { location: { href: 'http://localhost/' }, history: { replaceState() {} } };
  const { default: UpgradeBanner, UpgradeReport } = await import('../src/screens/fleet/UpgradeBanner.jsx');
  const out = html(createElement(UpgradeBanner, { info: { shape: 'v1' } }));
  assert.match(out, /<section class="upg is-v1" aria-label="Upgrade">/);
  assert.match(out, /This repo is on nexus v1/);
  assert.match(out, /<button class="btn btn-s btn-primary upg-go" type="button">.*Upgrade<\/button>/);
  assert.match(out, /cstar is-lit upg-star/, 'the lit star');
  assert.equal((out.match(/<i style=/g) || []).length, 8, 'the motes drift behind the words');
  assert.equal(html(createElement(UpgradeBanner, { info: { shape: 'v2' } })), '');
  const rep = html(createElement(UpgradeReport, { last: { code: 0, report: REPORT, text: 'nexus upgrade: dry run (nothing written)', at: 0 } }));
  assert.match(rep, /aria-label="Upgrade dry run report"/);
  assert.match(rep, /Ready: v1/);
  assert.match(rep, /gh variable set NEXUS_LOOP_MODE --body owner/);
  assert.match(rep, /<pre class="upg-term">nexus upgrade: dry run \(nothing written\)<\/pre>/, 'the full report, as the terminal prints it');
});

test('the banner keeps the GUI\'s colour and motion, and stops only for reduced motion', () => {
  const css = fs.readFileSync(new URL('../src/styles/upgrade-banner.css', import.meta.url), 'utf8');
  assert.match(css, /var\(--aurora-grad\)/, 'the aurora edge');
  assert.match(css, /\.upg-sky i \{[^}]*animation: upg-mote/, 'the motes drift');
  assert.match(css, /\.upg\.is-running::before \{[^}]*animation: upg-sweep/, 'the edge sweeps while the dry run works');
  const reduced = /@media \(prefers-reduced-motion: reduce\) \{([^}]*)\}/.exec(css);
  assert.ok(reduced && /animation: none/.test(reduced[1]), 'reduced motion stops the animations');
});

test('POST /api/upgrade/dry runs the dry run once at a time, answers with its report and text, and keeps the last', { timeout: 60000 }, async () => {
  const t = tmpRepo();
  put(t.dir, 'plan/steps/01_build_plan.md', BUILD_PLAN);
  let calls = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const upgradeRun = async (repo) => { calls += 1; assert.equal(repo, t.dir); await gate; return { code: 0, report: REPORT }; };
  const app = await startServer({ repo: t.dir, provider: () => ({ kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} }), pollRuns: false, dist: NO_DIST, ghLogin: async () => '', claudeHome: t.home, beatMs: 0, upgradeRun });
  try {
    assert.equal((await call(app, '/api/state')).json.info.shape, 'v1');
    const before = (await call(app, '/api/upgrade')).json;
    assert.deepEqual(before, { shape: 'v1', running: false, last: null });
    const a = call(app, '/api/upgrade/dry', {});
    const b = call(app, '/api/upgrade/dry', {});
    for (let i = 0; i < 200 && !(await call(app, '/api/upgrade')).json.running; i++) await new Promise((r) => setTimeout(r, 10));
    assert.equal((await call(app, '/api/upgrade')).json.running, true);
    release();
    const [ra, rb] = await Promise.all([a, b]);
    assert.equal(calls, 1, 'a second ask while one runs gets the same answer');
    assert.equal(ra.status, 200);
    assert.deepEqual(ra.json, rb.json);
    assert.equal(ra.json.code, 0);
    assert.equal(ra.json.report.shape, 'v1');
    assert.match(ra.json.text, /^nexus upgrade: dry run \(nothing written; the local checkout is not touched\)/);
    assert.match(ra.json.text, /gh variable set NEXUS_LOOP_MODE --body owner/);
    const kept = (await call(app, '/api/upgrade')).json;
    assert.equal(kept.running, false);
    assert.deepEqual(kept.last, ra.json);
  } finally {
    await removeTree(t.parent, { stop: [() => app.close()] });
  }
});

test('a run that throws answers as a stop report, never a 500', async () => {
  const v = createUpgradeView({ repo: '/r', run: async () => { throw new Error('boom'); }, now: () => 7 });
  const last = await v.dry();
  assert.deepEqual(last, { code: 2, report: { error: 'boom' }, text: 'nexus upgrade: boom', at: 7 });
  assert.deepEqual(v.status(), { running: false, last });
});

test('the default run is a child `nexus upgrade --json` in the repo: its JSON, its exit code, its error', { timeout: 60000 }, async () => {
  const d = tmp('nexus-ub-child-');
  const bin = path.join(d, 'stub.mjs');
  fs.writeFileSync(bin, 'process.stdout.write(JSON.stringify({ code: 1, repo: process.cwd(), args: process.argv.slice(2), shape: "v1", files: [] }, null, 2)); process.exit(1);\n');
  const r = await dryRunChild(d, { bin });
  assert.equal(r.code, 1);
  assert.equal(fs.realpathSync(r.report.repo), fs.realpathSync(d), 'the repo is the child\'s cwd');
  assert.deepEqual(r.report.args, ['upgrade', '--json']);
  fs.writeFileSync(bin, 'process.stderr.write("it broke\\n"); process.exit(3);\n');
  assert.deepEqual(await dryRunChild(d, { bin }), { code: 3, report: { error: 'it broke' } });
  fs.writeFileSync(bin, 'setTimeout(() => {}, 60000);\n');
  const slow = await dryRunChild(d, { bin, ms: 300 });
  assert.equal(slow.code, 2);
  assert.match(slow.report.error, /took longer than/);
  // The real CLI on a folder that is no git repository: exit 2 and its error, as JSON.
  const real = await dryRunChild(d);
  assert.equal(real.code, 2);
  assert.match(real.report.error, /is not a git repository/);
});

test('the real dry run through the server on a v1 repo with an origin: the report, the local checkout untouched', { timeout: 300000 }, async () => {
  const t = tmpRepo();
  const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' };
  const git = (...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd: t.dir, env, encoding: 'utf8', stdio: 'pipe' }).trim();
  put(t.dir, 'package.json', '{ "name": "field-notes" }\n');
  put(t.dir, 'agents.md', '# Field notes — agents.md\n\nShip with /ship-a-phase.\n');
  put(t.dir, 'plan/steps/01_build_plan.md', BUILD_PLAN.replace('abc1234', git('rev-parse', '--short', 'HEAD')));
  git('add', '-A');
  git('commit', '-q', '-m', 'plan: the v1 plan');
  git('push', '-q', 'origin', 'main');
  const status = git('status', '--porcelain');
  const app = await startServer({ repo: t.dir, provider: () => ({ kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} }), pollRuns: false, dist: NO_DIST, ghLogin: async () => '', claudeHome: t.home, beatMs: 0 });
  try {
    const r = await call(app, '/api/upgrade/dry', {});
    assert.equal(r.status, 200);
    assert.ok([0, 1].includes(r.json.code), JSON.stringify(r.json.report).slice(0, 2000));
    assert.equal(r.json.report.shape, 'v1');
    assert.ok(r.json.report.files.some((f) => f.path === 'plan/nexus.lock'), 'the lock flips in the scratch worktree');
    assert.match(r.json.text, /nexus upgrade: dry run/);
    assert.match(r.json.text, /first dispatch \(predicted\)/);
    assert.equal(git('status', '--porcelain'), status, 'the local checkout is untouched');
    assert.ok(fs.existsSync(path.join(t.dir, 'plan', 'steps', '01_build_plan.md')));
    if (r.json.report.worktree) fs.rmSync(r.json.report.worktree, { recursive: true, force: true });
  } finally {
    await removeTree(t.parent, { stop: [() => app.close()] });
  }
});
