// Step 5 · Plot (boards Plot, PlotLight). Messy thoughts on the left,
// exploded into idea cards in the middle (keep, merge, discard, undo), and
// the kept ones as planned chunks on the right, each with a place in line.
// Explode (POST /api/explode, server/explode.mjs) splits the thoughts with
// Haiku, or by rule when the model is not there, and writes nothing. Next
// sends the kept chunks to POST /api/plot, which starts a /plot run in its
// own session that lands them per owner mode; the column then names that
// session and opens its cockpit. If exploding fails, the middle column
// offers /messy, which plots the same thoughts in a session instead, and
// renders its themes as cards as its report streams in, each with its /plot
// line as the action (themes.js reads the report; /messy's Step 6 pins its
// shape). Nothing here is planned until it is written. On a repo nexus is not in yet the kept ideas wait in the
// draft: the step offers Adopt now and plots them once adoption lands (plotGate.js; spec 52, A1).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, Kbd, ChoiceButtons, SessTag, SizeTag, useShell, stepCount, stepAfter, stepBefore, stepNo } from '../../ui/index.js';
import { server, useAppState } from '../../data/index.js';
import { PATHS } from '../../routes.js';
import { ObFrame, Back, Next } from './frame.jsx';
import { useDraft } from './draft.js';
import { onboardingCalls } from './calls.js';
import { messyReport } from './themes.js';
import { usePlotLive, PlotAskStrip } from './PlotAsk.jsx';
import { nexusIn, plotGate, plotKeptLabel, needsAdopt } from './plotGate.js';
import '../../styles/plot-fit.css';

const PLACES = [
  { value: 'asap', label: 'asap', asap: true },
  { value: 'anytime', label: 'anytime' },
  { value: 'auto', label: 'let nexus decide' },
];
const BUMP = { S: 'M', M: 'L', L: 'L' };

/** The thoughts with each idea's quote marked, as the board underlines them. */
function Marked({ text, quotes }) {
  const parts = [];
  let rest = text;
  let k = 0;
  const qs = quotes.filter(Boolean);
  while (rest) {
    let best = null;
    for (const q of qs) {
      const i = rest.toLowerCase().indexOf(q.toLowerCase());
      if (i >= 0 && (best === null || i < best.i)) best = { i, n: q.length };
    }
    if (!best) { parts.push(rest); break; }
    if (best.i) parts.push(rest.slice(0, best.i));
    parts.push(<mark key={k++}>{rest.slice(best.i, best.i + best.n)}</mark>);
    rest = rest.slice(best.i + best.n);
  }
  return parts;
}

/**
 * How the Lands note names the spec: the file explode named, else the next spec number this repo would take
 * (GET /api/state info.nextSpec), and "the first spec" only in a repo with no spec at all. A repo nexus is not in
 * yet has no plan to number from: "the first spec, once nexus is in" (`nexus` false; nexusIn in plotGate.js).
 * @returns {{ code: string|null, words: string }}
 */
export function specWords(specFile, next, nexus = true) {
  if (nexus === false) return { code: null, words: 'the first spec (once nexus is in)' };
  if (specFile) return { code: specFile, words: '' };
  if (next && !next.fresh && next.n) return { code: `${next.prefix || `plan/${next.n}-`}…`, words: 'a new spec, ' };
  return { code: null, words: 'the first spec' };
}

function SpecName({ specFile, next, nexus }) {
  const w = specWords(specFile, next, nexus);
  return <>{w.words}{w.code ? <code>{w.code}</code> : null}</>;
}

/** Kept ideas become chunks in board order; merged ideas fold into theirs. */
function planFrom(ideas, place, specN) {
  const kept = ideas.filter((x) => x.st === 'kept');
  const idOf = {};
  kept.forEach((x, n) => { idOf[x.id] = `${specN}.${n + 1}`; });
  const kids = (id) => ideas.filter((x) => x.st === 'merged' && x.into === id);
  const chunks = kept.map((x) => {
    const ks = kids(x.id);
    const p = place[x.id] || 'auto';
    const hint = p === 'asap' ? 'asap lane · first in line' : p === 'anytime' ? 'whenever a session is free' : (x.auto || 'nexus places it by size and what it needs');
    return {
      key: x.id, id: idOf[x.id], place: p, hint,
      t: ks.length ? (x.mt || `${x.t} + ${ks.map((c) => c.t.toLowerCase()).join(', ')}`) : x.t,
      sub: ks.length ? `merged from ${ks.length + 1} ideas` : '',
      size: ks.length ? BUMP[x.size] || x.size : x.size,
      from: [x.q, ...ks.map((c) => c.q)],
    };
  });
  return { chunks, idOf };
}

/** The adoption gate's note in the Planned column (plotGate.js): adopt first, adopting, or plot the held ideas. */
export function AdoptGate({ gate, kept, held, err, plotting, onAdopt, onPlot }) {
  if (gate === 'adopt' || gate === 'adopting') {
    const adopting = gate === 'adopting';
    const ideas = kept === 1 ? 'kept idea' : `${kept} kept ideas`;
    return (
      <div className="lands" role="status" data-gate={gate}>
        <Icon name="rays8" size={14} style={{ marginTop: 3, flex: 'none', color: 'var(--accent)' }} />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
          <span>
            <b>nexus isn't in this repo yet.</b> <code>/plot</code> needs its plan and skills, so adopt it first.{' '}
            {held ? (kept === 1 ? `Your ${ideas} waits here and plots as soon as it lands.` : `Your ${ideas} wait here and plot as soon as it lands.`) : (kept === 1 ? `Your ${ideas} stays here meanwhile.` : `Your ${ideas} stay here meanwhile.`)}
          </span>
          {adopting ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="t-body-s c-3" aria-live="polite">Adopting in the home session...</span>
              <Link className="btn btn-s btn-ghost" to={PATHS.cockpit('main')}><Icon name="arrowRight" size={14} />Watch it</Link>
            </span>
          ) : (
            <button className="btn btn-s btn-primary" type="button" onClick={onAdopt}><Icon name="arrowRight" size={14} />Adopt now</button>
          )}
          {err ? <span className="t-body-s" role="alert" style={{ color: 'var(--st-blocked)' }}>Adopt did not start: {err}</span> : null}
        </span>
      </div>
    );
  }
  if (gate === 'landed' || gate === 'auto') {
    return (
      <div className="lands" role="status" data-gate={gate}>
        <Icon name="check" size={14} style={{ marginTop: 3, flex: 'none', color: 'var(--st-done)' }} />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
          <span><b>nexus is in.</b> {gate === 'auto' ? 'Plotting your held ideas now.' : 'Your kept ideas are ready to plot.'}</span>
          {gate === 'landed' ? (
            <button className="btn btn-s btn-primary" type="button" onClick={onPlot} disabled={plotting} aria-busy={plotting || undefined}><Icon name="arrowRight" size={14} />{plotKeptLabel(kept)}</button>
          ) : null}
        </span>
      </div>
    );
  }
  return null;
}

export default function Plot() {
  const { owner, live } = useShell();
  const [d, patch] = useDraft();
  const plot = usePlotLive(d);
  const [merging, setMerging] = useState(null);
  const [again, setAgain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(null); // null | { error }
  const [editing, setEditing] = useState(false);
  const [plotErr, setPlotErr] = useState(null);
  const [plotting, setPlotting] = useState(false);
  const nav = useNavigate();
  const [plotted, setPlotted] = useState({}); // theme plot line -> 'sending' | 'sent' | { error }
  const report = useMemo(() => (d.messy ? messyReport(live?.transcript || []) : { sent: false, done: false, themes: [] }), [d.messy, live?.transcript]);
  const themes = report.themes;

  const thoughts = d.thoughts ?? d.building ?? '';
  const ideas = d.ideas || [];
  const app = useAppState();
  const next = app.data?.info?.nextSpec || null;
  const nexus = nexusIn(app.data?.info);
  const specN = d.spec?.n || next?.n || 1;
  const specFile = nexus === false ? null : d.spec?.file || null;
  const { chunks, idOf } = useMemo(() => planFrom(ideas, d.place || {}, specN), [ideas, d.place, specN]);
  const showText = !ideas.length || editing;
  const gate = plotGate({ nexus, adopt: d.adopt, kept: chunks.length, plotted: d.plotted, held: d.plotHeld });
  const [adoptErr, setAdoptErr] = useState(null);

  const setIdeas = (fn) => patch((cur) => ({ ideas: fn(cur.ideas || []), plotted: false }));
  const setIdea = (id, p) => setIdeas((all) => all.map((x) => {
    if (x.id === id) return { ...x, ...p };
    if (p.st && p.st !== 'kept' && x.st === 'merged' && x.into === id) return { ...x, st: 'new', into: null };
    return x;
  }));
  const mergeInto = (src, dst) => {
    setIdeas((all) => all.map((x) => {
      if (x.id === src) return { ...x, st: 'merged', into: dst };
      if (x.id === dst && x.st === 'new') return { ...x, st: 'kept' };
      if (x.st === 'merged' && x.into === src) return { ...x, into: dst };
      return x;
    }));
    setMerging(null);
  };

  const explode = async () => {
    if (!thoughts.trim() || busy) return;
    setBusy(true);
    setMerging(null);
    try {
      const r = await onboardingCalls.explode(thoughts, d.team);
      const fresh = (r.ideas || []).map((x, i) => ({ id: String(x.id ?? i), t: x.t, q: x.q, size: x.size || 'M', auto: x.auto, mt: x.mt, st: 'new', into: null }));
      patch({ ideas: fresh, spec: r.spec || null, place: {}, plotted: false });
      setEditing(false);
      setState(null);
      if (ideas.length) setAgain((a) => !a);
    } catch (e) {
      setState({ error: e.message });
    } finally {
      setBusy(false);
    }
  };

  const toMessy = async () => {
    setBusy(true);
    try {
      await server.send(`/messy ${thoughts.trim()}`);
      patch({ messy: true });
      setState(null);
    } catch (e) {
      setState({ error: e.message });
    } finally {
      setBusy(false);
    }
  };

  const plotTheme = async (t) => {
    if (plotted[t.plot]) return;
    setPlotted((p) => ({ ...p, [t.plot]: 'sending' }));
    try {
      await server.send(t.plot);
      setPlotted((p) => ({ ...p, [t.plot]: 'sent' }));
    } catch (e) {
      setPlotted((p) => ({ ...p, [t.plot]: { error: e.message } }));
    }
  };

  // Continue waits for the plot call: a link would leave before an error could show. A repo nexus is not in holds
  // the kept ideas (plotHeld) until adoption lands; the server refuses it too (409 { adopt: true }).
  const writePlan = async (e) => {
    if (!chunks.length || d.plotted) return;
    e?.preventDefault();
    if (plotting) return;
    if (gate === 'adopt' || gate === 'adopting') { patch({ plotHeld: true }); return; }
    setPlotting(true);
    setPlotErr(null);
    try {
      const r = await onboardingCalls.plot({ spec: specFile, thoughts, chunks: chunks.map((c) => ({ id: c.id, title: c.t, size: c.size, place: c.place, from: c.from })) });
      patch({ plotted: true, plotHeld: false, plotSession: r.session ? { id: r.session, name: r.star || '' } : null });
      nav(PATHS.onboarding(stepAfter('plot')));
    } catch (err) {
      if (needsAdopt(err)) { patch({ plotHeld: true }); app.reload(); } else setPlotErr(err.message);
    } finally {
      setPlotting(false);
    }
  };

  // Adopt now: the home session adopts nexus (POST /api/adopt, as Launch does); the kept ideas stay in the draft.
  const adoptNow = async () => {
    setAdoptErr(null);
    try {
      await server.adopt();
      patch({ adopt: 'sent' });
    } catch (err) {
      setAdoptErr(err.message);
    }
  };

  // While the home session adopts, read the state until it says nexus is in.
  const reloadState = app.reload;
  useEffect(() => {
    if (gate !== 'adopting') return undefined;
    const t = setInterval(reloadState, 3000);
    return () => clearInterval(t);
  }, [gate, reloadState]);

  // Adoption landed after the person asked to plot: plot the held ideas as Next would have, once.
  const autoRan = useRef(false);
  useEffect(() => {
    if (gate !== 'auto' || autoRan.current) return;
    autoRan.current = true;
    writePlan();
  }, [gate]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = (st) => ideas.filter((x) => x.st === st).length;
  const counts = ideas.length ? [`${n('kept')} kept`, `${n('merged')} merged`, `${n('discarded')} discarded`, `${n('new')} to decide`].join(' · ') : '';
  const mergingT = merging ? (ideas.find((x) => x.id === merging) || {}).t : '';

  const foot = (
    <>
      <Back to={stepBefore('plot')} />
      <span className="ob-count">{stepCount('plot')}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {plotErr ? <span className="t-body-s" style={{ color: 'var(--st-blocked)' }}>Not planned yet: {plotErr}</span> : null}
        <span className="t-body-s c-3" aria-live="polite">{plotting ? 'Starting /plot...' : gate === 'adopt' || gate === 'adopting' ? `${chunks.length} chunks held until nexus is in` : `${chunks.length} chunks planned`}</span>
        <Next to={PATHS.onboarding(stepAfter('plot'))} onClick={writePlan} />
      </div>
    </>
  );

  return (
    <ObFrame step="plot" foot={foot} notice={<PlotAskStrip session={d.plotSession} live={plot.live} />} mainStyle={{ maxWidth: 1360 }} mainClass="plot-main">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="kicker">step {stepNo('plot')} · plot the first work</span>
          <h1 className="t-display-s">Plot the first work</h1>
        </div>
        <p className="t-body ob-lede" style={{ maxWidth: 520, textAlign: 'right' }}>Type or paste whatever is in your head. Explode it into ideas, keep what matters, and give each one a place in line.</p>
      </div>

      <div className="plot-grid" style={{ gridTemplateColumns: '300px minmax(0, 1fr) 352px' }}>
        <div className="plot-col">
          <div className="plot-col-h">
            <span className="t-title-s">Your messy thoughts</span>
            <span className="tb-spacer" style={{ flex: 1 }} />
            <span className="cap">{thoughts.length ? `${thoughts.length} chars` : 'empty'}</span>
          </div>
          {showText ? (
            <textarea
              className="thoughts" aria-label="Your messy thoughts" autoFocus={editing}
              // The Plot board's thoughts box is ~440px tall; keep that size before any idea cards stretch the row.
              style={{ border: 0, resize: 'none', font: 'inherit', fontSize: 14, lineHeight: '23px', color: 'var(--text)', minHeight: 'min(440px, 48vh)' }}
              value={thoughts} onChange={(e) => patch({ thoughts: e.target.value })}
              onBlur={() => { if (ideas.length) setEditing(false); }}
              placeholder="ideas, bugs, half-plans, in any order"
            />
          ) : (
            <div className="thoughts" role="textbox" aria-multiline="true" aria-readonly="true" aria-label="Your messy thoughts" tabIndex={0} onClick={() => setEditing(true)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setEditing(true); } }}>
              <Marked text={thoughts} quotes={ideas.map((x) => x.q)} />
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" type="button" onClick={explode} disabled={!thoughts.trim() || busy} aria-busy={busy || undefined}>
              <Icon name="rays8" size={14} />{ideas.length ? 'Explode again' : 'Explode'}
            </button>
            <Kbd>/explode</Kbd>
          </div>
          <span className="t-body-s c-3">It splits on ideas, not sentences. Nothing is planned until you keep it.</span>
        </div>

        <div className="plot-col">
          <div className="plot-col-h">
            <span className="t-title-s">{d.messy && !ideas.length ? `${themes.length} themes` : `${ideas.length} ideas`}</span>
            <span className="tb-spacer" style={{ flex: 1 }} />
            <span className="cap">{d.messy && !ideas.length ? (report.done ? 'from /messy' : report.sent ? '/messy is working' : '') : counts}</span>
          </div>
          {merging ? <div className="t-body-s" style={{ color: 'var(--accent)' }}>Pick the card to merge “{mergingT}” into.</div> : null}
          {state?.error && !d.messy ? (
            <div className="lands" role="status">
              <Icon name="rays8" size={14} style={{ marginTop: 3, flex: 'none', color: 'var(--accent)' }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
                <span><b>Exploding into cards did not work this time.</b> <code>/messy</code> does the same work in a session: it saves your thoughts raw, clusters them and plots each theme as a spec with chunks.</span>
                <button className="btn btn-s" type="button" onClick={toMessy} disabled={busy}><Icon name="arrowRight" size={14} />Send to /messy</button>
              </span>
            </div>
          ) : null}
          {d.messy ? (
            <div className="lands" role="status">
              <Icon name="check" size={14} style={{ marginTop: 3, flex: 'none', color: 'var(--st-done)' }} />
              <span><b>Sent to /messy.</b> Your thoughts are saved raw and plotted in the session. {themes.length ? 'Each theme is a card below: plot it to give it its place in line.' : 'Its themes show up here as cards, and its specs on the plan board as they land.'}</span>
            </div>
          ) : null}
          {d.messy && themes.length ? (
            <div className="ideas">
              {themes.map((t, i) => {
                const st = plotted[t.plot];
                const tag = st === 'sent' ? 'sent to /plot' : t.kind === 'built' ? 'already built' : t.kind === 'extends' ? `extends ${t.spec || 'a spec'}` : t.spec ? `spec ${t.spec}` : (t.became || '');
                return (
                  <div key={`${t.title}
${t.plot}`} className={st === 'sent' ? 'idea is-kept' : t.kind === 'built' ? 'idea is-merged' : 'idea'} style={{ '--d': `${i * 70}ms` }}>
                    <div className="idea-t">{t.title}</div>
                    <div className="idea-q" title={t.became ? `${t.became} · ${t.plot}` : t.plot}><code>{t.plot}</code></div>
                    {st?.error ? <div className="t-body-s" role="alert" style={{ color: 'var(--st-blocked)' }}>Not sent: {st.error}</div> : null}
                    <div className="idea-acts">
                      {st === 'sent' ? null : (
                        <button className="btn btn-ghost" type="button" onClick={() => plotTheme(t)} disabled={st === 'sending'} aria-busy={st === 'sending' || undefined} aria-label={`Plot ${t.title}`}>
                          <Icon name="arrowRight" size={14} />Plot it
                        </button>
                      )}
                      <span className="idea-tag">{tag}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
          {state?.error ? <div className="t-body-s" role="alert" style={{ color: 'var(--st-blocked)' }}>That did not work: {state.error}</div> : null}
          <div className={again ? 'ideas is-again' : 'ideas'}>
            {ideas.map((x, i) => {
              const col = i % 2;
              const row = Math.floor(i / 2);
              const picking = merging === x.id;
              const target = merging && !picking && (x.st === 'new' || x.st === 'kept');
              const cls = ['idea', x.st === 'kept' && 'is-kept', x.st === 'merged' && 'is-merged', x.st === 'discarded' && 'is-discarded', picking && 'is-picking', target && 'is-target'].filter(Boolean).join(' ');
              const tag = picking ? 'merging' : x.st === 'kept' ? `kept · ${idOf[x.id]}` : x.st === 'merged' ? `merged into ${idOf[x.into] || 'a kept idea'}` : x.st === 'discarded' ? 'discarded' : '';
              const live = x.st === 'new' || x.st === 'kept';
              return (
                <div key={x.id} className={cls} style={{ '--d': `${i * 70}ms`, '--bx': `${-130 - col * 90}px`, '--by': `${110 - row * 44}px` }}>
                  <div className="idea-t">{x.t}</div>
                  <div className="idea-q">“{x.q}”</div>
                  <div className="idea-acts">
                    {!merging && x.st === 'new' ? <button className="btn btn-ghost" type="button" onClick={() => setIdea(x.id, { st: 'kept' })}><Icon name="check" size={14} />Keep</button> : null}
                    {!merging && live ? <button className="btn btn-ghost" type="button" onClick={() => setMerging(x.id)}><Icon name="merge" size={14} />Merge</button> : null}
                    {!merging && live ? <button className="btn btn-ghost btn-icon" type="button" onClick={() => setIdea(x.id, { st: 'discarded' })} aria-label="Discard this idea"><Icon name="x" size={14} /></button> : null}
                    {target ? <button className="btn" type="button" onClick={() => mergeInto(merging, x.id)}><Icon name="merge" size={14} />Merge here</button> : null}
                    {picking ? <button className="btn btn-ghost" type="button" onClick={() => setMerging(null)}>Cancel</button> : null}
                    {!merging && !live ? <button className="btn btn-ghost" type="button" onClick={() => setIdea(x.id, { st: 'new', into: null })}><Icon name="undo" size={14} />Undo</button> : null}
                    <span className="idea-tag">{tag}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="plot-col">
          <div className="plot-col-h">
            <span className="t-title-s">Planned</span>
            <span className="tb-spacer" style={{ flex: 1 }} />
            <span className="cap">{specFile || (nexus === false ? 'nexus not in yet' : '')}</span>
          </div>
          <div className="planned">
            {chunks.map((c) => (
              <div className="plan-row" key={c.key}>
                <span className="chunk-id">{c.id}</span>
                <div>
                  <div className="plan-t">{c.t}</div>
                  {c.sub ? <div className="plan-sub">{c.sub}</div> : null}
                </div>
                <div className="plan-line">
                  <SizeTag size={c.size} />
                  <ChoiceButtons options={PLACES} value={c.place} onChange={(p) => patch((cur) => ({ place: { ...cur.place, [c.key]: p }, plotted: false }))} label={`Place in line for ${c.id}`} />
                </div>
                <div className="plan-line" style={{ marginTop: 0 }}><span className="plan-sub">{c.hint}</span></div>
              </div>
            ))}
          </div>
          {!chunks.length ? <div className="lands">Keep an idea and it lands here as a chunk.</div> : null}
          <AdoptGate gate={gate} kept={chunks.length} held={!!d.plotHeld} err={adoptErr} plotting={plotting} onAdopt={adoptNow} onPlot={writePlan} />
          {d.plotted && d.plotSession?.id ? (
            <div className="lands" role="status">
              <Icon name="check" size={14} style={{ marginTop: 3, flex: 'none', color: 'var(--st-done)' }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
                <span><b>Plotting in</b> {d.plotSession.name ? <SessTag session={{ name: d.plotSession.name, kind: 'local' }} /> : 'its own session'}: <code>/plot</code> researches each chunk, writes the spec and lands it.</span>
                <Link className="btn btn-s" to={PATHS.cockpit(d.plotSession.id)}><Icon name="arrowRight" size={14} />Open its cockpit</Link>
              </span>
            </div>
          ) : null}
          {owner ? (
            <div className="lands">
              <Icon name="lockOne" size={14} style={{ marginTop: 3, flex: 'none', color: 'var(--owner)' }} />
              <span><b>Lands on main</b> as <SpecName specFile={specFile} next={next} nexus={nexus} /> with {chunks.length === 1 ? "1 chunk" : `${chunks.length} chunks`}. You own this checkout, so there is no plan PR to wait for.</span>
            </div>
          ) : (
            <div className="lands">
              <Icon name="contribOne" size={14} style={{ marginTop: 3, flex: 'none' }} />
              <span><b>Opens a plan PR</b> for <SpecName specFile={specFile} next={next} nexus={nexus} />, with {chunks.length === 1 ? "1 chunk" : `${chunks.length} chunks`}, so the owner reviews your plan like code.</span>
            </div>
          )}
        </div>
      </div>
    </ObFrame>
  );
}
