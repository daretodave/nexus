// heartbeat.yml's red-gate alarm: a watched push-triggered workflow (a CI gate such as cli-ci) whose newest completed
// push run on the default branch failed opens one deduped issue; a green run, an open issue, or a scheduled loop in the
// same watch list files nothing. The step's own shell runs here (nexus's copy and the template's) against a stubbed gh
// on PATH. Needs a posix bash; skipped where there is none.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { runScripts } from '../workflow-lint.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const NEXUS = '.github/workflows/heartbeat.yml';
const TEMPLATE = 'templates/.github/workflows/heartbeat.yml';

const uname = spawnSync('bash', ['-c', 'uname -s'], { encoding: 'utf8' });
const bashOk = uname.status === 0 && (process.platform !== 'win32' || /MINGW|MSYS|CYGWIN/.test(uname.stdout));

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** The red-gate step's script, dedented. */
function redScript(rel) {
  const s = runScripts(read(rel)).find((t) => t.includes('is red on'));
  assert.ok(s, `${rel}: no red-gate step`);
  const lines = s.split('\n');
  const pad = Math.min(...lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)[0].length));
  return lines.map((l) => l.slice(pad)).join('\n');
}

/** The default watch list of the step that names the red gate. */
function redDefault(rel) {
  const text = read(rel).replace(/\r\n/g, '\n');
  const at = text.indexOf('- name: Alarm if a watched gate is red');
  assert.ok(at >= 0, `${rel}: no red-gate step`);
  const m = /NEXUS_HEARTBEAT_WATCH \|\| '([^']*)'/.exec(text.slice(at));
  assert.ok(m, `${rel}: the red-gate step reads no NEXUS_HEARTBEAT_WATCH default`);
  return m[1].split(/\s+/);
}

// Rows answer only a query for push runs on main: a step that forgets --event push or --branch finds nothing.
const STUB = `#!/usr/bin/env bash
all="$*"
case "$1 $2" in
  "repo view") echo main ;;
  "run list")
    if [[ "$all" == *"--event push"* && "$all" == *"--branch main"* && "$all" == *"--status completed"* ]]; then
      if [[ "$all" == *"--workflow cli-ci"* ]]; then printf '%s\\n' "$CLI_ROW"; fi
    fi ;;
  "issue list") echo "\${OPEN:-0}" ;;
  "issue create") echo "$all" >> "$GH_LOG" ;;
esac
`;

function runRed(rel, { cli = '', open = 0, watch = 'march night cli-ci' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-red-'));
  fs.writeFileSync(path.join(dir, 'gh'), STUB, { mode: 0o755 });
  const script = path.join(dir, 'step.sh');
  fs.writeFileSync(script, redScript(rel));
  const log = path.join(dir, 'gh.log');
  const toBash = (p) => p.replace(/\\/g, '/');
  const r = spawnSync('bash', ['-c', `export PATH="$(cd "${toBash(dir)}" && pwd):$PATH"; bash "${toBash(script)}"`], {
    encoding: 'utf8',
    env: { ...process.env, CLI_ROW: cli, OPEN: String(open), WATCH: watch, GH_LOG: toBash(log) },
  });
  assert.equal(r.status, 0, r.stderr);
  return { out: r.stdout, created: fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '' };
}

const URL = 'https://github.com/o/r/actions/runs/42';
const row = (conclusion) => `${conclusion}\t0123456789abcdef\t${URL}`;

describe('heartbeat watch list', () => {
  it('nexus watches its GUI gate', () => {
    assert.deepEqual(redDefault(NEXUS), ['march', 'night', 'cli-ci']);
    const wedged = /Cancel wedged runs[\s\S]*?NEXUS_HEARTBEAT_WATCH \|\| '([^']*)'/.exec(read(NEXUS));
    assert.equal(wedged[1], 'march night cli-ci');
  });

  it('the template default stays the loops alone (adopters add their own gate)', () => {
    assert.deepEqual(redDefault(TEMPLATE), ['march', 'night']);
  });
});

describe('heartbeat red-gate alarm', { skip: !bashOk && 'no posix bash here' }, () => {
  for (const rel of [NEXUS, TEMPLATE]) {
    it(`${rel}: a failed push run on main opens the red issue with the run link`, () => {
      const r = runRed(rel, { cli: row('failure') });
      assert.match(r.created, /Heartbeat: cli-ci is red on main/);
      assert.ok(r.created.includes(URL), r.created);
      assert.match(r.created, /0123456/);
    });

    it(`${rel}: a timed-out run is red too`, () => {
      assert.match(runRed(rel, { cli: row('timed_out') }).created, /cli-ci is red on main/);
    });

    it(`${rel}: a green run files nothing`, () => {
      const r = runRed(rel, { cli: row('success') });
      assert.equal(r.created, '');
      assert.match(r.out, /cli-ci: newest push run on main is success/);
    });

    it(`${rel}: an open red issue is the one report`, () => {
      assert.equal(runRed(rel, { cli: row('failure'), open: 1 }).created, '');
    });

    it(`${rel}: scheduled loops in the list have no push runs and file nothing`, () => {
      const r = runRed(rel, { cli: row('failure'), watch: 'march night' });
      assert.equal(r.created, '');
      assert.match(r.out, /march: no completed push run on main/);
    });
  }
});
