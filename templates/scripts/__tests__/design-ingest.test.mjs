// design/ingest.mjs: a Claude Design export folder in, `<into>/<date>/` out with a manifest (pages, boards, a sha256 per
// file) and a README naming it the source of truth; the check that the files still match; rehash after a logged edit.
// node:test, no deps; a fixture export of three tiny boards, a stylesheet and a canvas index, in temp dirs only.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { boardName, buildManifest, checkHandoff, ingest, listFiles, nextSlot, rehash } from '../design/ingest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', 'design', 'ingest.mjs');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

const BOARDS = {
  'Fleet.dc.html': '<x-dc><helmet><link rel="stylesheet" href="./app.css"></helmet><div class="fleet">Fleet</div></x-dc>\n',
  'FleetLight.dc.html': '<x-dc><dc-import src="./Fleet.dc.html" theme="light"></dc-import></x-dc>\n',
  'Tokens.dc.html': '<x-dc><div class="tokens">--ink: #111</div></x-dc>\n',
};
const CANVAS = {
  v: 3,
  title: 'Demo app, design system and UI',
  pages: [{ id: 'system', name: 'Design system' }, { id: 'fleet', name: 'Fleet' }],
  boards: {
    'Tokens.dc.html': { x: 0, y: 0, title: 'Tokens', page: 'system' },
    'Fleet.dc.html': { x: 0, y: 0, title: 'Fleet', page: 'fleet' },
    'FleetLight.dc.html': { x: 0, y: 900, title: 'Fleet, light', page: 'fleet' },
  },
  order: ['Tokens.dc.html', 'Fleet.dc.html', 'FleetLight.dc.html'],
};

function fixture({ canvas = CANVAS, extra = {} } = {}) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'design ingest '));
  const root = path.join(ws, 'repo');
  const from = path.join(ws, 'export');
  fs.mkdirSync(root);
  fs.mkdirSync(path.join(from, 'fonts'), { recursive: true });
  for (const [f, body] of Object.entries(BOARDS)) fs.writeFileSync(path.join(from, f), body);
  fs.writeFileSync(path.join(from, 'app.css'), ':root { --ink: #111; }\n');
  fs.writeFileSync(path.join(from, 'fonts', 'mono.txt'), 'a font stand-in\n');
  fs.writeFileSync(path.join(from, '.DS_Store'), 'junk');
  if (canvas) fs.writeFileSync(path.join(from, 'canvas.json'), JSON.stringify(canvas, null, 1));
  for (const [f, body] of Object.entries(extra)) fs.writeFileSync(path.join(from, f), body);
  return { root, from, done: () => fs.rmSync(ws, { recursive: true, force: true }) };
}

describe('design ingest', () => {
  it('names boards from their files', () => {
    assert.equal(boardName('Fleet.dc.html'), 'Fleet');
    assert.equal(boardName('sub/Plain.html'), 'Plain');
  });

  it('writes design/handoff/<date>/ with every file verbatim, a manifest and a README', () => {
    const fx = fixture();
    try {
      const res = ingest({ from: fx.from, root: fx.root, date: '2026-10-21', artifact: 'https://claude.ai/artifact/abc', version: '17-ff' });
      assert.deepEqual(res.problems, []);
      const dir = path.join(fx.root, 'design', 'handoff', '2026-10-21');
      assert.equal(res.dir, dir);
      assert.deepEqual(listFiles(dir), ['FleetLight.dc.html', 'Fleet.dc.html', 'README.md', 'Tokens.dc.html', 'app.css', 'canvas.json', 'fonts/mono.txt', 'manifest.json'].sort());
      for (const [f, body] of Object.entries(BOARDS)) assert.equal(fs.readFileSync(path.join(dir, f), 'utf8'), body);
      const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      assert.equal(m.date, '2026-10-21');
      assert.equal(m.artifact, 'https://claude.ai/artifact/abc');
      assert.equal(m.version, '17-ff');
      assert.deepEqual(m.boards.map((b) => [b.name, b.page]), [['Tokens', 'system'], ['Fleet', 'fleet'], ['FleetLight', 'fleet']]);
      assert.deepEqual(m.pages, [
        { id: 'system', name: 'Design system', boards: ['Tokens'] },
        { id: 'fleet', name: 'Fleet', boards: ['Fleet', 'FleetLight'] },
      ]);
      const fleet = m.files.find((f) => f.path === 'Fleet.dc.html');
      assert.equal(fleet.sha256, sha(BOARDS['Fleet.dc.html']));
      assert.equal(fleet.bytes, Buffer.byteLength(BOARDS['Fleet.dc.html']));
      assert.ok(!m.files.some((f) => f.path.startsWith('.')), 'dotfiles are skipped');
      const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
      assert.match(readme, /source of truth for the UI/);
      assert.match(readme, /artifact https:\/\/claude\.ai\/artifact\/abc \(version 17-ff\)/);
      assert.match(readme, /\*\*Fleet\*\* \(2\): `Fleet`, `FleetLight`/);
      assert.match(readme, /## Patterns not adopted/);
      assert.match(readme, /Port: not plotted yet/);
      assert.deepEqual(checkHandoff(dir).problems, []);
    } finally {
      fx.done();
    }
  });

  it('is deterministic: the same folder and date give the same manifest and README', () => {
    const fx = fixture();
    try {
      const a = ingest({ from: fx.from, root: fx.root, date: '2026-10-21', chunk: '07.4' });
      const b = ingest({ from: fx.from, root: fx.root, into: 'other', date: '2026-10-21', chunk: '07.4' });
      assert.equal(fs.readFileSync(path.join(a.dir, 'manifest.json'), 'utf8'), fs.readFileSync(path.join(b.dir, 'manifest.json'), 'utf8'));
      const ra = fs.readFileSync(path.join(a.dir, 'README.md'), 'utf8');
      assert.match(ra, /Port: chunk 07\.4/);
      assert.equal(ra.replace('design/handoff/', 'other/'), fs.readFileSync(path.join(b.dir, 'README.md'), 'utf8'));
    } finally {
      fx.done();
    }
  });

  it('a second delivery the same day takes <date>-2; --into places a package handoff', () => {
    const fx = fixture();
    try {
      const into = 'packages/app/design/handoff';
      assert.equal(ingest({ from: fx.from, root: fx.root, into, date: '2026-10-21' }).slot, '2026-10-21');
      const second = ingest({ from: fx.from, root: fx.root, into, date: '2026-10-21' });
      assert.equal(second.slot, '2026-10-21-2');
      assert.equal(second.dir, path.join(fx.root, 'packages', 'app', 'design', 'handoff', '2026-10-21-2'));
      assert.equal(nextSlot(path.join(fx.root, into), '2026-10-21'), '2026-10-21-3');
    } finally {
      fx.done();
    }
  });

  it('without a canvas index every .html file is a board on one page', () => {
    const fx = fixture({ canvas: null });
    try {
      const { manifest, problems } = buildManifest(fx.from, { date: '2026-10-21' });
      assert.deepEqual(problems, []);
      assert.deepEqual(manifest.boards.map((b) => b.name), ['Fleet', 'FleetLight', 'Tokens']);
      assert.deepEqual(manifest.pages, [{ id: null, name: 'Boards', boards: ['Fleet', 'FleetLight', 'Tokens'] }]);
    } finally {
      fx.done();
    }
  });

  it('a board the canvas places nowhere lands on "Not on the canvas"', () => {
    const fx = fixture({ extra: { 'Stray.html': '<p>stray</p>\n' } });
    try {
      const { manifest } = buildManifest(fx.from, {});
      assert.deepEqual(manifest.pages.at(-1), { id: null, name: 'Not on the canvas', boards: ['Stray'] });
    } finally {
      fx.done();
    }
  });

  it('writes nothing when the fetch stopped short, the export has its own README, or holds no boards', () => {
    const short = fixture();
    try {
      fs.rmSync(path.join(short.from, 'FleetLight.dc.html'));
      const res = ingest({ from: short.from, root: short.root, date: '2026-10-21' });
      assert.match(res.problems.join('\n'), /canvas\.json names FleetLight\.dc\.html, which the folder lacks/);
      assert.ok(!fs.existsSync(path.join(short.root, 'design')));
    } finally {
      short.done();
    }
    const own = fixture({ extra: { 'README.md': '# mine\n' } });
    try {
      assert.match(ingest({ from: own.from, root: own.root, date: '2026-10-21' }).problems.join('\n'), /its own README\.md/);
    } finally {
      own.done();
    }
    const empty = fixture({ canvas: null });
    try {
      for (const f of Object.keys(BOARDS)) fs.rmSync(path.join(empty.from, f));
      assert.match(ingest({ from: empty.from, root: empty.root, date: '2026-10-21' }).problems.join('\n'), /no \.html boards/);
      assert.match(ingest({ from: empty.from, root: empty.root, date: '21-10-2026' }).problems.join('\n'), /want YYYY-MM-DD/);
    } finally {
      empty.done();
    }
  });

  it('check names a changed, missing or unlisted file; rehash takes a logged edit', () => {
    const fx = fixture();
    try {
      const { dir } = ingest({ from: fx.from, root: fx.root, date: '2026-10-21' });
      fs.writeFileSync(path.join(dir, 'app.css'), ':root { --ink: #000; }\n');
      fs.rmSync(path.join(dir, 'Tokens.dc.html'));
      fs.writeFileSync(path.join(dir, 'New.dc.html'), '<p>new</p>\n');
      const { problems } = checkHandoff(dir);
      assert.equal(problems.length, 3, problems.join('\n'));
      assert.match(problems.join('\n'), /app\.css: changed since ingest/);
      assert.match(problems.join('\n'), /Tokens\.dc\.html: in the manifest, missing on disk/);
      assert.match(problems.join('\n'), /New\.dc\.html: on disk, not in the manifest/);
      fs.writeFileSync(path.join(dir, 'Tokens.dc.html'), BOARDS['Tokens.dc.html']);
      fs.rmSync(path.join(dir, 'New.dc.html'));
      const before = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      const after = rehash(dir);
      assert.deepEqual({ ...after, files: null }, { ...before, files: null });
      assert.equal(after.files.find((f) => f.path === 'app.css').sha256, sha(':root { --ink: #000; }\n'));
      assert.deepEqual(checkHandoff(dir).problems, []);
      assert.match(checkHandoff(path.join(fx.root, 'nowhere')).problems[0], /manifest\.json: missing/);
    } finally {
      fx.done();
    }
  });

  it('the CLI ingests, checks and exits 1 on a mismatch', () => {
    const fx = fixture();
    const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: fx.root, encoding: 'utf8' });
    try {
      const res = run(fx.from, '--date', '2026-10-21', '--into', 'ui/handoff');
      assert.equal(res.status, 0, res.stderr);
      assert.match(res.stdout, /ingested 3 boards on 2 pages \(6 files\) into ui\/handoff\/2026-10-21\//);
      assert.match(res.stdout, /plot the port as an L chunk/);
      assert.equal(run('check', 'ui/handoff/2026-10-21').status, 0);
      fs.appendFileSync(path.join(fx.root, 'ui', 'handoff', '2026-10-21', 'Fleet.dc.html'), 'x');
      const bad = run('check', 'ui/handoff/2026-10-21', '--json');
      assert.equal(bad.status, 1);
      assert.equal(JSON.parse(bad.stdout).ok, false);
      assert.equal(run('--nope').status, 2);
    } finally {
      fx.done();
    }
  });
});
