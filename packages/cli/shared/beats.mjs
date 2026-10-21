// Beats: the only things that move the agent stage.
//
// A beat is a small structured fact ("agent X started", "chunk 12.3
// reached the gate"). The stage never reads transcript words; it reduces
// beats. The reducer is pure (no clock, no DOM, no randomness), so a page
// opened mid-run, a refresh, and a page that watched from the start all
// reach the same state by replaying the same beats.
//
// Kinds and phases:
//   chunk      claim | build | gate | archive        { id }
//   agent      start | tool | wait | end            { id, parent?, label?, tool?, ok? }
//   loop       dispatch | run | conclude            { id, name?, conclusion? }
//   oversight  ask | answer | tug                   { id?, agent?, text? }
//
// Any beat may carry `at` (ms): the session stamps the beats it reads off the
// stream with when it read them. The reducer keeps a chunk's first claim and
// its close (`claimedAt`, `closedAt`) and never reads a clock itself. An agent
// start with `junction: true` is a Workflow call: the stage draws it as the
// junction its agents hang from.

export const LANES = 5;
export const MAIN = 'main';

export const KINDS = {
  chunk: ['claim', 'build', 'gate', 'archive'],
  agent: ['start', 'tool', 'wait', 'end'],
  loop: ['dispatch', 'run', 'conclude'],
  oversight: ['ask', 'answer', 'tug'],
};

export function isBeat(b) {
  return !!b && typeof b === 'object' && Array.isArray(KINDS[b.k]) && KINDS[b.k].includes(b.p);
}

export function initialState() {
  return {
    seq: 0,
    agents: {},
    order: [],
    chunks: {},
    chunkOrder: [],
    current: null,
    loops: {},
    loopOrder: [],
    asks: {},
    tugs: 0,
    lastTug: null,
  };
}

function ensureAgent(s, id, parent) {
  if (s.agents[id]) return s.agents[id];
  const children = s.order.filter((a) => a !== MAIN).length;
  const a = {
    id,
    parent: id === MAIN ? null : parent || MAIN,
    label: id === MAIN ? 'session' : '',
    state: 'running',
    tool: null,
    tools: 0,
    slot: id === MAIN ? 0 : (children % LANES) + 1,
    ok: null,
  };
  s.agents[id] = a;
  s.order.push(id);
  return a;
}

/** Reduce one beat. Returns a new state; the input is not mutated. */
export function reduce(prev, beat) {
  if (!isBeat(beat)) return prev;
  const s = structuredCloneLite(prev);
  s.seq += 1;
  switch (beat.k) {
    case 'agent': {
      const id = beat.id || MAIN;
      if (id !== MAIN && !s.agents[MAIN]) ensureAgent(s, MAIN);
      const a = ensureAgent(s, id, beat.parent);
      if (beat.label) a.label = String(beat.label).slice(0, 80);
      if (beat.junction) a.junction = true;
      if (beat.p === 'start') { a.state = 'running'; a.ok = null; }
      if (beat.p === 'tool') { a.state = 'running'; a.tool = beat.tool || null; a.tools += 1; }
      if (beat.p === 'wait') a.state = 'waiting';
      if (beat.p === 'end') { a.state = beat.ok === false ? 'failed' : 'done'; a.ok = beat.ok !== false; a.tool = null; }
      break;
    }
    case 'chunk': {
      if (!beat.id) break;
      if (!s.chunks[beat.id]) { s.chunks[beat.id] = { id: beat.id, stage: beat.p }; s.chunkOrder.push(beat.id); }
      s.chunks[beat.id].stage = beat.p;
      if (typeof beat.at === 'number') {
        if (beat.p === 'claim' && s.chunks[beat.id].claimedAt == null) s.chunks[beat.id].claimedAt = beat.at;
        if (beat.p === 'archive') s.chunks[beat.id].closedAt = beat.at;
      }
      s.current = beat.p === 'archive' ? (s.current === beat.id ? null : s.current) : beat.id;
      break;
    }
    case 'loop': {
      if (!beat.id) break;
      if (!s.loops[beat.id]) { s.loops[beat.id] = { id: beat.id, name: beat.name || '', status: beat.p, conclusion: null }; s.loopOrder.push(beat.id); }
      const l = s.loops[beat.id];
      l.status = beat.p;
      if (beat.name) l.name = beat.name;
      if (beat.p === 'conclude') l.conclusion = beat.conclusion || 'unknown';
      break;
    }
    case 'oversight': {
      if (beat.p === 'ask' && beat.id) {
        s.asks[beat.id] = { id: beat.id, agent: beat.agent || MAIN, open: true };
        const a = s.agents[beat.agent || MAIN];
        if (a) a.state = 'waiting';
      }
      if (beat.p === 'answer' && beat.id && s.asks[beat.id]) {
        s.asks[beat.id].open = false;
        const a = s.agents[s.asks[beat.id].agent];
        if (a && a.state === 'waiting') a.state = 'running';
      }
      if (beat.p === 'tug') { s.tugs += 1; s.lastTug = { n: s.tugs, agent: beat.agent || MAIN }; }
      break;
    }
  }
  return s;
}

export function replay(beats, from = initialState()) {
  let s = from;
  for (const b of beats) s = reduce(s, b);
  return s;
}

export function openAsks(s) {
  return Object.values(s.asks).filter((a) => a.open);
}

// JSON-shaped state only, so a JSON round trip is an exact clone.
function structuredCloneLite(s) {
  return JSON.parse(JSON.stringify(s));
}

// --- beats from an agent message stream ------------------------------------
// Maps one SDK / stream-json message to zero or more beats. `ctx` carries the
// tool_use ids that spawned subagents, so their results end the right node.
// Structured fields only: tool names, tool inputs, parent_tool_use_id.

const SPAWN_TOOLS = new Set(['Task', 'Agent']);
const JUNCTION_TOOLS = new Set(['Workflow']);

/** A Workflow call's name: its own, else its script's file name. */
function workflowLabel(input) {
  const named = input.name || input.title || input.description;
  if (named) return String(named);
  const script = typeof input.script === 'string' && !/\n/.test(input.script) ? input.script : typeof input.script_path === 'string' ? input.script_path : '';
  const base = script.split(/[\\/]/).pop().replace(/\.[a-z]+$/i, '');
  return base || 'workflow';
}
const CLAIM_RE = /claims(?:\.mjs)?\s+claim\s+([0-9]+(?:\.[0-9a-z]+)?)/i;
const GATE_RE = /(verify\.mjs|check\.mjs|npm run (?:check|verify|test)|pnpm (?:verify|check))/i;
const PENDING_RE = /plan[\\/]pending[\\/]([0-9]+(?:\.[0-9a-z]+)?)\.md/i;

export function newBeatContext() {
  return { spawns: {}, chunk: null };
}

export function beatsFromMessage(msg, ctx) {
  const out = [];
  if (!msg || typeof msg !== 'object') return out;
  const parent = msg.parent_tool_use_id || null;
  if (msg.type === 'system' && msg.subtype === 'init') out.push({ k: 'agent', p: 'start', id: MAIN, label: 'session' });
  if (msg.type === 'system' && msg.subtype === 'task_started' && msg.tool_use_id && !ctx.spawns[msg.tool_use_id]) {
    ctx.spawns[msg.tool_use_id] = true;
    out.push({ k: 'agent', p: 'start', id: msg.tool_use_id, parent: MAIN, label: msg.description || msg.subagent_type || 'task' });
  }
  if (msg.type === 'system' && msg.subtype === 'task_notification' && msg.tool_use_id) {
    out.push({ k: 'agent', p: 'end', id: msg.tool_use_id, ok: msg.status === 'completed' });
  }
  if (msg.type === 'assistant' && msg.message && Array.isArray(msg.message.content)) {
    for (const block of msg.message.content) {
      if (block.type !== 'tool_use') continue;
      const input = block.input || {};
      if (SPAWN_TOOLS.has(block.name)) {
        if (!ctx.spawns[block.id]) {
          ctx.spawns[block.id] = true;
          out.push({ k: 'agent', p: 'start', id: block.id, parent: parent || MAIN, label: input.description || input.subagent_type || 'subagent' });
          if (ctx.chunk) out.push({ k: 'chunk', p: 'build', id: ctx.chunk });
        }
        continue;
      }
      if (JUNCTION_TOOLS.has(block.name)) {
        if (!ctx.spawns[block.id]) {
          ctx.spawns[block.id] = true;
          out.push({ k: 'agent', p: 'start', id: block.id, parent: parent || MAIN, label: workflowLabel(input), junction: true });
        }
        continue;
      }
      out.push({ k: 'agent', p: 'tool', id: parent || MAIN, tool: block.name });
      const cmd = typeof input.command === 'string' ? input.command : '';
      const file = typeof input.file_path === 'string' ? input.file_path : '';
      const claim = CLAIM_RE.exec(cmd);
      if (claim) { ctx.chunk = claim[1]; out.push({ k: 'chunk', p: 'claim', id: claim[1] }); }
      else if (ctx.chunk && GATE_RE.test(cmd)) out.push({ k: 'chunk', p: 'gate', id: ctx.chunk });
      const pending = PENDING_RE.exec(file) || PENDING_RE.exec(cmd);
      if (pending && /^(Write|Edit)$/.test(block.name)) {
        out.push({ k: 'chunk', p: 'archive', id: pending[1] });
        if (ctx.chunk === pending[1]) ctx.chunk = null;
      }
    }
  }
  if (msg.type === 'user' && msg.message && Array.isArray(msg.message.content)) {
    for (const block of msg.message.content) {
      if (block && block.type === 'tool_result' && ctx.spawns[block.tool_use_id] === true) {
        ctx.spawns[block.tool_use_id] = 'ended';
        out.push({ k: 'agent', p: 'end', id: block.tool_use_id, ok: !block.is_error });
      }
    }
  }
  if (msg.type === 'result') out.push({ k: 'agent', p: 'end', id: MAIN, ok: !msg.is_error });
  return out;
}
