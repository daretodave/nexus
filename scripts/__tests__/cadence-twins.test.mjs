// scripts/cadence-twins.mjs (the cadence-twins leg): the Cadence, Quota gate and Chain next tick steps agree between
// nexus's workflows and the templates' by what they read and run, not by path or default; a drifted step, a step
// missing from one copy, or a stale CLI kit is red. node:test, pure (an in-memory tree).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { KIT, check, stepSignature, twinSteps } from '../cadence-twins.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const real = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const OWN = `jobs:
  march:
    steps:
      - name: Cadence
        id: cadence
        env:
          CADENCE: \${{ vars.NEXUS_CADENCE }}
          CHAIN_MAX: \${{ vars.NEXUS_CHAIN_MAX }}
        run: node templates/scripts/cloud/cadence.mjs resolve --cadence "$CADENCE" --chain-max "$CHAIN_MAX" || true

      # a comment that belongs to the next step
      - name: Quota gate
        env:
          QUOTA_MAX: \${{ vars.NEXUS_QUOTA_MAX || '0.80' }}
        run: node templates/scripts/cloud/quota.mjs gate --max "$QUOTA_MAX"
`;
/** The template's copy: other paths and defaults, same names. */
const TPL = OWN.replaceAll('templates/scripts/', 'scripts/').replace("'0.80'", "'0.90'");

/** A tree in memory: { rel: text }, with directories implied by the paths. */
function tree(files) {
  const exists = (rel) => Object.hasOwn(files, rel) || Object.keys(files).some((f) => f.startsWith(`${rel}/`));
  return { exists, readFile: (rel) => files[rel] };
}
const pair = (own, tpl, extra = {}) => tree({ '.github/workflows/march.yml': own, 'templates/.github/workflows/march.yml': tpl, ...extra });

describe('twinSteps and stepSignature', () => {
  it('cuts each named step at its end, leaving the next step\'s comment out', () => {
    const s = twinSteps(OWN);
    assert.deepEqual([...s.keys()], ['Cadence', 'Quota gate']);
    assert.ok(!s.get('Cadence')[0].includes('a comment'));
    assert.ok(s.get('Cadence')[0].endsWith('|| true'));
  });

  it('names env keys, variables, script, subcommand and flags; never values or paths', () => {
    const sig = stepSignature(twinSteps(OWN).get('Cadence')[0]);
    assert.deepEqual(sig, { env: ['CADENCE', 'CHAIN_MAX'], vars: ['NEXUS_CADENCE', 'NEXUS_CHAIN_MAX'], outputs: [], script: 'cadence.mjs resolve', flags: ['cadence', 'chain-max'] });
    assert.deepEqual(stepSignature(twinSteps(TPL).get('Quota gate')[0]), stepSignature(twinSteps(OWN).get('Quota gate')[0]));
  });
});

describe('check', () => {
  it('passes copies that differ only in paths and defaults; no kit built is a skip', () => {
    const r = check('.', pair(OWN, TPL));
    assert.deepEqual(r.problems, []);
    assert.match(r.note, /2 named steps agree.*not built here, skipped/);
  });

  it('fails a step that reads another variable or passes another flag', () => {
    const drift = TPL.replace('--chain-max "$CHAIN_MAX"', '--chain-max "$CHAIN_MAX" --idle-backoff 3');
    assert.match(check('.', pair(OWN, drift)).problems.join('\n'), /"Cadence" differs \(flags/);
    const v = TPL.replace('vars.NEXUS_CHAIN_MAX', 'vars.NEXUS_CHAIN_LIMIT');
    assert.match(check('.', pair(OWN, v)).problems.join('\n'), /"Cadence" differs \(vars/);
  });

  it('fails a step one copy lacks', () => {
    const gone = TPL.replace(/ {6}- name: Cadence[\s\S]*?\|\| true\n/, '');
    assert.match(check('.', pair(OWN, gone)).problems.join('\n'), /templates\/\.github\/workflows\/march\.yml: no "Cadence" step/);
  });

  it('a built kit must hold the template\'s steps and cadence.mjs byte for byte', () => {
    const cad = '// cadence\n';
    const ok = check('.', pair(OWN, TPL, { [`${KIT}/workflows/march.yml`]: TPL.replace(/\n/g, '\r\n'), [`${KIT}/scripts/cloud/cadence.mjs`]: cad, 'templates/scripts/cloud/cadence.mjs': cad }));
    assert.deepEqual(ok.problems, []);
    assert.match(ok.note, /the CLI kit's 2 copies match/);
    const stale = check('.', pair(OWN, TPL, { [`${KIT}/workflows/march.yml`]: OWN, [`${KIT}/scripts/cloud/cadence.mjs`]: '// old\n', 'templates/scripts/cloud/cadence.mjs': cad }));
    assert.equal(stale.problems.length, 3);
    assert.match(stale.problems.join('\n'), /rebuild it: npm --prefix packages\/cli run build/);
    const missing = check('.', pair(OWN, TPL, { [`${KIT}/scripts/other.mjs`]: '' }));
    assert.equal(missing.problems.length, 2);
  });

  it('the real march, night and heartbeat copies agree', () => {
    const files = {};
    for (const wf of ['march.yml', 'night.yml', 'heartbeat.yml']) {
      for (const rel of [`.github/workflows/${wf}`, `templates/.github/workflows/${wf}`]) files[rel] = real(rel);
    }
    const r = check('.', tree(files));
    assert.deepEqual(r.problems, []);
    assert.match(r.note, /^6 named steps agree/);
  });
});
