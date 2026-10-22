// Copies the kit files the cloud loop's setup needs (server/cloud.mjs KIT_FILES) into the package's kit/: the loop
// workflow and its toolchain action from templates/.github, and the installer whose fillPlaceholders fills them
// (templates/scripts/bootstrap.mjs); the plan board's order.mjs and progress.mjs with what they import (server/plan.mjs
// planKitFiles) into kit/scripts/, run when a repo has none of its own; and the secrets vault's scripts (server/vault-setup.mjs vaultFiles: the import
// closure of templates/scripts/secrets.mjs) into kit/secrets/, for "Set up the vault". Runs before every build; the
// copy is not committed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KIT_FILES } from '../server/cloud.mjs';
import { BUNDLED as VAULT_DIR, vaultFiles } from '../server/vault-setup.mjs';
import { PLAN_BUNDLED, planKitFiles } from '../server/plan.mjs';

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.resolve(pkg, '..', '..', 'templates');

if (!fs.existsSync(src)) {
  console.log('bundle-kit: no ../../templates (outside the nexus repo); keeping what is there');
  process.exit(0);
}
for (const [bundled, templ] of Object.values(KIT_FILES)) {
  const out = path.join(pkg, 'kit', bundled);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(path.join(src, templ), out);
}
console.log(`bundle-kit: copied ${Object.values(KIT_FILES).map(([, t]) => t).join(', ')} -> kit/`);

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
