// Module hooks for tests that render .jsx on the server: a .jsx file is compiled with vite's oxc transform (React's
// automatic runtime), a .css import is an empty module. Registered by test/jsx.mjs.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

let transform;
export async function load(url, context, next) {
  if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
  if (!url.endsWith('.jsx')) return next(url, context);
  transform ||= (await import('vite')).transformWithOxc;
  const file = fileURLToPath(url);
  const { code } = await transform(fs.readFileSync(file, 'utf8'), file, { jsx: { runtime: 'automatic' } });
  return { format: 'module', source: code, shortCircuit: true };
}
