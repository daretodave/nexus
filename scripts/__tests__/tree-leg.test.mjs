// scripts/verify.mjs's tree leg (legTree): the root-level reverse-check added in
// chunk 72.2 (spec 72, A3) — a tracked file directly at a tree's own root that
// isn't named as its own entry in that tree's diagram is drift. Covers the two
// pure helpers (rootFiles, missingRootFiles) in isolation, plus (72.3) the
// derivation helper legTree uses to turn parsed tree entries into its
// reverse-check directory list (deriveReverseCheckDirs, isExpanded) and
// parseTreeBlock itself. node:test, pure (no disk, no git).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rootFiles, missingRootFiles, parseTreeBlock, isExpanded, deriveReverseCheckDirs } from '../verify.mjs';

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

describe('parseTreeBlock', () => {
  it('reads depth from the marker prefix and cuts each name at its comment', () => {
    const text = [
      '```',
      'nexus/',
      '├── README.md          # kit entry point',
      '├── skills/',
      '│   ├── march.md',
      '└── plan/',
      '```',
    ].join('\n');
    const { entries, sawRoot } = parseTreeBlock(text, 'nexus/', '');
    assert.ok(sawRoot);
    assert.deepEqual(entries, ['README.md', 'skills', 'skills/march.md', 'plan']);
  });

  it('never sees the root, and finds no entries, when the fence never matches the root label', () => {
    const text = '```\nsomething-else/\n├── README.md\n```';
    assert.deepEqual(parseTreeBlock(text, 'nexus/', ''), { entries: [], sawRoot: false });
  });
});

describe('isExpanded (72.3)', () => {
  it('is true for a dir some other entry nests under, false for a dir with no children listed', () => {
    const allEntries = new Set(['foo', 'foo/sub', 'bar']);
    assert.equal(isExpanded('foo', allEntries), true);
    assert.equal(isExpanded('bar', allEntries), false);
  });
});

describe('deriveReverseCheckDirs (72.3)', () => {
  it('picks up a newly expanded top-level dir automatically, with no edit to the gate', () => {
    // `widgets` is brand new to the fake tree — nothing in verify.mjs names it —
    // yet listing one child entry (widgets/sub) is enough for it to qualify.
    const topLevelEntries = new Set(['widgets', 'flat']);
    const allEntries = new Set(['widgets', 'widgets/sub', 'flat']);
    assert.deepEqual(deriveReverseCheckDirs(topLevelEntries, allEntries), ['widgets']);
  });

  it('leaves out a top-level dir collapsed to one line (no child entries)', () => {
    const topLevelEntries = new Set(['flat']);
    const allEntries = new Set(['flat']);
    assert.deepEqual(deriveReverseCheckDirs(topLevelEntries, allEntries), []);
  });

  it('excludes a dir on EXCLUDE_DIRS even though the diagram expands it', () => {
    // 'scripts' is on EXCLUDE_DIRS (README.md bundles its siblings, not exhaustive):
    // it must drop out even with a child entry that would otherwise qualify it.
    const topLevelEntries = new Set(['scripts', 'widgets']);
    const allEntries = new Set(['scripts', 'scripts/verify.mjs', 'widgets', 'widgets/sub']);
    assert.deepEqual(deriveReverseCheckDirs(topLevelEntries, allEntries), ['widgets']);
  });

  it('drops an ancestor when one of its own children also qualifies', () => {
    // Mirrors README.md's abbreviated `templates/` row and templates/README.md's
    // own exhaustive `templates/claude/` row both counting as "top-level" (each
    // relative to its own tree's root) — the narrower one wins.
    const topLevelEntries = new Set(['templates', 'templates/claude']);
    const allEntries = new Set(['templates', 'templates/claude', 'templates/claude/commands']);
    assert.deepEqual(deriveReverseCheckDirs(topLevelEntries, allEntries), ['templates/claude']);
  });
});
