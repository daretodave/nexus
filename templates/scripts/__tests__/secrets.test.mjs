// plan/secrets-manifest.mjs and secrets.mjs: nexus.secrets.json, the contract that names a repo's secrets. Its shape is
// checked (a value is refused outright); an import reads names and comments from a .env.example (commented-out lines
// too) and never a value; the CLI writes names only and never prints a value.
// node:test, no deps; every value below is a fake.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DESTINATIONS, emptyManifest, importEnvExample, mergeImport, parseManifest, serialize, validateManifest } from '../plan/secrets-manifest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', 'secrets.mjs');

const entry = (over = {}) => ({ name: 'VERCEL_TOKEN', for: 'Deploys the site.', where: 'https://vercel.com/account/tokens', destinations: ['local', 'vercel'], provider: 'owner', chunk: null, ...over });

const EXAMPLE = [
  '# Copy this file to .env and fill in the values.',
  '',
  '# ============================================================',
  '# DEPLOY',
  '# ============================================================',
  '',
  '# --- VERCEL ---------------------------------------------',
  '# VERCEL_TOKEN=fake-vercel-value                  # https://vercel.com/account/tokens',
  '# VERCEL_TEAM_ID=team_fakeid                      # if a team-owned project',
  '',
  '# Repo-scoped PAT for the issue mirror.',
  '# Get one at: https://github.com/settings/tokens',
  'GH_TOKEN=github_pat_FAKE0000000000',
  '',
  'export DATABASE_URL="postgres://fake:fake@localhost/db # not a comment"',
  'STRIPE_KEY=sk_test_fake',
  '# STRIPE_KEY=sk_test_fake_again',
  '# Supported: none | test-user',
  'lowercase_is_not_a_name=1',
].join('\n');

describe('the manifest shape', () => {
  it('accepts a well-formed manifest', () => {
    assert.deepEqual(validateManifest({ version: 1, secrets: [entry(), entry({ name: 'GH_TOKEN', where: null, destinations: ['github-actions'], chunk: '42.4' })] }), []);
    assert.deepEqual(validateManifest(emptyManifest()), []);
    assert.deepEqual(DESTINATIONS, ['local', 'github-actions', 'vercel', 'cloudflare']);
  });

  it('refuses a value, an unknown key, a bad name, a duplicate, and a bad destination, provider, link or chunk', () => {
    const problems = validateManifest({
      version: 1,
      secrets: [
        entry({ value: 'fake' }),
        entry({ name: 'GH_TOKEN', colour: 'red' }),
        entry({ name: 'bad-name' }),
        entry({ name: 'GH_TOKEN' }),
        entry({ name: 'A_TOKEN', destinations: ['heroku'] }),
        entry({ name: 'B_TOKEN', destinations: [] }),
        entry({ name: 'C_TOKEN', provider: 'someone' }),
        entry({ name: 'D_TOKEN', where: 'vercel.com' }),
        entry({ name: 'E_TOKEN', chunk: 'soon' }),
        entry({ name: 'F_TOKEN', for: '' }),
      ],
    }).join('\n');
    assert.match(problems, /VERCEL_TOKEN: a manifest never holds a value/);
    assert.doesNotMatch(problems, /fake/);
    assert.match(problems, /GH_TOKEN: unknown key colour/);
    assert.match(problems, /bad-name: not an env-var name/);
    assert.match(problems, /GH_TOKEN: declared twice/);
    assert.match(problems, /A_TOKEN: destination heroku is not one of local, github-actions, vercel, cloudflare/);
    assert.match(problems, /B_TOKEN: destinations: name at least one/);
    assert.match(problems, /C_TOKEN: provider someone is not one of owner/);
    assert.match(problems, /D_TOKEN: where: a link \(https:\/\/…\) or null/);
    assert.match(problems, /E_TOKEN: chunk: a chunk id \(NN\.k\) or null/);
    assert.match(problems, /F_TOKEN: for: say what it is for/);
  });

  it('takes optional: true or false (spec 49, A6), refuses anything else, and writes it only when true', () => {
    assert.deepEqual(validateManifest({ version: 1, secrets: [entry({ optional: true }), entry({ name: 'GH_TOKEN', optional: false })] }), []);
    assert.match(validateManifest({ version: 1, secrets: [entry({ optional: 'yes' })] }).join('\n'), /VERCEL_TOKEN: optional: true or false/);
    const text = serialize({ version: 1, secrets: [entry({ optional: true }), entry({ name: 'GH_TOKEN', optional: false }), entry({ name: 'X_TOKEN' })] });
    const back = JSON.parse(text).secrets;
    assert.deepEqual(Object.keys(back[0]), ['name', 'for', 'where', 'destinations', 'provider', 'chunk', 'optional']);
    assert.ok(!('optional' in back[1]) && !('optional' in back[2]), 'false or absent is left out');
    assert.deepEqual(parseManifest(text).problems, []);
  });

  it('refuses a wrong version and a missing list, and reports text that is not JSON', () => {
    assert.match(validateManifest({ version: 2, secrets: [] }).join('\n'), /version: 1/);
    assert.match(validateManifest({ version: 1 }).join('\n'), /secrets: a list/);
    assert.match(parseManifest('{ nope').problems.join('\n'), /not JSON/);
    assert.deepEqual([...parseManifest(JSON.stringify({ version: 1, secrets: [entry()] })).names], ['VERCEL_TOKEN']);
  });
});

describe('the import from .env.example', () => {
  const got = importEnvExample(EXAMPLE);
  const by = Object.fromEntries(got.map((e) => [e.name, e]));

  it('takes every name, commented out or not, once, in order', () => {
    assert.deepEqual(got.map((e) => e.name), ['VERCEL_TOKEN', 'VERCEL_TEAM_ID', 'GH_TOKEN', 'DATABASE_URL', 'STRIPE_KEY']);
  });

  it('reads what it is for and where to get it from the comments, never a value', () => {
    assert.deepEqual(by.VERCEL_TOKEN, { name: 'VERCEL_TOKEN', for: 'VERCEL_TOKEN (imported from .env.example: say what it is for)', where: 'https://vercel.com/account/tokens' });
    assert.equal(by.VERCEL_TEAM_ID.for, 'if a team-owned project');
    assert.deepEqual(by.GH_TOKEN, { name: 'GH_TOKEN', for: 'Repo-scoped PAT for the issue mirror. Get one at:', where: 'https://github.com/settings/tokens' });
    assert.equal(by.DATABASE_URL.where, null);
    const all = JSON.stringify(got);
    for (const fake of ['fake', 'FAKE', 'team_', 'postgres', 'sk_test', 'not a comment']) assert.ok(!all.includes(fake), `${fake} leaked`);
  });

  it('merges into a manifest without touching an entry already there', () => {
    const before = { version: 1, secrets: [entry({ name: 'GH_TOKEN', for: 'Kept as written.', destinations: ['github-actions'] })] };
    const { manifest, added, kept } = mergeImport(before, got);
    assert.deepEqual(added, ['VERCEL_TOKEN', 'VERCEL_TEAM_ID', 'DATABASE_URL', 'STRIPE_KEY']);
    assert.deepEqual(kept, ['GH_TOKEN']);
    assert.equal(manifest.secrets[0].for, 'Kept as written.');
    assert.deepEqual(manifest.secrets[1], { name: 'VERCEL_TOKEN', for: by.VERCEL_TOKEN.for, where: by.VERCEL_TOKEN.where, destinations: ['local'], provider: 'owner', chunk: null });
    assert.deepEqual(validateManifest(manifest), []);
    assert.ok(serialize(manifest).endsWith('}\n'));
  });
});

describe('the CLI', () => {
  const run = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

  it('imports names into nexus.secrets.json, prints names only, and checks the result', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets manifest '));
    try {
      fs.writeFileSync(path.join(dir, '.env.example'), EXAMPLE);
      const dry = run(dir, 'import', '--dry-run', '--root', dir);
      assert.equal(dry.status, 0, dry.stderr);
      assert.match(dry.stdout, /would add 5: VERCEL_TOKEN, VERCEL_TEAM_ID, GH_TOKEN, DATABASE_URL, STRIPE_KEY/);
      assert.ok(!fs.existsSync(path.join(dir, 'nexus.secrets.json')));
      const wet = run(dir, 'import', '--root', dir);
      assert.equal(wet.status, 0, wet.stderr);
      assert.ok(!/fake|FAKE|sk_test/.test(wet.stdout + wet.stderr));
      const written = fs.readFileSync(path.join(dir, 'nexus.secrets.json'), 'utf8');
      assert.ok(!/fake|FAKE|sk_test|postgres/.test(written));
      assert.match(run(dir, 'import', '--root', dir).stdout, /added 0; 5 already declared/);
      assert.equal(run(dir, 'names', '--root', dir).stdout, 'VERCEL_TOKEN\nVERCEL_TEAM_ID\nGH_TOKEN\nDATABASE_URL\nSTRIPE_KEY\n');
      assert.equal(run(dir, 'check', '--root', dir).status, 0);
      assert.equal(run(dir, 'import', 'missing.env.example', '--root', dir).status, 1);
      fs.writeFileSync(path.join(dir, 'nexus.secrets.json'), JSON.stringify({ version: 1, secrets: [entry({ value: 'fake' })] }));
      const red = run(dir, 'check', '--root', dir);
      assert.equal(red.status, 1);
      assert.match(red.stdout, /never holds a value/);
      assert.equal(run(dir, 'nonsense', '--root', dir).status, 64);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
