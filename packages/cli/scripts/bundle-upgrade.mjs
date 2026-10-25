// The upgrade's bundled kit (spec 58): the v2 kit file set, computed by the nexus repo's scripts/upgrade-files.mjs
// (the one list playbooks/upgrade.md's manual appendix is generated from), copied to `out` at its templates/ paths,
// with files.json naming each file, where it lands in a repo, and its kind. bundle-kit.mjs runs it into kit/upgrade/.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Where a listed kit path is written under `out`: its templates/ path. */
export const bundledPath = (kit) => kit.replace(/^templates\//, '');

/**
 * Copies the list from the nexus repo at `nexus` into `out` (emptied first): { files, missing }. Nothing is copied
 * when the closure reaches a file that is gone.
 */
export async function bundleUpgrade({ nexus, out }) {
  const { upgradeFiles } = await import(pathToFileURL(path.join(nexus, 'scripts', 'upgrade-files.mjs')).href);
  const { files, missing } = upgradeFiles(nexus);
  if (missing.length) return { files, missing };
  fs.rmSync(out, { recursive: true, force: true });
  for (const f of files) {
    const to = path.join(out, ...bundledPath(f.kit).split('/'));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(nexus, ...f.kit.split('/')), to);
  }
  fs.writeFileSync(path.join(out, 'files.json'), `${JSON.stringify({ files }, null, 2)}\n`);
  return { files, missing };
}
