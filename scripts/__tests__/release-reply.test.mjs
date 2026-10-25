// scripts/release-reply.mjs (spec 54, A11): a cli release closes the issues it fixed. git and gh are stubbed; the
// workflow wiring is read from publish.yml.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { decide, main, refsIn, replyText, summary, versionOf } from '../release-reply.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('versionOf', () => {
  it('reads the version from a cli-v tag', () => {
    assert.equal(versionOf('cli-v0.5.4'), '0.5.4');
    assert.equal(versionOf('cli-v1.0.0-rc.1'), '1.0.0-rc.1');
  });
  it('refuses anything else', () => {
    for (const t of ['v0.5.4', 'cli-v0.5', 'cli-v0.5.4; rm -rf /', '', 'refs/tags/cli-v0.5.4']) assert.equal(versionOf(t), null, t);
  });
});

describe('refsIn', () => {
  it('reads every Refs #N once, ascending', () => {
    assert.deepEqual(refsIn('fix: a\n\nRefs #88\n\0fix: b\n\nRefs: #86\nrefs #88\n\0'), [86, 88]);
  });
  it('ignores closing keywords, bare numbers and longer numbers', () => {
    assert.deepEqual(refsIn('Closes #12\nsee #13\nRefs#14'), []);
    assert.deepEqual(refsIn('Refs #1400'), [1400]);
  });
});

describe('decide', () => {
  const v = { version: '0.5.4' };
  it('closes an open issue labeled triage:loop-queued or bug', () => {
    assert.equal(decide({ state: 'OPEN', labels: ['triage:loop-queued'] }, v).action, 'close');
    assert.equal(decide({ state: 'OPEN', labels: [{ name: 'bug' }, { name: 'gui' }] }, v).action, 'close');
  });
  it('leaves an unlabeled, closed or unreadable issue alone, saying why', () => {
    assert.deepEqual(decide({ state: 'OPEN', labels: ['enhancement'] }, v), { action: 'leave', why: 'open, but not labeled triage:loop-queued or bug' });
    assert.deepEqual(decide({ state: 'CLOSED', labels: ['bug'] }, v), { action: 'leave', why: 'already closed' });
    assert.equal(decide(null, v).action, 'leave');
  });
  it('a prerelease closes nothing', () => {
    const d = decide({ state: 'OPEN', labels: ['bug'] }, { version: '0.6.0-rc.1' });
    assert.equal(d.action, 'leave');
    assert.match(d.why, /prerelease/);
  });
});

describe('replyText', () => {
  it('is the contract comment', () => {
    assert.equal(replyText('0.5.4'), 'Fixed in @usenexus/cli 0.5.4: npx @usenexus/cli@0.5.4');
  });
});

describe('summary', () => {
  it('lists the closed and the left alone with why', () => {
    const s = summary({ tag: 'cli-v0.5.4', previous: 'cli-v0.5.3', rows: [
      { number: 88, action: 'close', ok: true },
      { number: 90, action: 'leave', why: 'already closed' },
    ] }).join('\n');
    assert.match(s, /cli-v0\.5\.3\.\.cli-v0\.5\.4/);
    assert.match(s, /Closed \(1\):\n- #88/);
    assert.match(s, /Left alone \(1\):\n- #90: already closed/);
  });
  it('says when the range names no issue', () => {
    assert.match(summary({ tag: 'cli-v0.5.4', previous: null, rows: [] }).join('\n'), /nothing to close/);
  });
});

/** A spawnSync stand-in: git answers from `git`, gh from `issues`; every gh write is recorded. */
function stub({ previous = 'cli-v0.5.3', log = '', issues = {}, failClose = [], tagOk = true } = {}) {
  const calls = [];
  const run = (cmd, args) => {
    calls.push([cmd, ...args]);
    const ok = (stdout = '') => ({ status: 0, stdout });
    const no = { status: 1, stdout: '' };
    if (cmd === 'git') {
      if (args[0] === 'rev-parse') return tagOk ? ok('abc\n') : no;
      if (args[0] === 'describe') return previous ? ok(previous + '\n') : { status: 128, stdout: '' };
      if (args[0] === 'log') return ok(log);
    }
    if (cmd === 'gh' && args[0] === 'issue' && args[1] === 'view') {
      const i = issues[args[2]];
      return i ? ok(JSON.stringify({ state: i.state, labels: i.labels.map((name) => ({ name })) })) : no;
    }
    if (cmd === 'gh' && args[0] === 'issue' && args[1] === 'close') return failClose.includes(Number(args[2])) ? no : ok();
    return no;
  };
  return { run, calls };
}

function runMain(argv, s, env = {}) {
  const lines = [];
  const code = main(argv, { run: s.run, out: (l) => lines.push(l), env });
  return { code, text: lines.join('\n') };
}

describe('main', () => {
  const log = 'fix(cli): the hello answers\n\nRefs #88\n\0fix(cli): walk\n\nRefs #86\nRefs #90\n\0plan: 54.3\n\nRefs #91\n\0';
  const issues = {
    86: { state: 'OPEN', labels: ['triage:loop-queued'] },
    88: { state: 'OPEN', labels: ['bug'] },
    90: { state: 'CLOSED', labels: ['bug'] },
    91: { state: 'OPEN', labels: ['enhancement'] },
  };

  it('comments and closes each open labeled issue; leaves the rest and lists them', () => {
    const s = stub({ log, issues });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-reply-'));
    const file = path.join(dir, 'summary.md');
    const { code } = runMain(['cli-v0.5.4'], s, { GITHUB_STEP_SUMMARY: file });
    assert.equal(code, 0);
    const closes = s.calls.filter((c) => c[0] === 'gh' && c[2] === 'close');
    assert.deepEqual(closes, [
      ['gh', 'issue', 'close', '86', '--comment', 'Fixed in @usenexus/cli 0.5.4: npx @usenexus/cli@0.5.4'],
      ['gh', 'issue', 'close', '88', '--comment', 'Fixed in @usenexus/cli 0.5.4: npx @usenexus/cli@0.5.4'],
    ]);
    const sum = fs.readFileSync(file, 'utf8');
    assert.match(sum, /Closed \(2\):\n- #86\n- #88/);
    assert.match(sum, /- #90: already closed/);
    assert.match(sum, /- #91: open, but not labeled/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads the range from the previous stable tag, never a prerelease', () => {
    const s = stub({ log, issues });
    runMain(['cli-v0.5.4', '--dry-run'], s);
    const describe = s.calls.find((c) => c[0] === 'git' && c[1] === 'describe');
    assert.ok(describe.includes('--exclude') && describe.includes('cli-v*-*'));
    assert.equal(describe.at(-1), 'cli-v0.5.4^');
    assert.ok(s.calls.some((c) => c[0] === 'git' && c[1] === 'log' && c.includes('cli-v0.5.3..cli-v0.5.4')));
  });

  it('with no earlier stable tag, reads the whole history up to the tag', () => {
    const s = stub({ log, issues, previous: null });
    const { text } = runMain(['cli-v0.0.1', '--dry-run'], s);
    assert.ok(s.calls.some((c) => c[0] === 'git' && c[1] === 'log' && c.at(-1) === 'cli-v0.0.1'));
    assert.match(text, /no earlier stable cli-v tag/);
  });

  it('--dry-run writes nothing', () => {
    const s = stub({ log, issues });
    const { code, text } = runMain(['cli-v0.5.4', '--dry-run'], s);
    assert.equal(code, 0);
    assert.equal(s.calls.filter((c) => c[0] === 'gh' && c[2] === 'close').length, 0);
    assert.match(text, /#86: would close/);
  });

  it('a prerelease tag closes nothing', () => {
    const s = stub({ log, issues });
    const { text } = runMain(['cli-v0.6.0-rc.1'], s);
    assert.equal(s.calls.filter((c) => c[0] === 'gh' && c[2] === 'close').length, 0);
    assert.match(text, /#88: left · prerelease/);
  });

  it('a failed close stays exit 0 and is listed', () => {
    const s = stub({ log, issues, failClose: [88] });
    const { code, text } = runMain(['cli-v0.5.4'], s);
    assert.equal(code, 0);
    assert.match(text, /#88: close failed/);
    assert.match(text, /- #88: the gh close failed/);
  });

  it('without gh every issue is left alone', () => {
    const s = stub({ log, issues: {} });
    const { code, text } = runMain(['cli-v0.5.4'], s);
    assert.equal(code, 0);
    assert.equal(s.calls.filter((c) => c[0] === 'gh' && c[2] === 'close').length, 0);
    assert.match(text, /#86: left · unreadable/);
  });

  it('refuses a bad tag with 64 and an unreadable range with 1', () => {
    assert.equal(runMain([], stub()).code, 64);
    assert.equal(runMain(['v0.5.4'], stub()).code, 64);
    assert.equal(runMain(['cli-v0.5.4', '--bogus'], stub()).code, 64);
    assert.equal(runMain(['cli-v0.5.4'], stub({ tagOk: false })).code, 1);
  });
});

describe('publish.yml', () => {
  const text = fs.readFileSync(path.join(ROOT, '.github/workflows/publish.yml'), 'utf8').replace(/\r\n/g, '\n');
  const job = text.slice(text.indexOf('\n  reply:'));
  it('runs release-reply after publish, on a cli-v tag, behind NEXUS_RELEASE_REPLY', () => {
    assert.ok(text.includes('\n  reply:'), 'a reply job');
    assert.match(job, /needs: publish/);
    assert.match(job, /startsWith\(github\.ref, 'refs\/tags\/cli-v'\)/);
    assert.match(job, /vars\.NEXUS_RELEASE_REPLY != 'off'/);
    assert.match(job, /run: node scripts\/release-reply\.mjs "\$TAG"/);
  });
  it('holds issues: write on the reply job only, with the full history', () => {
    assert.match(job, /issues: write/);
    assert.match(job, /fetch-depth: 0/);
    assert.ok(!text.slice(0, text.indexOf('\n  reply:')).includes('issues: write'), 'the publish job never writes issues');
    assert.match(job, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  });
});
