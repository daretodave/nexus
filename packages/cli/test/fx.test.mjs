// The particle layer (fx/, ui/fx.jsx): the live store diffed into events (a replay is a baseline, never a burst), the
// events mapped onto the stage and the heads-down box, the pool and its budget, the drawing, the preference, and the
// layer staying out of the way of a static render, the pointer and both themes.
import './jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { reduce, replay } from '../shared/beats.mjs';
import { createFxDiffer, diffFx, fxSnapshot, toolTone } from '../src/fx/events.js';
import {
  FX_TOKENS, ORB_R, STATE_FX, ambientEmitters, ambientSpawn, bezier, emitCount, headsGrid, headsScene, nodeFor, seeded, spawnsFor, stageScene,
} from '../src/fx/effects.js';
import { budgetFor, createGovernor, scaled } from '../src/fx/budget.js';
import { createPool, ease, envelope, setLimit, spawn, step } from '../src/fx/pool.js';
import { drawPool, parseColor, rgba, themeLook } from '../src/fx/draw.js';
import { fxActive, parseFx, FX_LEVELS } from '../src/fx/pref.js';
import { safely, startFx } from '../src/fx/host.js';
import { createFx } from '../src/fx/runtime.js';

const EMPTY = { connected: false, stage: replay([]), transcript: [], status: { state: 'idle' }, asks: [], permissions: [], runs: [] };
const live = (over = {}) => ({ ...EMPTY, connected: true, ...over });
const beats = (...bs) => replay(bs);

// ---- events --------------------------------------------------------------------

test('a replay is a baseline: the first connected snapshot, and every reconnect, set off nothing', () => {
  const busy = live({
    transcript: [{ kind: 'tool', name: 'Bash', agent: 'main' }, { kind: 'tool-error', agent: 'main', text: 'x' }, { kind: 'result', ok: true }],
    stage: beats({ k: 'agent', p: 'start', id: 'main' }, { k: 'chunk', p: 'archive', id: '3.1' }, { k: 'agent', p: 'end', id: 'main', ok: true }),
  });
  const d = createFxDiffer();
  assert.deepEqual(d.feed(fxSnapshot(EMPTY)), [], 'not connected: nothing');
  assert.deepEqual(d.feed(fxSnapshot(busy)), [], 'the hello replay: a baseline');
  assert.deepEqual(d.feed(fxSnapshot(busy)), [], 'the same again: nothing new');
  assert.deepEqual(d.feed(fxSnapshot({ ...busy, connected: false })), [], 'the channel drops');
  const more = { ...busy, transcript: [...busy.transcript, { kind: 'tool', name: 'Edit', agent: 'main' }] };
  assert.deepEqual(d.feed(fxSnapshot(more)), [], 'the reconnect hello is a baseline again, even with more in it');
  const next = { ...more, transcript: [...more.transcript, { kind: 'tool', name: 'Read', agent: 'main' }] };
  assert.deepEqual(d.feed(fxSnapshot(next)), [{ type: 'tool', agent: 'main', name: 'Read', tone: 'tool' }], 'then news is news');
});

test('new transcript items become tool, tool-done, error and result events, oldest first', () => {
  const a = fxSnapshot(live({ transcript: [{ kind: 'text', text: 'hi' }] }));
  const b = fxSnapshot(live({
    transcript: [
      { kind: 'text', text: 'hi' },
      { kind: 'tool', name: 'Edit', agent: 'toolu_1' },
      { kind: 'tool-done', agent: 'toolu_1', ok: true },
      { kind: 'tool', name: 'Task', agent: 'main' },
      { kind: 'tool-done', agent: 'main', ok: false },
      { kind: 'tool-error', agent: 'main', text: 'boom' },
      { kind: 'result', ok: false },
    ],
  }));
  assert.deepEqual(diffFx(a, b), [
    { type: 'tool', agent: 'toolu_1', name: 'Edit', tone: 'writing' },
    { type: 'tool-done', agent: 'toolu_1', ok: true },
    { type: 'tool', agent: 'main', name: 'Task', tone: 'spawn' },
    { type: 'tool-done', agent: 'main', ok: false },
    { type: 'error', agent: 'main' },
    { type: 'result', ok: false },
  ]);
  assert.deepEqual(diffFx(b, a), [], 'a transcript that shrank (a reset) is a baseline');
});

test('beats become agent starts and ends, chunk steps, tugs; questions arriving and clearing', () => {
  const s0 = beats({ k: 'agent', p: 'start', id: 'main' }, { k: 'agent', p: 'start', id: 'a1', parent: 'main' });
  const s1 = [
    { k: 'agent', p: 'end', id: 'a1', ok: false },
    { k: 'agent', p: 'start', id: 'a2', parent: 'main' },
    { k: 'chunk', p: 'claim', id: '4.2' },
    { k: 'oversight', p: 'tug', agent: 'main' },
  ].reduce(reduce, s0);
  const a = fxSnapshot(live({ stage: s0 }));
  const b = fxSnapshot(live({ stage: s1, asks: [{ id: 'q1' }] }));
  assert.deepEqual(diffFx(a, b), [
    { type: 'agent-end', agent: 'a1', ok: false },
    { type: 'agent-start', agent: 'a2', parent: 'main' },
    { type: 'chunk', id: '4.2', stage: 'claim' },
    { type: 'ask', agent: 'main' },
    { type: 'tug', agent: 'main' },
  ]);
  const s2 = [{ k: 'chunk', p: 'archive', id: '4.2' }, { k: 'agent', p: 'end', id: 'main', ok: true }].reduce(reduce, s1);
  const c = fxSnapshot(live({ stage: s2 }));
  assert.deepEqual(diffFx(b, c), [
    { type: 'agent-end', agent: 'main', ok: true },
    { type: 'chunk', id: '4.2', stage: 'archive' },
    { type: 'answered' },
  ]);
});

test('a landing is a new sha on the ledger after it loaded; its first read is a baseline', () => {
  const l = live();
  const unloaded = fxSnapshot(l, { landed: undefined });
  const loaded = fxSnapshot(l, { landed: [{ sha: 'a1' }] });
  assert.deepEqual(diffFx(unloaded, loaded), [], 'the ledger loading is not a landing');
  const landed = fxSnapshot(l, { landed: [{ sha: 'a1' }, { sha: 'b2' }] });
  assert.deepEqual(diffFx(loaded, landed), [{ type: 'landed', sha: 'b2' }]);
  assert.deepEqual(diffFx(fxSnapshot(l, { landed: [] }), loaded), [{ type: 'landed', sha: 'a1' }], 'the first commit of a session lands too');
  assert.deepEqual(diffFx(fxSnapshot(l, { progress: 20 }), fxSnapshot(l, { progress: 23 })), [{ type: 'progress', from: 20, to: 23 }]);
  assert.deepEqual(diffFx(fxSnapshot(l, { progress: 23 }), fxSnapshot(l, { progress: 23 })), []);
});

test('a tool call\'s tone is its orb state: edits write, delegations spawn, the rest are tools', () => {
  assert.equal(toolTone('Edit'), 'writing');
  assert.equal(toolTone('NotebookEdit'), 'writing');
  assert.equal(toolTone('Agent'), 'spawn');
  assert.equal(toolTone('Bash'), 'tool');
});

// ---- scenes and effects -----------------------------------------------------------

const VIEW = [
  { key: 'main', at: [50, 30], size: 'xl', state: 'thinking', main: true },
  { key: 'a1', at: [22, 14], size: 'm', state: 'tool' },
  { key: 'a2', at: [76, 14], size: 'm', state: 'blocked' },
  { key: 'wf', at: [48, 8], junction: true },
];

test('the stage scene puts each orb where model.js seats it, in pixels, with its size and state', () => {
  const s = stageScene({ nodes: VIEW, trayY: 361 }, 1000, 800);
  assert.deepEqual(s.nodes.map((n) => [n.key, Math.round(n.x), Math.round(n.y), n.r, n.state]), [
    ['main', 500, 240, ORB_R.xl, 'thinking'], ['a1', 220, 112, ORB_R.m, 'tool'], ['a2', 760, 112, ORB_R.m, 'blocked'], ['wf', 480, 64, 8, null],
  ]);
  assert.equal(s.main.key, 'main');
  assert.deepEqual(s.drop, { x: 500, y: 504 });
  assert.deepEqual(s.tug[0], [500, 240], 'the tug leaves the session orb');
  assert.deepEqual(s.tug[3], [0, 800 - 361], 'and reaches the conversation at the tray');
  assert.equal(nodeFor(s, 'a2').key, 'a2');
  assert.equal(nodeFor(s, 'nobody').key, 'main', 'an unknown agent falls back to the session orb');
  const [x, y] = bezier(s.tug, 0.5);
  assert.ok(x > 0 && x < 500 && y > 240 && y < 439, 'the path bows between its ends');
});

test('every orb state has a particle look, keyed like the orb\'s own glyphs and words', async () => {
  const { ORB_GLYPH, STATE_WORD } = await import('../src/ui/agent.jsx');
  for (const st of Object.keys(ORB_GLYPH)) assert.ok(STATE_FX[st], `${st} has a look`);
  for (const st of Object.keys(STATE_WORD)) assert.ok(STATE_FX[st], `${st} has a look`);
  for (const look of Object.values(STATE_FX)) assert.ok(FX_TOKENS.includes(look.token), `${look.token} is resolved`);
  assert.equal(STATE_FX.thinking.ambient, 'orbit');
  assert.equal(STATE_FX.tool.ambient, 'spark');
  assert.equal(STATE_FX.writing.ambient, 'ink');
  assert.equal(STATE_FX.blocked.ambient, 'ripple');
  assert.equal(STATE_FX.done.ambient, null);
});

test('each event makes particles at its agent\'s orb, in tokens the runtime resolves', () => {
  const s = stageScene({ nodes: VIEW, trayY: 361 }, 1000, 800);
  const rng = seeded(7);
  const all = [
    { type: 'tool', agent: 'a1', tone: 'tool' }, { type: 'tool', agent: 'a1', tone: 'writing' }, { type: 'tool-done', agent: 'a1', ok: true },
    { type: 'tool-done', agent: 'a1', ok: false }, { type: 'error', agent: 'main' }, { type: 'agent-start', agent: 'a1', parent: 'main' },
    { type: 'agent-end', agent: 'a1', ok: true }, { type: 'agent-end', agent: 'a1', ok: false }, { type: 'result', ok: true },
    { type: 'chunk', id: '1', stage: 'archive' }, { type: 'chunk', id: '1', stage: 'gate' }, { type: 'chunk', id: '1', stage: 'claim' },
    { type: 'landed', sha: 'x' }, { type: 'ask', agent: 'a2' }, { type: 'tug', agent: 'main' },
  ];
  for (const ev of all) {
    const specs = spawnsFor(ev, s, rng);
    assert.ok(specs.length > 0, `${ev.type} makes something`);
    for (const sp of specs) {
      assert.ok(FX_TOKENS.includes(sp.color), `${ev.type}: ${sp.color} is a resolved token`);
      assert.equal(sp.prio, 1, 'an event outranks the drift');
      assert.ok(sp.life > 0 && Number.isFinite(sp.x) && Number.isFinite(sp.y));
    }
  }
  const tool = spawnsFor({ type: 'tool', agent: 'a1', tone: 'tool' }, s, seeded(1));
  assert.ok(tool.every((p) => Math.hypot(p.x - 220, p.y - 112) <= ORB_R.m + 1), 'a tool spark leaves its own orb');
  assert.ok(tool.filter((p) => p.kind === 'spark').every((p) => p.color === '--st-tool'));
  const fail = spawnsFor({ type: 'error', agent: 'main' }, s, seeded(1));
  assert.ok(fail.every((p) => p.color === '--st-failed'), 'errors spark red');
  const land = spawnsFor({ type: 'landed', sha: 'x' }, s, seeded(1));
  assert.ok(land.some((p) => p.x === 500 && p.y === 504), 'a landing bursts at the drop');
  assert.ok(new Set(land.map((p) => p.color)).size >= 4, 'in the cheer colours');
  const ask = spawnsFor({ type: 'ask', agent: 'main' }, s, seeded(1));
  assert.ok(ask.some((p) => p.kind === 'seek' && p.path === s.tug), 'a question pulls along the tug toward the conversation');
  assert.deepEqual(spawnsFor({ type: 'answered' }, s, seeded(1)), [], 'an answer is quiet');
  assert.deepEqual(spawnsFor({ type: 'tool', agent: 'a1' }, s, seeded(1), 0), [], 'nothing at a burst scale of zero');
});

test('the burst scale (level and governor) shrinks bursts but keeps at least one of each', () => {
  const s = stageScene({ nodes: VIEW }, 1000, 800);
  const full = spawnsFor({ type: 'landed' }, s, seeded(2), 1).length;
  const subtle = spawnsFor({ type: 'landed' }, s, seeded(2), budgetFor('subtle').burst).length;
  const tiny = spawnsFor({ type: 'landed' }, s, seeded(2), 0.01).length;
  assert.ok(full > subtle && subtle > tiny && tiny > 0, `${full} > ${subtle} > ${tiny}`);
  assert.equal(scaled(10, 0.5), 5);
  assert.equal(scaled(10, 0.01), 1);
  assert.equal(scaled(10, 0), 0);
  assert.equal(scaled(0, 1), 0);
});

test('ambient: the session drift and each live orb\'s look; hushed, the orbs still and only the tug moves', () => {
  const s = stageScene({ nodes: VIEW }, 1280, 800);
  const busy = ambientEmitters(s, {});
  assert.deepEqual(busy.map((e) => e.kind).sort(), ['drift', 'orbit', 'ripple', 'spark']);
  const hushed = ambientEmitters(s, { hushed: true, asking: true });
  assert.deepEqual(hushed.map((e) => e.kind).sort(), ['drift', 'ripple', 'tug'], 'the blocked ripple and the tug keep going');
  assert.ok(hushed.find((e) => e.kind === 'drift').rate < busy.find((e) => e.kind === 'drift').rate / 3, 'the drift slows to a trickle');
  const rng = seeded(3);
  const drift = ambientSpawn(busy.find((e) => e.kind === 'drift'), s, rng);
  assert.ok(['--sess', '--star'].includes(drift.color), 'the drift wears the session colour (and a little starlight)');
  assert.equal(drift.prio, 0);
  for (const em of busy) assert.ok(ambientSpawn(em, s, rng), `${em.kind} spawns`);
  const tug = ambientSpawn(hushed.find((e) => e.kind === 'tug'), s, rng);
  assert.equal(tug.kind, 'seek');
  assert.equal(tug.color, '--st-blocked');
});

test('emission carries fractions across frames, so a slow rate still emits', () => {
  const acc = {};
  let n = 0;
  for (let i = 0; i < 60; i += 1) n += emitCount(acc, 'x', 0.5, 1 / 60);
  assert.equal(n, 0, 'half a particle in one second');
  for (let i = 0; i < 60; i += 1) n += emitCount(acc, 'x', 0.5, 1 / 60);
  assert.equal(n, 1, 'one in two seconds');
  assert.equal(emitCount(acc, 'y', 120, 1 / 60), 2);
});

// ---- heads-down -----------------------------------------------------------------------

test('the heads-down grid comes from the rows: the phase track, the newest tape line, the prompt', async () => {
  const { headsRows } = await import('../src/screens/headsdown-inbox/headsModel.js');
  const now = Date.parse('2026-10-22T12:00:00Z');
  const ledger = { name: 'vega', phase: 'working', phaseStartedAt: now - 3600000, budgetMs: 4 * 3600000 };
  const transcript = [{ kind: 'tool', name: 'Bash', agent: 'main', summary: 'ls' }, { kind: 'tool', name: 'Edit', agent: 'main', summary: 'a.js' }];
  const ui = { draft: '', links: { inbox: '/i', cockpitW: {}, inboxW: {}, planW: {}, fleetW: {} } };
  const rows = headsRows({ ledger, live: live({ transcript }), now, ui, seenAt: { 1: now } });
  const g = headsGrid(rows);
  assert.equal(g.rows, rows.length);
  assert.equal(g.cols, 120);
  assert.equal(g.bar.row, 5, 'the bar under the phase labels and stats');
  assert.ok(g.bar.col0 < g.bar.head && g.bar.head < g.bar.col1, 'the head sits inside the track while working');
  assert.equal(rows[g.tape].isNew, true, 'the newest tape line');
  assert.equal(rows[g.prompt].fx.kind, 'prompt');
  const later = headsGrid(headsRows({ ledger, live: live({ transcript }), now: now + 3600000, ui, seenAt: {} }));
  assert.ok(later.bar.head > g.bar.head, 'the head moves as the phase does: that is the progress streak');
  assert.ok(rows[later.tape].key.startsWith('t'), 'no new line: the last one written');

  const scene = headsScene({ left: 100, top: 50, width: 1200, height: rows.length * 20 }, g, 1400, 1000);
  assert.equal(scene.cw, 10);
  assert.equal(scene.rh, 20);
  assert.equal(scene.bar.y, 50 + 5.5 * 20);
  assert.equal(scene.bar.x0, 100 + (g.bar.col0 + 0.5) * 10);
  assert.equal(scene.tape.y, 50 + (g.tape + 0.5) * 20);
  const streak = spawnsFor({ type: 'chunk', id: '1', stage: 'archive' }, scene, seeded(4));
  assert.ok(streak.some((p) => p.kind === 'seek' && p.path[0][1] === scene.bar.y), 'a closed chunk streaks along the phase track');
  assert.ok(streak.some((p) => p.kind === 'glyph'), 'and throws terminal glyphs');
  const tool = spawnsFor({ type: 'tool', tone: 'tool' }, scene, seeded(4));
  assert.ok(tool.every((p) => p.kind === 'pixel'), 'heads-down sparks are pixels');
  const amb = ambientEmitters(scene, {});
  assert.deepEqual(amb.map((e) => e.kind), ['rise']);
  const mote = ambientSpawn(amb[0], scene, seeded(5));
  assert.ok(mote.vy < 0 && ['glyph', 'pixel'].includes(mote.kind), 'motes rise behind the box');
  assert.deepEqual(ambientEmitters(scene, { asking: true, hushed: true }).map((e) => e.kind), ['rise', 'heads-tug']);
  const card = headsScene({ left: 0, top: 0, width: 560, height: 300 }, undefined, 1400, 1000);
  assert.equal(card.rh, 16, 'no grid (the start card): a usual cell, not the card\'s height');
});

// ---- pool and budget ------------------------------------------------------------------

test('the pool reuses a fixed array, retires the dead, and lets a burst take the drift\'s place', () => {
  const pool = createPool(4);
  const items = pool.items;
  for (let i = 0; i < 4; i += 1) assert.ok(spawn(pool, { kind: 'mote', x: i, y: 0, life: 1 + i, prio: 0 }));
  assert.equal(spawn(pool, { kind: 'mote', life: 1, prio: 0 }), false, 'full: the drift waits');
  pool.items[2].age = 0.9 * pool.items[2].life;
  assert.equal(spawn(pool, { kind: 'ember', x: 99, life: 1, prio: 1 }), true, 'a burst takes the oldest drift slot');
  assert.equal(pool.items[2].x, 99);
  pool.items.forEach((p) => { p.prio = 1; });
  assert.equal(spawn(pool, { kind: 'ember', life: 1, prio: 1 }), false, 'all bursts: nothing gives way');
  step(pool, 0.05);
  for (let i = 0; i < 40; i += 1) step(pool, 0.05);
  assert.equal(pool.n, 1, 'the short-lived retire; the longest one lives on');
  assert.equal(pool.items, items, 'the same array throughout');
  setLimit(pool, 0);
  assert.equal(pool.n, 0, 'a lower limit retires the extra at once');
  assert.equal(spawn(pool, { kind: 'mote', life: 1 }), false);
});

test('step moves each kind its own way; a long gap is clamped', () => {
  const pool = createPool(8);
  spawn(pool, { kind: 'ember', x: 0, y: 0, vx: 100, vy: 0, ay: 100, drag: 0, life: 9 });
  spawn(pool, { kind: 'orbit', cx: 10, cy: 10, rad: 5, ang: 0, w: Math.PI, tilt: 1, life: 9 });
  spawn(pool, { kind: 'seek', path: [[0, 0], [0, 0], [100, 0], [100, 0]], life: 1, jitter: 0 });
  spawn(pool, { kind: 'mote', x: 0, y: 0, life: 9, delay: 5 });
  step(pool, 2);
  const [e, o, s, m] = pool.items;
  assert.equal(e.x, 5, 'a two-second gap moves a 50ms step');
  assert.ok(e.vy > 0, 'gravity');
  assert.ok(Math.abs(o.x - (10 + Math.cos(Math.PI * 0.05) * 5)) < 1e-9, 'orbits its centre');
  assert.ok(s.x > 0 && s.x < 100);
  assert.equal(m.age, 0, 'a delayed particle waits');
  assert.equal(envelope(m), 0, 'and is not drawn yet');
  assert.equal(ease(0), 0);
  assert.equal(ease(1), 1);
  assert.equal(ease(0.5), 0.5);
});

test('levels set the ceiling; off has none', () => {
  assert.ok(budgetFor('on').cap > budgetFor('subtle').cap);
  assert.ok(budgetFor('subtle').ambient < budgetFor('on').ambient);
  assert.deepEqual(budgetFor('off'), { cap: 0, ambient: 0, burst: 0, alpha: 0 });
});

test('the governor trades particles for frame time, and gives them back', () => {
  const g = createGovernor({ budget: 4 });
  for (let i = 0; i < 200; i += 1) g.feed(12, 16.7);
  assert.ok(g.scale() < 0.5, `slow frames cut the share (${g.scale().toFixed(2)})`);
  assert.ok(g.scale() >= 0.2, 'never below a fifth');
  for (let i = 0; i < 2000; i += 1) g.feed(0.5, 16.7);
  assert.equal(g.scale(), 1, 'quick frames restore it');
  const h = createGovernor();
  for (let i = 0; i < 200; i += 1) h.feed(3, 60);
  assert.ok(h.scale() < 1, 'a page that only gets 16 frames a second, with this layer a large share of each, sheds load too');
  const cheap = createGovernor();
  for (let i = 0; i < 500; i += 1) cheap.feed(0.6, 33.3);
  assert.equal(cheap.scale(), 1, 'a 30Hz display (or a battery mode) is not overload when the frames cost little');
  for (let i = 0; i < 200; i += 1) cheap.feed(12, 33.3);
  assert.ok(cheap.scale() < 1);
  for (let i = 0; i < 2000; i += 1) cheap.feed(0.6, 40);
  assert.equal(cheap.scale(), 1, 'and gives the share back at 30Hz too');
});

// ---- drawing ------------------------------------------------------------------------------

test('colours: hex, rgb(), rgba() and the space syntax; nothing unreadable', () => {
  assert.deepEqual(parseColor('#4CECE7'), [76, 236, 231, 1]);
  assert.deepEqual(parseColor('#fff'), [255, 255, 255, 1]);
  assert.deepEqual(parseColor('rgb(1, 2, 3)'), [1, 2, 3, 1]);
  assert.deepEqual(parseColor('rgba(58, 63, 92, 0.3)'), [58, 63, 92, 0.3]);
  assert.deepEqual(parseColor('rgb(58 63 92 / 30%)'), [58, 63, 92, 0.3]);
  assert.equal(parseColor('oklab(0.5 0.1 0.1)'), null, 'left to the browser\'s own parser');
  assert.equal(parseColor(''), null);
  assert.equal(rgba([1, 2, 3], 2), 'rgba(1,2,3,1.000)');
});

test('night adds light, dawn paints thinner: additive glow washes out on a pale sky', () => {
  assert.equal(themeLook('dark').blend, 'lighter');
  assert.equal(themeLook('light').blend, 'source-over');
  assert.ok(themeLook('light').alpha < themeLook('dark').alpha);
});

function fakeCtx() {
  const calls = [];
  const rec = (name) => (...a) => calls.push([name, ...a]);
  return {
    calls, globalAlpha: 1, globalCompositeOperation: 'source-over', strokeStyle: '', fillStyle: '', lineWidth: 1, lineCap: '', font: '', textAlign: '', textBaseline: '',
    beginPath: rec('beginPath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'), stroke: rec('stroke'), arc: rec('arc'), fill: rec('fill'),
    fillRect: rec('fillRect'), fillText: rec('fillText'), drawImage: rec('drawImage'),
  };
}

test('drawPool draws each kind, skips what is invisible, and leaves the context as it found it', () => {
  const pool = createPool(8);
  const base = { life: 2, age: 0.5, alpha: 1, color: '--st-tool' };
  for (const kind of ['mote', 'spark', 'ring', 'pixel', 'glyph', 'seek']) spawn(pool, { ...base, kind, x: 10, y: 10, vx: 10, r0: 1, r1: 9, glyph: '*', path: [[0, 0], [0, 0], [10, 10], [10, 10]] });
  spawn(pool, { ...base, kind: 'mote', color: '--nope' });
  pool.items.slice(0, pool.n).forEach((p) => { p.age = 0.5; });
  const ctx = fakeCtx();
  const img = {};
  const n = drawPool(ctx, pool, { color: (t) => (t === '--st-tool' ? [82, 221, 240, 1] : null), sprite: () => img, look: themeLook('dark'), alpha: 1, font: 'JetBrains Mono' });
  assert.equal(n, 6, 'an unresolved token is skipped');
  const names = ctx.calls.map((c) => c[0]);
  for (const call of ['drawImage', 'stroke', 'arc', 'fillRect', 'fillText']) assert.ok(names.includes(call), call);
  assert.ok(ctx.font.includes('JetBrains Mono'), 'glyphs in the mono face');
  assert.equal(ctx.globalCompositeOperation, 'source-over');
  assert.equal(ctx.globalAlpha, 1);
});

// ---- the preference and the component ---------------------------------------------------------

test('the preference: on, subtle or off, on by default; reduced motion overrides any of them', () => {
  assert.deepEqual(FX_LEVELS, ['on', 'subtle', 'off']);
  assert.equal(parseFx(null), 'on');
  assert.equal(parseFx('subtle'), 'subtle');
  assert.equal(parseFx('loud'), 'on');
  assert.equal(fxActive('on', false), true);
  assert.equal(fxActive('subtle', false), true);
  assert.equal(fxActive('off', false), false, 'off: no canvas at all');
  assert.equal(fxActive('on', true), false, 'reduced motion: no canvas at all');
});

test('a static render draws the hidden wrapper and canvas, touches no window, and never says forming or snode', async () => {
  const { FxLayer } = await import('../src/ui/fx.jsx');
  assert.equal(typeof globalThis.window, 'undefined');
  const html = renderToStaticMarkup(createElement(FxLayer, { nodes: VIEW, live: live(), hushed: true, sess: 'sess-vega' }));
  assert.match(html, /^<div class="fx-layer is-calm sess-vega" aria-hidden="true"><canvas class="fx-canvas"><\/canvas><\/div>$/);
  assert.doesNotMatch(html, /forming|snode|lstar/);
  const heads = renderToStaticMarkup(createElement(FxLayer, { mode: 'heads', target: '.tui' }));
  assert.match(heads, /class="fx-layer is-heads"/);
});

test('the stage draws the layer first thing over the starfield, and only when asked', async () => {
  const { default: StageView } = await import('../src/screens/cockpit/StageView.jsx');
  const view = { nodes: [{ key: 'main', at: [50, 30], state: 'idle', size: 'xl', main: true, label: 'session' }], fils: [], count: '1 agent' };
  const plain = renderToStaticMarkup(createElement(StageView, { view }));
  assert.doesNotMatch(plain, /fx-layer/);
  const html = renderToStaticMarkup(createElement(StageView, { view, fx: { live: live(), hushed: false, sess: 'sess-deneb' } }));
  assert.match(html, /<div class="stage"><div class="starfield"><\/div><div class="fx-layer sess-deneb" aria-hidden="true">/);
});

test('the screens wire it: the cockpit\'s live store and hush, heads-down\'s rows, Settings\' switch', () => {
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
  const cockpit = read('../src/screens/Cockpit.jsx');
  assert.match(cockpit, /const fxLanded = ledger && ledgerRes\.path === ledgerPath \? landed : undefined;/, 'landed is read only once the ledger is this session\'s');
  assert.match(cockpit, /const fx = \{ live, session: id, landed: fxLanded, hushed, asking: asking && view === 'working', sess: sessClass\(session\) \};/);
  assert.match(cockpit, /fx=\{fx\} \/>/);
  const heads = read('../src/screens/HeadsDown.jsx');
  assert.match(heads, /const grid = headsGrid\(rows\);/);
  assert.match(heads, /const mine = ledger && ledgerRes\.path === `\/api\/sessions\/\$\{encodeURIComponent\(id\)\}`;/);
  assert.match(heads, /<FxLayer\s+mode="heads" target="\.tui" grid=\{grid\} live=\{live\} session=\{id\} landed=\{mine \? ledger\.landed \|\| \[\] : undefined\} progress=\{mine \? grid\.bar\?\.head : undefined\}/);
  assert.match(heads, /<FxLayer mode="heads" target="\.sp-card" \/>/, 'the start card gets the drift alone');
  const settings = read('../src/screens/Settings.jsx');
  assert.match(settings, /Particle effects<\/span>\s*<FxSeg \/>/);
  assert.match(settings, /const reducedMotion = useReducedMotion\(\);/);
  assert.match(settings, /\{reducedMotion \? ' Your system asks for reduced motion, so none are drawn whatever you pick\.' : ''\}/, 'the help line says why On draws nothing');
  const fx = read('../src/ui/fx.jsx');
  assert.match(fx, /import\('\.\.\/fx\/runtime\.js'\)/, 'the engine loads on demand, in its own chunk');
  assert.match(fx, /return startFx\(fx, \{/, 'the engine\'s life is fx/host.js startFx');
  assert.match(fx, /useEffect\(\(\) => \{ safely\(fx, \(e\) => e\.retheme\(\)\); \}, \[sess\]\);/, 'a new sess class re-reads the colours');
  assert.match(fx, /differ\.current\.feed\(fxSnapshot\(live, \{ landed, progress \}\), session\)/, 'the differ knows the session it follows');
});

test('fx.css leans only on nexus.css tokens, places the layer under everything, and takes no pointer', () => {
  const css = fs.readFileSync(new URL('../src/styles/fx.css', import.meta.url), 'utf8');
  const nexus = fs.readFileSync(new URL('../src/styles/nexus.css', import.meta.url), 'utf8');
  for (const [, ref] of css.matchAll(/var\((--[a-z0-9-]+)\)/g)) assert.ok(nexus.includes(`${ref}:`), `${ref} is a nexus.css token`);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i, 'no raw colours');
  assert.match(css, /\.fx-layer \{ position: absolute; inset: 0; z-index: 0; pointer-events: none;/);
  assert.match(css, /\.fx-layer\.is-heads \{ position: fixed; \}/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  for (const t of FX_TOKENS.filter((t) => t !== '--sess')) assert.ok(nexus.includes(`${t}:`), `${t} is a nexus.css token`);
  assert.match(nexus, /\.sess-vega\s*\{[^}]*--sess:/, 'the session classes set --sess');
});

// ---- a session switched in place ----------------------------------------------------------

test('a session switched in place is a baseline: the old store, the new hello, the new ledger set off nothing', () => {
  const old = live({
    transcript: [{ kind: 'tool', name: 'Bash', agent: 'main' }],
    stage: beats({ k: 'agent', p: 'start', id: 'main' }),
  });
  const d = createFxDiffer();
  assert.deepEqual(d.feed(fxSnapshot(old, { landed: [{ sha: 'a1' }], progress: 10 }), 's1'), [], 'the first session\'s hello');
  // The route moves: the store is still the old session's (and still connected), the landed list waits for the ledger.
  assert.deepEqual(d.feed(fxSnapshot(old, { landed: undefined, progress: undefined }), 's2'), [], 'the switch render');
  const busy = live({
    transcript: [
      { kind: 'tool', name: 'Bash', agent: 'main' }, { kind: 'tool', name: 'Edit', agent: 'toolu_9' }, { kind: 'tool-error', agent: 'main', text: 'x' },
      { kind: 'result', ok: false }, { kind: 'tool', name: 'Read', agent: 'main' },
    ],
    stage: beats({ k: 'agent', p: 'start', id: 'main' }, { k: 'agent', p: 'start', id: 'toolu_9', parent: 'main' }, { k: 'agent', p: 'start', id: 'toolu_8', parent: 'main' }),
  });
  assert.deepEqual(d.feed(fxSnapshot(busy, { landed: undefined }), 's2'), [], 'the new session\'s hello: longer, other agents, a baseline');
  assert.deepEqual(d.feed(fxSnapshot(busy, { landed: [{ sha: 'b2' }], progress: 40 }), 's2'), [], 'its ledger loading: another sha, no landing, no streak');
  const next = { ...busy, transcript: [...busy.transcript, { kind: 'tool', name: 'Grep', agent: 'main' }] };
  assert.deepEqual(d.feed(fxSnapshot(next, { landed: [{ sha: 'b2' }], progress: 40 }), 's2'), [{ type: 'tool', agent: 'main', name: 'Grep', tone: 'tool' }], 'then news is news');

  // Even a feed that skips the switch render (the new hello is the first thing seen) is no storm.
  const e = createFxDiffer();
  e.feed(fxSnapshot(old, { landed: [{ sha: 'a1' }] }), 's1');
  assert.deepEqual(e.feed(fxSnapshot(busy, { landed: [{ sha: 'b2' }], progress: 40 }), 's2'), []);
  assert.deepEqual(e.feed(fxSnapshot(busy, { landed: [{ sha: 'b3' }], progress: 41 }), 's2'), [], 'held until the store moves');
  assert.deepEqual(e.feed(fxSnapshot(next, { landed: [{ sha: 'b3' }], progress: 41 }), 's2'), [], 'which is the baseline');
  const r = createFxDiffer();
  r.feed(fxSnapshot(old, { landed: [{ sha: 'a1' }] }));
  r.reset();
  assert.deepEqual(r.feed(fxSnapshot(busy, { landed: [{ sha: 'b2' }] })), [], 'reset: the next snapshot is a baseline');
});

// ---- the engine's life (fx/host.js) ---------------------------------------------------------

const flush = () => new Promise((r) => setImmediate(r));

test('the engine starts on load, stops once, and a layer turned off before the load lands starts none', async () => {
  const ref = { current: null };
  let made = 0;
  let destroyed = 0;
  const calls = [];
  const load = async () => ({ createFx: () => { made += 1; return { setState: (s) => calls.push(s), setScene() {}, destroy: () => { destroyed += 1; } }; } });
  const canvas = () => ({});
  const first = (e) => e.setState('first');

  const stop = startFx(ref, { load, canvas, first });
  assert.equal(ref.current, null, 'nothing until the chunk loads');
  await flush();
  assert.equal(made, 1);
  assert.ok(ref.current, 'on: an engine');
  assert.deepEqual(calls, ['first'], 'brought up to date on start');
  stop();
  assert.equal(destroyed, 1, 'off: destroyed once');
  assert.equal(ref.current, null, 'and let go');
  stop();
  assert.equal(destroyed, 1, 'a second cleanup destroys nothing');

  const late = startFx(ref, { load, canvas, first });
  late();
  await flush();
  assert.equal(made, 1, 'turned off before the import landed: no engine at all');
  assert.equal(ref.current, null);

  const gone = startFx(ref, { load, canvas: () => null, first });
  await flush();
  assert.equal(made, 1, 'no canvas (unmounted): no engine');
  gone();

  const again = startFx(ref, { load, canvas, first });
  await flush();
  assert.equal(made, 2, 'on again: a new engine');
  again();
  assert.equal(destroyed, 2);

  const broken = startFx(ref, { load: async () => { throw new Error('offline'); }, canvas, first });
  await flush();
  assert.equal(ref.current, null, 'no chunk: no particles, no throw');
  broken();
});

test('an engine that throws is destroyed and dropped, and the page goes on', async () => {
  const ref = { current: null };
  let destroyed = 0;
  const load = async () => ({ createFx: () => ({ setState() { throw new Error('bad state'); }, destroy: () => { destroyed += 1; } }) });
  const stop = startFx(ref, { load, canvas: () => ({}), first: (e) => e.setState({}) });
  await flush();
  assert.equal(ref.current, null, 'a throw on start drops it');
  assert.equal(destroyed, 1);
  stop();
  assert.equal(destroyed, 1, 'and it is not destroyed twice');

  ref.current = { emit() { throw new Error('boom'); }, destroy() { throw new Error('worse'); } };
  assert.doesNotThrow(() => safely(ref, (e) => e.emit([])));
  assert.equal(ref.current, null, 'a throw anywhere, even in destroy, lets it go');
  assert.doesNotThrow(() => safely(ref, (e) => e.emit([])), 'and a call with no engine is nothing');
});

// ---- heads-down motes and the drawing pass -------------------------------------------------------

test('heads-down glyph motes keep beside the box, never in it, and never in the dim-text colour', () => {
  for (const scene of [
    headsScene({ left: 200, top: 40, width: 1000, height: 600 }, { rows: 30, cols: 120 }, 1400, 900),
    headsScene({ left: 420, top: 300, width: 560, height: 300 }, undefined, 1400, 900),
  ]) {
    const [em] = ambientEmitters(scene, {});
    const rng = seeded(11);
    const motes = Array.from({ length: 600 }, () => ambientSpawn(em, scene, rng));
    const glyphs = motes.filter((m) => m.kind === 'glyph');
    assert.ok(glyphs.length > 20, 'there are glyphs');
    assert.ok(motes.some((m) => m.kind === 'pixel' && m.x > scene.box.left && m.x < scene.box.left + scene.box.width), 'pixels may pass behind the box');
    for (const g of glyphs) {
      // Its furthest sideways drift over a whole life stays outside the box.
      const reach = Math.abs(g.vx) * g.life;
      assert.ok(g.x + reach < scene.box.left || g.x - reach > scene.box.left + scene.box.width, `glyph at ${g.x.toFixed(0)} keeps out of the box`);
    }
    assert.ok(motes.every((m) => m.color !== '--text-3'), 'no mote wears the tape\'s dim-text token');
  }
  assert.ok(!FX_TOKENS.includes('--text-3'));
  const wide = headsScene({ left: 0, top: 0, width: 1400, height: 900 }, { rows: 40, cols: 120 }, 1400, 900);
  const [em] = ambientEmitters(wide, {});
  const rng = seeded(3);
  assert.ok(Array.from({ length: 200 }, () => ambientSpawn(em, wide, rng)).every((m) => m.kind === 'pixel'), 'a box as wide as the window: pixels only');
});

test('the start card (no grid) still anchors every event at its centre in usual cells', () => {
  const card = headsScene({ left: 420, top: 300, width: 560, height: 300 }, undefined, 1400, 900);
  assert.equal(card.cw, 9.6);
  assert.equal(card.bar, null);
  assert.deepEqual(card.tape, { x: 700, y: 450 });
  assert.deepEqual(card.prompt, card.tape);
  for (const type of ['tool', 'error', 'agent-end', 'result', 'chunk', 'landed', 'progress', 'ask']) {
    const out = spawnsFor({ type, ok: type !== 'result', stage: 'archive' }, card, seeded(2));
    assert.ok(out.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), `${type}: finite`);
  }
  assert.deepEqual(spawnsFor({ type: 'progress' }, card, seeded(2)), [], 'no phase track: no streak');
});

test('the drawing pass builds one css string per colour, not one per particle', () => {
  const pool = createPool(64);
  for (let i = 0; i < 40; i += 1) spawn(pool, { kind: ['spark', 'ring', 'pixel', 'glyph'][i % 4], x: i, y: i, vx: 5, life: 2, age: 0, alpha: 0.5 + (i % 5) / 10, color: i % 2 ? '--st-tool' : '--st-done', r0: 1, r1: 5, glyph: '*' });
  pool.items.slice(0, pool.n).forEach((p) => { p.age = 0.5; });
  const styles = [];
  const alphas = new Set();
  const ctx = fakeCtx();
  for (const k of ['fillStyle', 'strokeStyle']) Object.defineProperty(ctx, k, { set: (v) => styles.push(v), get: () => styles[styles.length - 1] });
  Object.defineProperty(ctx, 'globalAlpha', { set: (v) => alphas.add(v), get: () => 1 });
  const colors = { '--st-tool': [82, 221, 240, 1], '--st-done': [120, 230, 160, 1] };
  drawPool(ctx, pool, { color: (t) => colors[t], sprite: () => null, look: themeLook('dark'), alpha: 1 });
  assert.deepEqual([...new Set(styles)].sort(), ['rgb(120,230,160)', 'rgb(82,221,240)'], 'opaque per colour');
  assert.ok(alphas.size > 3, 'each particle\'s alpha rides in globalAlpha');
});

// ---- the runtime against a stubbed page ---------------------------------------------------------

function stubPage() {
  const saved = {};
  for (const k of ['document', 'window', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver']) saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
  const on = [];
  const target = (name) => ({
    addEventListener: (type, fn, cap) => on.push([name, type, fn, !!cap]),
    removeEventListener: (type, fn, cap) => { const i = on.findIndex((l) => l[0] === name && l[1] === type && l[2] === fn && l[3] === !!cap); if (i >= 0) on.splice(i, 1); },
  });
  const frames = [];
  let id = 0;
  const cancelled = [];
  const stops = [];
  const observers = [];
  const page = { on, frames, cancelled, stops, observers, sess: 'rgb(1, 2, 3)', reads: 0 };
  const ctx = () => ({ ...fakeCtx(), setTransform() {}, clearRect() {}, createRadialGradient: () => ({ addColorStop: (o, c) => stops.push(c) }), getImageData: () => ({ data: [0, 0, 0, 0] }) });
  const tui = { getBoundingClientRect: () => { page.reads += 1; return { left: 100, top: 40, width: 1000, height: 600 }; } };
  const host = { appendChild: (el) => { page.probe = el; }, parentElement: { querySelector: () => tui } };
  page.canvas = { width: 0, height: 0, parentElement: host, getContext: () => ctx(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }) };
  globalThis.document = {
    hidden: false,
    documentElement: { getAttribute: () => 'dark' },
    createElement: (tag) => (tag === 'canvas' ? { width: 0, height: 0, getContext: () => ctx() } : { style: {}, setAttribute() {}, remove() { this.removed = true; } }),
    ...target('document'),
  };
  globalThis.window = { devicePixelRatio: 1, ...target('window') };
  globalThis.getComputedStyle = (el) => ({ color: String(el.style?.color || '').startsWith('var(--sess') ? page.sess : 'rgb(10, 20, 30)', getPropertyValue: () => '' });
  globalThis.requestAnimationFrame = (fn) => { id += 1; frames.push({ id, fn }); return id; };
  globalThis.cancelAnimationFrame = (n) => { cancelled.push(n); const i = frames.findIndex((f) => f.id === n); if (i >= 0) frames.splice(i, 1); };
  globalThis.MutationObserver = class { constructor(cb) { this.cb = cb; this.live = false; observers.push(this); } observe() { this.live = true; } disconnect() { this.live = false; } };
  delete globalThis.ResizeObserver;
  delete globalThis.IntersectionObserver;
  let ts = 0;
  page.run = () => { ts += 16.7; for (const f of frames.splice(0)) f.fn(ts); };
  page.restore = () => {
    for (const [k, d] of Object.entries(saved)) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; }
  };
  return page;
}

test('the runtime: listens only where it must, measures a scroll once a frame, idles calm, re-reads colours, and cleans up', () => {
  const page = stubPage();
  try {
    const fx = createFx(page.canvas);
    assert.ok(page.observers[0].live, 'it watches the theme on <html>');
    assert.deepEqual(page.on.map((l) => `${l[0]}:${l[1]}`), ['document:visibilitychange']);

    fx.setScene({ mode: 'stage', nodes: [{ key: 'main', at: [50, 30], size: 'xl', state: 'idle', main: true }] });
    assert.equal(page.on.filter((l) => l[0] === 'window').length, 0, 'the stage never listens to window scrolls');
    assert.equal(page.frames.length, 1, 'a scene wakes the loop');
    page.run();
    assert.equal(page.frames.length, 0, 'drift alone is calm: the next frame waits on a timer, not the very next vsync');
    fx.emit([{ type: 'tool', agent: 'main', tone: 'tool' }]);
    assert.equal(page.frames.length, 1, 'an event brings full rate back at once');
    page.run();
    assert.equal(page.frames.length, 1, 'a burst alive: every frame');

    fx.setScene({ mode: 'heads', target: '.tui', grid: { rows: 30, cols: 120 } });
    const scrolls = page.on.filter((l) => l[0] === 'window');
    assert.deepEqual(scrolls.map((l) => `${l[1]}:${l[3]}`), ['scroll:true', 'resize:false'], 'a heads scene follows scrolls');
    const before = page.reads;
    for (let i = 0; i < 20; i += 1) scrolls[0][2]();
    assert.equal(page.reads, before, 'a scroll only marks the scene');
    page.run();
    assert.equal(page.reads, before + 1, 'the next frame measures once');

    const stops = page.stops.length;
    page.sess = 'rgb(9, 9, 9)';
    fx.retheme();
    assert.ok(page.stops.slice(stops).some((c) => c.includes('9,9,9')), 'retheme re-reads --sess');

    fx.setScene({ mode: 'stage', nodes: [] });
    assert.equal(page.on.filter((l) => l[0] === 'window').length, 0, 'back on the stage: no window listeners');
    fx.setScene({ mode: 'heads', target: '.tui', grid: { rows: 30, cols: 120 } });
    fx.destroy();
    assert.deepEqual(page.on, [], 'destroy removes every listener');
    assert.equal(page.observers[0].live, false, 'and the theme watch');
    assert.ok(page.probe.removed, 'and the token probe');
    assert.ok(page.cancelled.length >= 1, 'and the pending frame');
    for (const f of page.frames.splice(0)) f.fn(1e6);
    fx.emit([{ type: 'error', agent: 'main' }]);
    assert.equal(page.frames.length, 0, 'a destroyed layer never wakes');
  } finally {
    page.restore();
  }
  assert.equal(typeof globalThis.window, 'undefined', 'the page stubs are gone');
});
