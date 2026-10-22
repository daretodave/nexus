// Onboarding fits an adopted repo (spec 47, A3): Detect names the lock's version, the Plot step names the next spec
// number (never "the first spec" in a repo with specs), toasts sit clear of the onboarding footer and link the docs
// they name, and an orb's glyph stays centred in its orb inside the onboarding art.
import './jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { kitLock, nextSpecOf } from '../server/repo.mjs';
import { removeTreeSync } from './helpers/tmp.mjs';

// The data client reads its launch token from the page at import: a bare page for the screens imported here.
globalThis.window ||= { location: { href: 'http://localhost/' }, history: { replaceState() {} } };

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-obfit-'));
const html = (node) => renderToStaticMarkup(createElement(Fragment, null, node));
const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

test('kitLock reads version and ref from plan/nexus.lock, tolerating a missing or empty lock', () => {
  const dir = tmp();
  try {
    assert.equal(kitLock(dir), null, 'no plan/ at all');
    fs.mkdirSync(path.join(dir, 'plan'));
    fs.writeFileSync(path.join(dir, 'plan', 'nexus.lock'), '# a comment\r\nkit: nexus\r\nversion: 2.0.0\r\nref: v2.0.0 # pinned\r\nshape: chunks\r\n');
    assert.deepEqual(kitLock(dir), { version: '2.0.0', ref: 'v2.0.0' });
    fs.writeFileSync(path.join(dir, 'plan', 'nexus.lock'), 'ref: "main"\n');
    assert.deepEqual(kitLock(dir), { version: null, ref: 'main' });
    fs.writeFileSync(path.join(dir, 'plan', 'nexus.lock'), '# nothing pinned\n');
    assert.equal(kitLock(dir), null);
  } finally { removeTreeSync(dir); }
});

test('Detect names the lock version for an adopted repo, and stays plain without a lock', async () => {
  const { rowsFrom, kitVersion } = await import('../src/screens/onboarding/Detect.jsx');
  const pf = (info) => ({ checks: [], info: { isGit: true, name: 'r', adopted: true, ...info } });
  const withLock = rowsFrom(pf({ kit: { version: '2.0.0', ref: 'v2.0.0' } })).nexus;
  assert.equal(withLock.short, 'nexus 2.0.0');
  assert.match(html(withLock.detail), /Already adopted, <code>nexus 2\.0\.0<\/code> \(plan\/nexus\.lock\): agents\.md/);
  assert.equal(kitVersion({ version: null, ref: 'v1.4.0' }), 'v1.4.0');
  const noLock = rowsFrom(pf({ kit: null })).nexus;
  assert.equal(noLock.short, 'adopted');
  assert.equal(html(noLock.detail), 'Already adopted: agents.md, plan/ and .claude/commands are here.');
});

test('nextSpecOf names the next spec number; fresh only when the repo has no spec', () => {
  const dir = tmp();
  try {
    assert.deepEqual(nextSpecOf(dir), { n: 1, prefix: 'plan/01-', fresh: true });
    fs.mkdirSync(path.join(dir, 'plan'));
    fs.writeFileSync(path.join(dir, 'plan', '46-something.md'), '# 46\n');
    assert.deepEqual(nextSpecOf(dir), { n: 47, prefix: 'plan/47-', fresh: false });
  } finally { removeTreeSync(dir); }
});

test('the Plot step names the spec: explode\'s file, else the next number, and "the first spec" only in a fresh repo', async () => {
  const { specWords } = await import('../src/screens/onboarding/Plot.jsx');
  assert.deepEqual(specWords('plan/48-fast-search.md', { n: 48, prefix: 'plan/48-', fresh: false }), { code: 'plan/48-fast-search.md', words: '' });
  assert.deepEqual(specWords(null, { n: 48, prefix: 'plan/48-', fresh: false }), { code: 'plan/48-…', words: 'a new spec, ' });
  assert.deepEqual(specWords(null, { n: 1, prefix: 'plan/01-', fresh: true }), { code: null, words: 'the first spec' });
  assert.deepEqual(specWords(null, null), { code: null, words: 'the first spec' }, 'state not loaded yet');
  assert.doesNotMatch(read('../src/screens/onboarding/Plot.jsx'), /: 'the first spec'\}/, 'no hard-coded first-spec fallback left in the Lands notes');
});

test('toasts: a kit doc they name is a link, and the host lifts clear of a footer or the composer', async () => {
  const { docParts, toastHostClass, ToastHost } = await import('../src/ui/feedback.jsx');
  const blob = 'https://github.com/daretodave/nexus/blob/main/customization/secrets.md';
  assert.deepEqual(docParts(`update the repo's secrets scripts (${blob})`), ["update the repo's secrets scripts (", { path: 'customization/secrets.md', href: blob }, ')']);
  assert.deepEqual(docParts('see nexus/playbooks/upgrade.md first'), ['see ', { path: 'playbooks/upgrade.md', href: 'https://github.com/daretodave/nexus/blob/main/playbooks/upgrade.md' }, ' first']);
  assert.deepEqual(docParts('plain words, agents.md stays text'), ['plain words, agents.md stays text']);
  assert.equal(toastHostClass(), 'toast-host');
  assert.equal(toastHostClass('foot'), 'toast-host is-clear-foot');
  assert.equal(toastHostClass('composer'), 'toast-host is-clear-composer');
  const out = html(createElement(ToastHost, { clear: 'foot', toasts: [{ id: 1, kind: 'error', title: 'Not written', body: 'see customization/secrets.md' }] }));
  assert.match(out, /^<div class="toast-host is-clear-foot">/);
  assert.match(out, /<a href="https:\/\/github\.com\/daretodave\/nexus\/blob\/main\/customization\/secrets\.md" target="_blank" rel="noreferrer">customization\/secrets\.md<\/a>/);
  assert.doesNotMatch(out, /style="position:fixed/, 'placement lives in toast-host.css, not inline');
  const css = read('../src/styles/toast-host.css');
  const foot = Number(/^\.toast-host\.is-clear-foot \{ bottom: (\d+)px/m.exec(css)?.[1]);
  // The onboarding foot is 26px of padding under a 44px button: the host sits above that with room to spare.
  assert.ok(foot >= 26 + 44 + 16, `clear of the Back/Continue row (${foot}px)`);
  assert.match(read('../src/screens/onboarding/Secrets.jsx'), /<ToastHost [^>]*clear="foot"/);
  assert.match(read('../src/screens/Cockpit.jsx'), /<ToastHost [^>]*clear="composer"/);
  assert.match(read('../src/ui/feedback.jsx'), /import '\.\.\/styles\/toast-host\.css';/);
});

test('an orb\'s glyph sits in the orb: the art containers\' full-bleed svg rule never reaches it', async () => {
  const { Orb } = await import('../src/ui/agent.jsx');
  assert.match(html(createElement(Orb, { state: 'thinking', size: 'xl', main: true })), /^<span class="orb orb-xl st-thinking is-main"><svg class="ic"/);
  assert.match(html(createElement(Orb, { state: 'blocked', size: 'l', main: true })), /^<span class="orb orb-l st-blocked is-main"><svg class="ic"/);
  const nexus = read('../src/styles/nexus.css');
  const glyph = read('../src/styles/orb-glyph.css');
  // Every `.<art> svg { position: absolute ... }` rule is (0,1,1); `.orb > svg.ic` is (0,2,1), so it wins.
  const art = [...nexus.matchAll(/^(\.[\w-]+) svg \{[^}]*position: absolute/gm)].map((m) => m[1]);
  for (const a of ['.loop-art', '.collapse', '.const']) assert.ok(art.includes(a), `${a} draws its svg full-bleed`);
  assert.match(glyph, /^\.orb > svg\.ic \{ position: relative; inset: auto; \}/m);
  assert.match(glyph, /^\.ob \.orb\.st-thinking > svg\.ic \{ color: var\(--ink-50\);/m, 'light ink on the violet orb');
  assert.match(glyph, /^\.ob \.orb\.st-blocked > svg\.ic \{ color: var\(--orb-ink\);/m, 'theme orb ink: dark on the yellow orb');
  assert.match(read('../src/ui/agent.jsx'), /import '\.\.\/styles\/orb-glyph\.css';/);
});
