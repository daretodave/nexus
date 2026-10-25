// heartbeat.yml's realized-cadence step, its own shell (nexus's copy and the template's), replayed against real
// September 2026 schedule-event run lists (fixtures/realized-cadence-2026-09.json): two adopters whose schedules
// GitHub throttled (an hourly cron at about 25% of its slots, a 40-minute one at about 13%) each open the ONE
// `Heartbeat: march realized cadence below 40%` issue, a second run while it is open files nothing, and nexus's own
// late-but-delivered schedule files nothing. A march.yml whose cron changed under 24h ago is not measured. The run
// lists are shifted by whole days so the last 72h before now fall inside September. Needs a posix bash.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { runScripts } from '../workflow-lint.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.resolve(HERE, '..');
const ROOT = path.resolve(KIT, '..', '..');
const FILES = ['.github/workflows/heartbeat.yml', 'templates/.github/workflows/heartbeat.yml'];
const FIXTURE = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'realized-cadence-2026-09.json'), 'utf8'));
const TITLE = 'Heartbeat: march realized cadence below 40%';

const uname = spawnSync('bash', ['-c', 'uname -s'], { encoding: 'utf8' });
const bashOk = uname.status === 0 && (process.platform !== 'win32' || /MINGW|MSYS|CYGWIN/.test(uname.stdout));
const toBash = (p) => p.replace(/\\/g, '/');

/** The realized-cadence step's script, dedented. */
function realizedScript(rel) {
  const s = runScripts(fs.readFileSync(path.join(ROOT, rel), 'utf8')).find((t) => t.includes('cadence.mjs realized'));
  assert.ok(s, `${rel}: no realized-cadence step`);
  const lines = s.split('\n');
  const pad = Math.min(...lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)[0].length));
  return lines.map((l) => l.slice(pad)).join('\n');
}

const STUB = `#!/usr/bin/env bash
all="$*"
case "$1 $2" in
  "workflow list") echo "\${STATE:-active}" ;;
  "run list")
    [ "$RUNS_FAIL" = 1 ] && exit 1
    [[ "$all" == *"--event schedule"* ]] || { echo "unexpected gh $all" >&2; exit 1; }
    cat "$RUNS" ;;
  "issue list")
    [[ "$all" == *"--author app/github-actions"* ]] || { echo "unexpected gh $all" >&2; exit 1; }
    echo "\${EXISTING:-0}" ;;
  "issue create") echo "$all" >> "$GH_LOG" ;;
  *) echo "unexpected gh $all" >&2; exit 1 ;;
esac
`;

const DAY = 86400000;

/** A loop's September runs, shifted by whole days (slots stay on their minutes) so September's end is now or later. */
function shifted(loop) {
  const end = Date.UTC(2026, 9, 1);
  const days = Math.ceil((Date.now() - end) / DAY);
  return loop.runs.map((t) => ({ createdAt: new Date(Date.parse(t) + days * DAY).toISOString().replace('.000Z', 'Z'), event: 'schedule' }));
}

/** A scratch adopter checkout (march.yml with the loop's cron, cadence.mjs where each copy runs it). */
function checkout(cron, { committed = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-realized-'));
  fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(root, '.github', 'workflows', 'march.yml'), `name: march\non:\n  schedule:\n    - cron: '${cron}'\n  workflow_dispatch:\n`);
  for (const dir of ['scripts/cloud', 'templates/scripts/cloud']) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.copyFileSync(path.join(KIT, 'cloud', 'cadence.mjs'), path.join(root, dir, 'cadence.mjs'));
  }
  if (committed) {
    const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' };
    for (const args of [['init', '-q'], ['add', '.github'], ['commit', '-q', '-m', 'ci: march']]) {
      const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', env });
      assert.equal(r.status, 0, r.stderr);
    }
  }
  return root;
}

function runStep(rel, name, env = {}, opts = {}) {
  const loop = FIXTURE.loops[name];
  const root = checkout(loop.cron, opts);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-gh-'));
  fs.writeFileSync(path.join(dir, 'gh'), STUB, { mode: 0o755 });
  const runs = path.join(dir, 'runs.json');
  fs.writeFileSync(runs, JSON.stringify(shifted(loop)));
  const script = path.join(dir, 'step.sh');
  fs.writeFileSync(script, realizedScript(rel));
  const log = path.join(dir, 'gh.log');
  // GitHub runs a step as `bash -eo pipefail`, so the test does too.
  const r = spawnSync('bash', ['-c', `export PATH="$(cd "${toBash(dir)}" && pwd):$PATH"; cd "${toBash(root)}" && bash -eo pipefail "${toBash(script)}"`], {
    encoding: 'utf8',
    env: { ...process.env, GH_LOG: toBash(log), RUNS: toBash(runs), RUNNER_TEMP: toBash(dir), ...env },
  });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  return { out: r.stdout, created: fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '' };
}

describe('heartbeat alarms on realized cadence', { skip: !bashOk && 'no posix bash here' }, () => {
  for (const rel of FILES) {
    for (const name of ['adopter-hourly', 'adopter-40min']) {
      it(`${rel}: ${name}'s throttled September schedule opens the one issue`, () => {
        const r = runStep(rel, name);
        assert.match(r.out, /march realized cadence: \d+ of \d+ promised slots ran in 72h \(\d+%, alarm under 40%/);
        assert.equal(r.created.split('\n').filter(Boolean).length, 1);
        assert.ok(r.created.includes(`--title ${TITLE}`), r.created);
        assert.match(r.created, /promised slots ran in 72h/);
      });

      it(`${rel}: ${name} files nothing while the issue is open (deduped)`, () => {
        const r = runStep(rel, name, { EXISTING: '1' });
        assert.match(r.out, /alarm under 40%/);
        assert.equal(r.created, '');
      });
    }

    it(`${rel}: nexus's late-but-delivered schedule files nothing`, () => {
      const r = runStep(rel, 'nexus');
      assert.match(r.out, /march realized cadence: \d+ of 12 promised slots ran in 72h/);
      assert.equal(r.created, '');
    });

    it(`${rel}: a cron changed under 24h ago is not measured`, () => {
      const r = runStep(rel, 'adopter-hourly', {}, { committed: true });
      assert.match(r.out, /not measured \(the cron line changed/);
      assert.equal(r.created, '');
    });

    it(`${rel}: a disabled march is the armed-ness step's report`, () => {
      const r = runStep(rel, 'adopter-hourly', { STATE: 'disabled_manually' });
      assert.match(r.out, /march: disabled_manually - realized cadence skipped/);
      assert.equal(r.created, '');
    });

    it(`${rel}: a run list it cannot read files nothing`, () => {
      const r = runStep(rel, 'adopter-hourly', { RUNS_FAIL: '1' });
      assert.match(r.out, /could not list its scheduled runs/);
      assert.equal(r.created, '');
    });
  }
});
