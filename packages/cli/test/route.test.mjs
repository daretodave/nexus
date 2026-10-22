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

test('a multi-line message keeps its newlines (ends trimmed); a slash command still routes on its first line', () => {
  const pasted = '  first line\n\n- a list\n- of things\n\n```\nstack trace\n  at x\n```\n  ';
  assert.equal(toPrompt(pasted, 'ask'), 'first line\n\n- a list\n- of things\n\n```\nstack trace\n  at x\n```');
  assert.equal(toPrompt('add export\nwith two lines', 'plot'), '/plot add export\nwith two lines');
  assert.equal(toPrompt('the save button\nis broken'), '/bug the save button\nis broken');
  assert.equal(classify('/plot a task\nwith detail below'), 'slash');
  assert.equal(toPrompt('/plot a task\n\nwith detail below'), '/plot a task\n\nwith detail below');
  assert.equal(toPrompt('/explode\nthought one\nthought two'), '/messy\nthought one\nthought two', 'the alias resolves, the lines stay');
  assert.equal(toPrompt('/next  top'), '/next  top', 'spacing after the command is the person\'s');
  assert.equal(toPrompt('/next 12.3\nnotes under it', 'slash', { agents: true }), '/next 12.3 --agents\nnotes under it', 'a flag joins the command line');
  assert.equal(withRunFlags('/next\nuse --workflow later', { agents: true }), '/next --agents\nuse --workflow later', 'only the first line counts as flagged');
});
