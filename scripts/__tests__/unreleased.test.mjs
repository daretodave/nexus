// scripts/plan/unreleased.mjs (spec 56.8): the pure parts, and /digest's wiring to it. The git end runs in
// unreleased-run.test.mjs (scripts-git leg).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { format, main, parseLog } from '../plan/unreleased.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('parseLog', () => {
  it('splits sha and subject on the tab, dropping blank lines', () => {
    assert.deepEqual(parseLog('abc1234\tfix(cli): the hello answers\r\n\ndef5678\tfeat: walk\n'), [
      { sha: 'abc1234', subject: 'fix(cli): the hello answers' },
      { sha: 'def5678', subject: 'feat: walk' },
    ]);
  });
  it('reads nothing from empty output', () => {
    assert.deepEqual(parseLog(''), []);
  });
});

describe('format', () => {
  it('counts and lists the commits since the tag', () => {
    assert.deepEqual(format({ tag: 'cli-v0.5.4', commits: [{ sha: 'abc1234', subject: 'fix: a' }] }), [
      'unreleased CLI fixes: 1 since cli-v0.5.4',
      '  abc1234 fix: a',
    ]);
  });
  it('says none when the tag is current', () => {
    assert.deepEqual(format({ tag: 'cli-v0.5.4', commits: [] }), ['unreleased CLI fixes: none since cli-v0.5.4']);
  });
  it('says when no cli-v* tag exists yet', () => {
    assert.match(format({ tag: null, commits: [{ sha: 'a', subject: 'b' }] })[0], /1 and no cli-v\* tag yet/);
  });
});

describe('main', () => {
  it('refuses an unknown flag with 64', () => {
    const lines = [];
    assert.equal(main(['--nope'], { cwd: ROOT, out: (l) => lines.push(l) }), 64);
    assert.match(lines[0], /^usage:/);
  });
});

describe('/digest lists unreleased CLI fixes', () => {
  const digest = fs.readFileSync(path.join(ROOT, 'skills/digest.md'), 'utf8');
  it('gathers them in the pulse', () => {
    assert.match(digest, /node scripts\/plan\/unreleased\.mjs/);
  });
  it('writes the section into plan/DIGEST.md', () => {
    assert.match(digest, /`Unreleased CLI fixes`/);
  });
  it('runs where night.yml checks out the cli-v* tags (full history)', () => {
    const night = fs.readFileSync(path.join(ROOT, '.github/workflows/night.yml'), 'utf8');
    assert.match(night, /fetch-depth:\s*0\b/);
  });
});
