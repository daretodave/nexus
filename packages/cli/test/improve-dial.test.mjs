// The improvement dial in Settings (spec 59, A4): four radios with one-line explanations; a choice lands the
// `Improve:` line of plan/bearings.md as a pending file from a temporary worktree of origin's default branch (owner:
// settled and pushed; contributor: a pull request), never in the checkout the GUI runs from. The GUI's colour and
// motion stay: the pips are lit with the aurora, the landing position glows, reduced motion stills it.
import './jsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { startServer } from '../server/server.mjs';
import { applyExact } from '../server/reorder.mjs';
import { POSITIONS, dialIn, improveEdits, improveName, improveView, landImprove } from '../server/improve.mjs';
import { gitEnv } from '../server/cloud.mjs';
import { removeTreeSync } from './helpers/tmp.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'templates', 'scripts');
const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');
const FAKE = { kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} };
const NOW = new Date(2020, 9, 21, 15, 30, 12);
const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const { resolve: kitResolve } = await import(pathToFileURL(path.join(KIT, 'plan', 'improve.mjs')).href);

const BEARINGS = [
  '# Bearings', '', '> Standing context.', '', '---', '',
  '## Voice', '', '- Terse.', '',
  '## Plan expansion posture', '',
  '`/expand` reads signals and files candidates.', '',
  '- Promote: owner', '',
  '## Support', '', 'Support: fix-small', '',
].join('\n');

/** The edits applied as settle applies them. */
const applied = (text, value) => applyExact(text, improveEdits(text, value).edits);

test('dialIn reads the setting line the resolver reads; prose, comments and fences are no setting', () => {
  assert.deepEqual(POSITIONS, ['off', 'gentle', 'steady', 'bold']);
  assert.equal(dialIn(BEARINGS).source, 'default');
  assert.equal(dialIn(BEARINGS).value, 'gentle');
  for (const line of ['- Improve: bold', 'Improve: bold', '**Improve:** `bold`', '- Improve: bold # nexus itself', '- Improve: bold (nexus)']) {
    const t = BEARINGS.replace('- Promote: owner', `${line}\n- Promote: owner`);
    assert.equal(dialIn(t).value, 'bold', line);
    assert.equal(kitResolve(t).improve.value, 'bold', `the resolver agrees: ${line}`);
  }
  assert.equal(dialIn('Improve: off | gentle | steady | bold\n').source, 'default', 'a line naming every position is prose');
  assert.equal(dialIn('<!--\n- Improve: bold\n-->\n').source, 'default');
  assert.equal(dialIn('```\nImprove: bold\n```\n').source, 'default');
  assert.equal(dialIn('- Improve: max\n').value, 'gentle', 'no position reads gentle');
  // two lines, the first no position: the resolver (and so the loop) reads the second, and so does Settings
  const two = BEARINGS.replace('- Promote: owner', '- Improve: medium\n- Improve: bold\n- Promote: owner');
  assert.equal(kitResolve(two).improve.value, 'bold');
  assert.equal(dialIn(two).value, 'bold');
  assert.equal(dialIn(two).source, 'bearings');
  assert.equal(dialIn(two).line, '- Improve: bold');
  assert.equal(applied(two, 'steady'), two.replace('- Improve: bold', '- Improve: steady'), 'a choice swaps the line the loop reads');
  assert.equal(dialIn('- Improve: medium\n- Improve: huge\n').line, '- Improve: medium', 'no valid line: the first one');
});

test('improveEdits: swaps the value in place, adds the line under the posture heading, or adds the section', () => {
  // swap, keeping the line's own shape
  const bold = BEARINGS.replace('- Promote: owner', '- Improve: bold\n- Promote: owner');
  const swapped = applied(bold, 'steady');
  assert.equal(swapped, bold.replace('- Improve: bold', '- Improve: steady'));
  assert.equal(improveEdits(bold, 'steady').how, 'swap');
  const fancy = BEARINGS.replace('- Promote: owner', '**Improve:** `gentle` # the loop as it ran\n- Promote: owner');
  assert.equal(applied(fancy, 'off'), fancy.replace('`gentle`', '`off`'));
  // an example in a comment is left alone; the real line is the one changed
  const both = `<!-- e.g.\n- Improve: bold\n-->\n${bold}`;
  const out = applied(both, 'off');
  assert.match(out, /<!-- e\.g\.\n- Improve: bold\n-->/);
  assert.equal(kitResolve(out).improve.value, 'off');

  // no line: under the heading
  const added = applied(BEARINGS, 'steady');
  assert.equal(improveEdits(BEARINGS, 'steady').how, 'line');
  assert.match(added, /## Plan expansion posture\n\n- Improve: steady\n\n`\/expand` reads/);
  assert.equal(kitResolve(added).improve.value, 'steady');
  assert.equal(kitResolve(added).knobs.find((k) => k.knob === 'Support').source, 'override', 'a knob line of its own still wins');

  // no section: at the end
  const bare = '# Bearings\n\n- Terse.\n\n- Terse.\n';
  const appended = applied(bare, 'bold');
  assert.equal(improveEdits(bare, 'bold').how, 'section');
  assert.equal(appended, '# Bearings\n\n- Terse.\n\n- Terse.\n\n## Plan expansion posture\n\n- Improve: bold\n');
  assert.equal(kitResolve(appended).improve.value, 'bold');

  // CRLF text reads the same
  assert.equal(improveEdits(bold.replace(/\n/g, '\r\n'), 'off').how, 'swap');

  assert.throws(() => improveEdits(bold, 'bold'), (e) => e.status === 400 && /already there/.test(e.message));
  assert.throws(() => improveEdits(bold, 'max'), (e) => e.status === 400 && /not a dial position/.test(e.message));
  assert.throws(() => improveEdits('', 'bold'), (e) => e.status === 409);
  assert.equal(improveName('20201021-153012', new Set(['improve-20201021-153012.md'])), 'improve-20201021-153012-2.md');
});

// ---- landing ------------------------------------------------------------------------------------------------------

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: gitEnv(), stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The person's checkout with a bare origin and the kit's plan scripts (settle, settled, the resolver). */
function fixture({ owner = true, bearings = BEARINGS } = {}) {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-improve-'));
  const origin = path.join(top, 'origin.git');
  const dir = path.join(top, 'me');
  fs.mkdirSync(dir);
  git(top, 'init', '-q', '--bare', '-b', 'main', origin);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'Dave');
  git(dir, 'config', 'user.email', 'd@x');
  fs.mkdirSync(path.join(dir, 'scripts', 'plan'), { recursive: true });
  for (const f of fs.readdirSync(path.join(KIT, 'plan'))) fs.copyFileSync(path.join(KIT, 'plan', f), path.join(dir, 'scripts', 'plan', f));
  for (const f of ['plan-check.mjs', 'owner.mjs']) fs.copyFileSync(path.join(KIT, f), path.join(dir, 'scripts', f));
  fs.mkdirSync(path.join(dir, 'plan', 'pending'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plan', 'README.md'), '# Plan\n\n## Lanes\n\n**Asap** (built before the table):\n\n- (none)\n\n## Specs\n\n| # | Initiative | Spec | Status | Progress |\n|---|---|---|---|---|\n');
  fs.writeFileSync(path.join(dir, 'plan', 'ARCHIVE.md'), '# Archive\n');
  fs.writeFileSync(path.join(dir, 'plan', 'bearings.md'), bearings);
  fs.writeFileSync(path.join(dir, '.gitignore'), '.owner\n.nexus/\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'seed');
  git(dir, 'remote', 'add', 'origin', origin);
  git(dir, 'push', '-q', '-u', 'origin', 'main');
  git(dir, 'remote', 'set-head', 'origin', 'main');
  if (owner) fs.writeFileSync(path.join(dir, '.owner'), 'owner\n');
  return { top, dir, origin, done: () => removeTreeSync(top) };
}

const onMain = (f, rel) => git(f.origin, 'show', `main:${rel}`);

/** The checkout is as it was: same HEAD, its bearings unchanged, no pending file, one worktree, no leftover branch. */
function untouched(f, head) {
  assert.equal(git(f.dir, 'rev-parse', 'HEAD'), head);
  assert.equal(fs.readFileSync(path.join(f.dir, 'plan', 'bearings.md'), 'utf8'), BEARINGS);
  assert.deepEqual(fs.readdirSync(path.join(f.dir, 'plan', 'pending')), []);
  assert.equal(git(f.dir, 'worktree', 'list').split('\n').length, 1);
  assert.equal(git(f.dir, 'branch', '--list', 'nexus/*'), '');
}

test('owner: the dial lands on main through a pending file, settled; the checkout is untouched', async () => {
  const f = fixture();
  try {
    const head = git(f.dir, 'rev-parse', 'HEAD');
    const r = await landImprove(f.dir, { value: 'steady' }, { owner: true, now: NOW });
    assert.equal(r.landed, 'main');
    assert.equal(r.settled, true, r.note);
    assert.equal(r.value, 'steady');
    assert.equal(r.from, null);
    assert.match(r.note, /^Set on main: Improve: steady\./);
    const on = onMain(f, 'plan/bearings.md');
    assert.equal(kitResolve(on).improve.value, 'steady');
    assert.match(on, /## Plan expansion posture\n\n- Improve: steady\n/);
    assert.equal(git(f.origin, 'ls-tree', '--name-only', 'main', 'plan/pending/'), '', 'settled: no pending file left');
    const log = git(f.origin, 'log', '--format=%s', 'main').split('\n');
    assert.equal(log[1], 'plan: improve steady');
    untouched(f, head);
  } finally {
    f.done();
  }
});

test('contributor: a nexus/improve branch and a pull request; main is never pushed', async () => {
  const f = fixture({ owner: false });
  try {
    const head = git(f.dir, 'rev-parse', 'HEAD');
    const before = git(f.origin, 'rev-parse', 'main');
    const seen = [];
    const gh = async (args) => { seen.push(args); return { ok: true, code: 0, out: 'https://github.com/o/r/pull/9\n', err: '' }; };
    const r = await landImprove(f.dir, { value: 'bold' }, { owner: false, now: NOW, gh });
    assert.equal(r.landed, 'pr');
    assert.equal(r.pr, 9);
    assert.equal(r.branch, 'nexus/improve-20201021-153012');
    assert.equal(git(f.origin, 'rev-parse', 'main'), before);
    const file = 'plan/pending/improve-20201021-153012.md';
    const pending = git(f.origin, 'show', `${r.branch}:${file}`);
    assert.match(pending, /^## Edit plan\/bearings\.md$/m);
    assert.match(pending, /- Improve: bold/);
    assert.equal(seen[0][seen[0].indexOf('--title') + 1], 'plan: improve bold');
    untouched(f, head);
    const view = await improveView(f.dir);
    assert.equal(view.value, 'gentle', 'a pull request is not main: GET still reads the old position');
    const { ImproveDial } = await import('../src/screens/cloud-settings/improve-dial.jsx');
    assert.match(renderToStaticMarkup(createElement(ImproveDial, { view, note: r.note })), /checked="" value="gentle"/, 'the radio shows what main holds');
  } finally {
    f.done();
  }
});

function call(app, method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const r = http.request({
      host: '127.0.0.1', port: app.port, path: pathname, method,
      headers: { host: `127.0.0.1:${app.port}`, origin: `http://127.0.0.1:${app.port}`, 'x-nexus-token': app.token, ...(data ? { 'content-type': 'application/json' } : null) },
    }, (res) => {
      let out = '';
      res.on('data', (d) => { out += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(out || '{}') }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

test('GET /api/improve reads the dial and its overrides; POST lands it, and GET then reads main ahead of the checkout', async () => {
  const f = fixture();
  const app = await startServer({ repo: f.dir, provider: FAKE, pollRuns: false, dist: NO_DIST });
  try {
    const a = await call(app, 'GET', '/api/improve');
    assert.equal(a.status, 200);
    assert.equal(a.body.value, 'gentle');
    assert.equal(a.body.source, 'default');
    assert.equal(a.body.resolver, true);
    assert.deepEqual(a.body.overrides.map((o) => o.knob).sort(), ['Promote', 'Support']);
    assert.ok(a.body.overrides.some((o) => o.knob === 'Support' && o.value === 'fix-small'), 'a knob line of its own is listed');
    assert.equal(a.body.here, undefined);

    const bad = await call(app, 'POST', '/api/improve', { value: 'max' });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /not a dial position/);

    const p = await call(app, 'POST', '/api/improve', { value: 'bold' });
    assert.equal(p.status, 200, JSON.stringify(p.body));
    assert.equal(p.body.landed, 'main');
    const b = await call(app, 'GET', '/api/improve');
    assert.equal(b.body.value, 'bold', 'what main holds, which the loop runs on');
    assert.equal(b.body.branch, 'main');
    assert.equal(b.body.here, 'gentle', 'the checkout reads gentle until it pulls');
    assert.equal(fs.readFileSync(path.join(f.dir, 'plan', 'bearings.md'), 'utf8'), BEARINGS, 'never written in the checkout');
  } finally {
    await app.close();
    f.done();
  }
});

test('a repo with no bearings: a choice is refused (404) and the temporary worktree is gone', async () => {
  const f = fixture();
  try {
    fs.rmSync(path.join(f.dir, 'plan', 'bearings.md'));
    git(f.dir, 'commit', '-qam', 'no bearings');
    git(f.dir, 'push', '-q', 'origin', 'main');
    await assert.rejects(landImprove(f.dir, { value: 'bold' }, { owner: true, now: NOW }), (e) => e.status === 404 && /no plan\/bearings\.md/.test(e.message));
    assert.equal(git(f.dir, 'worktree', 'list').split('\n').length, 1);
  } finally {
    f.done();
  }
});

// ---- the control ---------------------------------------------------------------------------------------------------

test('Settings\' dial: four radios with one-line explanations, the chosen one checked, overrides listed; colour and motion kept', async () => {
  const { ImproveDial, DIAL_CHOICES, shownDial, overridesLine } = await import('../src/screens/cloud-settings/improve-dial.jsx');
  const html = (props) => renderToStaticMarkup(createElement(ImproveDial, props));
  assert.deepEqual(DIAL_CHOICES.map((c) => c.value), POSITIONS);
  for (const c of DIAL_CHOICES) assert.ok(c.sub && !c.sub.includes('\n') && c.sub.length < 140, `${c.label} has a one-line explanation`);
  const none = html({ view: { value: 'gentle', source: 'default', file: 'plan/bearings.md', overrides: [] } });
  assert.equal((none.match(/type="radio"/g) || []).length, 4);
  assert.match(none, /role="radiogroup" aria-label="Improvement dial"/);
  assert.match(none, /checked="" value="gentle"/);
  assert.match(none, /No <code[^>]*>Improve:<\/code> line/);
  assert.equal(shownDial('max'), 'gentle');

  const bold = html({ view: { value: 'bold', source: 'bearings', overrides: [{ knob: 'Support', value: 'fix-small' }], here: 'gentle', branch: 'main' } });
  assert.match(bold, /checked="" value="bold"/);
  assert.match(bold, /Support fix-small/);
  assert.match(bold, /main reads bold; this checkout still reads gentle until you pull/);
  assert.equal(overridesLine([]), null);

  const landing = html({ view: { value: 'gentle', source: 'bearings', overrides: [] }, value: 'gentle', busy: 'steady' });
  assert.match(landing, /class="check dial-opt is-landing"/);
  assert.match(landing, /aria-busy="true"/);
  assert.match(html({ view: { value: 'gentle' }, error: 'a hook said no' }), /role="alert"/);

  const src = read('../src/screens/Settings.jsx');
  assert.match(src, /Improvement dial/);
  assert.match(src, /api\('\/api\/improve', \{ value \}\)/);
  assert.match(src, /const r = await api\('\/api\/improve', \{ value \}\);\s*setDial\(\{ value: null, busy: null, note: r\.note/, 'no pinned value after a landing: the radio follows GET');
  assert.match(src, /import '\.\.\/styles\/improve-dial\.css'/);
  const css = read('../src/styles/improve-dial.css');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, 'tokens only, so both themes follow');
  assert.match(css, /var\(--aurora-grad\)/, 'the pips keep the aurora');
  assert.match(css, /@keyframes dial-landing/, 'the landing position moves');
  assert.match(css, /prefers-reduced-motion: reduce/);
});
