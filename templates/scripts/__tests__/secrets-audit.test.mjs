// secrets-audit.mjs and the CLI's audit trail: every set, push and rotation lands in .nexus/secrets-audit.jsonl (the
// record secrets-sinks.mjs writes) by name, destination and time, never a value; a secret last set more than 90 days
// ago gets a rotation nudge (`audit`, `status`); `request <chunk>` files a names-only secret request in the oversight
// queue, once.
// node:test, no deps; every value below is a fake, and each one is searched for in every byte written or printed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { AUDIT, ROTATE_DAYS, lastSet, readAudit, recordSets, rotationNudges } from '../secrets-audit.mjs';
import { recordAudit } from '../secrets-sinks.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', 'secrets.mjs');
const FAKES = ['fake-audit-0001', 'fake-audit-0002', 'fake-audit-0003'];
const DAY = 86_400_000;

function repo() {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets audit '));
  const root = path.join(ws, 'repo');
  fs.mkdirSync(root);
  return { root, done: () => fs.rmSync(ws, { recursive: true, force: true }) };
}

const manifest = (root) => fs.writeFileSync(path.join(root, 'nexus.secrets.json'), JSON.stringify({
  version: 1,
  secrets: [
    { name: 'VERCEL_TOKEN', for: 'Deploys the site.', where: 'https://vercel.com/account/tokens', destinations: ['local', 'vercel'], provider: 'owner', chunk: '07.3' },
    { name: 'CF_API_TOKEN', for: 'Purges the cache.', where: null, destinations: ['github-actions'], provider: 'owner', chunk: null },
  ],
}, null, 2));

const plan = (root) => {
  fs.mkdirSync(path.join(root, 'plan', 'pending'), { recursive: true });
  fs.writeFileSync(path.join(root, 'plan', '07-deploy.md'), ['# 07', '## Acceptance', '- **A1** x', '## Chunks', 'Measure: 2 open · 0 closed · next A2',
    '- [ ] **07.3** Deploy previews · S · closes A1 · needs — · secrets VERCEL_TOKEN, CF_API_TOKEN', '- [ ] **07.4** Box · S · closes A1 · needs —', ''].join('\n'));
};

const clean = (text) => { for (const f of FAKES) assert.ok(!text.includes(f), `a value leaked: ${text}`); return text; };
const at = (iso) => ({ now: () => iso });

describe('the audit record: set and rotation', () => {
  it('records a first value as set and a replaced one as rotate, beside a sink push, by name and time', () => {
    const r = repo();
    try {
      recordSets(r.root, { names: ['VERCEL_TOKEN', 'CF_API_TOKEN'], ring: 'local' }, at('2026-01-01T00:00:00.000Z'));
      recordAudit(r.root, { action: 'push', name: 'VERCEL_TOKEN', destination: 'github-actions' }, at('2026-01-02T00:00:00.000Z'));
      recordSets(r.root, { names: ['VERCEL_TOKEN'], ring: 'keychain', had: new Set(['VERCEL_TOKEN']) }, at('2026-02-01T00:00:00.000Z'));
      const log = readAudit(r.root);
      assert.deepEqual(log.map((e) => [e.action, e.name, e.time.slice(0, 10)]), [['set', 'VERCEL_TOKEN', '2026-01-01'], ['set', 'CF_API_TOKEN', '2026-01-01'], ['push', 'VERCEL_TOKEN', '2026-01-02'], ['rotate', 'VERCEL_TOKEN', '2026-02-01']]);
      assert.deepEqual(log[3], { time: '2026-02-01T00:00:00.000Z', action: 'rotate', name: 'VERCEL_TOKEN', destination: 'local', ring: 'keychain' });
      assert.equal(lastSet(log).get('VERCEL_TOKEN'), '2026-02-01T00:00:00.000Z');
      assert.equal(lastSet(log).get('CF_API_TOKEN'), '2026-01-01T00:00:00.000Z');
      assert.ok(fs.existsSync(path.join(r.root, AUDIT)));
    } finally { r.done(); }
  });

  it('refuses a bad name or ring before writing a line, and never quotes it', () => {
    const r = repo();
    try {
      assert.throws(() => recordSets(r.root, { names: ['A_TOKEN', FAKES[0]], ring: 'local' }), (e) => !clean(e.message).includes('fake'));
      assert.throws(() => recordSets(r.root, { names: ['A_TOKEN'], ring: FAKES[1] }), (e) => !clean(e.message).includes('fake'));
      assert.deepEqual(readAudit(r.root), []);
    } finally { r.done(); }
  });

  it('nudges a secret last set (or rotated) more than 90 days ago, and only one still in the vault; a push is no set', () => {
    const now = new Date('2026-10-21T00:00:00Z');
    const ago = (days) => new Date(now.getTime() - days * DAY).toISOString();
    const log = [
      { time: ago(200), action: 'set', name: 'OLD_TOKEN', destination: 'local' },
      { time: ago(200), action: 'set', name: 'FRESH_TOKEN', destination: 'local' },
      { time: ago(200), action: 'set', name: 'GONE_TOKEN', destination: 'local' },
      { time: ago(10), action: 'rotate', name: 'FRESH_TOKEN', destination: 'local' },
      { time: ago(5), action: 'push', name: 'OLD_TOKEN', destination: 'github-actions' },
    ];
    assert.equal(ROTATE_DAYS, 90);
    const nudges = rotationNudges(log, { now, held: (n) => n !== 'GONE_TOKEN' });
    assert.deepEqual(nudges.map((x) => [x.name, x.days]), [['OLD_TOKEN', 200]]);
    assert.deepEqual(rotationNudges(log, { now, days: 365 }), []);
  });
});

describe('the CLI', () => {
  const run = (root, input, ...args) => spawnSync(process.execPath, [CLI, ...args, '--root', root], { input, encoding: 'utf8', env: { ...process.env, VERCEL_TOKEN: '', CF_API_TOKEN: '', NEXUS_CONTRIBUTOR: '' } });
  // The owner's checkout: a git repo with an untracked .owner (a contributor's set is its own local key, not recorded).
  const gitignore = (root) => {
    spawnSync('git', ['init', '-q'], { cwd: root });
    fs.writeFileSync(path.join(root, '.gitignore'), '.env\n.nexus/\n.owner\n');
    fs.writeFileSync(path.join(root, '.owner'), '');
  };

  it('records a set, then a rotation, and an import, by name only; audit prints them', () => {
    const r = repo();
    try {
      gitignore(r.root);
      manifest(r.root);
      assert.equal(run(r.root, FAKES[0], 'set', 'VERCEL_TOKEN').status, 0);
      assert.equal(run(r.root, FAKES[1], 'set', 'VERCEL_TOKEN').status, 0);
      fs.writeFileSync(path.join(r.root, 'drop.env'), `CF_API_TOKEN=${FAKES[2]}\nVERCEL_TOKEN=${FAKES[0]}\n`);
      assert.equal(run(r.root, '', 'import', 'drop.env', '--store').status, 0);
      const raw = clean(fs.readFileSync(path.join(r.root, AUDIT), 'utf8'));
      const log = raw.trim().split('\n').map((l) => JSON.parse(l));
      assert.deepEqual(log.map((e) => [e.action, e.name]), [['set', 'VERCEL_TOKEN'], ['rotate', 'VERCEL_TOKEN'], ['set', 'CF_API_TOKEN'], ['rotate', 'VERCEL_TOKEN']]);
      const out = run(r.root, '', 'audit');
      assert.equal(out.status, 0);
      clean(out.stdout + out.stderr);
      assert.match(out.stdout, /rotate +VERCEL_TOKEN +-> local/);
      assert.match(out.stdout, /4 events/);
      const json = JSON.parse(run(r.root, '', 'audit', '--json').stdout);
      assert.equal(json.events.length, 4);
      assert.deepEqual(json.nudges, []);
    } finally { r.done(); }
  });

  it('nudges a stale secret in audit and status', () => {
    const r = repo();
    try {
      gitignore(r.root);
      manifest(r.root);
      assert.equal(run(r.root, FAKES[0], 'set', 'VERCEL_TOKEN').status, 0);
      const file = path.join(r.root, AUDIT);
      const old = new Date(Date.now() - 120 * DAY).toISOString();
      fs.writeFileSync(file, `${JSON.stringify({ time: old, action: 'set', name: 'VERCEL_TOKEN', destination: 'local', ring: 'local' })}\n`);
      const audit = run(r.root, '', 'audit');
      assert.match(clean(audit.stdout), /rotate VERCEL_TOKEN: last set 120 days ago/);
      const status = run(r.root, '', 'status');
      assert.match(clean(status.stdout), /rotate VERCEL_TOKEN: last set 120 days ago/);
      const rows = JSON.parse(run(r.root, '', 'status', '--json').stdout).secrets;
      assert.deepEqual(rows.map((x) => [x.name, x.age, x.rotate]), [['VERCEL_TOKEN', 120, true], ['CF_API_TOKEN', null, false]]);
    } finally { r.done(); }
  });

  it('files a names-only secret request for a chunk once, and nothing when every secret is set', () => {
    const r = repo();
    try {
      gitignore(r.root);
      manifest(r.root);
      plan(r.root);
      assert.equal(run(r.root, FAKES[0], 'set', 'VERCEL_TOKEN').status, 0);
      const first = run(r.root, '', 'request', '07.3');
      assert.equal(first.status, 0, first.stderr);
      const file = path.join(r.root, 'plan', 'pending', 'secrets-07.3.md');
      const text = clean(fs.readFileSync(file, 'utf8'));
      assert.match(text, /^---\ndate: \d{4}-\d\d-\d\d\n---\n## Notes\n- \[needs-user-call\] secret request 07\.3: /);
      assert.match(text, /CF_API_TOKEN/);
      assert.doesNotMatch(text, /VERCEL_TOKEN/);
      assert.match(text, /Purges the cache\./);
      assert.match(text, /github-actions/);
      assert.match(text, /node scripts\/secrets\.mjs set CF_API_TOKEN/);
      assert.match(first.stdout, /plan\/pending\/secrets-07\.3\.md/);
      const again = run(r.root, '', 'request', '07.3');
      assert.equal(again.status, 0);
      assert.match(again.stdout, /already asked/);
      fs.rmSync(file);
      assert.equal(run(r.root, FAKES[2], 'set', 'CF_API_TOKEN').status, 0);
      const none = run(r.root, '', 'request', '07.3');
      assert.equal(none.status, 0);
      assert.match(none.stdout, /nothing to ask/);
      assert.ok(!fs.existsSync(file));
      assert.equal(run(r.root, '', 'request', '07.4').status, 0);
      assert.equal(run(r.root, '', 'request', '07.9').status, 1);
    } finally { r.done(); }
  });

  it('parses its own request as a pending note settle can take', async () => {
    const r = repo();
    try {
      gitignore(r.root);
      manifest(r.root);
      plan(r.root);
      assert.equal(run(r.root, '', 'request', '07.3').status, 0);
      const { parsePending } = await import('../plan/pending.mjs');
      const p = parsePending(fs.readFileSync(path.join(r.root, 'plan', 'pending', 'secrets-07.3.md'), 'utf8'), 'secrets-07.3.md');
      assert.equal(p.close, null);
      assert.equal(p.notes.length, 1);
    } finally { r.done(); }
  });
});
