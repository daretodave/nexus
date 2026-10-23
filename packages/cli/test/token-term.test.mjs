// The mini terminal that replays `claude setup-token` (onboarding/tokenTerm.js, TokenTerm.jsx, styles/mini-term.css):
// frames in order, a made-up token that can never pass for a real one, reduced motion as the final frame, a transcript
// for screen readers, tokens-only CSS, and nexus.css left as it is.
import './jsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FAKE_TOKEN, REAL_TOKEN } from '../shared/oauth-token.mjs';
import { tokenFrames, transcript, shownAt, typedAt, browserAt, nextTick, END_MS, COMMAND } from '../src/screens/onboarding/tokenTerm.js';

globalThis.window ||= { location: { href: 'http://localhost/' }, history: { replaceState() {} } };
const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('frames run in time order and end on the token, its callout, the store line and the export note', () => {
  const f = tokenFrames();
  for (let i = 1; i < f.length; i += 1) assert.ok(f[i].at >= f[i - 1].at);
  assert.equal(f[0].kind, 'cmd');
  assert.equal(f[0].text, 'claude setup-token');
  const kinds = f.map((x) => x.kind);
  assert.ok(kinds.indexOf('token') < kinds.indexOf('callout'));
  assert.match(f.at(-2).text, /Store this token securely/);
  assert.match(f.at(-1).note, /repo secret/);
  assert.ok(f.at(-1).at < END_MS);
  assert.equal(shownAt(f, 0), 1);
  assert.equal(shownAt(f, END_MS), f.length);
  assert.equal(typedAt(0), '');
  assert.equal(typedAt(10000), COMMAND);
  assert.deepEqual([browserAt(0), browserAt(2500), browserAt(4000), browserAt(5000)], ['hidden', 'asking', 'signed', 'gone']);
  assert.equal(nextTick(f, END_MS), null, 'it holds after the end');
});

test('the made-up token has the mask dots and can never match a real token', () => {
  assert.ok(FAKE_TOKEN.startsWith('sk-ant-oat01-'));
  assert.ok(FAKE_TOKEN.includes('•'.repeat(20)));
  assert.doesNotMatch(FAKE_TOKEN, REAL_TOKEN);
  assert.ok(tokenFrames().some((f) => f.text === FAKE_TOKEN));
});

test('reduced: every final line at once, no caret, no Replay, the browser card still and signed in; the transcript always there', async () => {
  const { default: TokenTerm } = await import('../src/screens/onboarding/TokenTerm.jsx');
  const still = renderToStaticMarkup(createElement(TokenTerm, { reduced: true }));
  for (const line of transcript()) {
    const text = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;');
    assert.ok(still.includes(text), `the transcript holds: ${line}`);
  }
  assert.ok(!still.includes('mt-caret'));
  assert.ok(!still.includes('Replay'));
  assert.match(still, /mt-browser is-signed/);
  assert.match(still, /in your browser/);
  assert.match(still, /aria-hidden="true"/);
  assert.match(still, /<ol class="mt-sr">/);
  const live = renderToStaticMarkup(createElement(TokenTerm, { reduced: false }));
  assert.match(live, /<ol class="mt-sr">/, 'the screen-reader transcript is there while it plays');
  assert.match(live, /Replay/);
  assert.match(live, /mt-caret/);
});

test('the CSS uses theme tokens only, with a reduced-motion block; nexus.css is byte-identical to HEAD', () => {
  for (const f of ['mini-term.css', 'repo-start.css']) {
    const css = fs.readFileSync(path.join(PKG, 'src', 'styles', f), 'utf8');
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i, `${f}: no colour literals`);
    assert.match(css, /prefers-reduced-motion: reduce/);
  }
  // git's own compare (it follows the checkout's line-ending settings): no change against HEAD, staged or not.
  execFileSync('git', ['diff', '--quiet', 'HEAD', '--', 'src/styles/nexus.css'], { cwd: PKG });
});

test('TokenGuide: paste only where it can land; the GitHub page and the terminal command name the repo', async () => {
  const { default: TokenGuide, canPaste, secretsPage } = await import('../src/screens/onboarding/TokenGuide.jsx');
  assert.equal(canPaste({ place: 'github', gh: true, viewer: 'ADMIN' }), true);
  assert.equal(canPaste({ place: 'github', gh: true, viewer: null }), true, 'an unread role: gh decides');
  assert.equal(canPaste({ place: 'github', gh: true, viewer: 'WRITE' }), false);
  assert.equal(canPaste({ place: 'local', gh: true, viewer: 'ADMIN' }), false);
  assert.equal(secretsPage('ada-park/lantern'), 'https://github.com/ada-park/lantern/settings/secrets/actions/new');
  const html = renderToStaticMarkup(createElement(TokenGuide, { slug: 'ada-park/lantern', place: 'github', gh: true, viewer: 'ADMIN', open: true, reduced: true }));
  assert.match(html, /Save to ada-park\/lantern/);
  assert.match(html, /type="password"/);
  assert.doesNotMatch(html, /value="/, 'the paste field never renders a value');
  assert.match(html, /Where it goes/);
  const writer = renderToStaticMarkup(createElement(TokenGuide, { slug: 'ada-park/lantern', place: 'github', gh: true, viewer: 'WRITE' }));
  assert.doesNotMatch(writer, /Save to/, 'a writer starts on the terminal path');
  assert.match(writer, /gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo ada-park\/lantern/);
});
