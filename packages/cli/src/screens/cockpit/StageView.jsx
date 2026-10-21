// The right pane: the agent stage (Cockpit boards). Nodes and filaments
// come from model.js; this file only draws them with the design's classes.
import { Basin, CommitPill, Drop, Fil, NodeCap, Orb, ParkMark, PkgNode, River, SNode, StageLabel, Starfield } from '../../ui/index.js';
import { clock } from './model.js';

const PARK_AT = { xl: ['30px', '-46px'], m: ['10px', '-22px'], s: ['6px', '-18px'] };

function Node({ n }) {
  const [pmx, pmy] = PARK_AT[n.size] || PARK_AT.m;
  return (
    <SNode x={`${n.at[0]}%`} y={n.atTray ? 'auto' : `${n.at[1]}%`} capUp={n.capUp} atTray={n.atTray}>
      {n.pkg ? <PkgNode /> : n.junction ? <span className="junction" /> : <Orb state={n.state} size={n.size} main={n.main} />}
      {n.parked ? <ParkMark style={{ position: 'absolute', left: pmx, top: pmy, boxShadow: '0 0 0 2px var(--bg)' }} /> : null}
      <NodeCap label={n.label} tool={n.tool} toolBad={n.bad} style={{ top: n.capUp ? 'auto' : (n.capTop || '30px') }} />
    </SNode>
  );
}

/**
 * view: { nodes, fils, count }. basin: { head, items } (contributor) or
 * null; river: [{ sha, msg, at }] (owner) or null; drop: { sha, msg } or null.
 */
export default function StageView({ view, basin, river, riverCap, drop }) {
  return (
    <div className="stage">
      <Starfield />
      <StageLabel title="Agent stage" cap={view.count} />
      {view.fils.map((f, i) => (
        <Fil key={f.key || i} l={f.l} t={f.t} w={f.w} h={f.h} d={f.d} flow={f.flow} kind={f.tug ? 'tug' : f.dash ? 'flow' : f.quiet ? 'quiet' : undefined} className={f.dash && f.quiet ? 'is-quiet' : undefined} />
      ))}
      {view.nodes.map((n) => <Node key={n.key} n={n} />)}
      {drop ? (
        <Drop x="50%" y="63%">
          <CommitPill sha={drop.sha} msg={drop.msg} style={{ boxShadow: '0 0 24px -6px color-mix(in oklab, var(--st-done) 60%, transparent)' }} />
        </Drop>
      ) : null}
      {basin ? <Basin head={basin.head} items={basin.items} /> : null}
      {river ? (
        <River label="Shipped to main" cap={riverCap}>
          {river.map((r) => <CommitPill key={r.sha} sha={r.sha} msg={r.msg} when={clock(r.at)} />)}
        </River>
      ) : null}
    </div>
  );
}
