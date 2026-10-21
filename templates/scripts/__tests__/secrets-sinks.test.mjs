// secrets-sinks.mjs and `secrets.mjs push`: a sink pipes a vault value to where it is needed (GitHub Actions first)
// through stdin, never argv, and every push lands in the audit record by name, never by value. Every command goes
// through a recording runner: no test runs gh (or any sink's tool), so no test can set a real secret anywhere. Every
// value below is a fake, and each one is searched for in every byte the CLI prints and the audit holds.
// node:test, no deps.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { main } from '../secrets.mjs';
import { AUDIT, SINKS, pushSecret, readAudit, recordAudit, sinkFor } from '../secrets-sinks.mjs';

const FAKES = ['fake-gh-0001', 'fake "quoted" $(not run) 0002'];

function recorder(reply = () => ({ status: 0 })) {
  const calls = [];
  return { calls, run: (cmd, args, opts = {}) => { calls.push({ cmd, args, ...opts }); return reply(cmd, args, opts); } };
}
/** A runner that must never be reached. */
const never = () => { throw new Error('a sink ran where none should'); };

function workspace() {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets sinks '));
  const repo = path.join(ws, 'repo');
  fs.mkdirSync(repo);
  return { ws, repo, done: () => fs.rmSync(ws, { recursive: true, force: true }) };
}

describe('the GitHub Actions sink', () => {
  it('runs gh secret set NAME with the value on stdin only, never in argv', () => {
    for (const value of FAKES) {
      const r = recorder();
      const done = pushSecret({ name: 'A_TOKEN', value, destination: 'github-actions', run: r.run, cwd: '/w/repo' });
      assert.deepEqual(done, { destination: 'github-actions', ok: true });
      assert.equal(r.calls.length, 1);
      assert.equal(r.calls[0].cmd, 'gh');
      assert.deepEqual(r.calls[0].args, ['secret', 'set', 'A_TOKEN', '--app', 'actions']);
      assert.equal(r.calls[0].input, value);
      assert.equal(r.calls[0].cwd, '/w/repo');
      assert.ok(!r.calls[0].args.join(' ').includes(value), 'the value reached argv');
    }
  });

  it('targets another repo with --repo, and reports a failure by exit code, never by value', () => {
    const r = recorder(() => ({ status: 1 }));
    const done = pushSecret({ name: 'A_TOKEN', value: FAKES[0], destination: 'github-actions', run: r.run, repo: 'me/app' });
    assert.deepEqual(r.calls[0].args, ['secret', 'set', 'A_TOKEN', '--app', 'actions', '--repo', 'me/app']);
    assert.equal(done.ok, false);
    assert.match(done.error, /gh exited 1/);
    assert.ok(!done.error.includes(FAKES[0]));
  });

  it('knows GitHub Actions only (Vercel and Cloudflare come next), and refuses a bad name or value before running', () => {
    assert.deepEqual(Object.keys(SINKS), ['github-actions']);
    assert.equal(sinkFor('github-actions').command, 'gh');
    assert.equal(sinkFor('vercel'), null);
    assert.equal(sinkFor('local'), null);
    assert.throws(() => pushSecret({ name: 'A_TOKEN', value: FAKES[0], destination: 'vercel', run: never }), /no sink for vercel/);
    assert.throws(() => pushSecret({ name: 'a-token', value: FAKES[0], destination: 'github-actions', run: never }), /not an env-var name/);
    assert.throws(() => pushSecret({ name: 'A_TOKEN', value: '', destination: 'github-actions', run: never }), /an empty value/);
    assert.throws(() => pushSecret({ name: 'A_TOKEN', value: 'two\nlines', destination: 'github-actions', run: never }), /one line/);
  });
});

describe('the audit record', () => {
  it('appends one JSON line per event, by name and destination and time, and refuses a value', () => {
    const t = workspace();
    try {
      assert.deepEqual(readAudit(t.repo), []);
      recordAudit(t.repo, { action: 'push', name: 'A_TOKEN', destination: 'github-actions' }, { now: () => '2026-10-21T10:00:00.000Z' });
      recordAudit(t.repo, { action: 'push', name: 'B_TOKEN', destination: 'github-actions' }, { now: () => '2026-10-21T11:00:00.000Z' });
      const lines = fs.readFileSync(path.join(t.repo, AUDIT), 'utf8').trim().split('\n');
      assert.equal(lines.length, 2);
      assert.deepEqual(JSON.parse(lines[0]), { time: '2026-10-21T10:00:00.000Z', action: 'push', name: 'A_TOKEN', destination: 'github-actions' });
      assert.deepEqual(readAudit(t.repo).map((e) => e.name), ['A_TOKEN', 'B_TOKEN']);
      assert.throws(() => recordAudit(t.repo, { action: 'push', name: 'A_TOKEN', value: FAKES[0] }), /never a value/);
      assert.throws(() => recordAudit(t.repo, { action: 'push', name: 'A_TOKEN', note: { x: 1 } }), /note: a string/);
      assert.throws(() => recordAudit(t.repo, { name: 'A_TOKEN' }), /action/);
      assert.ok(!fs.readFileSync(path.join(t.repo, AUDIT), 'utf8').includes(FAKES[0]));
      fs.appendFileSync(path.join(t.repo, AUDIT), 'not json\n');
      assert.equal(readAudit(t.repo).length, 2, 'a torn line is skipped');
    } finally {
      t.done();
    }
  });
});

describe('secrets push', () => {
  function setup(t) {
    fs.writeFileSync(path.join(t.repo, 'nexus.secrets.json'), JSON.stringify({ version: 1, secrets: [
      { name: 'GH_TOKEN', for: 'The issue mirror.', where: null, destinations: ['local', 'github-actions'], provider: 'owner', chunk: null },
      { name: 'VERCEL_TOKEN', for: 'Deploys.', where: null, destinations: ['github-actions', 'vercel'], provider: 'owner', chunk: null },
      { name: 'LOCAL_TOKEN', for: 'Local only.', where: null, destinations: ['local'], provider: 'owner', chunk: null },
      { name: 'MISSING_TOKEN', for: 'Not set.', where: null, destinations: ['github-actions'], provider: 'owner', chunk: null },
    ] }));
    fs.writeFileSync(path.join(t.repo, '.env'), `GH_TOKEN=fake-gh-0001\nVERCEL_TOKEN="${FAKES[1].replace(/"/g, '\\"')}"\nLOCAL_TOKEN=fake-gh-0001\n`);
  }
  async function push(t, argv, { owner = () => true, run = never } = {}) {
    const lines = [];
    const out = (s) => lines.push(s);
    const code = await main([...argv, '--root', t.repo], { out, err: out, owner, run, vault: { git: () => ({ status: 0, stdout: '' }) } });
    const text = lines.join('\n');
    for (const f of FAKES) assert.ok(!text.includes(f), `a value reached the terminal: ${text}`);
    return { code, text };
  }
  const audit = (t) => { const p = path.join(t.repo, AUDIT); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; };

  it('pushes a declared name to its destinations through stdin and records each push', async () => {
    const t = workspace();
    try {
      setup(t);
      const r = recorder();
      const { code, text } = await push(t, ['push', 'GH_TOKEN'], { run: r.run });
      assert.equal(code, 0, text);
      assert.match(text, /GH_TOKEN -> github-actions/);
      assert.equal(r.calls.length, 1, 'local is the vault itself: nothing to push there');
      assert.equal(r.calls[0].input, FAKES[0]);
      assert.equal(path.resolve(r.calls[0].cwd), path.resolve(t.repo));
      const rec = readAudit(t.repo);
      assert.deepEqual(rec.map((e) => [e.action, e.name, e.destination]), [['push', 'GH_TOKEN', 'github-actions']]);
      assert.ok(!FAKES.some((f) => audit(t).includes(f)));

      const r2 = recorder();
      assert.equal((await push(t, ['push', 'GH_TOKEN', '--to', 'github-actions', '--repo', 'me/app'], { run: r2.run })).code, 0);
      assert.deepEqual(r2.calls[0].args.slice(-2), ['--repo', 'me/app']);
    } finally {
      t.done();
    }
  });

  it('pushes what it can, names a destination with no sink yet, and records only what landed', async () => {
    const t = workspace();
    try {
      setup(t);
      const r = recorder();
      const { code, text } = await push(t, ['push', 'VERCEL_TOKEN'], { run: r.run });
      assert.equal(code, 1);
      assert.match(text, /VERCEL_TOKEN -> github-actions/);
      assert.match(text, /no sink for vercel yet/);
      assert.equal(r.calls.length, 1);
      assert.equal(r.calls[0].input, FAKES[1]);
      assert.deepEqual(readAudit(t.repo).map((e) => e.destination), ['github-actions']);

      const failing = recorder(() => ({ status: 4 }));
      const bad = await push(t, ['push', 'GH_TOKEN'], { run: failing.run });
      assert.equal(bad.code, 1);
      assert.match(bad.text, /gh exited 4/);
      assert.equal(readAudit(t.repo).length, 1, 'a failed push is not recorded as a push');
    } finally {
      t.done();
    }
  });

  it('refuses a contributor, an undeclared or missing name, a destination the manifest does not list, and bad usage', async () => {
    const t = workspace();
    try {
      setup(t);
      const contributor = await push(t, ['push', 'GH_TOKEN'], { owner: () => false });
      assert.equal(contributor.code, 1);
      assert.match(contributor.text, /owner mode/);
      assert.match(contributor.text, /local-only/);
      const undeclared = await push(t, ['push', 'OTHER_TOKEN']);
      assert.equal(undeclared.code, 1);
      assert.match(undeclared.text, /OTHER_TOKEN is not declared/);
      const missing = await push(t, ['push', 'MISSING_TOKEN']);
      assert.equal(missing.code, 1);
      assert.match(missing.text, /MISSING_TOKEN is not in the vault: set it first/);
      const elsewhere = await push(t, ['push', 'GH_TOKEN', '--to', 'cloudflare']);
      assert.equal(elsewhere.code, 1);
      assert.match(elsewhere.text, /GH_TOKEN does not go to cloudflare/);
      const local = await push(t, ['push', 'LOCAL_TOKEN']);
      assert.equal(local.code, 0);
      assert.match(local.text, /LOCAL_TOKEN goes to local only: nothing to push/);
      assert.equal((await push(t, ['push'])).code, 64);
      assert.equal((await push(t, ['push', 'GH_TOKEN', '--to', 'local'])).code, 64);
      assert.equal((await push(t, ['push', 'GH_TOKEN', '--to', 'heroku'])).code, 64);
      assert.equal((await push(t, ['status', '--to', 'github-actions'])).code, 64);
      assert.equal(audit(t), '', 'nothing was pushed, so nothing was recorded');
    } finally {
      t.done();
    }
  });
});
