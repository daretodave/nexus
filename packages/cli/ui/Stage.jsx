// The agent stage: the session as a central orb, subagents and workflow
// fan-out as child nodes on filaments, an open question as a tug line
// pulling toward the prompt pane. It draws only from the reduced beat
// state and only with colours from CSS tokens. Reduced motion: still frames.
import { useEffect, useRef } from 'react';
import { MAIN, LANES } from '../shared/beats.mjs';

const GLYPH = { running: 'o', waiting: '?', done: '+', failed: 'x' };

function tokens(el) {
  const cs = getComputedStyle(el);
  const v = (n) => cs.getPropertyValue(n).trim();
  return {
    bg: v('--stage-bg'), filament: v('--stage-filament'), orb: v('--stage-orb'), glow: v('--stage-orb-glow'), label: v('--stage-label'), tug: v('--stage-tug'),
    font: v('--font-mono'),
    lanes: Array.from({ length: LANES }, (_, i) => v(`--stage-agent-${i + 1}`)),
    states: { running: v('--state-running'), waiting: v('--state-waiting'), done: v('--state-done'), failed: v('--state-failed') },
  };
}

function layout(stage, w, h) {
  const cx = w / 2;
  const cy = h * 0.44;
  const pos = { [MAIN]: { x: cx, y: cy } };
  const kids = stage.order.filter((id) => id !== MAIN);
  const byParent = {};
  for (const id of kids) (byParent[stage.agents[id].parent || MAIN] ||= []).push(id);
  const place = (parent, depth) => {
    const list = byParent[parent] || [];
    const p = pos[parent];
    const radius = Math.min(w, h) * (depth === 1 ? 0.3 : 0.14);
    list.forEach((id, i) => {
      const a = depth === 1 ? (-Math.PI / 2) + (i * 2 * Math.PI) / Math.max(list.length, 1) : Math.atan2(p.y - cy, p.x - cx) + (i - (list.length - 1) / 2) * 0.5;
      pos[id] = { x: p.x + Math.cos(a) * radius, y: p.y + Math.sin(a) * radius };
      place(id, depth + 1);
    });
  };
  place(MAIN, 1);
  return pos;
}

export default function Stage({ stage }) {
  const canvas = useRef(null);
  const latest = useRef(stage);
  latest.current = stage;
  const tugAt = useRef({ n: 0, t: 0 });

  useEffect(() => {
    const el = canvas.current;
    const ctx = el.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let tk = tokens(el);
    const themeWatch = new MutationObserver(() => { tk = tokens(el); });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const draw = (now) => {
      const s = latest.current;
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) { el.width = Math.round(w * dpr); el.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const still = reduced.matches;
      const breathe = still ? 0 : Math.sin(now / 700) * 0.5 + 0.5;
      const pos = layout(s, w, h);

      // filaments
      for (const id of s.order) {
        const a = s.agents[id];
        if (!a.parent || !pos[a.parent]) continue;
        const p = pos[a.parent];
        const q = pos[id];
        ctx.strokeStyle = tk.filament;
        ctx.lineWidth = a.state === 'running' ? 1.6 : 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.quadraticCurveTo((p.x + q.x) / 2 + (q.y - p.y) * 0.12, (p.y + q.y) / 2 - (q.x - p.x) * 0.12, q.x, q.y);
        ctx.stroke();
      }

      // open asks: a tug line from the node toward the prompt pane (left edge)
      for (const ask of Object.values(s.asks)) {
        if (!ask.open || !pos[ask.agent]) continue;
        const p = pos[ask.agent];
        ctx.strokeStyle = tk.tug;
        ctx.setLineDash([4, 6]);
        ctx.lineDashOffset = still ? 0 : -now / 40;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(0, p.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // nodes
      for (const id of s.order) {
        const a = s.agents[id];
        const p = pos[id];
        if (!p) continue;
        const isMain = id === MAIN;
        const color = isMain ? tk.orb : tk.lanes[(a.slot - 1 + LANES) % LANES];
        const live = a.state === 'running' || a.state === 'waiting';
        const r = isMain ? 26 + (live ? breathe * 4 : 0) : 10 + (live ? breathe * 2 : 0);
        if (live) {
          const g = ctx.createRadialGradient(p.x, p.y, r * 0.4, p.x, p.y, r * 2.4);
          g.addColorStop(0, tk.glow);
          g.addColorStop(1, 'transparent');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = a.state === 'done' ? 0.55 : 1;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = tk.states[a.state] || color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = tk.label;
        ctx.font = `12px ${tk.font}`;
        ctx.textAlign = 'center';
        const label = `${GLYPH[a.state] || ''} ${a.label || (isMain ? 'session' : 'agent')}`.trim();
        ctx.fillText(label.length > 34 ? `${label.slice(0, 33)}...` : label, p.x, p.y + r + 16);
        if (a.tool && a.state === 'running') {
          ctx.fillStyle = tk.states.running;
          ctx.fillText(a.tool, p.x, p.y + r + 30);
        }
      }

      // current chunk under the orb
      if (s.current && s.chunks[s.current]) {
        const c = s.chunks[s.current];
        ctx.fillStyle = tk.label;
        ctx.font = `13px ${tk.font}`;
        ctx.textAlign = 'center';
        ctx.fillText(`chunk ${c.id} · ${c.stage}`, w / 2, 24);
      }

      // loops: a strip along the bottom
      const loops = s.loopOrder.slice(-6);
      ctx.textAlign = 'left';
      ctx.font = `11px ${tk.font}`;
      loops.forEach((id, i) => {
        const l = s.loops[id];
        const color = l.status === 'conclude' ? (l.conclusion === 'success' ? tk.states.done : tk.states.failed) : tk.states.running;
        ctx.fillStyle = color;
        ctx.fillText(`[${l.status === 'conclude' ? l.conclusion : l.status}] ${l.name || id}`, 12, h - 40 - i * 15);
      });

      // owner tug: a pulse travelling from the left edge into the orb
      if (s.lastTug && s.lastTug.n !== tugAt.current.n) tugAt.current = { n: s.lastTug.n, t: now };
      const age = now - tugAt.current.t;
      if (tugAt.current.n && age < 900 && !still && pos[MAIN]) {
        const k = age / 900;
        ctx.fillStyle = tk.tug;
        ctx.beginPath();
        ctx.arc(pos[MAIN].x * k, pos[MAIN].y, 5 * (1 - k) + 2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!s.order.length) {
        ctx.fillStyle = tk.label;
        ctx.globalAlpha = 0.6;
        ctx.font = `13px ${tk.font}`;
        ctx.textAlign = 'center';
        ctx.fillText('idle: send a prompt and the agents appear here', w / 2, h / 2);
        ctx.globalAlpha = 1;
      }
    };

    const loop = (now) => {
      draw(now);
      raf = reduced.matches ? 0 : requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(() => { if (reduced.matches) draw(performance.now()); });
    ro.observe(el);
    const onMotion = () => { if (!reduced.matches && !raf) raf = requestAnimationFrame(loop); };
    reduced.addEventListener('change', onMotion);
    el.redraw = () => { if (reduced.matches) draw(performance.now()); };
    return () => { cancelAnimationFrame(raf); ro.disconnect(); themeWatch.disconnect(); reduced.removeEventListener('change', onMotion); };
  }, []);

  // still frames under reduced motion: redraw on every state change
  useEffect(() => { canvas.current?.redraw?.(); }, [stage]);

  return <canvas ref={canvas} role="img" aria-label={describe(stage)} />;
}

function describe(s) {
  const kids = s.order.filter((id) => id !== MAIN).map((id) => s.agents[id]);
  const running = kids.filter((a) => a.state === 'running').length;
  return `Agent stage: session ${s.agents[MAIN]?.state || 'idle'}, ${kids.length} subagents (${running} running)${s.current ? `, chunk ${s.current}` : ''}.`;
}
