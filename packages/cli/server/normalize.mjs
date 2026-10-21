// SDK / stream-json messages -> transcript items for the prompt pane.
// Pure apart from `ctx`, which remembers which assistant messages already
// streamed as partials (so the full message that follows is not repeated).

export function newTxContext() {
  return { msgId: null, streamed: new Set() };
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
        if (block.type === 'tool_use') out.push({ kind: 'tool', id: block.id, agent, name: block.name, summary: summarize(block.name, block.input) });
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
