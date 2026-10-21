// A tile's sky (Fleet board): where each star seats its agents around the
// main orb, and the filament to each. The boards draw vega on the four
// quadrants, deneb on its own seats with its idle agent's curve (it leaves
// the main orb sideways, quiet), and altair's one helper up and left. A star
// the boards do not draw working takes the quadrants. The agents and their
// states are the session's own (GET /api/sessions); nothing here invents one.

/** The four quadrant seats (vega's, and the default). */
export const QUADS = [
  { x: '24%', y: '24%', fil: { l: '24%', t: '24%', w: '26%', h: '22%', d: 'M100 100C100 50 0 50 0 0' } },
  { x: '76%', y: '26%', fil: { l: '50%', t: '26%', w: '26%', h: '20%', d: 'M0 100C0 50 100 50 100 0' } },
  { x: '28%', y: '76%', fil: { l: '28%', t: '46%', w: '22%', h: '30%', d: 'M100 0C100 50 0 50 0 100' } },
  { x: '74%', y: '74%', fil: { l: '50%', t: '46%', w: '24%', h: '28%', d: 'M0 0C0 50 100 50 100 100' } },
];

const OWN = {
  deneb: [
    { x: '26%', y: '26%', fil: { l: '26%', t: '26%', w: '24%', h: '20%', d: 'M100 100C100 50 0 50 0 0' } },
    { x: '76%', y: '24%', fil: { l: '50%', t: '24%', w: '26%', h: '22%', d: 'M0 100C0 50 100 50 100 0' } },
    { x: '78%', y: '70%', fil: { l: '50%', t: '46%', w: '28%', h: '24%', d: 'M0 0C0 50 100 50 100 100' } },
    QUADS[2],
  ],
  altair: [
    { x: '30%', y: '26%', fil: { l: '30%', t: '26%', w: '20%', h: '20%', d: 'M100 100C100 50 0 50 0 0' } },
    QUADS[1], QUADS[2], QUADS[3],
  ],
};

/** A star's seats, in the order its agents take them. */
export const seatsFor = (name) => OWN[name] || QUADS;

const r = (n) => Math.round(n * 100) / 100;

/**
 * An idle agent's curve: the seat's own end points, bent to leave the main
 * orb sideways (deneb's board path, `M0 0C40 0 60 100 100 100`).
 */
export function idleCurve(d) {
  const n = String(d).match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
  if (n.length < 8) return d;
  const [sx, sy] = n;
  const [ex, ey] = n.slice(-2);
  return `M${sx} ${sy}C${r(sx + (ex - sx) * 0.4)} ${sy} ${r(sx + (ex - sx) * 0.6)} ${ey} ${ex} ${ey}`;
}

const ACTIVE = new Set(['thinking', 'tool', 'writing']);

/**
 * The filament to one agent: a workflow flows; a known idle agent draws
 * its idle curve, quiet; an observed (terminal) session draws quiet on the
 * plain curve; a working agent flows. An agent with no state gets the plain
 * curve and nothing more.
 */
export function filFor(seat, a = {}, { observing = false } = {}) {
  const { d, ...box } = seat.fil;
  if (a.workflow) return { ...box, d, kind: 'flow' };
  const idle = !observing && a.state === 'idle';
  const quiet = observing || idle;
  return { ...box, d: idle ? idleCurve(d) : d, kind: quiet ? 'quiet' : undefined, flow: !quiet && ACTIVE.has(a.state) };
}
