// The folder-to-GitHub panel (onboarding/RepoStart.jsx, RepoConfirm.jsx, repoStart.js), the cloud gate and Detect's
// git row per place. Static renders from GET /api/repo/start answers; nothing is fetched.
import './jsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

globalThis.window ||= { location: { href: 'http://localhost/' }, history: { replaceState() {} } };

const { cloudGate, repoSteps, identityLine, ownerChoices, nameLine, commitSummary, gitStar, wantsRepoStart, heading } = await import('../src/screens/onboarding/repoStart.js');
const { rowsFrom } = await import('../src/screens/onboarding/Detect.jsx');
const { default: RepoStart, RepoPointer } = await import('../src/screens/onboarding/RepoStart.jsx');
const { default: RepoConfirm } = await import('../src/screens/onboarding/RepoConfirm.jsx');

const GH = { installed: true, signedIn: true, login: 'ada-park', name: 'Ada Park', id: 1, orgs: ['lantern-labs'], scopes: ['repo', 'workflow'], protocol: 'https' };
const USER = { installed: true, version: '2.43.0', user: { name: 'Ada Park', email: 'ada@example.com' }, from: 'global' };
const start = (o = {}) => ({
  place: 'none', next: 'init', platform: 'linux', folder: { path: '/w/lantern', name: 'lantern', slug: 'lantern' },
  git: USER, gh: GH, repo: { branch: 'main', commits: 0, head: null, remote: null, pushed: null },
  gitignore: { exists: false, missing: [] }, preview: { files: 37, capped: false, ignoredTop: [], flagged: [], large: [] },
  plan: { init: ['git', 'init', '-b', 'main'], remote: ['gh', 'repo', 'create', 'ada-park/lantern', '--private', '--source', '.', '--remote', 'origin'], push: ['git', 'push', '-u', 'origin', 'main'] },
  guide: {}, manual: ['git init -b main'], ...o,
});
const html = (s, props = {}) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(RepoStart, { res: { status: 'ready', data: s, reload() {} }, ...props })));

test('cloudGate for every place; an unknown place is today\'s ready', () => {
  assert.deepEqual(['none', 'local', 'unpushed'].map(cloudGate), ['repo', 'repo', 'repo']);
  assert.deepEqual(['other', 'nested', 'refused'].map(cloudGate), ['other', 'other', 'other']);
  assert.equal(cloudGate('github'), 'ready');
  assert.equal(cloudGate(undefined), 'ready');
});

test('Detect\'s git row per place: word, star and detail', () => {
  const pf = (info) => ({ checks: [], info: { name: 'lantern', branch: 'main', adopted: false, ...info } });
  const none = rowsFrom(pf({ isGit: false, place: 'none' })).git;
  assert.deepEqual([none.star, none.word], ['warn', 'not a repo']);
  const local = rowsFrom(pf({ isGit: true, place: 'local', remote: null })).git;
  assert.deepEqual([local.star, local.word], ['neutral', 'local only']);
  const gh = rowsFrom(pf({ isGit: true, place: 'github', remote: 'https://github.com/a/b.git' })).git;
  assert.deepEqual([gh.star, gh.word], ['lit', 'found']);
  const nested = rowsFrom(pf({ isGit: true, place: 'nested', top: '/w/big' })).git;
  assert.equal(nested.word, 'inside a repo');
  assert.match(renderToStaticMarkup(nested.detail), /\/w\/big/);
  assert.equal(rowsFrom(pf({ isGit: false, place: 'refused' })).git.star, 'warn');
  assert.deepEqual(['github', 'local', 'none'].map(gitStar), ['lit', 'neutral', 'warn']);
  assert.equal(wantsRepoStart({ place: 'github' }), false);
  assert.equal(wantsRepoStart({ place: 'local' }), true);
  assert.equal(wantsRepoStart({ isGit: false }), true, 'an older server with no place');
});

test('the model: steps, identity line, owners, the name line, the commit summary, the heading', () => {
  assert.deepEqual(repoSteps(start()).map((s) => s.state), ['now', 'wait', 'wait', 'wait']);
  assert.deepEqual(repoSteps(start({ next: 'push' })).map((s) => s.state), ['done', 'done', 'now', 'wait']);
  assert.deepEqual(repoSteps(start({ next: 'done' })).map((s) => s.state), ['done', 'done', 'done', 'done']);
  assert.deepEqual(identityLine(start({ git: { ...USER, user: null }, gh: { ...GH, signedIn: false } })).missing, ['git does not know who you are yet', 'GitHub: gh is not signed in (the local steps still work)']);
  assert.deepEqual(ownerChoices(start()), ['ada-park', 'lantern-labs']);
  assert.equal(nameLine('ada-park', 'lantern', true), 'github.com/ada-park/lantern · free');
  assert.equal(nameLine('ada-park', 'lantern', false), 'github.com/ada-park/lantern already exists');
  assert.equal(commitSummary({ files: 37, ignoredTop: ['node_modules/', '.env', '.nexus/'] }), '37 files go in. Left out by .gitignore: node_modules/, .env, .nexus/.');
  assert.equal(heading(start()).title, 'Make lantern a repo');
});

test('RepoStart per next: the identity line and the one right button', () => {
  const init = html(start());
  assert.match(init, /As <b>Ada Park<\/b>/);
  assert.match(init, /GitHub <b>ada-park<\/b>/);
  assert.match(init, /Start the repo<\/button>/);
  assert.doesNotMatch(init, /Make the first commit/);
  assert.match(init, /Do it in a terminal instead/);
  const commit = html(start({ place: 'local', next: 'commit', preview: { files: 37, ignoredTop: ['.nexus/'], flagged: [{ path: 'config/secrets.json', why: 'named for secrets' }], large: [] } }));
  assert.match(commit, /Make the first commit/);
  assert.match(commit, /config\/secrets\.json/);
  assert.match(commit, /stay out unless you untick them/);
  const big = html(start({ place: 'local', next: 'commit', preview: { files: 2, ignoredTop: [], flagged: [], large: [{ path: 'v.mov', mb: 212, blocks: true }] } }));
  assert.match(big, /GitHub refuses files over 100 MB/);
  assert.match(big, /disabled=""[^>]*>.{0,200}Make the first commit/s);
  const remote = html(start({ place: 'local', next: 'remote', repo: { branch: 'main', commits: 1, head: 'a1b2c3d', remote: null, pushed: null } }));
  assert.match(remote, /Put it on GitHub\.\.\./);
  assert.match(remote, /<option value="lantern-labs">/);
  assert.match(remote, /Private/);
  const done = html(start({ place: 'github', next: 'done', repo: { branch: 'main', commits: 1, head: 'a1b2c3d', remote: { web: 'https://github.com/ada-park/lantern' }, pushed: true } }));
  assert.match(done, /Open on GitHub/);
  assert.match(done, /href="https:\/\/github.com\/ada-park\/lantern"/);
});

test('RepoStart guidance: missing identity offers the gh name and the copyable commands; blocked reasons show commands only', () => {
  const noId = html(start({ place: 'local', next: 'commit', why: 'no-identity', git: { ...USER, user: null }, guide: { 'no-identity': ['git config --global user.name "Ada Park"', 'git config --global user.email "you@example.com"'] } }));
  assert.match(noId, /Use ada-park for this repo/);
  assert.match(noId, /user\.email/);
  assert.match(noId, /Check again/);
  assert.match(noId, /aria-label="Copy the command: git config --global user.name &quot;Ada Park&quot;"/);
  const signedOut = html(start({ place: 'local', next: 'remote', gh: { ...GH, signedIn: false, login: null }, repo: { branch: 'main', commits: 1, head: 'a', remote: null, pushed: null }, guide: { 'gh-signed-out': ['gh auth login'] } }));
  assert.match(signedOut, /gh is not signed in/);
  assert.match(signedOut, /gh auth login/);
  const nested = html(start({ place: 'nested', next: 'blocked', why: 'nested', folder: { name: 'sub', slug: 'sub', top: '/w/big' }, guide: { nested: ['npx @usenexus/cli --repo "/w/big"'] } }));
  assert.match(nested, /inside the repo at \/w\/big/);
  assert.doesNotMatch(nested, /Start the repo/, 'no init button, ever');
  const refused = html(start({ place: 'refused', next: 'blocked', why: 'refused', folder: { name: 'me', slug: 'me', refusedAs: 'home' }, guide: { refused: ['mkdir me && cd me && npx @usenexus/cli'] } }));
  assert.match(refused, /This is your home folder/);
  assert.equal(html(start(), { res: { status: 'missing', data: null } }), '', 'an older server: nothing drawn');
});

test('the confirm card renders the server\'s plan args verbatim, and the owner-mode tick only for a create', () => {
  const plan = { remote: ['gh', 'repo', 'create', 'lantern-labs/lantern', '--public', '--source', '.', '--remote', 'origin'], push: ['git', 'push', '-u', 'origin', 'main'] };
  const card = renderToStaticMarkup(createElement(RepoConfirm, { kind: 'create', owner: 'lantern-labs', name: 'lantern', visibility: 'public', login: 'ada-park', plan, counts: { commits: 1, files: 37 }, ownerMode: false, onOwnerMode() {} }));
  const text = card.replace(/<[^>]+>/g, '');
  assert.ok(text.includes(plan.remote.join(' ')));
  assert.ok(text.includes(plan.push.join(' ')));
  assert.match(text, /This creates a public repo lantern-labs\/lantern on GitHub as ada-park/);
  assert.match(text, /An org repo: tick it if you are the one who lands work here/);
  assert.match(text, /Create and push/);
  const push = renderToStaticMarkup(createElement(RepoConfirm, { kind: 'push', owner: 'ada-park', name: 'lantern', login: 'ada-park', plan, counts: { commits: 1 } }));
  assert.doesNotMatch(push, /gh repo create/);
  assert.doesNotMatch(push, /Owner mode/);
  assert.match(push, /Push again/);
});

test('RepoPointer: one line for a plain folder, nothing otherwise', () => {
  const r = (p) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(RepoPointer, p)));
  assert.match(r({ name: 'lantern', place: 'none' }), /lantern<\/b> is not a git repo yet/);
  assert.match(r({ name: 'lantern', place: 'none' }), /href="\/onboarding\/detect"/);
  assert.equal(r({ name: 'lantern', place: 'github' }), '');
});
