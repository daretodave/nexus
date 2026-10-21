// The built UI's weight rules (scripts/check-bundle.mjs): a chunk over
// 500 kB or a font face the UI does not use fails. The rules are tested on a
// fixture; the real dist/ is checked too when a build is there (npm test
// runs without one; `npm run build` runs the same check itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHUNK_LIMIT, bundleProblems } from '../scripts/check-bundle.mjs';

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-bundle-'));
  for (const [name, size] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), Buffer.alloc(size));
  return dir;
}

test('a bundle with route chunks under the limit and only the used font faces holds', () => {
  const dir = fixture({
    'index-abc.js': CHUNK_LIMIT - 1, 'Cockpit-def.js': 50_000, 'index-abc.css': 1000,
    'fira-sans-latin-400-normal-x1.woff2': 10, 'fira-sans-latin-ext-400-italic-x2.woff2': 10,
    'jetbrains-mono-latin-ext-700-normal-x3.woff2': 10, 'JetBrainsMono-Bold-symbols-x4.woff2': 10,
  });
  assert.deepEqual(bundleProblems(dir), []);
});

test('a chunk over 500 kB, a cyrillic face, a woff fallback or a full webfont each fail', () => {
  const dir = fixture({
    'index-abc.js': CHUNK_LIMIT + 1,
    'fira-sans-cyrillic-400-normal-x1.woff2': 10,
    'fira-sans-latin-400-normal-x2.woff': 10,
    'JetBrainsMono-Regular-x3.woff2': 10,
  });
  const p = bundleProblems(dir);
  assert.equal(p.length, 4, p.join('\n'));
  assert.ok(p.includes('index-abc.js is 500.0 kB, over the 500 kB chunk limit'), p.join('\n'));
});

test('the built dist/, when there is one, holds to the same rules', (t) => {
  const assets = fileURLToPath(new URL('../dist/assets', import.meta.url));
  if (!fs.existsSync(assets)) return t.skip('no dist/ (run npm run build)');
  assert.deepEqual(bundleProblems(assets), []);
});
