import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { questionsIn, durableQuestions, settledItem, specNumber, answersPrompt, isOwner, repoInfo } from '../server/repo.mjs';
import { runBeats, markStall, STALL_MS } from '../server/gh.mjs';

test('durable questions: needs-user-call rows and Open questions lists', () => {
  const text = [
    '# 12 — Export',
    '- [ ] **12.1** build it · S',
    '## Open questions',
    '- Should export include archived rows?',
    '- None.',
    '## Notes',
    '- not a question',
    '- [ ] [needs-user-call] pick the default branch name',
    '  (prose that mentions [needs-user-call] rows is not one)',
    '',
    '- skills answer `[needs-user-call]` rows inline',
  ].join('\n');
  const q = questionsIn(text, 'plan/specs/12-export.md');
  assert.deepEqual(q.map((x) => [x.line, x.source, x.text]), [
    [4, 'plan', 'Should export include archived rows?'],
    [8, 'needs-user-call', 'pick the default branch name (prose that mentions [needs-user-call] rows is not one)'],
  ]);
  assert.deepEqual(q[0].spec, { n: '12', title: 'Export' });
  assert.equal(q[0].id, 'plan/specs/12-export.md:4');
});

test('durable questions: an item is read whole, its wrapped and indented lines joined', () => {
  const text = [
    '# Spec 7: Site launch',
    '## Open questions',
    '- The site has no build step; should the deploy',
    'run one, or stay static? (D37 and D38 were',
    '  written before the move.)',
    '- Which host?',
    '  - Recommendation: keep the current one',
    '  - the other costs more',
    '1. A numbered one',
    '   that wraps.',
    '',
    'Prose after a blank line is not part of it.',
    '## Chunks',
  ].join('\n');
  const q = questionsIn(text, 'plan/07-site-launch.md');
  assert.deepEqual(q.map((x) => [x.line, x.text]), [
    [3, 'The site has no build step; should the deploy run one, or stay static? (D37 and D38 were written before the move.)'],
    [6, 'Which host?\n  - Recommendation: keep the current one\n  - the other costs more'],
    [9, 'A numbered one that wraps.'],
  ]);
  assert.deepEqual(q[0].spec, { n: '07', title: 'Site launch' });
  // A spec titled with a middle dot (`# 15 · Title`) loses the separator too.
  const dotted = questionsIn('# 15 · Head start\n\n## Open questions\n\n- Which?\n', 'plan/15-head-start.md');
  assert.deepEqual(dotted[0].spec, { n: '15', title: 'Head start' });
});

test('durable questions: settled items are skipped, each prefix', () => {
  const skipped = [
    'Settled 2026-10-13: the accounts are both live.',
    '**Decided:** go with the first.',
    'Answered in 12.3.',
    '_Resolved_ by the port.',
    'Done: shipped.',
    '[x] picked the name',
    '~~Which name?~~ the first',
    '(None.)',
    '(none yet)',
    'None. Nothing open.',
    'none',
  ];
  const text = ['# 3 — X', '## Open questions', ...skipped.map((s) => `- ${s}`), '- Is this still open?'].join('\n');
  assert.deepEqual(questionsIn(text, 'plan/03-x.md').map((x) => x.text), ['Is this still open?']);
  for (const s of skipped) assert.equal(settledItem(s), true, s);
  assert.equal(settledItem('Doneness of the export: what counts?'), false);
});

test('durable questions: Open questions count in spec files only; needs-user-call rows count anywhere', () => {
  const text = [
    '# Audit',
    '## Open questions',
    '- **Hosting:** the site is live on the main host.',
    '| when | what |',
    '|---|---|',
    '| 10-12 | [needs-user-call] pick a release day |',
  ].join('\n');
  for (const rel of ['plan/AUDIT.md', 'plan/notes.md', 'plan/README.md', 'plan/specs/notes.md']) {
    const q = questionsIn(text, rel);
    assert.deepEqual(q.map((x) => [x.source, x.line]), [['needs-user-call', 6]], rel);
    assert.equal(q[0].spec, undefined);
  }
  assert.equal(specNumber('plan/47-gui.md'), '47');
  assert.equal(specNumber('plan/specs/03-x.md'), '03');
  assert.equal(specNumber('plan/pending/47-x.md'), null);
  assert.equal(specNumber('plan/AUDIT.md'), null);
});

test('durableQuestions walks plan/, skipping plan/messy/', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-q-'));
  try {
    fs.mkdirSync(path.join(dir, 'plan', 'messy'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'plan', '05-a.md'), '# 05 — Alpha\n## Open questions\n- Real one?\n');
    fs.writeFileSync(path.join(dir, 'plan', 'notes.md'), '## Open questions\n- a fact\n');
    fs.writeFileSync(path.join(dir, 'plan', 'messy', '01-raw.md'), '## Open questions\n- raw?\n');
    const q = durableQuestions(dir);
    assert.deepEqual(q.map((x) => [x.file, x.text, x.spec?.title]), [['plan/05-a.md', 'Real one?', 'Alpha']]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('answers prompt lands per owner mode', () => {
  const rows = [{ file: 'plan/AUDIT.md', line: 3, text: 'q', answer: 'yes' }];
  assert.match(answersPrompt(rows, true), /owner mode: gate, commit, and push to main/);
  assert.match(answersPrompt(rows, false), /open a pull request/);
  assert.match(answersPrompt(rows, false), /Never push main/);
  assert.ok(answersPrompt(rows, true).startsWith('/oversight'));
});

test('runBeats: news only, history stays quiet', () => {
  const seen = new Map();
  const first = runBeats([{ databaseId: 1, status: 'completed', conclusion: 'success', workflowName: 'march' }, { databaseId: 2, status: 'in_progress', workflowName: 'night' }], seen);
  assert.deepEqual(first, [{ k: 'loop', p: 'run', id: '2', name: 'night' }]);
  assert.deepEqual(runBeats([{ databaseId: 2, status: 'in_progress', workflowName: 'night' }], seen), []);
  assert.deepEqual(runBeats([{ databaseId: 2, status: 'completed', conclusion: 'failure', workflowName: 'night' }, { databaseId: 3, status: 'queued', workflowName: 'march' }], seen), [
    { k: 'loop', p: 'conclude', id: '2', name: 'night', conclusion: 'failure' },
    { k: 'loop', p: 'dispatch', id: '3', name: 'march' },
  ]);
});

test('only a queued run past STALL_MS reads stalled', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  const old = new Date(now - STALL_MS - 1000).toISOString();
  assert.equal(markStall({ status: 'queued', createdAt: old }, now).stalled, true);
  assert.equal(markStall({ status: 'in_progress', createdAt: old }, now).stalled, false);
  assert.equal(markStall({ status: 'queued', createdAt: new Date(now).toISOString() }, now).stalled, false);
});

// ---- owner mode: the effective one (scripts/owner.mjs), read at the primary checkout ----
// A temp repo's own .owner, never a real checkout's.
function ownedRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-owner-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: dir });
  fs.writeFileSync(path.join(dir, '.owner'), 'owner\n');
  return dir;
}
const switchOff = (root) => {
  fs.mkdirSync(path.join(root, '.nexus'), { recursive: true });
  fs.writeFileSync(path.join(root, '.nexus', 'local.json'), JSON.stringify({ ownerMode: false }));
};

test('isOwner is the effective owner mode: .owner present and not switched off in local.json', async () => {
  const repo = ownedRepo();
  try {
    assert.equal(isOwner(repo), true);
    assert.equal((await repoInfo(repo)).owner, true);
    switchOff(repo);
    assert.equal(isOwner(repo), false, 'ownerMode: false switches it off');
    assert.equal((await repoInfo(repo)).owner, false);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('a worktree reads owner mode at the primary checkout: its .owner and its local.json', () => {
  const repo = ownedRepo();
  const wt = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-owner-wt-')), 'wt');
  try {
    execFileSync('git', ['worktree', 'add', '-q', '--detach', wt], { cwd: repo });
    assert.equal(fs.existsSync(path.join(wt, '.owner')), false);
    assert.equal(isOwner(wt), true, "the primary's .owner makes the worktree the owner's");
    switchOff(repo);
    assert.equal(isOwner(wt), false, "the primary's local.json switches it off");
  } finally {
    fs.rmSync(path.dirname(wt), { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('a committed .owner counts for no one', () => {
  const repo = ownedRepo();
  try {
    execFileSync('git', ['add', '-f', '.owner'], { cwd: repo });
    assert.equal(isOwner(repo), false);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('kit scripts: one lookup, scripts/ first, then scripts/dev/, scripts/plan/ and scripts/git/; a home folder first', async () => {
  const { findKitScript, kitScripts, CLAIMS_SCRIPTS, PROGRESS_SCRIPTS, ANNOUNCE_SCRIPTS } = await import('../server/repo.mjs');
  const { ORDER_SCRIPTS } = await import('../server/plan.mjs');
  const { WORKTREE_SCRIPTS } = await import('../server/git.mjs');
  assert.deepEqual(kitScripts('x.mjs'), ['scripts/x.mjs', 'scripts/dev/x.mjs', 'scripts/plan/x.mjs', 'scripts/git/x.mjs']);
  assert.deepEqual(kitScripts('x.mjs', { home: 'scripts/plan' }), ['scripts/plan/x.mjs', 'scripts/x.mjs', 'scripts/dev/x.mjs', 'scripts/git/x.mjs']);
  // every lookup the server makes is the one list
  for (const [list, name] of [[CLAIMS_SCRIPTS, 'claims.mjs'], [PROGRESS_SCRIPTS, 'progress.mjs'], [ANNOUNCE_SCRIPTS, 'announce.mjs'], [WORKTREE_SCRIPTS, 'worktree.mjs']]) {
    assert.deepEqual(list, kitScripts(name));
  }
  assert.deepEqual(ORDER_SCRIPTS, kitScripts('order.mjs', { home: 'scripts/plan' }));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-kit-scripts-'));
  try {
    assert.equal(findKitScript(dir, 'claims.mjs'), null, 'absent: null');
    fs.mkdirSync(path.join(dir, 'scripts', 'dev'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'scripts', 'dev', 'claims.mjs'), '');
    assert.equal(findKitScript(dir, 'claims.mjs'), 'scripts/dev/claims.mjs');
    fs.writeFileSync(path.join(dir, 'scripts', 'claims.mjs'), '');
    assert.equal(findKitScript(dir, 'claims.mjs'), 'scripts/claims.mjs', 'scripts/ wins when both hold it');
    fs.mkdirSync(path.join(dir, 'scripts', 'plan'));
    fs.writeFileSync(path.join(dir, 'scripts', 'plan', 'order.mjs'), '');
    fs.writeFileSync(path.join(dir, 'scripts', 'order.mjs'), '');
    assert.equal(findKitScript(dir, 'order.mjs', { home: 'scripts/plan' }), 'scripts/plan/order.mjs');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
