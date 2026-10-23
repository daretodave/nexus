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
  for (let i = 0; i < 200; i += 1) h.feed(1, 60);
  assert.ok(h.scale() < 1, 'a page that only gets 16 frames a second sheds load too');
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
  assert.match(cockpit, /const fx = \{ live, landed: ledger \? landed : undefined, hushed, asking: asking && view === 'working', sess: sessClass\(session\) \};/);
  assert.match(cockpit, /fx=\{fx\} \/>/);
  const heads = read('../src/screens/HeadsDown.jsx');
  assert.match(heads, /const grid = headsGrid\(rows\);/);
  assert.match(heads, /<FxLayer\s+mode="heads" target="\.tui"/);
  assert.match(heads, /<FxLayer mode="heads" target="\.sp-card" \/>/, 'the start card gets the drift alone');
  const settings = read('../src/screens/Settings.jsx');
  assert.match(settings, /Particle effects<\/span>\s*<FxSeg \/>/);
  const fx = read('../src/ui/fx.jsx');
  assert.match(fx, /import\('\.\.\/fx\/runtime\.js'\)/, 'the engine loads on demand, in its own chunk');
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
