// SDK / stream-json messages -> transcript items for the prompt pane.
// Pure apart from `ctx`, which remembers which assistant messages already
// streamed as partials (so the full message that follows is not repeated).
//
// Times: the stream carries none of its own, so a context made with a clock
// (`newTxContext({ now })`, the session's) stamps each item with `at` (ms, when
// the server read it), remembers when each tool call went out, and turns its
// tool_result into a `tool-done` item with the call's duration. Without a clock
// nothing is stamped and no duration is guessed.
//
// Diffstats: an Edit or MultiEdit carries its old and new text, so its lines
// added and removed are counted from the call itself (`diff: { add, del }`); a
// Write carries only the new text (`del: null`, unknown). A replace_all edit
// changes an unknown number of places, so it carries no diffstat.

export function newTxContext({ now = null } = {}) {
  return { msgId: null, streamed: new Set(), now, started: new Map() };
}

/** The lines of a text, a trailing newline closing the last one (not opening another). */
export function lines(text) {
  if (typeof text !== 'string' || text === '') return [];
  const a = text.split(/\r?\n/);
  if (a[a.length - 1] === '') a.pop();
  return a;
}

const LCS_CAP = 250000; // cells; past it, the changed middle counts as wholly replaced

/** Lines added and removed going from `a` to `b` (a line diff: common lines are not counted). */
export function lineDiff(a, b) {
  const x = lines(a);
  const y = lines(b);
  let lo = 0;
  while (lo < x.length && lo < y.length && x[lo] === y[lo]) lo += 1;
  let hx = x.length;
  let hy = y.length;
  while (hx > lo && hy > lo && x[hx - 1] === y[hy - 1]) { hx -= 1; hy -= 1; }
  const xs = x.slice(lo, hx);
  const ys = y.slice(lo, hy);
  let common = 0;
  if (xs.length && ys.length && xs.length * ys.length <= LCS_CAP) {
    let prev = new Array(ys.length + 1).fill(0);
    for (let i = 1; i <= xs.length; i += 1) {
      const cur = new Array(ys.length + 1).fill(0);
      for (let j = 1; j <= ys.length; j += 1) cur[j] = xs[i - 1] === ys[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
      prev = cur;
    }
    common = prev[ys.length];
  }
  return { add: ys.length - common, del: xs.length - common };
}

/** A tool call's diffstat from its own input, or null when the call does not say. */
export function diffOf(name, input = {}) {
  if (!input || typeof input !== 'object') return null;
  if (name === 'Edit') {
    if (input.replace_all || typeof input.old_string !== 'string' || typeof input.new_string !== 'string') return null;
    return lineDiff(input.old_string, input.new_string);
  }
  if (name === 'MultiEdit') {
    const edits = Array.isArray(input.edits) ? input.edits : [];
    if (!edits.length || edits.some((e) => !e || e.replace_all || typeof e.old_string !== 'string' || typeof e.new_string !== 'string')) return null;
    return edits.reduce((t, e) => { const d = lineDiff(e.old_string, e.new_string); return { add: t.add + d.add, del: t.del + d.del }; }, { add: 0, del: 0 });
  }
  if (name === 'Write' && typeof input.content === 'string') return { add: lines(input.content).length, del: null };
  return null;
}

export function summarize(name, input = {}) {
  const pick = input.command || input.file_path || input.pattern || input.url || input.description || input.prompt || input.query || '';
  const s = String(pick).replace(/\s+/g, ' ').trim();
  return s.length > 140 ? `${s.slice(0, 137)}...` : s;
}

/** Copy for account errors, keyed by the SDK's assistant error codes. */
export function friendlyError(code, fallback) {
  switch (code) {
    case 'authentication_failed':
      return 'Claude Code is not logged in. Run `claude` in a terminal, then /login, and try again.';
    case 'billing_error':
      return 'Your Claude account has a billing problem. Check your plan, then try again.';
    case 'rate_limit':
      return 'Rate limited. Wait a minute and send again.';
    case 'overloaded':
      return 'The service is overloaded right now. Try again shortly.';
    default:
      return fallback || `Claude Code reported: ${code}`;
  }
}

export function txFromMessage(msg, ctx) {
  const out = txItems(msg, ctx);
  if (typeof ctx?.now !== 'function') return out;
  const at = ctx.now();
  for (const item of out) {
    item.at = at;
    if (item.kind === 'tool' && item.id) ctx.started.set(item.id, at);
  }
  if (msg && msg.type === 'user') {
    const content = msg.message && Array.isArray(msg.message.content) ? msg.message.content : [];
    for (const block of content) {
      if (!block || block.type !== 'tool_result' || !ctx.started.has(block.tool_use_id)) continue;
      const from = ctx.started.get(block.tool_use_id);
      ctx.started.delete(block.tool_use_id);
      out.push({ kind: 'tool-done', id: block.tool_use_id, agent: msg.parent_tool_use_id || 'main', ms: Math.max(0, at - from), ok: !block.is_error, at });
    }
  }
  return out;
}

function txItems(msg, ctx) {
  const out = [];
  if (!msg || typeof msg !== 'object') return out;
  const agent = msg.parent_tool_use_id || 'main';
  switch (msg.type) {
    case 'system':
      if (msg.subtype === 'init') out.push({ kind: 'system', text: `session ${String(msg.session_id || '').slice(0, 8)} · ${msg.model || 'model'} · ${(msg.slash_commands || []).length} commands`, session: msg.session_id });
      if (msg.subtype === 'task_notification' && msg.summary) out.push({ kind: 'system', agent: msg.tool_use_id || agent, text: `task ${msg.status}: ${msg.summary}` });
      break;
    case 'stream_event': {
      if (msg.parent_tool_use_id) break;
      const ev = msg.event || {};
      if (ev.type === 'message_start' && ev.message) ctx.msgId = ev.message.id;
      if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') {
        if (ctx.msgId) ctx.streamed.add(ctx.msgId);
        out.push({ kind: 'delta', id: `${ctx.msgId || 'm'}:${ev.index ?? 0}`, agent, text: ev.delta.text });
      }
      break;
    }
    case 'assistant': {
      const m = msg.message || {};
      if (msg.error) out.push({ kind: 'error', code: msg.error, text: friendlyError(msg.error) });
      const content = Array.isArray(m.content) ? m.content : [];
      content.forEach((block, i) => {
        if (block.type === 'text' && !msg.parent_tool_use_id && !ctx.streamed.has(m.id) && block.text) {
          out.push({ kind: 'text', id: `${m.id || 'm'}:${i}`, agent, text: block.text });
        }
        if (block.type === 'tool_use') {
          const item = { kind: 'tool', id: block.id, agent, name: block.name, summary: summarize(block.name, block.input) };
          const diff = diffOf(block.name, block.input);
          if (diff) item.diff = diff;
          out.push(item);
        }
      });
      break;
    }
    case 'user': {
      const content = msg.message && Array.isArray(msg.message.content) ? msg.message.content : [];
      for (const block of content) {
        if (block && block.type === 'tool_result' && block.is_error) out.push({ kind: 'tool-error', id: block.tool_use_id, agent, text: toText(block.content).slice(0, 400) });
      }
      break;
    }
    case 'result':
      out.push({
        kind: 'result',
        ok: !msg.is_error,
        subtype: msg.subtype,
        cost: typeof msg.total_cost_usd === 'number' ? msg.total_cost_usd : null,
        turns: msg.num_turns ?? null,
        ms: msg.duration_ms ?? null,
        session: msg.session_id,
        text: msg.is_error ? toText(msg.result || msg.errors || msg.subtype) : '',
      });
      break;
  }
  return out;
}

function toText(c) {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((x) => (typeof x === 'string' ? x : x && x.text ? x.text : '')).join(' ');
  return c == null ? '' : JSON.stringify(c);
}
