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
import { fxActive, useFxLevel, useReducedMotion } from '../fx/pref.js';
import '../styles/fx.css';

/** Run one call on the engine; one that throws is stopped, and the page goes on without particles. */
function safely(ref, call) {
  if (!ref.current) return;
  try { call(ref.current); } catch {
    try { ref.current.destroy(); } catch { /* already broken: let it go */ }
    ref.current = null;
  }
}

/**
 * mode: 'stage' (absolute over the cockpit's stage; nodes: model.js
 * view.nodes) or 'heads' (fixed over the window; target: a selector for the
 * box beside the layer, grid: { rows, cols, bar, tape, prompt }).
 * live: the useEvents store; landed: the ledger's landed list (undefined
 * until it loads); progress: a number that grows as the phase does.
 * hushed calms the drift; asking streams the tug; sess: the session's
 * sess-* class, so the drift wears its colour.
 */
export function FxLayer({ mode = 'stage', nodes, target, grid, live, landed, progress, hushed = false, asking = false, sess }) {
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
    let gone = false;
    let inst = null;
    import('../fx/runtime.js').then(({ createFx }) => {
      if (gone || !canvas.current) return;
      inst = createFx(canvas.current);
      fx.current = inst;
      safely(fx, (e) => { e.setState(latest.current.state); e.setScene(latest.current.scene); });
    }).catch(() => { /* no engine (an offline chunk): the page simply has no particles */ });
    return () => { gone = true; if (fx.current === inst) safely(fx, (e) => e.destroy()); fx.current = null; };
  }, [on]);

  useEffect(() => { safely(fx, (e) => e.setState({ level, hushed, asking })); }, [level, hushed, asking]);
  useEffect(() => { safely(fx, (e) => e.setScene(scene)); }, [scene]);

  // Diff every store change, on or off, so turning the layer on later starts from now and not from a backlog.
  useEffect(() => {
    if (!live) return;
    const events = differ.current.feed(fxSnapshot(live, { landed, progress }));
    // Decoration never takes the screen down: an engine that throws is stopped (safely) and the page goes on.
    if (events.length) safely(fx, (e) => e.emit(events));
  }, [live, landed, progress]);

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
