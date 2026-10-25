// Dimension I (spec 57.8, A6): nexus's own plan/AUDIT.md keeps its I rows in shape (scripts/plan/loop-rows.mjs), and
// the skills, bearings and command wrappers say what the spec decided: loop-config rows turn one repo variable or one
// bearings line, at most one ships per 7 days, a YAML tuning is a [needs-user-call]. Text checks only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { REPO_VARS, loopOn, main } from '../plan/loop-rows.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

describe('loop-rows on nexus', () => {
  it('nexus\'s own plan/AUDIT.md is clean', () => {
    const lines = [];
    assert.equal(main(['check'], { root: ROOT, log: (l) => lines.push(l) }), 0, lines.join('\n'));
  });

  it('nexus runs dimension I (loop: on); a new adoption does too', () => {
    assert.equal(loopOn(read('plan/bearings.md')).on, true);
    assert.equal(loopOn(read('templates/plan/bearings.md')).on, true);
  });

  it('every repo variable it accepts is one a template workflow reads', () => {
    const wf = 'templates/.github/workflows';
    const known = fs.readdirSync(path.join(ROOT, wf)).map((f) => read(`${wf}/${f}`)).join('\n');
    for (const v of REPO_VARS) assert.ok(known.includes(v), v);
  });
});

describe('the skills say it', () => {
  for (const file of ['skills/iterate.md', 'templates/skills/iterate.md']) {
    it(`${file}: dimension I, its row, the lever, the ease cap, the 7 days and the YAML ask`, () => {
      const t = read(file);
      assert.match(t, /### \[I, <score>\] <line>/);
      assert.match(t, /loop-config/);
      assert.match(t, /ONE concrete lever: a repo\s+variable/);
      assert.match(t, /Ease caps at 6/);
      assert.match(t, /At most one I row ships per 7 days/);
      assert.match(t, /\[needs-user-call\] <line>/);
      assert.match(t, /loop-rows\.mjs status/);
    });
  }

  it('the command wrappers take loop as a focus word', () => {
    assert.match(read('.claude/commands/iterate.md'), /lessons\|ui\|loop\)/);
    assert.match(read('templates/claude/commands/iterate.md'), /`loop`/);
  });
});
