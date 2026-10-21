import test from 'node:test';
import assert from 'node:assert/strict';
import { questionsIn, answersPrompt } from '../server/repo.mjs';
import { runBeats, markStall, STALL_MS } from '../server/gh.mjs';

test('durable questions: needs-user-call rows and Open questions lists', () => {
  const text = [
    '# Spec 12',
    '- [ ] **12.1** build it · S',
    '## Open questions',
    '- Should export include archived rows?',
    '- None.',
    '## Notes',
    '- not a question',
    '- [ ] [needs-user-call] pick the default branch name',
    '  (prose that mentions [needs-user-call] rows is not one)',
    '- skills answer `[needs-user-call]` rows inline',
  ].join('\n');
  const q = questionsIn(text, 'plan/specs/12.md');
  assert.deepEqual(q.map((x) => [x.line, x.source, x.text]), [
    [4, 'open-question', 'Should export include archived rows?'],
    [8, 'needs-user-call', 'pick the default branch name'],
  ]);
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
