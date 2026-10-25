// The upgrade's bundled kit (spec 58, A2): bundle-kit.mjs copies exactly the computed
// v2 kit file set (the nexus repo's scripts/upgrade-files.mjs, the same list the
// playbook's manual appendix is generated from), with files.json. Written to a temp
// folder, never the package's kit/ (other suites read it while this one runs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { KIT_TEXT, SEEDS, bundleUpgrade, bundledPath } from '../scripts/bundle-upgrade.mjs';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEXUS = path.resolve(PKG, '..', '..');
const LIST = path.join(NEXUS, 'scripts', 'upgrade-files.mjs');

test('the upgrade bundle is the computed list, byte for byte, with files.json naming each file', { skip: !fs.existsSync(LIST) && 'outside the nexus repo' }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-upgrade-kit-'));
  const { files, missing } = await bundleUpgrade({ nexus: NEXUS, out });
  assert.deepEqual(missing, []);
  const { upgradeFiles } = await import(pathToFileURL(LIST).href);
  assert.deepEqual(files, upgradeFiles(NEXUS).files);
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'files.json'), 'utf8'));
  assert.deepEqual(manifest.files, files);
  // The seeds the upgrade merges or flips (the v2 roadmap, the lock) ride along, byte for byte.
  assert.deepEqual(manifest.seeds, [...SEEDS]);
  // A v2 sync's extra files (the kit's workflows and the scripts they call) and the kit commit the bundle was cut from.
  const { syncFiles } = await import(pathToFileURL(LIST).href);
  const listed = new Set(files.map((f) => f.kit));
  assert.deepEqual(manifest.sync, syncFiles(NEXUS).files.filter((f) => !listed.has(f.kit)));
  for (const want of ['heartbeat.yml', 'march.yml', 'nudge.yml']) assert.ok(manifest.sync.some((f) => f.kit === `templates/.github/workflows/${want}` && f.kind === 'workflow'), want);
  for (const f of manifest.sync) assert.ok(fs.existsSync(path.join(out, ...bundledPath(f.kit).split('/'))), f.kit);
  assert.match(manifest.build.ref, /^[0-9a-f]{40}$/);
  assert.match(manifest.build.version, /^\d+\.\d+\.\d+/);
  for (const s of SEEDS) assert.equal(fs.readFileSync(path.join(out, ...s.split('/')), 'utf8'), fs.readFileSync(path.join(NEXUS, 'templates', ...s.split('/')), 'utf8'), s);
  // kit-text.json: every header and paragraph the kit's march and iterate skills ever held (spec 58, A4).
  const text = JSON.parse(fs.readFileSync(path.join(out, KIT_TEXT), 'utf8'));
  const snapshot = JSON.parse(fs.readFileSync(path.join(NEXUS, 'scripts', 'upgrade-kit-text.json'), 'utf8'));
  for (const skill of ['march.md', 'iterate.md']) {
    assert.ok(text[skill].headers.length && text[skill].paras.length, skill);
    for (const p of snapshot[skill].paras) assert.ok(text[skill].paras.includes(p), `${skill}: the bundle holds every snapshot paragraph`);
  }
  for (const f of files) {
    assert.equal(fs.readFileSync(path.join(out, ...bundledPath(f.kit).split('/')), 'utf8'), fs.readFileSync(path.join(NEXUS, ...f.kit.split('/')), 'utf8'), f.kit);
  }
  const kits = new Set(files.map((f) => f.kit));
  for (const want of ['scripts/plan-check.mjs', 'scripts/plan/pending.mjs', 'scripts/plan/settled.mjs', 'scripts/plan/secrets-manifest.mjs', 'scripts/claims.mjs', 'scripts/cloud/tick.mjs', 'skills/next.md', 'claude/commands/plot.md', '.github/actions/setup/action.yml']) {
    assert.ok(kits.has(`templates/${want}`), want);
  }
  fs.rmSync(out, { recursive: true, force: true });
});

test('a closure that reaches a gone file copies nothing', async () => {
  const nexus = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-upgrade-gone-'));
  fs.mkdirSync(path.join(nexus, 'scripts'), { recursive: true });
  fs.copyFileSync(LIST, path.join(nexus, 'scripts', 'upgrade-files.mjs'));
  fs.mkdirSync(path.join(nexus, 'templates', 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(nexus, 'templates', 'scripts', 'plan-check.mjs'), "import './plan/gone.mjs'\n");
  const out = path.join(nexus, 'out');
  const { missing } = await bundleUpgrade({ nexus, out });
  assert.ok(missing.includes('plan-check.mjs -> plan/gone.mjs'), missing.join(', '));
  assert.equal(fs.existsSync(out), false);
  fs.rmSync(nexus, { recursive: true, force: true });
});
