import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, toPrompt, withRunFlags, complete } from '../shared/route.mjs';

test('classify routes free text', () => {
  assert.equal(classify('fix this bug please'), 'bug');
  assert.equal(classify('the export button is broken on mobile'), 'bug');
  assert.equal(classify('add a dark mode toggle to settings'), 'plot');
  assert.equal(classify('why is the gate red?'), 'ask');
  assert.equal(classify('how does settle work'), 'ask');
  assert.equal(classify('why does login crash?'), 'ask');
  assert.equal(classify('/next top'), 'slash');
  assert.equal(classify('   '), null);
});

test('toPrompt wraps per route and resolves GUI aliases', () => {
  assert.equal(toPrompt('fix this bug please'), '/bug fix this bug please');
  assert.equal(toPrompt('add csv export'), '/plot add csv export');
  assert.equal(toPrompt('what is a chunk?'), 'what is a chunk?');
  assert.equal(toPrompt('/explode lots of messy thoughts'), '/messy lots of messy thoughts');
  assert.equal(toPrompt('add csv export', 'bug'), '/bug add csv export');
});

test('run flags only touch /next and /heads-down; workflows wins', () => {
  assert.equal(withRunFlags('/next top', { agents: true }), '/next top --agents');
  assert.equal(withRunFlags('/next', { agents: true, workflows: true }), '/next --workflow');
  assert.equal(withRunFlags('/heads-down 12', { workflows: true }), '/heads-down 12 --workflow');
  assert.equal(withRunFlags('/next --agents', { workflows: true }), '/next --agents');
  assert.equal(withRunFlags('/plot x', { agents: true }), '/plot x');
  assert.equal(withRunFlags('/next', {}), '/next');
  assert.equal(toPrompt('/next', 'slash', { agents: true }), '/next --agents');
});

test('complete lists matching commands for a bare slash word', () => {
  const cmds = [{ name: 'next' }, { name: 'note' }, { name: 'plot' }];
  assert.deepEqual(complete('/n', cmds).map((c) => c.name), ['next', 'note']);
  assert.deepEqual(complete('/next ', cmds), []);
  assert.deepEqual(complete('hello', cmds), []);
});
