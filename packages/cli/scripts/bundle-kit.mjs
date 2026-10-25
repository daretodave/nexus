// Copies the kit files the cloud loop's setup needs (server/cloud.mjs KIT_FILES) into the package's kit/: the loop
// workflow and its toolchain action from templates/.github, and the installer whose fillPlaceholders fills them
// (templates/scripts/bootstrap.mjs); the plan board's order.mjs and progress.mjs with what they import (server/plan.mjs
// planKitFiles) into kit/scripts/, run when a repo has none of its own; and the secrets vault's scripts (server/vault-setup.mjs vaultFiles: the import
// closure of templates/scripts/secrets.mjs) into kit/secrets/, for "Set up the vault"; and the v2 kit file set an
// upgrade writes (the nexus repo's scripts/upgrade-files.mjs, the one list playbooks/upgrade.md's manual appendix is
// generated from) into kit/upgrade/ at its templates/ paths, with kit/upgrade/files.json naming each file, where it
// lands in a repo, and its kind, plus the seeds `upgrade` merges or flips (the v2 roadmap, the lock). Runs before
// every build; the copy is not committed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KIT_FILES } from '../server/cloud.mjs';
import { BUNDLED as VAULT_DIR, vaultFiles } from '../server/vault-setup.mjs';
import { PLAN_BUNDLED, planKitFiles } from '../server/plan.mjs';
import { SEEDS, bundleUpgrade, bundledPath } from './bundle-upgrade.mjs';

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.resolve(pkg, '..', '..', 'templates');
/** The upgrade's bundled kit: the computed file set at its templates/ paths, and files.json. */
const UPGRADE_DIR = path.join(pkg, 'kit', 'upgrade');

if (!fs.existsSync(src)) {
  console.log('bundle-kit: no ../../templates (outside the nexus repo); keeping what is there');
  process.exit(0);
}

const scriptsSrc = path.join(src, 'scripts');
const planFiles = planKitFiles(scriptsSrc);
fs.rmSync(PLAN_BUNDLED, { recursive: true, force: true });
for (const f of planFiles) {
  const out = path.join(PLAN_BUNDLED, ...f.split('/'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(path.join(scriptsSrc, ...f.split('/')), out);
}
console.log(`bundle-kit: copied ${planFiles.length} plan scripts -> kit/scripts/`);

const vaultSrc = scriptsSrc;
const vault = vaultFiles(vaultSrc);
fs.rmSync(VAULT_DIR, { recursive: true, force: true });
for (const f of vault) {
  const out = path.join(VAULT_DIR, ...f.split('/'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(path.join(vaultSrc, ...f.split('/')), out);
}
console.log(`bundle-kit: copied ${vault.length} vault scripts -> kit/secrets/`);

// The cloud loop's files go last: kit/scripts/ is wiped and refilled for the plan scripts above, and bootstrap.mjs
// lives there too (it went missing from 0.4.0-0.4.3 when this ran first).
for (const [bundled, templ] of Object.values(KIT_FILES)) {
  const out = path.join(pkg, 'kit', bundled);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(path.join(src, templ), out);
}
console.log(`bundle-kit: copied ${Object.values(KIT_FILES).map(([, t]) => t).join(', ')} -> kit/`);

// The v2 kit file set (spec 58): one computed list, shared with the playbook's manual appendix.
const { files: upgrade, missing } = await bundleUpgrade({ nexus: path.resolve(pkg, '..', '..'), out: UPGRADE_DIR });
if (missing.length) {
  console.error(`bundle-kit: the upgrade list's closure reaches files that are gone: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`bundle-kit: copied ${upgrade.length} upgrade files -> kit/upgrade/ (+ files.json)`);

// Every file a server route loads from kit/ must be there, or the build fails here rather than for a user.
const want = [...Object.values(KIT_FILES).map(([b]) => b), ...planFiles.map((f) => `scripts/${f}`), ...vault.map((f) => `secrets/${f}`),
  ...upgrade.map((f) => `upgrade/${bundledPath(f.kit)}`), ...SEEDS.map((s) => `upgrade/${s}`), 'upgrade/files.json'];
const lost = want.filter((f) => !fs.existsSync(path.join(pkg, 'kit', ...f.split('/'))));
if (lost.length) {
  console.error(`bundle-kit: missing from kit/ after bundling: ${lost.join(', ')}`);
  process.exit(1);
}
