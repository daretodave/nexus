// heartbeat.yml's cadence alarm under a weekly quota lockout: while a `Loop paused: weekly quota` issue is open the
// loop skips the model on purpose, so no flatline issue is filed; with none open, a stale loop still alarms. The step's
// own shell runs here (nexus's copy and the template's) against a stubbed gh on PATH. Needs a posix bash; skipped
// where there is none (or where `bash` is not one that can run this checkout's paths).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { runScripts } from '../workflow-lint.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FILES = ['.github/workflows/heartbeat.yml', 'templates/.github/workflows/heartbeat.yml'];

const uname = spawnSync('bash', ['-c', 'uname -s'], { encoding: 'utf8' });
const bashOk = uname.status === 0 && (process.platform !== 'win32' || /MINGW|MSYS|CYGWIN/.test(uname.stdout));

/** The cadence step's script, dedented. */
function cadenceScript(rel) {
  const s = runScripts(fs.readFileSync(path.join(ROOT, rel), 'utf8')).find((t) => t.includes('check_cadence march'));
  assert.ok(s, `${rel}: no cadence step`);
  const lines = s.split('\n');
  const pad = Math.min(...lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)[0].length));
  return lines.map((l) => l.slice(pad)).join('\n');
}

const STUB = `#!/usr/bin/env bash
all="$*"
case "$1 $2" in
  "workflow list") printf 'march\\tactive\\nnight\\tactive\\nheartbeat\\tactive\\n' ;;
  "run list") echo "2026-01-01T00:00:00Z" ;;
  "issue list")
    # PAUSED names the open pause-titled issue, if any: label (labelled), bot (unlabelled, the workflow token's),
    # outsider (unlabelled, anyone's). A title search finds the outsider's unless it filters on the bot author.
    if [[ "$all" == *"--label loop:paused-quota"* ]]; then
      if [ "$PAUSED" = label ]; then echo 1; else echo 0; fi
    elif [[ "$all" == *"Loop paused: weekly quota"* ]]; then
      case "$PAUSED" in
        label|bot) echo 1 ;;
        outsider) if [[ "$all" == *"app/github-actions"* ]]; then echo 0; else echo 1; fi ;;
        *) echo 0 ;;
      esac
    else echo 0; fi ;;
  "issue create") echo "$all" >> "$GH_LOG" ;;
esac
`;

function runCadence(rel, paused) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-'));
  fs.writeFileSync(path.join(dir, 'gh'), STUB, { mode: 0o755 });
  const script = path.join(dir, 'step.sh');
  fs.writeFileSync(script, cadenceScript(rel));
  const log = path.join(dir, 'gh.log');
  const toBash = (p) => p.replace(/\\/g, '/');
  const r = spawnSync('bash', ['-c', `export PATH="$(cd "${toBash(dir)}" && pwd):$PATH"; bash "${toBash(script)}"`], {
    encoding: 'utf8',
    env: { ...process.env, PAUSED: String(paused), GH_LOG: toBash(log) },
  });
  assert.equal(r.status, 0, r.stderr);
  return { out: r.stdout, created: fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '' };
}

describe('heartbeat under a quota pause', { skip: !bashOk && 'no posix bash here' }, () => {
  for (const rel of FILES) {
    for (const kind of ['label', 'bot']) {
      it(`${rel}: files no flatline while the pause issue is open (${kind})`, () => {
        const r = runCadence(rel, kind);
        assert.equal(r.created, '');
        assert.match(r.out, /march: loop paused on the weekly quota/);
      });
    }

    it(`${rel}: still files the flatline when no pause issue is open`, () => {
      const r = runCadence(rel, 'none');
      assert.match(r.created, /Heartbeat: march has flatlined/);
    });

    it(`${rel}: an outsider's unlabelled pause-titled issue does not silence the flatline`, () => {
      const r = runCadence(rel, 'outsider');
      assert.match(r.created, /Heartbeat: march has flatlined/);
    });
  }
});
