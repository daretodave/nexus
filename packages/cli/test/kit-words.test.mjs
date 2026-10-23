// The words the Infinite picker sends must be words the skills document, or a session reads them as free text. Every
// word followPrompt can send is checked against the kit's skills and command pointers (template and the kit's own).
// Skips when the repo files are absent (the package installed on its own).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { followPrompt } from '../src/screens/fleet/follow.js';

const root = new URL('../../../', import.meta.url);
const has = fs.existsSync(new URL('templates/skills/march.md', root));
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');

const WORDS = {
  careful: ['templates/skills/march.md', 'skills/march.md', 'templates/skills/iterate.md', 'skills/iterate.md'],
  bold: ['templates/skills/march.md', 'skills/march.md'],
  'then expand': ['templates/skills/next.md', 'skills/next.md', 'templates/claude/commands/next.md', '.claude/commands/next.md'],
  'then build': ['templates/skills/next.md', 'skills/next.md', 'templates/claude/commands/next.md', '.claude/commands/next.md', 'templates/skills/expand.md', 'skills/expand.md'],
  promote: ['templates/skills/expand.md', 'skills/expand.md'],
};

test('every word the picker sends is a documented skill word', { skip: !has && 'repo files absent' }, () => {
  for (const [word, files] of Object.entries(WORDS)) for (const f of files) assert.ok(read(f).includes(word), `${word} in ${f}`);
  const sent = [
    followPrompt({ mode: 'march', ideas: 'careful' }), followPrompt({ mode: 'march', ideas: 'bold' }),
    followPrompt({ mode: 'next', dry: 'expand' }), followPrompt({ mode: 'next', dry: 'build' }),
  ];
  for (const p of sent) {
    const tail = p.replace(/^\/loop \/(march|next) ?/, '');
    assert.ok(tail in WORDS, `${p}: "${tail}" is checked`);
  }
});
