// The upgrade's bundled kit (spec 58): the v2 kit file set, computed by the nexus repo's scripts/upgrade-files.mjs
// (the one list playbooks/upgrade.md's manual appendix is generated from), copied to `out` at its templates/ paths,
// with files.json naming each file, where it lands in a repo, and its kind. Beside them, the seeds the upgrade reads
// but never copies over a repo's own (SEEDS: the v2 roadmap it merges in, the lock it flips), at their templates/
// paths too, and kit-text.json: every header and paragraph the kit's march and iterate skills ever held (the nexus
// repo's scripts/upgrade-kit-text.mjs: its committed snapshot, git history and the current templates), which tells a
// repo's own steps from kit text. bundle-kit.mjs runs it into kit/upgrade/; server/upgrade.mjs reads it.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Where a listed kit path is written under `out`: its templates/ path. */
export const bundledPath = (kit) => kit.replace(/^templates\//, '');

/** Templates the upgrade reads (merged or rewritten into a repo, never copied over one), relative to templates/. */
export const SEEDS = Object.freeze(['plan/README.md', 'plan/nexus.lock']);

/** The kit-text list's name under `out`. */
export const KIT_TEXT = 'kit-text.json';
const KIT_TEXT_SCRIPT = ['scripts', 'upgrade-kit-text.mjs'];

/**
 * Copies the list from the nexus repo at `nexus` into `out` (emptied first): { files, missing }. Nothing is copied
 * when the closure reaches a file that is gone, a seed is missing, or the kit-text script is.
 */
export async function bundleUpgrade({ nexus, out }) {
  const { upgradeFiles } = await import(pathToFileURL(path.join(nexus, 'scripts', 'upgrade-files.mjs')).href);
  const { files, missing } = upgradeFiles(nexus);
  missing.push(...SEEDS.filter((s) => !fs.existsSync(path.join(nexus, 'templates', ...s.split('/')))).map((s) => `seed ${s}`));
  const textScript = path.join(nexus, ...KIT_TEXT_SCRIPT);
  if (!fs.existsSync(textScript)) missing.push(KIT_TEXT_SCRIPT.join('/'));
  if (missing.length) return { files, missing };
  fs.rmSync(out, { recursive: true, force: true });
  for (const kit of [...files.map((f) => f.kit), ...SEEDS.map((s) => `templates/${s}`)]) {
    const to = path.join(out, ...bundledPath(kit).split('/'));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(nexus, ...kit.split('/')), to);
  }
  fs.writeFileSync(path.join(out, 'files.json'), `${JSON.stringify({ files, seeds: SEEDS }, null, 2)}\n`);
  const { build } = await import(pathToFileURL(textScript).href);
  fs.writeFileSync(path.join(out, KIT_TEXT), `${JSON.stringify(await build(nexus), null, 2)}\n`);
  return { files, missing };
}
