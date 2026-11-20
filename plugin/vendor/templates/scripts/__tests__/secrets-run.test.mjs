// secrets-run.mjs, secrets-scan.mjs and the CLI's run and scan: a command gets the declared values in its environment
// and nothing else from the vault, its output comes back masked, and a diff that adds a vault value is found and named
// (never shown). Every value below is a fake, and each one is searched for in every byte the CLI prints. The scan's
// end-to-end run (a real git repo) is in secrets-scan-run.test.mjs.
// node:test, no deps.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { masker, runWithSecrets } from '../secrets-run.mjs';
import { MIN_SECRET, addedLines, isSecretShaped, describeHit, findValues, maskText, scanDiff, scanRepo, vaultValues } from '../secrets-scan.mjs';
import { openVault } from '../secrets-vault.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', 'secrets.mjs');
const A = 'fake-a-value-000111';
const B = 'fake "b" value 0002';
const U = 'fake-undeclared-0003';
const FAKES = [A, B, U];

const entry = (name) => ({ name, for: 'A test secret.', where: null, destinations: ['local'], provider: 'owner', chunk: null });

function checkout({ env = `A_TOKEN=${A}\nB_TOKEN="fake \\"b\\" value 0002"\nUNDECLARED_TOKEN=${U}\n`, declared = ['A_TOKEN', 'B_TOKEN'] } = {}) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets run '));
  const repo = path.join(ws, 'repo');
  fs.mkdirSync(repo);
  fs.writeFileSync(path.join(repo, 'nexus.secrets.json'), JSON.stringify({ version: 1, secrets: declared.map(entry) }, null, 2));
  if (env !== null) fs.writeFileSync(path.join(repo, '.env'), env);
  return { ws, repo, done: () => fs.rmSync(ws, { recursive: true, force: true }) };
}

const cli = (repo, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: repo, encoding: 'utf8', env: { ...process.env, A_TOKEN: '', B_TOKEN: '', UNDECLARED_TOKEN: '' } });
const noValue = (r) => { for (const v of FAKES) assert.ok(!(r.stdout + r.stderr).includes(v), 'a value reached the output'); };
// The child's script: no double quotes, so it survives the Windows shell's quoting.
const node = (code) => [process.execPath, '-e', code];

describe('the masker', () => {
  const values = new Map([['A_TOKEN', A], ['SHORT', 'abc']]);

  it('masks a value whole, split across writes, and at the end, and leaves short values alone', () => {
    let out = '';
    const m = masker(values, (s) => { out += s; });
    m.write(`one ${A} two `);
    m.write(A.slice(0, 7));
    m.write(A.slice(7));
    m.write(' abc fake-a-');
    m.end();
    assert.equal(out, 'one [secret A_TOKEN] two [secret A_TOKEN] abc fake-a-');
  });

  it('passes ordinary output through as it comes, holding back only a possible start of a value', () => {
    const got = [];
    const m = masker(values, (s) => got.push(s));
    m.write('line one\n');
    assert.deepEqual(got, ['line one\n']);
    m.write('ends with fake');
    assert.deepEqual(got, ['line one\n', 'ends with ']);
    m.write('-ish\n');
    assert.deepEqual(got, ['line one\n', 'ends with ', 'fake-ish\n']);
  });

  it('keeps a multi-byte character split across writes whole', () => {
    let out = '';
    const m = masker(values, (s) => { out += s; });
    const buf = Buffer.from('café ok');
    m.write(buf.subarray(0, 4));
    m.write(buf.subarray(4));
    m.end();
    assert.equal(out, 'café ok');
  });
});

describe('runWithSecrets', () => {
  it('adds the values to the env, masks them in stdout and stderr, and returns the exit code', async () => {
    let out = '';
    let err = '';
    const code = await runWithSecrets(node("process.stdout.write('v=' + process.env.A_TOKEN); process.stderr.write(process.env.A_TOKEN.length + ':' + process.env.A_TOKEN); process.exit(3)"), new Map([['A_TOKEN', A]]), { out: (s) => { out += s; }, err: (s) => { err += s; } });
    assert.equal(code, 3);
    assert.equal(out, 'v=[secret A_TOKEN]');
    assert.equal(err, `${A.length}:[secret A_TOKEN]`);
  });

  it('returns 127 for a command that does not exist', async () => {
    let err = '';
    const code = await runWithSecrets(['nexus-no-such-command-xyz'], new Map([['A_TOKEN', A]]), { out: () => {}, err: (s) => { err += s; } });
    assert.notEqual(code, 0);
    assert.ok(!err.includes(A));
  });
});

describe('secrets run', () => {
  it('gives the command the declared values and nothing else from the vault, masked', () => {
    const c = checkout();
    try {
      const r = cli(c.repo, 'run', '--root', c.repo, '--', ...node("console.log([process.env.A_TOKEN === 'fake-a-value-000111', process.env.B_TOKEN, process.env.UNDECLARED_TOKEN || 'none'].join(' | '))"));
      assert.equal(r.status, 0, r.stderr);
      noValue(r);
      assert.equal(r.stdout.trim(), 'true | [secret B_TOKEN] | none');
    } finally { c.done(); }
  });

  it('hands over only the --only names, and refuses an undeclared one', () => {
    const c = checkout();
    try {
      const r = cli(c.repo, 'run', '--only', 'A_TOKEN', '--root', c.repo, '--', ...node("console.log(String(!!process.env.A_TOKEN) + ' ' + String(!!process.env.B_TOKEN))"));
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout.trim(), 'true false');
      const bad = cli(c.repo, 'run', '--only', 'UNDECLARED_TOKEN', '--root', c.repo, '--', ...node('1'));
      assert.equal(bad.status, 1);
      assert.match(bad.stderr, /not declared in nexus\.secrets\.json: UNDECLARED_TOKEN/);
      noValue(bad);
    } finally { c.done(); }
  });

  it('refuses to start the command when a declared name is missing, naming it', () => {
    const c = checkout({ env: `A_TOKEN=${A}\n` });
    const marker = path.join(c.ws, 'ran');
    try {
      const r = cli(c.repo, 'run', '--root', c.repo, '--', ...node(`require('fs').writeFileSync(${JSON.stringify(marker).replace(/"/g, "'")}, 'x')`));
      assert.equal(r.status, 1);
      assert.match(r.stderr, /not set in the vault: B_TOKEN/);
      assert.ok(!fs.existsSync(marker));
      noValue(r);
    } finally { c.done(); }
  });

  it("passes the child's exit code through, and the child's own flags after --", () => {
    const c = checkout();
    try {
      const r = cli(c.repo, 'run', '--root', c.repo, '--', ...node('console.log(process.argv.slice(1).join(\' \')); process.exit(5)'), '--', '--root', 'x', '--only', 'y');
      assert.equal(r.status, 5);
      assert.equal(r.stdout.trim(), '--root x --only y');
    } finally { c.done(); }
  });

  it('is a usage error without a command, with -- on another command, or a scan flag on run', () => {
    const c = checkout();
    try {
      assert.equal(cli(c.repo, 'run', '--root', c.repo).status, 64);
      assert.equal(cli(c.repo, 'run', '--root', c.repo, '--').status, 64);
      assert.equal(cli(c.repo, 'status', '--root', c.repo, '--', 'x').status, 64);
      assert.equal(cli(c.repo, 'run', '--staged', '--root', c.repo, '--', 'x').status, 64);
      assert.equal(cli(c.repo, 'scan', '--only', 'A_TOKEN', '--root', c.repo).status, 64);
    } finally { c.done(); }
  });
});

describe('the diff scan', () => {
  const values = new Map([['A_TOKEN', A], ['B_TOKEN', B], ['SHORT', 'fake']]);
  const DIFF = [
    'diff --git a/src/x.js b/src/x.js',
    '--- a/src/x.js',
    '+++ b/src/x.js',
    '@@ -1,2 +1,3 @@',
    ` const old = '${A}'`,
    `-const gone = '${B}'`,
    '+const fine = process.env.A_TOKEN',
    `+const leak = '${A}'`,
    'diff --git a/notes.md b/notes.md',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/notes.md',
    '@@ -0,0 +10,2 @@',
    '+fake fake fake',
    `+pasted: ${B}`,
  ].join('\n');

  it('reads the added lines with their file and line number', () => {
    assert.deepEqual(addedLines(DIFF).map((l) => `${l.file}:${l.line}`), ['src/x.js:2', 'src/x.js:3', 'notes.md:10', 'notes.md:11']);
  });

  it('finds a value only on an added line, names it, and skips values under the minimum length', () => {
    const hits = scanDiff(DIFF, values);
    assert.deepEqual(hits, [{ file: 'src/x.js', line: 3, name: 'A_TOKEN' }, { file: 'notes.md', line: 11, name: 'B_TOKEN' }]);
    assert.equal(describeHit(hits[0]), 'src/x.js:3: holds the value of A_TOKEN');
    assert.equal(MIN_SECRET, 8);
    assert.deepEqual(scanDiff('+++ b/a\n@@ -0,0 +1 @@\n+fake\n', values), []);
    assert.deepEqual(findValues(`x ${A} y`, values), ['A_TOKEN']);
    assert.equal(maskText(`${A}/${B}`, values), '[secret A_TOKEN]/[secret B_TOKEN]');
  });

  it('skips a value shaped like configuration: one plain word, a number, a localhost URL', () => {
    for (const v of ['production', 'development', '12345678', 'http://localhost:3000', 'https://127.0.0.1/', 'short']) assert.equal(isSecretShaped(v), false, v);
    for (const v of ['ghp_fake0000', 'postgres://u:fake-pass@db/x', 'fakeword1', 'two words']) assert.equal(isSecretShaped(v), true, v);
    assert.deepEqual(scanDiff('+++ b/a\n@@ -0,0 +1 @@\n+NODE_ENV=production\n', new Map([['NODE_ENV', 'production']])), []);
  });

  it('scans the working tree and untracked files, or the staged diff only, through git', () => {
    const c = checkout({ env: null });
    try {
      fs.writeFileSync(path.join(c.repo, 'new.txt'), `token ${A}\n`);
      const calls = [];
      const git = (args) => {
        calls.push(args.join(' '));
        if (args[0] === 'rev-parse') return 'abc\n';
        if (args[0] === 'diff') return args.includes('--cached') ? '' : `+++ b/x\n@@ -1 +1 @@\n+${B}\n`;
        if (args[0] === 'ls-files') return 'new.txt\0';
        return '';
      };
      assert.deepEqual(scanRepo({ root: c.repo, values, git }).hits.map((h) => `${h.file}:${h.line}:${h.name}`), ['x:1:B_TOKEN', 'new.txt:1:A_TOKEN']);
      assert.deepEqual(scanRepo({ root: c.repo, values, staged: true, git }).hits, []);
      assert.ok(calls.some((c2) => /^diff .*--cached HEAD$/.test(c2)));
    } finally { c.done(); }
  });

  it("takes the vault's values by name: declared, and any its files hold", () => {
    const c = checkout();
    try {
      const vault = openVault({ root: c.repo, git: () => ({ status: 128, stdout: '' }) });
      assert.deepEqual([...vaultValues(vault, ['A_TOKEN', 'B_TOKEN', 'MISSING_TOKEN']).keys()], ['A_TOKEN', 'B_TOKEN', 'UNDECLARED_TOKEN']);
    } finally { c.done(); }
  });
});
