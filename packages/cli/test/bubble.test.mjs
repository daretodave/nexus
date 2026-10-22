// Your own message in the transcript (spec 47): the bubble draws the person's markdown, so a multi-line message keeps
// its lines, a list stays a list and a pasted fence stays a fence, never one flattened paragraph.
import './jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('the bubble renders markdown: lines, a list and a fenced block keep their shape; tags stay text', async () => {
  const { MsgYou } = await import('../src/ui/shell.jsx');
  const text = 'first line\nsecond line\n\n- one\n- two\n\n```\nError: boom\n    at main (x.js:1)\n```\n<b>not bold</b>';
  const html = renderToStaticMarkup(createElement(MsgYou, { time: '10:02', text }));
  assert.match(html, /<div class="md bubble">/);
  assert.match(html, /<p>first line<br\/>second line<\/p>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<pre class="md-pre"><code>Error: boom\n {4}at main \(x\.js:1\)<\/code><\/pre>/);
  assert.match(html, /&lt;b&gt;not bold&lt;\/b&gt;/);
  assert.match(renderToStaticMarkup(createElement(MsgYou, { time: '', text: 'just one line' })), /<div class="md bubble"><p>just one line<\/p><\/div>/);
});
