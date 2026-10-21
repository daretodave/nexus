// The event hub behind GET /api/events (one SSE stream per tab).
//
// - On connect: a `hello` with server time and the full replay (beats and
//   transcript), so a late tab reduces to the same state as an early one.
// - A `: ping` comment every 20 s keeps proxies and sleeping tabs honest.
// - Writes are coalesced into 300 ms flushes; consecutive text deltas for
//   the same transcript item merge into one event.

export const PING_MS = 20000;
export const FLUSH_MS = 300;
const MAX_BEATS = 5000;
const MAX_TRANSCRIPT = 2000;

export function createHub({ pingMs = PING_MS, flushMs = FLUSH_MS } = {}) {
  const clients = new Set();
  const beats = [];
  const transcript = [];
  let queue = [];
  let timer = null;
  let status = { state: 'idle' };
  const extras = {};

  function frame(type, data) {
    return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  function flush() {
    timer = null;
    if (!queue.length) return;
    const out = coalesce(queue).map((e) => frame(e.type, e.data)).join('');
    queue = [];
    for (const res of clients) res.write(out);
  }

  function emit(type, data) {
    queue.push({ type, data });
    if (!timer) timer = setTimeout(flush, flushMs);
  }

  function beat(b) {
    beats.push(b);
    if (beats.length > MAX_BEATS) beats.splice(0, beats.length - MAX_BEATS);
    emit('beat', b);
  }

  function tx(item) {
    if (item.kind === 'delta') {
      const last = transcript[transcript.length - 1];
      if (last && last.kind === 'text' && last.id === item.id) last.text += item.text;
      else transcript.push({ kind: 'text', id: item.id, agent: item.agent, text: item.text, ...(item.at != null ? { at: item.at } : {}) });
    } else transcript.push(item);
    if (transcript.length > MAX_TRANSCRIPT) transcript.splice(0, transcript.length - MAX_TRANSCRIPT);
    emit('tx', item);
  }

  function setStatus(next) {
    status = { ...status, ...next };
    emit('status', status);
  }

  function set(key, value) {
    extras[key] = value;
    emit(key, value);
  }

  function attach(req, res) {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write(frame('hello', { time: Date.now(), beats, transcript, status, ...extras }));
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), pingMs);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
  }

  function reset() {
    beats.length = 0;
    transcript.length = 0;
    emit('reset', {});
  }

  function close() {
    if (timer) { clearTimeout(timer); flush(); }
    for (const res of clients) res.end();
    clients.clear();
  }

  return { emit, beat, tx, setStatus, set, attach, reset, close, flush, get clients() { return clients.size; }, get beats() { return beats; }, get transcript() { return transcript; } };
}

/** Merge consecutive `tx` deltas for the same item; everything else passes in order. */
export function coalesce(events) {
  const out = [];
  for (const e of events) {
    const last = out[out.length - 1];
    if (e.type === 'tx' && e.data.kind === 'delta' && last && last.type === 'tx' && last.data.kind === 'delta' && last.data.id === e.data.id) {
      last.data = { ...last.data, text: last.data.text + e.data.text };
    } else out.push({ type: e.type, data: e.data });
  }
  return out;
}
