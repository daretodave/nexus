// design/prompt.mjs (/design prompt, /design addendum): reading a spec's Design and Acceptance items, what a scope
// selects, the prompt's numbering and front matter, the addendum continuing the last stored file's numbering, and the
// "what changed since the last prompt" diff by item hash. node:test, no deps; the CLI runs in a scratch folder.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  buildAddendum, buildPrompt, changes, itemHash, lastStored, main, parseScope, parseSpec, parseStored, roles, select,
} from '../design/prompt.mjs';

const vault = (extra = '') => [
  '# 42 — Secrets: the vault',
  '',
  '> A loop uses a secret without holding one.',
  '',
  '## Design',
  '',
  '- **Vault screen:** the owner sees every secret by name,',
  '  with its status per destination.',
  '- **Sinks:** values go to GitHub Actions on stdin.',
  '- **Contributor view:** a contributor sees "No project',
  '  secrets needed" and their local keys.',
  extra,
  '## Acceptance',
  '',
  '- **A1** The vault screen lists names, never values.',
  '- **A2** Sinks push through stdin.',
  '',
  '## Chunks',
  '- [ ] **42.1** Vault · M · closes A1 · needs —',
].join('\n');
const docs = ['# 07 — Docs pass', '', '## Design', '', '- **Voice:** every playbook in one voice.', '', '## Acceptance', '', '- **A1** The voice holds.', ''].join('\n');

describe('reading a spec', () => {
  it('takes each Design bullet by its bold lead and each Acceptance line by its A-ID', () => {
    const s = parseSpec('42-secrets.md', vault());
    assert.equal(s.num, '42');
    assert.equal(s.title, 'Secrets: the vault');
    assert.equal(s.summary, 'A loop uses a secret without holding one.');
    assert.deepEqual(s.items.map((i) => i.key), ['vault-screen', 'sinks', 'contributor-view', 'A1', 'A2']);
    assert.match(s.items[0].text, /status per destination\.$/);
  });

  it('hashes an item by its words, so rewrapping is not a change', () => {
    assert.equal(itemHash('- a b\n  c'), itemHash('- a b c'));
    assert.notEqual(itemHash('- a b c'), itemHash('- a b d'));
  });
});

describe('scope', () => {
  const specs = [parseSpec('42-secrets.md', vault()), parseSpec('07-docs.md', docs)];
  it('reads numbers, a keyword, or nothing (UI work)', () => {
    assert.deepEqual(parseScope('42, 7').numbers, ['42', '07']);
    assert.equal(parseScope('vault').kind, 'keyword');
    assert.equal(parseScope('').kind, 'ui');
  });
  it('with no scope takes only the UI items of the specs that have any', () => {
    const got = select(specs, '');
    assert.deepEqual(got.map((s) => s.num), ['42']);
    assert.deepEqual(got[0].items.map((i) => i.key), ['vault-screen', 'contributor-view', 'A1']);
  });
  it('by number takes every item of the named specs', () => {
    assert.deepEqual(select(specs, '7').flatMap((s) => s.items.map((i) => i.key)), ['voice', 'A1']);
  });
  it('by keyword takes the items holding the word or naming UI work', () => {
    assert.deepEqual(select(specs, 'stdin').flatMap((s) => s.items.map((i) => i.key)), ['vault-screen', 'sinks', 'contributor-view', 'A1', 'A2']);
    assert.deepEqual(select(specs, 'nothing-matches'), []);
  });
  it('names the roles a block of text is for', () => {
    assert.equal(roles('the owner and a contributor'), 'owner and contributor');
    assert.equal(roles('owners only'), 'owner');
    assert.equal(roles('everyone'), null);
  });
});

describe('the prompt', () => {
  const specs = select([parseSpec('42-secrets.md', vault())], '');
  const text = buildPrompt({ specs, scope: 'ui', date: '2026-10-21', number: 1, plan: 'abc1234', product: 'acme' });
  it('puts the design system first, one section per spec, the constraints last, numbered from 1', () => {
    const heads = [...text.matchAll(/^## (\d+)\. (.+)$/gm)].map((m) => `${m[1]} ${m[2]}`);
    assert.deepEqual(heads, ['1 Design system first', '2 Secrets: the vault', '3 Constraints']);
    assert.match(text, /No emoji anywhere/);
    assert.match(text, /Roles: owner and contributor/);
  });
  it('records its number, scope, plan commit, last section and one hash per item', () => {
    const fm = parseStored(text);
    assert.equal(fm.number, 1);
    assert.equal(fm.continues, 1);
    assert.equal(fm.scope, 'ui');
    assert.equal(fm.plan, 'abc1234');
    assert.equal(fm.last, 3);
    assert.deepEqual([...fm.items.keys()], ['42/vault-screen', '42/contributor-view', '42/A1']);
  });
  it('is null when the scope selects nothing', () => {
    assert.equal(buildPrompt({ specs: [], scope: 'x', date: '2026-10-21', number: 1 }), null);
  });
});

describe('the addendum', () => {
  const before = select([parseSpec('42-secrets.md', vault())], '');
  const prev = parseStored(buildPrompt({ specs: before, scope: 'ui', date: '2026-10-21', number: 1 }));

  it('is null when nothing changed', () => {
    assert.deepEqual(changes(before, prev), { added: [], changed: [], dropped: [] });
    assert.equal(buildAddendum({ specs: before, prev, date: '2026-10-22', number: 2 }), null);
  });

  it('writes only the new and changed items, numbered on from the last section', () => {
    const edited = vault('- **Import screen:** paste a .env; names only.\n')
      .replace('with its status per destination.', 'with its status per destination and its age.');
    const after = select([parseSpec('42-secrets.md', edited)], '');
    const c = changes(after, prev);
    assert.deepEqual(c.added.map((x) => x.item.key), ['import-screen']);
    assert.deepEqual(c.changed.map((x) => x.item.key), ['vault-screen']);
    const text = buildAddendum({ specs: after, prev, date: '2026-10-22', number: 2 });
    const heads = [...text.matchAll(/^## (\d+)\. (.+)$/gm)].map((m) => `${m[1]} ${m[2]}`);
    assert.deepEqual(heads, ['4 Secrets: the vault: what changed']);
    assert.match(text, /continues prompt 001/);
    assert.match(text, /Import screen/);
    assert.match(text, /and its age/);
    assert.doesNotMatch(text, /Contributor view/);
    const fm = parseStored(text);
    assert.equal(fm.kind, 'addendum');
    assert.equal(fm.continues, 1);
    assert.equal(fm.last, 4);
    assert.equal(fm.items.get('42/vault-screen'), itemHash(after[0].items.find((i) => i.key === 'vault-screen').text));
  });

  it('names dropped items and brings a new spec whole', () => {
    const shop = parseSpec('50-shop.md', ['# 50 — Shop', '', '## Design', '', '- **Cart screen:** the items.', '', '## Acceptance', '', '- **A1** A cart page.', ''].join('\n'));
    const after = select([parseSpec('42-secrets.md', vault().replace(/- \*\*A1\*\*.*\n/, '')), shop], '');
    const text = buildAddendum({ specs: after, prev, date: '2026-10-22', number: 2 });
    const heads = [...text.matchAll(/^## (\d+)\. (.+)$/gm)].map((m) => `${m[1]} ${m[2]}`);
    assert.deepEqual(heads, ['4 Shop (new)', '5 Dropped from the plan']);
    assert.match(text, /^- 42\/A1$/m);
  });
});

describe('the CLI', () => {
  it('stores 001, then an addendum 002 continuing it, and says when nothing changed', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design prompt '));
    try {
      fs.mkdirSync(path.join(root, 'plan'));
      fs.writeFileSync(path.join(root, 'plan', '42-secrets.md'), vault());
      const lines = [];
      const run = (...argv) => main(argv, { cwd: root, out: (l) => lines.push(l), err: (l) => lines.push(l) });
      assert.equal(run('addendum', '--date', '2026-10-21'), 1);
      assert.equal(run('prompt', '--write', '--date', '2026-10-21'), 0);
      assert.equal(lines.at(-1), 'design/prompts/001-2026-10-21.md');
      assert.equal(run('addendum', '--write', '--date', '2026-10-21'), 0);
      assert.match(lines.at(-1), /nothing changed since 001-2026-10-21\.md/);
      fs.writeFileSync(path.join(root, 'plan', '42-secrets.md'), vault('- **Import screen:** names only.\n'));
      assert.equal(run('addendum', '--write', '--date', '2026-10-22'), 0);
      assert.equal(lines.at(-1), 'design/prompts/002-2026-10-22.md');
      const last = lastStored(path.join(root, 'design', 'prompts'));
      assert.equal(last.number, 2);
      assert.equal(last.last, 4);
      assert.equal(run('prompt', '--date', '2026-10-22'), 0); // a dry run prints and writes nothing
      assert.match(lines.at(-1), /^design-prompt: 3$/m);
      assert.equal(fs.readdirSync(path.join(root, 'design', 'prompts')).length, 2);
      assert.equal(run('prompt', 'nothing-matches'), 1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
