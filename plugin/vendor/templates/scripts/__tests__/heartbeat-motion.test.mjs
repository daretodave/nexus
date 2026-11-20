// heartbeat.yml's motion step, its own shell (nexus's copy and the template's) in a scratch repo whose history
// stalled: two shipped commits a week for four weeks, then a full week of none. Against a stubbed gh on PATH it opens
// the ONE `Heartbeat: motion stalled` issue with its labels, and files nothing while a weekly quota pause is open.
// Needs a posix bash. The stall case spawns gh from node, which only finds the stub where PATH lookup runs scripts
// (not Windows, where it would reach a real gh), so it runs on posix only.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { runScripts } from '../workflow-lint.mjs';
import { addDays, mondayOf, today } from '../plan/motion.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(KIT, '..', '..');
const FILES = ['.github/workflows/heartbeat.yml', 'templates/.github/workflows/heartbeat.yml'];

const uname = spawnSync('bash', ['-c', 'uname -s'], { encoding: 'utf8' });
const bashOk = uname.status === 0 && (process.platform !== 'win32' || /MINGW|MSYS|CYGWIN/.test(uname.stdout));
const posix = bashOk && process.platform !== 'win32';

/** The motion step's script, dedented. */
function motionScript(rel) {
  const s = runScripts(fs.readFileSync(path.join(ROOT, rel), 'utf8')).find((t) => t.includes('motion.mjs alarm'));
  assert.ok(s, `${rel}: no motion step`);
  const lines = s.split('\n');
  const pad = Math.min(...lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)[0].length));
  return lines.map((l) => l.slice(pad)).join('\n');
}

const STUB = `#!/usr/bin/env bash
all="$*"
case "$1 $2" in
  "issue list")
    if [[ "$all" == *"loop:paused-quota"* ]]; then echo "\${PAUSED:-0}"; else echo '[]'; fi ;;
  "run list") echo '[]' ;;
  "label create") ;;
  "issue create") echo "$all" >> "$GH_LOG" ;;
  *) echo "unexpected gh $all" >&2; exit 1 ;;
esac
`;

const toBash = (p) => p.replace(/\\/g, '/');

/** A scratch repo laid out as an adopter's (scripts/ from the kit), its history stalled in the last full week. */
function stalledRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-motion-'));
  fs.cpSync(KIT, path.join(root, 'scripts'), { recursive: true, filter: (src) => !src.includes('__tests__') });
  fs.mkdirSync(path.join(root, 'plan'));
  fs.writeFileSync(path.join(root, 'plan', 'bearings.md'), '# Bearings\n\n## Plan expansion posture\n\n- Motion floor: 50%\n- stall_action: alert\n');
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' };
  const git = (args, extra = {}) => {
    const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', env: { ...env, ...extra } });
    assert.equal(r.status, 0, r.stderr);
  };
  git(['init', '-q']);
  const current = mondayOf(today());
  for (let k = 5; k >= 2; k--) {
    const at = `${addDays(current, -7 * k + 1)}T12:00:00Z`;
    for (const s of ['feat: a feature', 'fix: a fix', 'audit: housekeeping']) git(['commit', '-q', '--allow-empty', '-m', s], { GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at });
  }
  return root;
}

function runStep(rel, root, paused) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-gh-'));
  fs.writeFileSync(path.join(dir, 'gh'), STUB, { mode: 0o755 });
  const script = path.join(dir, 'step.sh');
  fs.writeFileSync(script, motionScript(rel));
  const log = path.join(dir, 'gh.log');
  const r = spawnSync('bash', ['-c', `export PATH="$(cd "${toBash(dir)}" && pwd):$PATH"; cd "${toBash(root)}" && bash "${toBash(script)}"`], {
    encoding: 'utf8',
    env: { ...process.env, PAUSED: String(paused), GH_LOG: toBash(log), RUNNER_TEMP: toBash(dir) },
  });
  assert.equal(r.status, 0, r.stderr);
  return { out: r.stdout, created: fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '' };
}

describe('heartbeat motion step', { skip: !bashOk && 'no posix bash here' }, () => {
  for (const rel of FILES) {
    it(`${rel}: files nothing while a weekly quota pause is open`, () => {
      const r = runStep(rel, fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-motion-')), 1);
      assert.equal(r.created, '');
      assert.match(r.out, /no scripts\/plan\/motion\.mjs|paused on the weekly quota/);
    });

    it(`${rel}: opens one labelled motion-stall issue when the last full week shipped nothing`, { skip: !posix && 'gh is spawned from node: posix only' }, () => {
      const r = runStep(rel, stalledRepo(), 0);
      assert.match(r.out, /shipped 0 \/ baseline 2 /);
      assert.match(r.out, /floor 1 · stalled/);
      assert.equal(r.created.split('\n').filter((l) => l.includes('issue create')).length, 1);
      assert.match(r.created, /--title Heartbeat: motion stalled/);
      assert.match(r.created, /--label loop:opened --label loop:stall/);
    });

    it(`${rel}: the pause skips the measure itself`, () => {
      const r = runStep(rel, stalledRepo(), 1);
      assert.equal(r.created, '');
      assert.match(r.out, /motion: loop paused on the weekly quota/);
    });
  }
});
