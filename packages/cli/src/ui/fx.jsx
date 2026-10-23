// The particle layer (fx/): a canvas behind the stage or the heads-down box
// that answers what the session does. Decoration only: aria-hidden, no
// pointer events, and nothing it shows is carried by colour alone (every
// event it marks is also in the transcript, the orbs and the tape). The
// engine loads on demand inside an effect, so a static render draws the
// empty wrapper and never touches the window. Off (Settings > Appearance)
// or a reduced-motion system: no canvas at all.
import { useEffect, useMemo, useRef } from 'react';
import { cx, Seg } from './controls.jsx';
import { createFxDiffer, fxSnapshot } from '../fx/events.js';
import { safely, startFx } from '../fx/host.js';
import { fxActive, useFxLevel, useReducedMotion } from '../fx/pref.js';
import '../styles/fx.css';

/**
 * mode: 'stage' (absolute over the cockpit's stage; nodes: model.js
 * view.nodes) or 'heads' (fixed over the window; target: a selector for the
 * box beside the layer, grid: { rows, cols, bar, tape, prompt }).
 * live: the useEvents store; session: the session it follows (a new one is
 * a baseline, not news); landed: the ledger's landed list (undefined until
 * this session's ledger loads); progress: a number that grows as the phase
 * does (undefined likewise).
 * hushed calms the drift; asking streams the tug; sess: the session's
 * sess-* class, so the drift wears its colour.
 */
export function FxLayer({ mode = 'stage', nodes, target, grid, live, session, landed, progress, hushed = false, asking = false, sess }) {
  const [level] = useFxLevel();
  const reduced = useReducedMotion();
  const on = fxActive(level, reduced);
  const canvas = useRef(null);
  const fx = useRef(null);
  const differ = useRef(null);
  if (!differ.current) differ.current = createFxDiffer();

  const scene = useMemo(
    () => (mode === 'heads' ? { mode, target, grid } : { mode, nodes: nodes || [] }),
    // The grid is rebuilt on every heads-down render; its numbers are what matter.
    [mode, target, nodes, grid?.rows, grid?.cols, grid?.bar?.row, grid?.bar?.head, grid?.tape, grid?.prompt], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const latest = useRef(null);
  latest.current = { scene, state: { level, hushed, asking } };

  useEffect(() => {
    if (!on) return undefined;
    return startFx(fx, {
      load: () => import('../fx/runtime.js'),
      canvas: () => canvas.current,
      first: (e) => { e.setState(latest.current.state); e.setScene(latest.current.scene); },
    });
  }, [on]);

  useEffect(() => { safely(fx, (e) => e.setState({ level, hushed, asking })); }, [level, hushed, asking]);
  useEffect(() => { safely(fx, (e) => e.setScene(scene)); }, [scene]);
  // The sess class sits on this layer's own wrapper, which the engine's watch on <html> never sees: a ledger that
  // names the session after the engine started (or a switch in place) re-reads the colours here.
  useEffect(() => { safely(fx, (e) => e.retheme()); }, [sess]);

  // Diff every store change, on or off, so turning the layer on later starts from now and not from a backlog.
  useEffect(() => {
    if (!live) return;
    const events = differ.current.feed(fxSnapshot(live, { landed, progress }), session);
    // Decoration never takes the screen down: an engine that throws is stopped (safely) and the page goes on.
    if (events.length) safely(fx, (e) => e.emit(events));
  }, [live, session, landed, progress]);

  if (!on) return null;
  return (
    <div className={cx('fx-layer', mode === 'heads' && 'is-heads', hushed && 'is-calm', sess)} aria-hidden="true">
      <canvas ref={canvas} className="fx-canvas" />
    </div>
  );
}

/** Settings > Appearance: particle effects on, subtle or off, kept per browser. */
export function FxSeg() {
  const [level, setLevel] = useFxLevel();
  return (
    <Seg
      label="Particle effects" name="fx" value={level} onChange={setLevel}
      options={[{ value: 'on', label: 'On' }, { value: 'subtle', label: 'Subtle' }, { value: 'off', label: 'Off' }]}
    />
  );
}
