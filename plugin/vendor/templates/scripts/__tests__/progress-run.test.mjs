// plan/progress.mjs end to end: its main() run as a child process from a scratch repo whose path has a space, with a
// claims module beside it (a stub: one live claim held by this session, one by someone else) and a claims branch whose
// history dates the claim. Both the text view and --json read the claims, so the module was found through the spaced
// path. Offline, but it spawns git (the opt-in `scripts-git` gate leg). node:test, no deps.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

const KIT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_') && k !== 'NEXUS_SESSION' && k !== 'CLAUDE_CODE_SESSION_ID'));
let dir;
let repo;

function git(...args) {
  const res = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: ENV });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')}: ${res.stderr}`);
  return res.stdout.trim();
}

const SPEC = [
  '# 07 · Search box', '', '## Acceptance', '', '- **A1** a', '- **A2** b', '- **A3** c', '- **A4** d', '',
  '## Chunks', 'Measure: 3 open · 1 closed · next A5', '',
  '- [ ] **07.2** Results page lists hits · M · closes A2 · needs —',
  '- [ ] **07.3** Empty state shows · S · closes A3 · needs —',
  '- [ ] **07.4** Keyboard focus · S · closes A4 · needs —', '',
].join('\n');

// The claims module progress.mjs imports from ../claims.mjs: only the three names it uses.
const STUB = `
const at = new Date(Date.now() - 30 * 60_000).toISOString();
export const sessionId = () => process.env.NEXUS_SESSION || '';
export const fetchClaims = () => ({ map: {
  '07.2': { who: 'privileged_agent_session', host: 'box', session: 'sess1234', at, pr: null, held: '', base: '' },
  '07.4': { who: 'sam', host: 'pc', session: 'other999', at, pr: 12, held: '', base: '' },
} });
export const parse = (v) => v;
`;

function progress(...argv) {
  const res = spawnSync(process.execPath, [path.join(repo, 'scripts', 'plan', 'progress.mjs'), ...argv], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...ENV, NEXUS_SESSION: 'sess1234' },
  });
  assert.equal(res.status, 0, `progress ${argv.join(' ')} exited ${res.status}: ${res.stderr}`);
  return res.stdout;
}

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus progress-'));
  repo = path.join(dir, 'my repo');
  fs.mkdirSync(path.join(repo, 'scripts', 'plan'), { recursive: true });
  for (const f of ['progress.mjs', 'pending.mjs', 'config.mjs', 'footguns.mjs']) {
    fs.copyFileSync(path.join(KIT, 'plan', f), path.join(repo, 'scripts', 'plan', f));
  }
  fs.writeFileSync(path.join(repo, 'scripts', 'claims.mjs'), STUB);
  fs.mkdirSync(path.join(repo, 'plan'));
  fs.writeFileSync(path.join(repo, 'plan', '07-search-box.md'), SPEC);
  fs.writeFileSync(path.join(repo, 'plan', 'ARCHIVE.md'), '# Archive\n\n- 2026-10-19 · 07.1 · Search box renders · a1b2c3d\n');
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  git('config', 'commit.gpgsign', 'false');
  git('add', '-A');
  git('commit', '-qm', 'init');
  // The claims branch's history: the claim on 07.2, which dates "under way".
  fs.writeFileSync(path.join(repo, 'claims.json'), '{}\n');
  git('add', 'claims.json');
  git('commit', '-qm', 'claim 07.2 · privileged_agent_session@box');
  git('update-ref', 'refs/remotes/origin/claims', 'HEAD');
});

after(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('progress main() from a path with a space', () => {
  it('prints the text view with the claims the module beside it holds', () => {
    assert.match(repo, / /);
    const out = progress('07');
    assert.match(out, /^Spec 07 · Search box$/m);
    assert.match(out, /\] 1 of 4 chunks · 25%/);
    assert.match(out, /~~07\.1 Search box renders~~/);
    assert.match(out, /^- 07\.2 Results page lists hits \(M\) · under way for about \S+ (min|h) <--- \[here\]$/m);
    assert.match(out, /^- 07\.3 Empty state shows \(S\) · not claimed yet$/m);
    assert.match(out, /^- 07\.4 Keyboard focus \(S\) · PR #12, sam's$/m);
  });

  it('finds the spec from this session\'s claims when none is named', () => {
    assert.match(progress(), /^Spec 07 · Search box$/m);
  });

  it('prints the same as data with --json', () => {
    const data = JSON.parse(progress('07', '--json'));
    assert.equal(data.specs.length, 1);
    const [spec] = data.specs;
    assert.equal(spec.file, '07-search-box.md');
    assert.equal(spec.here, '07.2');
    assert.deepEqual(spec.counts, { closed: 1, claimed: 2, open: 1, total: 4 });
    const byId = Object.fromEntries(spec.chunks.map((c) => [c.id, c]));
    assert.equal(byId['07.1'].state, 'closed');
    assert.equal(byId['07.2'].claim.mine, true);
    assert.ok(byId['07.2'].underWay.since, 'the claims branch dated the claim');
    assert.equal(byId['07.3'].state, 'open');
    assert.deepEqual(byId['07.4'].claim, { who: 'sam', mine: false, pr: 12, held: null, wholeSpec: false });
  });
});
