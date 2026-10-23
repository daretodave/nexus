// Grill me's spec briefs (0.5.1, server/spec-brief.mjs): the lede skips status quotes, meta lines, tables and
// comments; "why it matters" comes from the first heading that says why; a file that is not a spec gets its path
// and the heading over its first [needs-user-call] row; only plan/**.md is read.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { briefOf, cutAtSentence, specBriefs } from '../server/spec-brief.mjs';

const SPEC = [
  '# 11 Sharing and referrals',
  '',
  '> Status: chunked',
  '**Owner:** sam',
  '',
  '| chunk | size |',
  '|---|---|',
  '| 11.1 | S |',
  '',
  '<!-- a note for later',
  'still a note -->',
  '',
  'Clubs grow by word of mouth. This spec makes sharing',
  'first-class.',
  '',
  '## Design',
  '',
  'Links look like the club.',
  '',
  '## Why it matters',
  '',
  'Half of new clubs came from another club.',
  '',
  '## Open questions',
  '',
  '- What reward?',
].join('\n');

test('a spec: the first prose paragraph after the title, and the why under a "why" heading', () => {
  const b = briefOf(SPEC, 'plan/11-sharing.md');
  assert.equal(b.n, '11');
  assert.equal(b.title, 'Sharing and referrals');
  assert.equal(b.lede, 'Clubs grow by word of mouth. This spec makes sharing first-class.');
  assert.equal(b.why, 'Half of new clubs came from another club.');
  assert.equal(briefOf(SPEC.replace('## Why it matters', '## Notes'), 'plan/11-sharing.md').why, null, 'no why heading: null');
  assert.equal(briefOf(SPEC.replace('## Why it matters', '## The problem'), 'plan/11-sharing.md').why, 'Half of new clubs came from another club.');
});

test('a long lede is cut at a sentence end', () => {
  const long = `${'A short sentence here. '.repeat(50)}`;
  const c = cutAtSentence(long, 700);
  assert.ok(c.length <= 700);
  assert.ok(c.endsWith('.'));
});

test('a file that is not a spec: its path, and the heading over its first [needs-user-call] row', () => {
  const b = briefOf('# Audit\n\n## Show mode\n\n- [ ] [needs-user-call] Real team names?\n', 'plan/AUDIT.md');
  assert.deepEqual(b, { n: null, title: 'plan/AUDIT.md', lede: 'Show mode', why: null });
});

test('only plan/**.md files that exist are read', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-brief-'));
  try {
    fs.mkdirSync(path.join(dir, 'plan'));
    fs.writeFileSync(path.join(dir, 'plan', '11-sharing.md'), SPEC);
    fs.writeFileSync(path.join(dir, 'secret.md'), '# no');
    const r = specBriefs(dir, ['plan/11-sharing.md', 'secret.md', '../secret.md', 'plan/../secret.md', 'plan/missing.md']);
    assert.deepEqual(Object.keys(r.specs), ['plan/11-sharing.md']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
