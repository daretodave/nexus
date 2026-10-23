// Writes the agent guide (shared/stack/guide.mjs) into the app's repo: docs/stack.md's marked block, and a short
// marked pointer at the end of agents.md (or AGENTS.md, else CLAUDE.md) so every session that reads the rule book
// finds it. Only the marked blocks change; every other line stays byte for byte, in the file's own line endings. A
// write that would change nothing is skipped, so saving the same stack twice leaves the files untouched. Names
// only: the text comes from the registry and the env names, never a value. Nothing here logs.
import fs from 'node:fs';
import path from 'node:path';
import { GUIDE_FILE, renderGuide, applyBlock, applyPointer, hasBlock } from '../shared/stack/guide.mjs';

const RULE_BOOKS = ['agents.md', 'AGENTS.md', 'CLAUDE.md'];

const readText = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };

/** Write a text file atomically (a temp file renamed into place). */
function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.nexus-tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

/** Text in a file's own line ending: CRLF when the file already uses it. */
const inEol = (text, like) => (/\r\n/.test(like || '') ? text.replace(/\r?\n/g, '\r\n') : text);

/**
 * Bring the guide up to date. repo: the app's checkout. picked, app, names: as renderGuide takes them.
 * Returns { path, written, pointer, pointerWritten }. With nothing picked and no guide on disk, it writes nothing.
 */
export function writeGuide({ repo, picked = [], app = {}, names = {} }) {
  const file = path.join(repo, GUIDE_FILE);
  const before = readText(file);
  const out = { path: GUIDE_FILE, written: false, pointer: null, pointerWritten: false };
  if (!picked.length && (before === null || !hasBlock(before))) return out;
  const lf = (before || '').replace(/\r\n/g, '\n');
  const next = inEol(applyBlock(lf, renderGuide({ picked, app, names })), before);
  if (next !== before) { writeText(file, next); out.written = true; }
  if (!picked.length) return out;
  const book = RULE_BOOKS.find((f) => fs.existsSync(path.join(repo, f)));
  if (!book) return out;
  out.pointer = book;
  const abs = path.join(repo, book);
  const text = readText(abs) ?? '';
  const pointed = inEol(applyPointer(text.replace(/\r\n/g, '\n'), GUIDE_FILE), text);
  if (pointed !== text) { writeText(abs, pointed); out.pointerWritten = true; }
  return out;
}

/** What the panel shows about the guide: where it is, whether it is there, and which rule book points at it. */
export function guideStatus(repo) {
  const text = readText(path.join(repo, GUIDE_FILE));
  const book = RULE_BOOKS.find((f) => /nexus:stack-pointer:begin/.test(readText(path.join(repo, f)) || ''));
  return { path: GUIDE_FILE, exists: text !== null && hasBlock(text), pointer: book || null };
}
