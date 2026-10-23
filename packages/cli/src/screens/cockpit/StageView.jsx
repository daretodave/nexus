// The right pane: the agent stage (Cockpit boards). Nodes and filaments
// come from model.js; this file only draws them with the design's classes.
import { Basin, CommitPill, Drop, Fil, FxLayer, Icon, NodeCap, Orb, ParkMark, PkgNode, River, SessTag, SNode, StageLabel, Starfield, cx } from '../../ui/index.js';
import { clock } from './model.js';
import Forming from './Forming.jsx';
import '../../styles/stage-tugs.css';

// While the worktree forms the stage has no orbs of its own: the drift alone.
const NO_NODES = [];

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

/** One oversight mark: the state's orb and word, the age, the session's star tag, the words. */
function Mark({ m, word, cls }) {
  return (
    <div className={cx('tug-mark', cls)} title={m.sub || undefined}>
      <Orb state={m.orb} size="xs" />
      <span className="tm-word">{word}</span>
      {m.age ? <span className="tm-age">{m.age}</span> : null}
      {m.session ? <SessTag session={m.session} /> : null}
      {m.takenBy ? <><Icon name="arrowRight" size={12} style={{ color: 'var(--text-3)' }} /><SessTag session={m.takenBy} /></> : null}
      {m.text ? <span className="tm-text">{m.text}</span> : null}
    </div>
  );
}

/** The marks at the inbox end of the tug paths: open questions above, tugs nearest their lines. */
function Marks({ marks }) {
  if (!marks || (!marks.tugs.length && !marks.questions.length)) return null;
  return (
    <div className={cx('tug-marks', marks.lifted && 'is-lifted')} role="list" aria-label="Tugs and open questions">
      {marks.questions.map((q) => <div role="listitem" key={q.key}><Mark m={q} word={q.word} cls="is-question" /></div>)}
      {marks.tugs.map((t) => <div role="listitem" key={t.key}><Mark m={t} word={`${t.kind} · ${t.word}`} cls={`is-${t.state}`} /></div>)}
    </div>
  );
}

/**
 * view: { nodes, fils, count }. basin: { head, items } (contributor) or
 * null; river: [{ sha, msg, at }] (owner) or null; drop: { sha, msg } or null.
 * marks: { tugs, questions, lifted } from cockpit/tugs.js, or null.
 * forming: { form, now, onRetry, retrying } while the session's worktree forms (Forming.jsx): the stage shows only that.
 * fx: { live, landed, hushed, asking, sess } for the particle layer (ui/fx.jsx), or none for a stage without one.
 */
export default function StageView({ view, basin, river, riverCap, drop, marks, forming, fx }) {
  if (forming?.form && forming.form.state !== 'ready') {
    return (
      <div className="stage">
        <Starfield />
        {fx ? <FxLayer {...fx} nodes={NO_NODES} /> : null}
        <StageLabel title="Agent stage" cap={forming.form.state === 'failed' ? 'not formed' : 'forming'} />
        <Forming {...forming} />
      </div>
    );
  }
  return (
    <div className="stage">
      <Starfield />
      {fx ? <FxLayer {...fx} nodes={view.nodes} /> : null}
      <StageLabel title="Agent stage" cap={view.count} />
      {view.fils.map((f, i) => (
        <Fil key={f.key || i} l={f.l} t={f.t} w={f.w} h={f.h} d={f.d} flow={f.flow} kind={f.tug ? 'tug' : f.dash ? 'flow' : f.quiet ? 'quiet' : undefined} className={cx(f.dash && f.quiet && 'is-quiet', f.cls) || undefined} />
      ))}
      {view.nodes.map((n) => <Node key={n.key} n={n} />)}
      <Marks marks={marks} />
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
