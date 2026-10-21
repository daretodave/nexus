// design/port-map.mjs and design/port.workflow.js: the port map (every board ported, skipped with a reason, or pending a
// chunk) checked against fixture handoffs, and the port recipe's Workflow script: its meta a pure literal, the script an
// ES module, its phases run in order under stand-in agents. node:test, no deps; temp dirs only.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ingest } from '../design/ingest.mjs';
import { appFor, checkAll, checkPort, classify, findHandoffs, seedPort } from '../design/port-map.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', 'design', 'port-map.mjs');
const WORKFLOW = path.join(HERE, '..', 'design', 'port.workflow.js');

const CANVAS = {
  pages: [{ id: 'system', name: 'Design system' }, { id: 'fleet', name: 'Fleet' }],
  boards: {
    'Tokens.dc.html': { title: 'Tokens', page: 'system' },
    'Fleet.dc.html': { title: 'Fleet', page: 'fleet' },
    'FleetLight.dc.html': { title: 'Fleet, light', page: 'fleet' },
  },
};

function repo() {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'design port '));
  const root = path.join(ws, 'repo');
  const from = path.join(ws, 'export');
  fs.mkdirSync(path.join(root, 'app', 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app', 'src', 'Fleet.jsx'), 'export default () => null;\n');
  fs.mkdirSync(from);
  for (const f of Object.keys(CANVAS.boards)) fs.writeFileSync(path.join(from, f), `<x-dc>${f}</x-dc>\n`);
  fs.writeFileSync(path.join(from, 'canvas.json'), JSON.stringify(CANVAS));
  return { root, from, done: () => fs.rmSync(ws, { recursive: true, force: true }) };
}

const writeMap = (dir, map) => fs.writeFileSync(path.join(dir, 'port.json'), `${JSON.stringify(map, null, 2)}\n`);
const GOOD = { Tokens: { skip: 'a documentation board' }, Fleet: 'src/Fleet.jsx', FleetLight: { skip: 'a dawn twin the tokens draw' } };

describe('design port map', () => {
  it('classifies an entry: files, a skip with its reason, a pending chunk, or a problem', () => {
    assert.deepEqual(classify('src/A.jsx'), { status: 'ported', files: ['src/A.jsx'] });
    assert.deepEqual(classify(['a', 'b']), { status: 'ported', files: ['a', 'b'] });
    assert.deepEqual(classify({ skip: 'docs' }), { status: 'skipped', reason: 'docs' });
    assert.deepEqual(classify({ pending: '42.8' }), { status: 'pending', chunk: '42.8' });
    assert.match(classify({ skip: '  ' }).problem, /needs its reason/);
    assert.match(classify({ pending: '' }).problem, /names its chunk/);
    assert.match(classify([]).problem, /non-empty paths/);
    assert.match(classify({ skip: 'x', note: 'y' }).problem, /want a file path/);
    assert.match(classify(3).problem, /want a file path/);
  });

  it('ingest seeds the map with every board pending the chunk, in the app it was ingested beside', () => {
    assert.equal(appFor('design/handoff'), '.');
    assert.equal(appFor('packages/cli/design/handoff/'), 'packages/cli');
    assert.deepEqual(seedPort({ boards: [{ name: 'A' }] }), { port: 1, app: '.', boards: { A: { pending: 'the port' } } });
    const fx = repo();
    try {
      const { dir } = ingest({ from: fx.from, root: fx.root, into: 'packages/web/design/handoff', date: '2026-11-02', chunk: '12.3' });
      fs.mkdirSync(path.join(fx.root, 'packages', 'web'), { recursive: true });
      const map = JSON.parse(fs.readFileSync(path.join(dir, 'port.json'), 'utf8'));
      assert.equal(map.app, 'packages/web');
      assert.deepEqual(map.boards, { Tokens: { pending: '12.3' }, Fleet: { pending: '12.3' }, FleetLight: { pending: '12.3' } });
      const res = checkAll(fx.root);
      assert.deepEqual(res.problems, []);
      assert.deepEqual(res.handoffs, ['packages/web/design/handoff/2026-11-02']);
      assert.deepEqual(res.counts, { ported: 0, skipped: 0, pending: 3 });
    } finally {
      fx.done();
    }
  });

  it('passes a complete map, and names an unmapped board, a stale entry, a missing file, a bare skip', () => {
    const fx = repo();
    try {
      const { dir } = ingest({ from: fx.from, root: fx.root, date: '2026-11-02' });
      writeMap(dir, { port: 1, app: 'app', boards: GOOD });
      const ok = checkPort(dir, { root: fx.root });
      assert.deepEqual(ok.problems, []);
      assert.deepEqual(ok.boards.map((b) => [b.board, b.page, b.status]), [['Tokens', 'system', 'skipped'], ['Fleet', 'fleet', 'ported'], ['FleetLight', 'fleet', 'skipped']]);
      writeMap(dir, { port: 1, app: 'app', boards: { Fleet: 'src/Gone.jsx', FleetLight: { skip: '' }, Old: 'src/Fleet.jsx' } });
      const bad = checkPort(dir, { root: fx.root }).problems.join('\n');
      assert.match(bad, /board Tokens is not mapped/);
      assert.match(bad, /board Fleet maps to app\/src\/Gone\.jsx, which does not exist/);
      assert.match(bad, /board FleetLight: a skip needs its reason/);
      assert.match(bad, /Old is mapped, but the handoff has no such board/);
      writeMap(dir, { port: 1, app: 'nowhere', boards: GOOD });
      assert.match(checkPort(dir, { root: fx.root }).problems.join('\n'), /app folder nowhere not found/);
      fs.writeFileSync(path.join(dir, 'port.json'), '{ not json');
      assert.match(checkPort(dir, { root: fx.root }).problems[0], /port\.json: not JSON/);
      writeMap(dir, { port: 1 });
      assert.match(checkPort(dir, { root: fx.root }).problems[0], /no "boards" object/);
      fs.rmSync(path.join(dir, 'port.json'));
      const none = checkPort(dir, { root: fx.root });
      assert.match(none.problems[0], /port\.json: missing/);
      assert.ok(none.boards.every((b) => b.status === 'unmapped'));
    } finally {
      fx.done();
    }
  });

  it('the whole check also holds the handoff to its manifest', () => {
    const fx = repo();
    try {
      const { dir } = ingest({ from: fx.from, root: fx.root, date: '2026-11-02' });
      writeMap(dir, { port: 1, app: 'app', boards: GOOD });
      assert.deepEqual(checkAll(fx.root).problems, []);
      fs.appendFileSync(path.join(dir, 'Fleet.dc.html'), 'x');
      assert.match(checkAll(fx.root).problems.join('\n'), /design\/handoff\/2026-11-02\/Fleet\.dc\.html: changed since ingest/);
    } finally {
      fx.done();
    }
  });

  it('a folder from before ingest: files unchecked with a note, its map checked against its top-level boards', () => {
    const fx = repo();
    try {
      const flat = path.join(fx.root, 'packages', 'gui', 'design', 'handoff');
      fs.mkdirSync(flat, { recursive: true });
      for (const f of fs.readdirSync(fx.from)) fs.copyFileSync(path.join(fx.from, f), path.join(flat, f));
      const later = ingest({ from: fx.from, root: fx.root, into: 'packages/gui/design/handoff', date: '2026-11-02' });
      fs.mkdirSync(path.join(fx.root, 'packages', 'gui', 'src'), { recursive: true });
      fs.writeFileSync(path.join(fx.root, 'packages', 'gui', 'src', 'Fleet.jsx'), '');
      writeMap(flat, { port: 1, app: 'packages/gui', boards: { ...GOOD, Fleet: ['src/Fleet.jsx'] } });
      assert.deepEqual(findHandoffs(fx.root).map((d) => path.relative(fx.root, d).split(path.sep).join('/')), ['packages/gui/design/handoff', 'packages/gui/design/handoff/2026-11-02']);
      const res = checkAll(fx.root);
      assert.deepEqual(res.problems, []);
      assert.match(res.note, /2 handoffs, 6 boards: 1 ported, 2 skipped, 3 pending/);
      assert.match(res.note, /packages\/gui\/design\/handoff predates ingest \(no manifest\)/);
      assert.equal(later.slot, '2026-11-02');
    } finally {
      fx.done();
    }
  });

  it('no handoff is green with a note; the CLI checks, prints status, and exits 1 on a problem', () => {
    const fx = repo();
    const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { cwd: fx.root, encoding: 'utf8' });
    try {
      assert.match(checkAll(fx.root).note, /no design handoff here/);
      assert.equal(run('check').status, 0);
      const { dir } = ingest({ from: fx.from, root: fx.root, date: '2026-11-02' });
      writeMap(dir, { port: 1, app: 'app', boards: GOOD });
      const ok = run('check');
      assert.equal(ok.status, 0, ok.stderr);
      assert.match(ok.stdout, /1 handoff, 3 boards: 1 ported, 2 skipped, 0 pending/);
      const st = JSON.parse(run('status', 'design/handoff/2026-11-02', '--json').stdout);
      assert.equal(st.ok, true);
      assert.deepEqual(st.boards.find((b) => b.board === 'Fleet').files, ['src/Fleet.jsx']);
      writeMap(dir, { port: 1, app: 'app', boards: { Fleet: 'src/Fleet.jsx' } });
      const red = run('check', 'design/handoff/2026-11-02');
      assert.equal(red.status, 1);
      assert.match(red.stderr, /board Tokens is not mapped/);
      assert.equal(run('status').status, 2);
      assert.equal(run('check', '--nope').status, 2);
    } finally {
      fx.done();
    }
  });
});

// The Workflow runtime runs a script's body as an async function: its globals are agent, parallel, pipeline, phase, log
// and args, and a top-level `return` is the run's result.
const SOURCE = fs.readFileSync(WORKFLOW, 'utf8').replace(/\r\n/g, '\n');

function metaLiteral(src) {
  const start = src.indexOf('export const meta = {');
  assert.equal(start, 0, 'the script opens with export const meta');
  let depth = 0;
  let quote = null;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return src.slice(src.indexOf('{', start), i + 1);
  }
  throw new Error('meta never closes');
}

function stubs({ pages, findings = true }) {
  const calls = [];
  const phases = [];
  const agent = async (prompt, opts = {}) => {
    calls.push({ label: opts.label, phase: opts.phase, prompt });
    if (opts.label === 'survey') return { app: 'app', stylesheet: 'app.css', pages, decided: [{ board: 'FleetLight', reason: 'a dawn twin' }] };
    if (opts.label.startsWith('page ')) return { ported: [{ board: 'Fleet', files: ['src/Fleet.jsx'] }], skipped: [], patterns: ['frozen .is-hover states'], shared: ['a route'], endpoints: [] };
    if (opts.label.startsWith('review ')) return { theme: opts.label.slice(7), boards: [{ board: 'Fleet', percent: 2.5, findings: findings ? ['the title is 2px low'] : [] }] };
    if (opts.label === 'fidelity fixes') return { fixed: ['the title'], departures: [], left: [] };
    if (opts.label === 'land') return { check: 'ok', counts: { ported: 1, skipped: 2, pending: 0 }, skipList: ['FleetLight: a dawn twin'], close: 'ported' };
    return 'done';
  };
  const parallel = async (thunks) => Promise.all(thunks.map((t) => t().catch(() => null)));
  const pipeline = async (items, ...stages) => Promise.all(items.map(async (item, i) => {
    let prev = item;
    for (const s of stages) prev = await s(prev, item, i);
    return prev;
  }));
  return { agent, parallel, pipeline, phase: (t) => phases.push(t), log: () => {}, calls, phases };
}

async function runWorkflow(args, opts) {
  const s = stubs(opts);
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const body = SOURCE.replace(/^export const meta/m, 'const meta');
  const fn = new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', body);
  const result = await fn(s.agent, s.parallel, s.pipeline, s.phase, s.log, args, { total: null, spent: () => 0, remaining: () => Infinity });
  return { ...s, result };
}

describe('design port workflow', () => {
  it('opens with a meta that is a pure literal: no variable, call, spread or interpolation', () => {
    const text = metaLiteral(SOURCE);
    const bare = text.replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
    assert.ok(!/`|\.\.\.|\(/.test(bare), 'no template, spread or call in meta');
    for (const word of bare.match(/[A-Za-z_$][\w$]*/g) ?? []) {
      assert.ok(['name', 'description', 'whenToUse', 'phases', 'title', 'detail', 'model', 'true', 'false', 'null'].includes(word), `meta names ${word}`);
    }
    const meta = Function(`"use strict"; return (${text});`)();
    assert.equal(meta.name, 'design-port');
    assert.ok(meta.description.length > 20);
    assert.deepEqual(meta.phases.map((p) => p.title), ['Survey', 'Foundation', 'Screens', 'Integrate', 'Fidelity', 'Land']);
  });

  it('is plain JS that resumes: no clock, no randomness, no type annotation', () => {
    assert.ok(!/Date\.now|Math\.random|new Date\(/.test(SOURCE));
    assert.ok(!/^\s*(import|require)\b/m.test(SOURCE), 'no imports: the runtime has no filesystem');
    assert.ok(!/\binterface\s+\w+|:\s*(string|number|boolean)\b(?!['"])/.test(SOURCE.replace(/'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, "''")));
  });

  it('parses as an ES module (its result return read as the default export)', () => {
    const tops = SOURCE.split('\n').filter((l) => /^return\b/.test(l));
    assert.equal(tops.length, 1, 'one top-level return, the result');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'design port wf '));
    try {
      const file = path.join(dir, 'port.workflow.mjs');
      fs.writeFileSync(file, SOURCE.replace(/^return /m, 'export default '));
      const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      assert.equal(res.status, 0, res.stderr);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runs the five steps: one agent per canvas page, one reviewer per theme, the fixes, the land', async () => {
    const pages = [{ name: 'Fleet', boards: ['Fleet'] }, { name: 'Views', boards: ['Inbox', 'Board'] }, { name: 'Empty', boards: [] }];
    const run = await runWorkflow({ handoff: 'design/handoff/2026-11-02', worktree: '/tmp/wt', chunk: '12.3' }, { pages });
    assert.deepEqual(run.phases, ['Survey', 'Foundation', 'Screens', 'Integrate', 'Fidelity', 'Land']);
    assert.deepEqual(run.calls.map((c) => c.label), ['survey', 'foundation', 'page Fleet', 'page Views', 'integrate', 'review night', 'review dawn', 'fidelity fixes', 'land']);
    assert.ok(run.calls.every((c) => c.prompt.includes('Work only in /tmp/wt')));
    assert.match(run.calls.find((c) => c.label === 'review dawn').prompt, /render\.mjs design\/handoff\/2026-11-02 --theme dawn/);
    assert.match(run.calls.find((c) => c.label === 'land').prompt, /port-map\.mjs check design\/handoff\/2026-11-02/);
    assert.deepEqual(run.result.pages, ['Fleet', 'Views']);
    assert.deepEqual(run.result.skipList, ['FleetLight: a dawn twin']);
    assert.equal(run.result.chunk, '12.3');
  });

  it('a re-port narrows to its boards and themes; no findings, no fixes agent', async () => {
    const run = await runWorkflow({ handoff: 'h', worktree: '/w', chunk: '1.1', boards: ['Fleet'], themes: ['night'] }, { pages: [{ name: 'Fleet', boards: ['Fleet'] }], findings: false });
    assert.deepEqual(run.calls.map((c) => c.label), ['survey', 'foundation', 'page Fleet', 'integrate', 'review night', 'land']);
    assert.match(run.calls[0].prompt, /re-port of these boards only: Fleet/);
    assert.match(run.calls.find((c) => c.label === 'review night').prompt, /--board Fleet/);
  });

  it('refuses to start without its args', async () => {
    await assert.rejects(runWorkflow({ handoff: 'h' }, { pages: [] }), /args needs worktree, chunk/);
    await assert.rejects(runWorkflow(undefined, { pages: [] }), /args needs handoff, worktree, chunk/);
  });
});
