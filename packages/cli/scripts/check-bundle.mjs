// Holds the built UI to its weight (spec 41, A9): every JS chunk under
// 500 kB (the screens load per route; see App.jsx), and only the font faces
// the UI uses: the latin and latin-ext @fontsource faces as woff2, and the
// three mono symbol cuts. Runs after every `vite build`, so `npm run build`
// (and prepublishOnly) fails on a regression; test/bundle.test.mjs runs the
// same rules over dist/ when a build is there.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CHUNK_LIMIT = 500 * 1000;
const FONT = /\.(woff2?|ttf|otf)$/;
const ALLOWED_FONT = /^(?:[a-z-]+-latin(?:-ext)?-\d{3}-(?:normal|italic)|JetBrainsMono-(?:Regular|Medium|Bold)-symbols)-[\w-]+\.woff2$/;

/** The problems with a built assets directory, as sentences; empty when it holds. */
export function bundleProblems(assetsDir) {
  const out = [];
  const files = fs.readdirSync(assetsDir);
  if (!files.some((f) => f.endsWith('.js'))) out.push(`no JS in ${assetsDir}`);
  for (const f of files) {
    const size = fs.statSync(path.join(assetsDir, f)).size;
    if (f.endsWith('.js') && size > CHUNK_LIMIT) out.push(`${f} is ${(size / 1000).toFixed(1)} kB, over the ${CHUNK_LIMIT / 1000} kB chunk limit`);
    if (FONT.test(f) && !ALLOWED_FONT.test(f)) out.push(`${f} is a font face the UI does not use (latin, latin-ext woff2 and the mono symbol cuts only)`);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'assets');
  const problems = bundleProblems(assets);
  if (problems.length) {
    for (const p of problems) console.error(`check-bundle: ${p}`);
    process.exit(1);
  }
  const js = fs.readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => fs.statSync(path.join(assets, f)).size);
  console.log(`check-bundle: ${js.length} JS chunks, largest ${(Math.max(...js) / 1000).toFixed(1)} kB (limit ${CHUNK_LIMIT / 1000} kB); fonts are latin, latin-ext and the symbol cuts`);
}
