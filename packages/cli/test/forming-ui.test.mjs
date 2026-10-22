// Spec 47 A4: the cockpit's forming state. The stage draws the handoff's constellation drawing into the session orb
// with what git is doing; a failed form shows the reason and Retry; the composer is held with the reason.
import './jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { formNext, formStart } from '../shared/forming.mjs';

const view = { nodes: [{ key: 'main', at: [50, 30], state: 'idle', size: 'xl', main: true, label: 'session' }], fils: [], count: '1 agent' };

test('the stage shows the star forming: stars drawing in, the orb, the branch and the root', async () => {
  const { default: StageView } = await import('../src/screens/cockpit/StageView.jsx');
  const form = formNext(formStart({ branch: 'nexus/vega-1', worktree: '/w/app-wt/vega-1', why: 'kit' }, 0), { type: 'progress', line: 'Preparing worktree (new branch)' });
  const html = renderToStaticMarkup(createElement(StageView, { view, forming: { form, now: 1000, onRetry: () => {} } }));
  assert.match(html, /class="forming"/);
  assert.match(html, /A star is forming/);
  assert.match(html, /checking out nexus\/vega-1\.\.\./);
  assert.match(html, /Preparing worktree \(new branch\)/);
  assert.match(html, /\/w\/app-wt\/vega-1 · the kit&#x27;s default, beside the repo/);
  assert.equal((html.match(/class="lstar/g) || []).length, 8, 'the handoff\'s stars, drawing in');
  assert.match(html, /orb orb-xl st-thinking is-main/);
  assert.doesNotMatch(html, /Retry/);
  assert.doesNotMatch(html, /snode/, 'no live nodes while it forms');
});

test('a failed form shows the failed orb, the reason and Retry; a ready one draws the live stage', async () => {
  const { default: StageView } = await import('../src/screens/cockpit/StageView.jsx');
  const failed = formNext(formStart({ branch: 'nexus/vega-1' }, 0), { type: 'fail', error: 'fatal: could not create work tree dir' });
  const html = renderToStaticMarkup(createElement(StageView, { view, forming: { form: failed, onRetry: () => {} } }));
  assert.match(html, /forming is-failed/);
  assert.match(html, /The star did not form/);
  assert.match(html, /fatal: could not create work tree dir/);
  assert.match(html, /orb orb-xl st-failed/);
  assert.match(html, />Retry<\/button>/);
  assert.doesNotMatch(html, /class="lstar/);
  const ready = renderToStaticMarkup(createElement(StageView, { view, forming: { form: formNext(formStart({}, 0), { type: 'ready' }) } }));
  assert.doesNotMatch(ready, /forming/);
  assert.match(ready, /snode/);
});

test('the composer is held while the worktree forms, saying why', async () => {
  const { Composer } = await import('../src/ui/composer.jsx');
  const html = renderToStaticMarkup(createElement(Composer, { value: '', mode: 'forming', formingText: 'Waiting on its worktree: checking out nexus/vega-1...', dock: true }));
  assert.match(html, /composer is-disabled/);
  assert.match(html, /<textarea[^>]*disabled=""/);
  assert.match(html, /Its worktree is forming\. You can write once it is ready\./);
  assert.match(html, /Waiting on its worktree: checking out nexus\/vega-1\.\.\./);
  assert.match(html, /aria-label="Send" disabled=""/);
  assert.doesNotMatch(html, /Resume/);
});
