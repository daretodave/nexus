// The heads-down view as rows of a 120-column canvas (HeadsDown board).
// Pure: every value comes from the inputs. Where the server does not report
// a value yet (the session ledger, the inbox, the cloud loop), the row keeps
// its label and shows a dim dash, never an invented number.
import { row, framed, split, rule, fit, cut, len, WIDTH } from './tuiCanvas.jsx';

const MID = 67; // the column of the pane divider (┬ ┴ │)
const L = 3; // left content
const LV = 14; // left values, after an 11-column label
const R = 70; // right content
const RV = 81; // right values
const RIGHT_END = WIDTH - 2; // last content column of the right pane
const DASH = '–';

export const PHASES = [
  { id: 'questions-start', label: 'Questions' },
  { id: 'working', label: 'Working' },
  { id: 'questions-end', label: 'Questions' },
  { id: 'package', label: 'Package' },
];
const PHASE_COL = [3, 19, 85, 101];
const PHASE_W = [14, 64, 14, 16];

const pad2 = (n) => String(n).padStart(2, '0');
export const clock = (t) => { const d = new Date(t); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${pad2(s % 60)}`; };
const hm = (ms) => { const m = Math.max(0, Math.floor(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
const ts = (v) => (v == null ? null : typeof v === 'number' ? v : Date.parse(v) || null);
/** A chunk step (the beats' chunk phases, or the ledger's step) as the board's word. */
const stepWord = (s) => ({ claim: 'claimed', build: 'building', gate: 'at the gate', archive: 'closing' }[s || 'build'] || s);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SPAWN = new Set(['Task', 'Agent']);

/** An agent node from the stage reducer -> glyph, class and word (the board's tree). */
export function agentLook(a, hasKids) {
  if (hasKids && a.state === 'running') return { g: '◎', cls: 'k', word: 'workflow' };
  if (a.state === 'waiting') return { g: '?', cls: 'ask', word: 'asking' };
  if (a.state === 'done') return { g: '✓', cls: 'ok', word: 'done' };
  if (a.state === 'failed') return { g: '✗', cls: 'no', word: 'failed' };
  if (a.state === 'idle') return { g: '○', cls: 'id', word: 'idle' };
  if (a.tool && WRITE_TOOLS.has(a.tool)) return { g: '◆', cls: 'wr', word: 'writing' };
  if (a.tool) return { g: '◜', cls: 'tl', word: 'tool' };
  return { g: '◌', cls: 'th', word: 'thinking' };
}

const agentName = (stage, id) => {
  if (!id || id === 'main') return 'main';
  const a = stage.agents?.[id];
  return (a?.label || 'agent').split(/\s+/)[0].toLowerCase();
};

/** The last thing an agent did, from the transcript: "Bash npm test -- sync". */
function lastTool(transcript, id) {
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const t = transcript[i];
    if (t.kind === 'tool' && (t.agent || 'main') === id) return `${t.name}${t.summary ? ` ${t.summary}` : ''}`;
  }
  return '';
}

/** One tape event from a transcript item: [who, glyph, glyphCls, segs]. */
function tapeEvent(t, stage) {
  const who = t.kind === 'user' ? 'you' : agentName(stage, t.agent);
  switch (t.kind) {
    case 'tool': {
      const look = WRITE_TOOLS.has(t.name) ? ['◆', 'wr'] : SPAWN.has(t.name) ? ['↳', 'th'] : ['◜', 'tl'];
      return [who, look[0], look[1], [['k', ` ${t.name} `], ['', t.summary || ''], SPAWN.has(t.name) ? ['d', ' · delegated'] : null]];
    }
    case 'tool-error': return [who, '✗', 'no', [['k', ` ${t.text}`]]];
    case 'error': return [who, '✗', 'no', [['k', ` ${t.text}`]]];
    case 'user': return [who, '›', 'v', [['', ` ${t.text}`]]];
    case 'pin': return [who, '■', 'v', [['v', ' pinned '], ['', t.text]]];
    case 'parked': return [who, '?', 'ask', [['ask', ' parked '], ['', t.q || t.text || ''], t.assumed ? ['d', ' · default taken: '] : null, t.assumed ? ['k', t.assumed] : null]];
    case 'result': return [who, t.ok ? '✓' : '✗', t.ok ? 'ok' : 'no', [['k', t.ok ? ' run finished' : ` ${t.text || 'run failed'}`]]];
    case 'system': return [who, '·', 'd', [['d', ` ${t.text}`]]];
    default: return [who, '◌', 'th', [['', ` ${String(t.text || '').replace(/\s+/g, ' ')}`]]];
  }
}

/**
 * Build every row of the view.
 * @param {object} m
 * @param {object|null} m.ledger   GET /api/sessions/:id, or null while missing
 * @param {object} m.info          /api/state info { name, branch, owner }
 * @param {object} m.live          the SSE store { stage, transcript, status }
 * @param {Array}  m.claims        claim rows for this session
 * @param {object} m.waiting       { count, who } questions waiting elsewhere
 * @param {object|null} m.cloud    GET /api/cloud, or null
 * @param {string|null} m.budget   the Working phase length ("3–4h")
 * @param {object} m.titles        chunk id -> title (the plan, when served)
 * @param {number} m.now
 * @param {object} m.ui            { draft, focused, paused, pausedAt, note, links, onPause }
 */
export function headsRows(m) {
  const { ledger, info = {}, live, claims = [], waiting = {}, cloud, budget, titles = {}, now, ui } = m;
  const L0 = ledger || {};
  const stage = live?.stage || { agents: {}, order: [], chunks: {}, chunkOrder: [] };
  const transcript = live?.transcript || [];
  const name = L0.name || 'session';
  const mode = info.owner ? 'owner' : 'contributor';
  const git = L0.git || {};
  const chunk = L0.chunk || (stage.current ? { id: stage.current } : null);
  const chunkTitle = chunk ? (chunk.title || titles[chunk.id] || '') : '';
  const rows = [];

  // ╭─ nexus heads-down ──── vega · tidepool · contributor · 03:18 ─╮
  {
    const r = row();
    r.fill(0, WIDTH, '─', 'b');
    r.seq(0, [['b', '╭─ '], ['a', 'nexus'], ['k', ' heads-down'], ['b', ' ']]);
    const right = [['a', name], ['d', ' · '], ['k', info.name || 'repo'], ['d', ' · '], ['k', mode], ['d', ' · '], ['h', clock(now)], ['b', ' ─╮']];
    const w = right.reduce((n, s) => n + len(s[1]), 0);
    r.put(WIDTH - w - 1, ' ', 'b');
    r.seq(WIDTH - w, right);
    rows.push(r);
  }

  // │  nexus/vega-2  ↑7 ↓0  ● uncommitted  ✓ #148 in review  3 claims   ◂ sirius has 4 questions waiting · i to answer  │
  {
    const r = framed();
    const dirty = (git.dirty || 0) + (git.staged || 0);
    const pr = git.pr;
    let c = r.seq(L, [['k', `${L0.branch || git.branch || info.branch || DASH}  `]]);
    c = git.ahead != null ? r.seq(c, [['a', `↑${git.ahead} `], ['d', `↓${git.behind ?? 0}  `]]) : c;
    if (ledger && git.dirty != null) c = r.seq(c, dirty ? [['wr', '●'], ['d', ' uncommitted  ']] : [['ok', '✓'], ['d', ' clean  ']]);
    if (pr && pr.num) c = r.seq(c, [[pr.state === 'merged' || pr.state === 'review' || pr.state === 'open' ? 'ok' : 'd', '✓'], ['k', ` #${pr.num} ${pr.state === 'open' || pr.state === 'review' ? 'in review' : pr.state}  `]]);
    r.seq(c, [['d', `${plural(claims.length, 'claim')}      `]]);
    if (waiting.count) {
      const link = { to: ui.links.inbox, label: `${waiting.who ? `${waiting.who} has` : ''} ${plural(waiting.count, 'question')} waiting, open the inbox`.trim() };
      const msg = `◂ ${waiting.who ? `${waiting.who} has ` : ''}${plural(waiting.count, 'question')} waiting`;
      const segs = [['ask-b', msg, link, LEAN], ['d', ' · '], ['h', 'i'], ['ask', ' to answer']];
      const w = segs.reduce((n, s) => n + len(s[1]), 0);
      r.seq(WIDTH - 3 - w, segs);
    } else {
      const segs = [['d', 'nothing waiting on you']];
      r.seq(WIDTH - 3 - len(segs[0][1]), segs);
    }
    rows.push(r);
  }
  rows.push(framed());

  // the phase track: labels, stats, bar, markers
  const phaseIdx = Math.max(0, PHASES.findIndex((p) => p.id === L0.phase));
  const known = !!L0.phase;
  {
    const r = framed();
    PHASES.forEach((p, i) => {
      const st = !known ? 'future' : i < phaseIdx ? 'done' : i === phaseIdx ? 'cur' : 'future';
      const g = st === 'done' ? ['ok', '✓'] : st === 'cur' ? ['a', '●'] : ['d', '○'];
      r.seq(PHASE_COL[i], [g, [st === 'cur' ? 'h' : 'k', ` ${p.label}`]]);
    });
    rows.push(r);
  }
  {
    const r = framed();
    const settled = L0.questions?.settled;
    r.put(PHASE_COL[0], settled != null ? `${settled} settled` : DASH, 'd');
    const started = ts(L0.phaseStartedAt || L0.startedAt);
    const closed = (stage.chunkOrder || []).filter((id) => stage.chunks[id]?.stage === 'archive').length;
    const segs = [];
    if (started) segs.push(['h', `${hm(now - started)}${budget ? ` of ${budget}` : ''}`]);
    else segs.push(['d', DASH]);
    segs.push(['k', ` · ${plural(L0.closed ?? closed, 'chunk')} closed`]);
    if (chunk) segs.push(['k', ` · ${chunk.id} ${stepWord(chunk.step || stage.chunks?.[chunk.id]?.stage)}`]);
    r.seq(PHASE_COL[1], segs.map((s) => [s[0], s[1]]));
    const parkedN = L0.parked?.length;
    r.put(PHASE_COL[2], parkedN != null ? `${parkedN} parked` : DASH, parkedN ? 'ask' : 'd');
    const pkg = L0.package?.stacksOn ? `stacks on #${L0.package.stacksOn}` : info.owner ? 'lands on main' : 'one PR';
    r.put(PHASE_COL[3], pkg, 'd');
    rows.push(r);
  }
  const workPct = (() => {
    const started = ts(L0.phaseStartedAt || L0.startedAt);
    const hi = L0.budgetMs;
    if (!started || !hi) return null;
    return Math.min(1, (now - started) / hi);
  })();
  {
    const r = framed();
    PHASES.forEach((p, i) => {
      const col = PHASE_COL[i];
      const w = PHASE_W[i];
      const st = !known ? 'future' : i < phaseIdx ? 'done' : i === phaseIdx ? 'cur' : 'future';
      if (st === 'done') r.fill(col, col + w, '━', 'ok');
      else if (st === 'cur') {
        const pct = i === 1 ? workPct : L0.questions?.total ? (L0.questions.settled || 0) / L0.questions.total : null;
        const head = Math.min(w - 1, Math.round((pct ?? 0) * (w - 1)));
        r.fill(col, col + w, '┄', 'b');
        r.fill(col, col + head, '━', 'a');
        r.put(col + head, '●', 'a');
      } else r.fill(col, col + w, '┄', 'b');
    });
    rows.push(r);
  }
  {
    const r = framed();
    const start = ts(L0.phaseStartedAt || L0.startedAt);
    if (start && L0.budgetMs) {
      for (const mk of L0.marks || []) {
        const at = ts(mk.at);
        if (!at) continue;
        const col = PHASE_COL[1] + Math.round(Math.min(1, Math.max(0, (at - start) / L0.budgetMs)) * (PHASE_W[1] - 1));
        r.put(col, mk.kind === 'closed' ? '✓' : '?', mk.kind === 'closed' ? 'ok' : 'ask');
      }
    }
    r.seq(84, [['ask', '?'], ['d', ' parked  '], ['ok', '✓'], ['d', ' chunk closed']]);
    rows.push(r);
  }

  rows.push(rule('├', '┤', MID, '┬'));

  // the two panes: 21 rows
  const body = Array.from({ length: 21 }, () => split(MID));
  const at = (i) => body[i];

  // left: now, time, acceptance, pinned, spec, agents
  at(0).seq(L, [['k', 'now        '], ...(chunk ? [['h', `${chunk.id}  `], ['h', cut(chunkTitle || DASH, MID - LV - len(chunk.id) - 3)]] : [['d', 'no chunk yet']])]);
  if (chunk) {
    const segs = [['tl', `◑ ${stepWord(chunk.step || stage.chunks?.[chunk.id]?.stage)}`]];
    if (chunk.size) segs.push(['d', ' · '], ['k', `size ${chunk.size}`]);
    if (chunk.startedAt) segs.push(['d', ' · '], ['d', `started ${clock(ts(chunk.startedAt))}`]);
    at(1).seq(LV, segs);
  }
  {
    const r = at(2);
    r.put(L, 'time       ', 'k');
    const started = chunk ? ts(chunk.startedAt) : null;
    const est = chunk?.estimate; // [lo, hi] minutes
    if (started) {
      const el = now - started;
      const lo = est?.[0] || 40;
      const cells = Math.min(33, Math.round((el / 60000) * (24 / lo)));
      r.fill(LV, LV + 24, '░', 'b');
      if (est) { r.put(LV + 24, '┊', 'k'); r.fill(LV + 25, LV + 32, '▒', 'd'); r.put(LV + 32, '┊', 'k'); }
      r.fill(LV, LV + cells, '█', 'a');
      r.seq(LV + 33, [['h', `  ${mmss(el)}`], est ? ['k', ` of ${est[0]}–${est[1]}m`] : null]);
    } else r.put(LV, DASH, 'd');
  }
  {
    const acc = chunk?.acceptance || [];
    at(4).put(L, 'acceptance ', 'k');
    if (!acc.length) at(4).put(LV, DASH, 'd');
    acc.slice(0, 3).forEach((a, i) => {
      const g = a.state === 'met' || a.met === true ? ['ok', '✓'] : a.state === 'working' ? ['tl', '◑'] : ['d', '○'];
      at(4 + i).seq(LV, [g, [g[0] === 'd' ? 'd' : '', ` ${cut(a.text || a.id || '', MID - LV - 4)}`]]);
    });
  }
  {
    const pin = L0.pinned;
    at(8).put(L, 'pinned     ', 'v');
    if (pin && pin.text) {
      const tail = `   ${pin.by || 'you'} · ${clock(ts(pin.at) || now)}`;
      at(8).seq(LV, [['k', cut(pin.text, MID - LV - len(tail) - 2)], ['d', tail]]);
    } else at(8).put(LV, 'nothing pinned', 'd');
    at(9).seq(L, [['k', 'spec       '], ['d', cut(L0.spec || DASH, MID - LV - 2)]]);
  }
  {
    const ids = (stage.order || []).filter((id) => stage.agents[id]);
    const kids = (id) => ids.filter((x) => stage.agents[x].parent === id);
    const working = ids.filter((id) => ['running', 'waiting'].includes(stage.agents[id].state)).length;
    at(11).seq(L, [['k', 'agents     '], ['h', String(ids.length)], ['d', ` · ${working} working`]]);
    const lines = [];
    const detail = (id, a, hasKids) => (hasKids ? plural(kids(id).length, 'agent') : a.state === 'waiting' ? 'waiting on you' : lastTool(transcript, id) || (a.state === 'done' ? '' : DASH));
    if (stage.agents.main) {
      const a = stage.agents.main;
      const look = agentLook(a, false);
      lines.push([[look.cls, look.g], ['h', fit(` main${chunk ? ` · ${chunk.id}` : ''}`, 15)], [look.cls, fit(look.word, 11)], ['k', detail('main', a, false)]]);
      const top = kids('main');
      top.forEach((id, i) => {
        const a2 = stage.agents[id];
        const sub = kids(id);
        const lk = agentLook(a2, sub.length > 0);
        const last = i === top.length - 1;
        lines.push([['b', last ? '└─ ' : '├─ '], [lk.cls, lk.g], ['', fit(` ${agentName(stage, id)}`, 12)], [lk.cls, fit(lk.word, 11)], [lk.cls === 'no' ? 'k' : 'd', detail(id, a2, sub.length > 0)]]);
        sub.forEach((sid, j) => {
          const a3 = stage.agents[sid];
          const lk3 = agentLook(a3, false);
          lines.push([['b', `${last ? '   ' : '│  '}${j === sub.length - 1 ? '└─ ' : '├─ '}`], [lk3.cls, lk3.g], ['', fit(` ${agentName(stage, sid)}`, 9)], [lk3.cls, fit(lk3.word, 11)], [lk3.cls === 'no' ? 'k' : 'd', detail(sid, a3, false)]]);
        });
      });
    } else {
      lines.push([['d', 'no agents running yet']]);
    }
    const room = 9;
    const shown = lines.length > room ? [...lines.slice(0, room - 1), [['b', '└─ '], ['d', `${lines.length - room + 1} more in the cockpit`]]] : lines;
    shown.forEach((segs, i) => {
      const r = at(12 + i);
      let c = L;
      for (const s of segs) {
        const room2 = MID - 1 - c;
        if (room2 <= 0) break;
        c = r.put(c, cut(s[1], room2), s[0]);
      }
    });
  }

  // right: queue, parked, context
  {
    const queue = L0.queue || (stage.chunkOrder || []).map((id) => ({ id, title: titles[id], state: stage.chunks[id]?.stage === 'archive' ? 'closed' : id === stage.current ? 'building' : 'claimed' }));
    const held = claims.length;
    at(0).seq(R, [['k', 'queue      '], ['k', plural(queue.length, 'chunk')], ['d', ` · ${name} holds ${held}`]]);
    if (!queue.length) at(1).put(R, 'nothing claimed yet', 'd');
    let nextSeen = false;
    queue.slice(0, 5).forEach((q, i) => {
      const r = at(1 + i);
      const isB = q.state === 'building' || q.id === chunk?.id;
      const isC = q.state === 'closed' || q.state === 'settled';
      const g = isC ? ['ok', '●'] : isB ? ['tl', '◑'] : ['k', '◔'];
      const idc = isB ? 'h' : 'k';
      r.seq(R, [g, [idc, ` ${fit(q.id, 6)}`], [isB ? 'h' : '', fit(q.title || DASH, 26)], ['d', fit(q.size || '', 4)]]);
      let st;
      if (isC) st = [['ok', '✓'], ['d', ` ${q.took || ''}`]];
      else if (isB) st = [['h', chunk?.startedAt ? mmss(now - ts(chunk.startedAt)) : 'now']];
      else { st = [[nextSeen ? 'd' : 'k', nextSeen ? 'then' : 'next']]; nextSeen = true; }
      r.seq(R + 38, st.map((s) => [s[0], cut(s[1], 10)]));
    });
  }
  {
    const parked = L0.parked || [];
    at(7).seq(R, [['ask', 'parked     '], ['h', L0.parked ? String(parked.length) : DASH], ['d', ' · reviewed when Working ends']]);
    parked.slice(-3).forEach((p, i) => {
      const b = 8 + i * 3;
      at(b).seq(R, [['ask', '?'], ['d', ` ${clock(ts(p.at) || now)}  `], ['k', p.who || 'main'], ['d', ` · ${p.chunk || ''}`]]);
      at(b + 1).put(RV - 2, cut(p.q || p.question || '', RIGHT_END - RV + 2), '');
      at(b + 2).seq(RV - 2, [['d', 'assumed  '], ['k', cut(p.assumed || p.default || DASH, RIGHT_END - RV - 7)]]);
    });
  }
  {
    const cx = L0.context;
    if (cx && cx.room != null) {
      at(18).seq(R, [['k', 'context    '], ['h', `${Math.round(cx.room)}%`], ['d', ` room left · compacts at ${cx.compactAt ?? 10}%`]]);
      const total = 46;
      const n = (p) => Math.round(((p || 0) / 100) * total);
      let c = R;
      c = at(19).put(c, '▓'.repeat(n(cx.pinned)), 'v');
      c = at(19).put(c, '▓'.repeat(n(cx.spec)), 'a');
      c = at(19).put(c, '▓'.repeat(n(cx.conversation)), 'k');
      at(19).put(c, '░'.repeat(Math.max(0, R + total - c)), 'b');
    } else {
      at(18).seq(R, [['k', 'context    '], ['d', DASH]]);
      at(19).put(R, '░'.repeat(46), 'b');
    }
    at(20).seq(R, [['v', '■'], ['d', ' pinned  '], ['a', '■'], ['d', ' spec  '], ['k', '■'], ['d', ' conversation  '], ['b', '░'], ['d', ' room']]);
  }
  rows.push(...body);

  rows.push(rule('├', '┤', MID, '┴'));

  // the tape: the last 7 events
  {
    const h = framed();
    h.seq(L, [['k', 'tape'], ['d', '       last 7 events · the full log lives in the cockpit']]);
    rows.push(h);
    const events = transcript.map((t, i) => ({ t, i })).filter(({ t }) => t.kind !== 'delta' && !(t.kind === 'text' && !String(t.text || '').trim()));
    const last = events.slice(-7);
    for (let k = 0; k < 7; k += 1) {
      const r = framed();
      const ev = last[k];
      if (ev) {
        const [who, g, gc, segs] = tapeEvent(ev.t, stage);
        const when = ev.t.at || m.seenAt?.[ev.i];
        let c = r.seq(L, [['d', `${when ? clock(when) : '--:--'}  `], ['k', fit(who, 9)], [gc, g]]);
        for (const s of segs) {
          if (!s) continue;
          const room = WIDTH - 3 - c;
          if (room <= 0) break;
          c = r.put(c, cut(String(s[1]).replace(/\s+/g, ' '), room), s[0]);
        }
        r.key = `t${ev.i}`;
        r.isNew = k === last.length - 1 && m.seenAt?.[ev.i] != null;
      } else if (k === 0 && !last.length) r.put(L, 'nothing yet: events arrive as the session works', 'd');
      rows.push(r);
    }
  }
  rows.push(framed());

  // the prompt
  {
    const r = framed();
    let c = r.seq(L, [['a', `${name} ›`], ['', ' ']]);
    if (ui.draft) c = r.put(c, cut(ui.draft, WIDTH - 6 - c), '');
    c = r.put(c, '▌', 'a', null, BLINK);
    if (ui.note) r.put(c + 2, cut(ui.note, WIDTH - 4 - c), 'ask');
    else if (!ui.draft) r.put(c + 2, `type to steer ${name} · / for commands · anything it asks parks for review`, 'd');
    rows.push(r);
  }

  // ╰─ c cockpit ─ i inbox 4 ─ … ─╯
  {
    const r = row();
    r.fill(0, WIDTH, '─', 'b');
    const lk = ui.links;
    const pause = { onClick: ui.onPause, label: 'Pause after this step, or resume' };
    const items = [
      [['h', 'c', lk.cockpitW], ['k', ' cockpit', lk.cockpitW]],
      [['h', 'i', lk.inboxW], ['k', ` inbox${waiting.total ? ` ${waiting.total}` : ''}`, lk.inboxW]],
      [['h', 'b', lk.planW], ['k', ' plan', lk.planW]],
      [['h', 'f', lk.fleetW], ['k', ' fleet', lk.fleetW]],
      ui.paused
        ? [['h', 'p', pause], ['ask', ` resume · paused ${ui.pausedAt ? clock(ui.pausedAt) : ''}`.trimEnd(), pause]]
        : [['h', 'p', pause], ['k', ' pause after this step', pause]],
      [['h', '/'], ['k', ' command']],
      [['h', 'esc', lk.cockpitW], ['k', ' leave', lk.cockpitW]],
      [['k', 'cloud loop'], ['d', cloud ? (cloud.paused ? ' paused' : cloud.next ? ` next ${clock(ts(cloud.next) || cloud.next)}` : ` ${DASH}`) : ` ${DASH}`]],
    ];
    let c = r.put(0, '╰─ ', 'b');
    items.forEach((segs, i) => {
      if (i) c = r.put(c, ' ─ ', 'b');
      c = r.seq(c, segs);
    });
    r.put(c, ' ', 'b');
    r.put(WIDTH - 1, '╯', 'b');
    rows.push(r);
  }
  return rows;
}

const LEAN = { display: 'inline-block', animation: 'nx-lean 3.2s var(--ease-breathe) infinite' };
const BLINK = { animation: 'nx-blink 1.1s steps(1, end) infinite' };
