// Copies the canonical paste-prompts (repo-root prompts/) into the package,
// so the GUI's "give this to your agent" door quotes the same text the
// README hands out. Runs before every build; the copy is not committed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.resolve(pkg, '..', '..', 'prompts');
const out = path.join(pkg, 'prompts');

if (!fs.existsSync(src)) {
  console.log('bundle-prompts: no ../../prompts (outside the nexus repo); keeping what is there');
  process.exit(0);
}
fs.mkdirSync(out, { recursive: true });
for (const f of ['adopt.md', 'pitch.md']) {
  fs.copyFileSync(path.join(src, f), path.join(out, f));
}
console.log(`bundle-prompts: copied adopt.md, pitch.md -> ${path.relative(process.cwd(), out) || out}`);
