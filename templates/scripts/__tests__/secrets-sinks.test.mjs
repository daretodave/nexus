// secrets-sinks.mjs and `secrets.mjs push`: a sink pipes a vault value to where it is needed (GitHub Actions, Vercel,
// Cloudflare) through stdin, never argv, and every push lands in the audit record by name, never by value. Every command
// goes through a recording runner: no test runs gh, vercel or wrangler, so no test can set a real secret anywhere. Every
// value below is a fake, and each one is searched for in every byte the CLI prints and the audit holds.
// node:test, no deps.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { main } from '../secrets.mjs';
import { AUDIT, SINKS, VERCEL_ENVIRONMENTS, pushSecret, readAudit, recordAudit, sinkFor } from '../secrets-sinks.mjs';

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

  it('knows GitHub Actions, Vercel and Cloudflare (local is the vault), and refuses a bad name or value before running', () => {
    assert.deepEqual(Object.keys(SINKS), ['github-actions', 'vercel', 'cloudflare']);
    assert.equal(sinkFor('github-actions').command, 'gh');
    assert.equal(sinkFor('vercel').command, 'vercel');
    assert.equal(sinkFor('cloudflare').command, 'wrangler');
    assert.equal(sinkFor('local'), null);
    assert.equal(sinkFor('heroku'), null);
    assert.throws(() => pushSecret({ name: 'A_TOKEN', value: FAKES[0], destination: 'heroku', run: never }), /no sink for heroku/);
    assert.throws(() => pushSecret({ name: 'a-token', value: FAKES[0], destination: 'github-actions', run: never }), /not an env-var name/);
    assert.throws(() => pushSecret({ name: 'A_TOKEN', value: '', destination: 'github-actions', run: never }), /an empty value/);
    assert.throws(() => pushSecret({ name: 'A_TOKEN', value: 'two\nlines', destination: 'github-actions', run: never }), /one line/);
  });
});

describe('the Vercel sink', () => {
  it('runs vercel env add NAME <environment> --force --yes once per environment (all three by default), the value on stdin', () => {
    for (const value of FAKES) {
      const r = recorder();
      const done = pushSecret({ name: 'A_TOKEN', value, destination: 'vercel', run: r.run, cwd: '/w/repo' });
      assert.deepEqual(done, { destination: 'vercel', ok: true, detail: { environments: VERCEL_ENVIRONMENTS } });
      assert.deepEqual(VERCEL_ENVIRONMENTS, ['production', 'preview', 'development']);
      assert.deepEqual(r.calls.map((c) => c.cmd), ['vercel', 'vercel', 'vercel']);
      assert.deepEqual(r.calls.map((c) => c.args), VERCEL_ENVIRONMENTS.map((e) => ['env', 'add', 'A_TOKEN', e, '--force', '--yes']));
      for (const c of r.calls) {
        assert.equal(c.input, value);
        assert.equal(c.cwd, '/w/repo');
        assert.ok(!c.args.join(' ').includes(value), 'the value reached argv');
        assert.ok(!c.args.includes('--value') && !c.args.includes('--token'), 'a value flag reached argv');
      }
    }
  });

  it('narrows to the environments named, refuses an unknown one, and stops at the first failure naming what landed', () => {
    const r = recorder();
    const done = pushSecret({ name: 'A_TOKEN', value: FAKES[0], destination: 'vercel', run: r.run, environments: ['preview'] });
    assert.deepEqual(r.calls.map((c) => c.args[3]), ['preview']);
    assert.deepEqual(done.detail, { environments: ['preview'] });
    assert.throws(() => pushSecret({ name: 'A_TOKEN', value: FAKES[0], destination: 'vercel', run: never, environments: ['staging'] }), /staging: a Vercel environment is one of production, preview, development/);
    const failing = recorder((cmd, args) => ({ status: args[3] === 'preview' ? 2 : 0 }));
    const bad = pushSecret({ name: 'A_TOKEN', value: FAKES[0], destination: 'vercel', run: failing.run });
    assert.equal(bad.ok, false);
    assert.equal(failing.calls.length, 2, 'it stops at the first failure');
    assert.match(bad.error, /vercel exited 2 \(preview\)/);
    assert.deepEqual(bad.detail, { environments: ['production'] }, 'what landed before the failure');
    assert.ok(!bad.error.includes(FAKES[0]));
  });
});

describe('the Cloudflare sink', () => {
  it('runs wrangler secret put NAME with the value on stdin, the worker from the checkout\'s wrangler config or --name', () => {
    for (const value of FAKES) {
      const r = recorder();
      const done = pushSecret({ name: 'A_TOKEN', value, destination: 'cloudflare', run: r.run, cwd: '/w/repo' });
      assert.deepEqual(done, { destination: 'cloudflare', ok: true });
      assert.equal(r.calls.length, 1);
      assert.equal(r.calls[0].cmd, 'wrangler');
      assert.deepEqual(r.calls[0].args, ['secret', 'put', 'A_TOKEN']);
      assert.equal(r.calls[0].input, value);
      assert.equal(r.calls[0].cwd, '/w/repo');
      assert.ok(!r.calls[0].args.join(' ').includes(value), 'the value reached argv');
    }
    const named = recorder();
    const done = pushSecret({ name: 'A_TOKEN', value: FAKES[0], destination: 'cloudflare', run: named.run, worker: 'my-worker' });
    assert.deepEqual(named.calls[0].args, ['secret', 'put', 'A_TOKEN', '--name', 'my-worker']);
    assert.deepEqual(done.detail, { worker: 'my-worker' });
    assert.throws(() => pushSecret({ name: 'A_TOKEN', value: FAKES[0], destination: 'cloudflare', run: never, worker: '--env x' }), /not a worker name/);
    const missing = pushSecret({ name: 'A_TOKEN', value: FAKES[0], destination: 'cloudflare', run: () => ({ status: 127, missing: true }) });
    assert.deepEqual(missing, { destination: 'cloudflare', ok: false, error: 'wrangler is not installed' });
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
      { name: 'CF_TOKEN', for: 'The edge worker.', where: null, destinations: ['cloudflare'], provider: 'owner', chunk: null },
      { name: 'MISSING_TOKEN', for: 'Not set.', where: null, destinations: ['github-actions'], provider: 'owner', chunk: null },
    ] }));
    fs.writeFileSync(path.join(t.repo, '.env'), `GH_TOKEN=fake-gh-0001\nVERCEL_TOKEN="${FAKES[1].replace(/"/g, '\\"')}"\nLOCAL_TOKEN=fake-gh-0001\nCF_TOKEN=fake-gh-0001\n`);
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

  it('pushes to Vercel per environment and to Cloudflare, and records what landed with its environments or worker', async () => {
    const t = workspace();
    try {
      setup(t);
      const r = recorder();
      const { code, text } = await push(t, ['push', 'VERCEL_TOKEN'], { run: r.run });
      assert.equal(code, 0, text);
      assert.match(text, /VERCEL_TOKEN -> github-actions/);
      assert.match(text, /VERCEL_TOKEN -> vercel \(production, preview, development\)/);
      assert.deepEqual(r.calls.map((c) => c.cmd), ['gh', 'vercel', 'vercel', 'vercel']);
      for (const c of r.calls) assert.equal(c.input, FAKES[1]);
      assert.deepEqual(readAudit(t.repo).map((e) => [e.destination, e.environments]), [
        ['github-actions', undefined], ['vercel', ['production', 'preview', 'development']],
      ]);

      const narrow = recorder();
      assert.equal((await push(t, ['push', 'VERCEL_TOKEN', '--to', 'vercel', '--env', 'production,preview'], { run: narrow.run })).code, 0);
      assert.deepEqual(narrow.calls.map((c) => c.args[3]), ['production', 'preview']);

      const cf = recorder();
      const worker = await push(t, ['push', 'CF_TOKEN', '--worker', 'edge-api'], { run: cf.run });
      assert.equal(worker.code, 0, worker.text);
      assert.match(worker.text, /CF_TOKEN -> cloudflare \(worker edge-api\)/);
      assert.deepEqual(cf.calls[0].args, ['secret', 'put', 'CF_TOKEN', '--name', 'edge-api']);
      const { time, ...cfEvent } = readAudit(t.repo).at(-1);
      assert.ok(time);
      assert.deepEqual(cfEvent, { action: 'push', name: 'CF_TOKEN', destination: 'cloudflare', worker: 'edge-api' });

      const before = readAudit(t.repo).length;
      const half = recorder((cmd, args) => ({ status: args[3] === 'development' ? 3 : 0 }));
      const partial = await push(t, ['push', 'VERCEL_TOKEN', '--to', 'vercel'], { run: half.run });
      assert.equal(partial.code, 1);
      assert.match(partial.text, /vercel exited 3 \(development\)/);
      const last = readAudit(t.repo);
      assert.equal(last.length, before + 1, 'the environments that landed are recorded');
      assert.deepEqual(last.at(-1).environments, ['production', 'preview']);

      const failing = recorder(() => ({ status: 4 }));
      const bad = await push(t, ['push', 'GH_TOKEN'], { run: failing.run });
      assert.equal(bad.code, 1);
      assert.match(bad.text, /gh exited 4/);
      assert.equal(readAudit(t.repo).length, before + 1, 'a failed push is not recorded as a push');
      assert.ok(!FAKES.some((f) => audit(t).includes(f)));
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
      assert.equal((await push(t, ['status', '--env', 'preview'])).code, 64);
      assert.equal((await push(t, ['push', 'VERCEL_TOKEN', '--env', ''])).code, 64);
      assert.equal((await push(t, ['push', 'CF_TOKEN', '--worker', ''])).code, 64);
      const staging = await push(t, ['push', 'VERCEL_TOKEN', '--to', 'vercel', '--env', 'staging']);
      assert.equal(staging.code, 1);
      assert.match(staging.text, /staging: a Vercel environment/);
      assert.equal(audit(t), '', 'nothing was pushed, so nothing was recorded');
    } finally {
      t.done();
    }
  });
});
