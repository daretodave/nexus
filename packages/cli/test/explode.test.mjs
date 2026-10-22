// Onboarding's Plot step served (spec 47, A1): POST /api/explode splits thoughts into sized ideas (Haiku, or the
// rule split when the model is unavailable) and proposes the next free spec; POST /api/plot starts a /plot run that
// lands the kept chunks per owner mode. The SDK's query() is stubbed throughout: no test calls a model.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { startServer } from '../server/server.mjs';
import { explode, nextSpec, parseIdeas, plotPrompt, plotRequest, slugOf, specFor, splitThoughts, titleOf } from '../server/explode.mjs';
import { SUMMARY_MODEL } from '../server/summaries.mjs';

const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');

function tmpRepo(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-explode-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), text);
  }
  return dir;
}

/** A stub of the SDK's query(): records each call, answers with `reply` (a string) or throws `fail`. */
function stubQuery({ reply = '', fail = null, hang = false } = {}) {
  const calls = [];
  const fn = ({ prompt, options }) => {
    calls.push({ prompt, options });
    return {
      async *[Symbol.asyncIterator]() {
        if (fail) throw new Error(fail);
        if (hang) await new Promise(() => {});
        yield { type: 'result', subtype: 'success', is_error: false, result: reply, total_cost_usd: 0.001 };
      },
      close() {},
    };
  };
  fn.calls = calls;
  return fn;
}

// ---- the rule split ----------------------------------------------------------

test('the rule split: blank lines, bullets, one thought per line, and connectives; each excerpt verbatim', () => {
  const text = [
    '- fix the login redirect',
    '* add dark mode. also make the sidebar collapsible',
    '',
    'We should cache the search results; the export button is broken and also the docs are stale',
    '2) rate limit the upload endpoint',
    '',
    '   ',
    '- fix the login redirect',
    '- ...',
  ].join('\r\n');
  const ideas = splitThoughts(text);
  assert.deepEqual(ideas.map((x) => x.t), [
    'Fix the login redirect', 'Add dark mode', 'Make the sidebar collapsible', 'Cache the search results',
    'The export button is broken', 'The docs are stale', 'Rate limit the upload endpoint',
  ]);
  assert.deepEqual(ideas.map((x) => x.id), ['0', '1', '2', '3', '4', '5', '6']);
  for (const x of ideas) {
    assert.equal(x.size, 'S');
    assert.ok(text.includes(x.q), `"${x.q}" is a verbatim excerpt`);
    assert.equal(x.auto, undefined, 'auto is a placement hint Plot.jsx shows as text; the rule split has none');
  }
  assert.deepEqual(splitThoughts(''), []);
  assert.deepEqual(splitThoughts('\n\n - \n'), []);
});

test('titles are short first clauses; slugs are kebab and at most 40 characters', () => {
  assert.equal(titleOf('we need to ship the importer: it reads csv and json'), 'Ship the importer');
  assert.ok(titleOf('a'.repeat(30) + ' ' + 'b'.repeat(40)).length <= 60);
  assert.equal(slugOf('Fix the login redirect on Safari!'), 'fix-the-login-redirect-on-safari');
  const long = slugOf('Make every onboarding button do exactly what it says it does');
  assert.ok(long.length <= 40 && !long.endsWith('-'), long);
  assert.equal(slugOf('!!!'), 'first-work');
});

// ---- the next spec number ----------------------------------------------------

test('the next spec: one above every spec file, archive id and pending addition; the README\'s sentence when higher', () => {
  assert.deepEqual(nextSpec(tmpRepo()).n, 1);
  assert.deepEqual(specFor(tmpRepo(), 'Plot the first work'), { n: 1, file: 'plan/01-plot-the-first-work.md' });

  const files = tmpRepo({ 'plan/03-search.md': '# 03', 'plan/12-export.md': '# 12', 'plan/README.md': '# Plan\n' });
  assert.equal(nextSpec(files).n, 13);

  // The archive holds a higher spec than any open file (specs close into it), as a spec line and a chunk line.
  const archived = tmpRepo({
    'plan/12-export.md': '# 12',
    'plan/ARCHIVE.md': '# Archive\n\n- 2026-07-02 · 06 · Cloud loop · b4d40ef\n- 2026-10-21 · 31.4 · something shipped · plan only\n- 2026-10-21 · 29 · spec complete · abc\n',
  });
  assert.deepEqual(nextSpec(archived).signals, { files: 13, archive: 32 });
  assert.equal(nextSpec(archived).n, 32);

  // The README names the next spec outright: it wins when it is the highest signal, and loses when a file is past it.
  const said = tmpRepo({ 'plan/12-export.md': '# 12', 'plan/README.md': 'Spec numbers continue from the phases. The next new spec is 48.\n' });
  assert.equal(nextSpec(said).n, 48);
  assert.deepEqual(specFor(said, 'Rate limits'), { n: 48, file: 'plan/48-rate-limits.md' });
  const stale = tmpRepo({ 'plan/50-later.md': '# 50', 'plan/README.md': 'The next new spec is **48**.\n' });
  assert.equal(nextSpec(stale).n, 51);

  // A pending file that adds a spec, and a repo whose specs live under plan/specs/ with three digits.
  const pending = tmpRepo({ 'plan/12-export.md': '# 12', 'plan/pending/plot-x.md': '## Add plan/14-rate-limits.md\n' });
  assert.equal(nextSpec(pending).n, 15);
  const wide = tmpRepo({ 'plan/specs/104-thing.md': '# 104' });
  assert.deepEqual(specFor(wide, 'Next'), { n: 105, file: 'plan/105-next.md' });
});

// ---- explode -------------------------------------------------------------------

test('explode asks Haiku once, the way the summaries do, and returns its ideas checked against the thoughts', async () => {
  const repo = tmpRepo({ 'plan/07-search.md': '# 07' });
  const text = 'Fix the login redirect, it loops on Safari. Also we want dark mode for the docs site';
  const query = stubQuery({ reply: `Sure:\n${JSON.stringify({ ideas: [
    { t: 'Fix the login redirect loop.', q: 'fix the login redirect, it loops on Safari', size: 's' },
    { t: 'Dark mode for the docs', q: 'not in the text at all', size: 'XL' },
    { t: '', q: 'dropped: no title' },
  ] })}` });
  const r = await explode({ repo, text, team: 'solo', query });
  assert.equal(r.status, 200);
  assert.equal(r.by, 'ai');
  assert.deepEqual(r.ideas, [
    { id: '0', t: 'Fix the login redirect loop', q: 'Fix the login redirect, it loops on Safari', size: 'S' },
    { id: '1', t: 'Dark mode for the docs', q: 'not in the text at all', size: 'M' },
  ]);
  assert.deepEqual(r.spec, { n: 8, file: 'plan/08-fix-the-login-redirect-loop.md' });
  assert.equal(query.calls.length, 1);
  const { prompt, options } = query.calls[0];
  assert.match(prompt, /one person working alone/);
  assert.ok(prompt.includes(text));
  assert.equal(options.model, SUMMARY_MODEL);
  assert.deepEqual([options.tools, options.allowedTools, options.settingSources, options.maxTurns, options.persistSession], [[], [], [], 1, false]);
  assert.ok(options.maxBudgetUsd > 0 && options.abortController);
  assert.equal(fs.readdirSync(path.join(repo, 'plan')).join(','), '07-search.md', 'explode writes nothing');
});

test('explode falls back to the rule split when the model fails, answers nothing usable, times out or is absent', async () => {
  const repo = tmpRepo();
  const text = '- fix the login redirect\n- add dark mode';
  const want = ['Fix the login redirect', 'Add dark mode'];
  for (const [why, query, note] of [
    ['throws', stubQuery({ fail: 'not logged in' }), /not logged in/],
    ['junk', stubQuery({ reply: 'I cannot help with that.' }), /no ideas/],
    ['empty list', stubQuery({ reply: '{"ideas":[]}' }), /no ideas/],
    ['hangs', stubQuery({ hang: true }), /timed out/],
    ['absent', false, /not available/],
  ]) {
    const r = await explode({ repo, text, query, timeoutMs: 50 });
    assert.equal(r.status, 200, why);
    assert.equal(r.by, 'split', why);
    assert.deepEqual(r.ideas.map((x) => x.t), want, why);
    assert.match(r.note, note, why);
    assert.deepEqual(r.spec, { n: 1, file: 'plan/01-fix-the-login-redirect.md' }, why);
  }
  assert.equal((await explode({ repo, text: '   ', query: false })).status, 400);
});

test('parseIdeas reads a bare array too, caps sizes to S M L and drops non-objects', () => {
  assert.deepEqual(parseIdeas('[{"title":"A thing","quote":"a thing","size":"l"}, 3, null]', 'A thing here'), [{ id: '0', t: 'A thing', q: 'A thing', size: 'L' }]);
  assert.deepEqual(parseIdeas('no json', 'x'), []);
});

// ---- plot ----------------------------------------------------------------------

const BODY = {
  spec: 'plan/48-fix-the-login-redirect.md',
  thoughts: 'fix the login redirect\nadd dark mode, "soon"',
  chunks: [
    { id: '48.1', title: 'Fix the login redirect', size: 'S', place: 'asap', from: ['fix the login redirect'] },
    { id: '48.2', title: 'Add dark mode + docs theme', size: 'L', place: 'auto', from: ['add dark mode, "soon"', 'docs theme'] },
  ],
};

test('the plot request is checked: chunks need a title, sizes and places are known words, the spec file is plan/NN-slug.md', () => {
  assert.match(plotRequest({ chunks: [] }).error, /keep an idea/);
  assert.match(plotRequest({ chunks: [{ title: '  ' }] }).error, /keep an idea/);
  const r = plotRequest({ spec: '../etc/passwd', chunks: [{ id: '1.1', title: 'X', size: 'huge', place: 'now', from: 'nope' }] });
  assert.equal(r.spec, null);
  assert.deepEqual(r.chunks, [{ id: '1.1', title: 'X', size: 'M', place: 'auto', from: [] }]);
  assert.deepEqual(plotRequest(BODY).spec, { n: 48, file: 'plan/48-fix-the-login-redirect.md' });
});

test('the /plot prompt names every chunk, its place, its excerpts, the spec the GUI showed and the landing', () => {
  const owner = plotPrompt(plotRequest(BODY), true);
  assert.match(owner, /^\/plot "Fix the login redirect, and 1 more"\n/);
  assert.match(owner, /plan\/48-fix-the-login-redirect\.md \(spec 48\)/);
  assert.match(owner, /^- 48\.1 · Fix the login redirect · S · asap$/m);
  assert.match(owner, /^- 48\.2 · Add dark mode \+ docs theme · L · let nexus decide$/m);
  assert.match(owner, /from: "add dark mode, 'soon'" ; "docs theme"/);
  assert.match(owner, /owner mode: land it settled on main/);
  assert.doesNotMatch(owner, /pull request/);
  assert.match(owner, /<<<\nfix the login redirect\nadd dark mode, "soon"\n>>>/);

  const contrib = plotPrompt(plotRequest(BODY), false);
  assert.match(contrib, /contributor mode: land it as a plot pull request/);
  assert.match(contrib, /Never push main/);
  assert.doesNotMatch(contrib, /settled on main/);

  // One place for every chunk is /plot's own word; a single chunk is the task itself.
  const asap = plotPrompt(plotRequest({ chunks: [{ title: 'Ship it "now"', size: 'S', place: 'anytime' }] }), true);
  assert.match(asap, /^\/plot anytime "Ship it 'now'"\n/);
  assert.match(asap, /Give it the next free spec number/);
});

// ---- the server ----------------------------------------------------------------

function req(port, { method = 'GET', pathname, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: pathname, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null }));
    });
    r.on('error', reject);
    r.end(body);
  });
}

function fakes() {
  const sent = [];
  const provider = () => ({ kind: 'fake', send: (t) => sent.push(t), async interrupt() {}, async stop() {}, async fresh() {} });
  return { sent, provider };
}

async function withServer(repo, opts, fn) {
  const { sent, provider } = fakes();
  const app = await startServer({ repo, provider, pollRuns: false, dist: NO_DIST, ghLogin: async () => '', ...opts });
  const headers = { 'x-nexus-token': app.token, 'content-type': 'application/json', origin: `http://127.0.0.1:${app.port}` };
  const post = (pathname, b) => req(app.port, { method: 'POST', pathname, headers, body: JSON.stringify(b) });
  try {
    await fn({ app, post, sent });
  } finally {
    await app.close();
  }
}

test('POST /api/explode is served: the model\'s ideas, or the rule split when it fails; never a model under test by default', async () => {
  const repo = tmpRepo({ 'plan/README.md': 'The next new spec is 5.\n' });
  const query = stubQuery({ reply: '{"ideas":[{"t":"Fix the redirect","q":"fix the login redirect","size":"M"}]}' });
  await withServer(repo, { explodeQuery: query }, async ({ post }) => {
    const r = await post('/api/explode', { text: 'fix the login redirect', team: 'team' });
    assert.equal(r.status, 200);
    assert.equal(r.data.by, 'ai');
    assert.deepEqual(r.data.ideas, [{ id: '0', t: 'Fix the redirect', q: 'fix the login redirect', size: 'M' }]);
    assert.deepEqual(r.data.spec, { n: 5, file: 'plan/05-fix-the-redirect.md' });
    assert.equal((await post('/api/explode', { text: '' })).status, 400);
  });
  await withServer(repo, { explodeQuery: stubQuery({ fail: 'boom' }) }, async ({ post }) => {
    const r = await post('/api/explode', { text: 'fix the login redirect; add dark mode' });
    assert.equal(r.status, 200);
    assert.equal(r.data.by, 'split');
    assert.deepEqual(r.data.ideas.map((x) => x.t), ['Fix the login redirect', 'Add dark mode']);
  });
  // An injected provider with no query stub loads no SDK: the rule split answers.
  await withServer(repo, {}, async ({ post }) => {
    const r = await post('/api/explode', { text: '- one thing\n- another thing' });
    assert.equal(r.data.by, 'split');
    assert.match(r.data.note, /not available/);
  });
});

test('POST /api/plot is served: a /plot run in a new session, landing settled for the owner and as a PR for a contributor', async () => {
  // Contributor: no .owner in the checkout.
  const contrib = tmpRepo();
  await withServer(contrib, {}, async ({ app, post, sent }) => {
    assert.equal((await post('/api/plot', { chunks: [] })).status, 400);
    assert.deepEqual(sent, []);
    const r = await post('/api/plot', BODY);
    assert.equal(r.status, 200);
    assert.equal(r.data.file, 'plan/48-fix-the-login-redirect.md');
    assert.deepEqual(r.data.chunks, ['48.1', '48.2']);
    assert.equal(r.data.owner, false);
    assert.notEqual(r.data.session, app.home);
    assert.ok(r.data.star);
    assert.equal(sent.length, 1);
    assert.equal(sent[0], r.data.prompt);
    assert.match(sent[0], /^\/plot "/);
    assert.match(sent[0], /contributor mode: land it as a plot pull request/);
    assert.ok(app.sessions.has(r.data.session), 'the session is hosted here, so its cockpit opens');
    assert.equal(app.sessions.get(r.data.session).place.worktree, undefined, 'no worktree of its own: /plot cuts one');
  });
  assert.ok(!fs.existsSync(path.join(contrib, 'plan')), 'the server writes no plan file');

  // Owner: an untracked .owner at the root.
  const owner = tmpRepo({ '.owner': 'owner\n' });
  await withServer(owner, {}, async ({ post, sent }) => {
    const r = await post('/api/plot', BODY);
    assert.equal(r.status, 200);
    assert.equal(r.data.owner, true);
    assert.match(sent[0], /owner mode: land it settled on main/);
  });
});
