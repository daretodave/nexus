// scripts/verify.mjs's tree leg (legTree): the root-level reverse-check added in
// chunk 72.2 (spec 72, A3) — a tracked file directly at a tree's own root that
// isn't named as its own entry in that tree's diagram is drift. Covers the two
// new pure helpers (rootFiles, missingRootFiles) in isolation; the newly-expanded-
// dir and excluded-dir cases (72.1) and the full exported-helpers suite are
// chunk 72.3's scope. node:test, pure (no disk, no git).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rootFiles, missingRootFiles } from '../verify.mjs';

describe('rootFiles', () => {
  it('picks tracked paths directly at the repo root (prefix ""), not deeper', () => {
    const tracked = ['README.md', '.gitignore', 'scripts/verify.mjs', 'plan/README.md'];
    assert.deepEqual(rootFiles(tracked, ''), ['README.md', '.gitignore']);
  });

  it('picks tracked paths directly under a prefix, not its own subdirectories', () => {
    const tracked = ['templates/README.md', 'templates/agents.md', 'templates/plan/README.md', 'other/file.md'];
    assert.deepEqual(rootFiles(tracked, 'templates'), ['templates/README.md', 'templates/agents.md']);
  });
});

describe('missingRootFiles', () => {
  it('fails a tracked root file missing from the tree\'s own entries (A3)', () => {
    const tracked = ['README.md', 'CLAUDE.md'];
    const entries = ['README.md']; // CLAUDE.md never got its own tree line
    assert.deepEqual(missingRootFiles(tracked, '', entries, 'README.md'), ['CLAUDE.md']);
  });

  it('passes a root file on the VCS/boilerplate exclusion list even though absent from entries', () => {
    const tracked = ['README.md', '.gitignore', '.gitattributes', 'LICENSE'];
    const entries = ['README.md'];
    assert.deepEqual(missingRootFiles(tracked, '', entries, 'README.md'), []);
  });

  it('never flags the tree-bearing file itself, whether or not it lists itself', () => {
    const entries = ['templates/agents.md', 'templates/design-prompt.md']; // templates/README.md doesn't list itself
    const tracked = ['templates/README.md', 'templates/agents.md', 'templates/design-prompt.md'];
    assert.deepEqual(missingRootFiles(tracked, 'templates', entries, 'templates/README.md'), []);
  });

  it('passes once the missing file gets its own entry', () => {
    const tracked = ['README.md', 'CLAUDE.md'];
    const entries = ['README.md', 'CLAUDE.md'];
    assert.deepEqual(missingRootFiles(tracked, '', entries, 'README.md'), []);
  });
});
