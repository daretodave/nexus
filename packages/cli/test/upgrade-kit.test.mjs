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
import { bundleUpgrade, bundledPath } from '../scripts/bundle-upgrade.mjs';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEXUS = path.resolve(PKG, '..', '..');
const LIST = path.join(NEXUS, 'scripts', 'upgrade-files.mjs');

test('the upgrade bundle is the computed list, byte for byte, with files.json naming each file', { skip: !fs.existsSync(LIST) && 'outside the nexus repo' }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-upgrade-kit-'));
  const { files, missing } = await bundleUpgrade({ nexus: NEXUS, out });
  assert.deepEqual(missing, []);
  const { upgradeFiles } = await import(pathToFileURL(LIST).href);
  assert.deepEqual(files, upgradeFiles(NEXUS).files);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, 'files.json'), 'utf8')).files, files);
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
