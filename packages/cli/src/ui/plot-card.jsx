// The /plot report card (spec 47, A6): the nexus-plot block ui/plot-report.js validates, drawn from the handoff's
// pieces (.chunk, .size-tag, .file-tag, .choice, .btn) plus styles/plot-card.css (imported by the cockpit's Working). Its actions send the report's
// exact command, with the chosen answers, through the cockpit's send path. Imports only plain .js modules, so a
// test can render it on the server.
import { Fragment, useState } from 'react';
import { aheadLabel, answersLine, plotActions, plotCommand } from './plot-report.js';

const MODE_LABEL = { peek: 'Peek', plotted: 'Plotted', done: 'Plotted and built' };
const ROWS = [
  ['built', 'Already built', 'is-built'],
  ['notBuilt', 'Planned, not built', 'is-planned'],
  ['notPlanned', 'Not planned', 'is-new'],
];

/** `code` spans in a short text as <code>; everything else stays text. */
function Ticks({ text }) {
  const parts = String(text || '').split(/(`[^`]+`)/);
  return parts.map((p, i) => (p.length > 2 && p.startsWith('`') && p.endsWith('`')
    ? <code key={i}>{p.slice(1, -1)}</code>
    : <Fragment key={i}>{p}</Fragment>));
}

function Lane({ label, ids, lit, sub }) {
  if (!ids.length) return null;
  return (
    <div className="plotc-lane">
      <span className="plotc-lane-k">{label}</span>
      <div className="plotc-lane-ids" role="list">
        {ids.map((id, i) => (
          <Fragment key={i}>
            {i ? <span className="plotc-arrow" aria-hidden="true">{'→'}</span> : null}
            <span role="listitem" className={`plotc-id${lit.includes(id) ? ' is-lit' : ''}`}>{id}</span>
          </Fragment>
        ))}
      </div>
      {sub ? <span className="plotc-lane-sub">{sub}</span> : null}
    </div>
  );
}

function ChunkCard({ c }) {
  return (
    <div className="chunk plotc-chunk">
      <div className="chunk-top">
        <span className="chunk-id">{c.id}</span>
        <span className="size-tag" title={`size ${c.size}`}>{c.size}</span>
      </div>
      <div className="chunk-title"><Ticks text={c.title} /></div>
      <div className="plotc-meta">
        <span><b>closes</b> {c.closes.length ? c.closes.join(', ') : '—'}</span>
        <span><b>needs</b> {c.needs.length ? c.needs.join(', ') : '—'}</span>
      </div>
      {c.files.length ? <div className="plotc-files">{c.files.map((f) => <span key={f} className="file-tag">{f}</span>)}</div> : null}
    </div>
  );
}

/**
 * .plotc: a valid report as a card. onSend(line) sends one line into the session and resolves true when it went
 * (the cockpit's send); without it the card draws no buttons.
 */
export function PlotCard({ report, onSend }) {
  const [picked, setPicked] = useState({});
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState(false);
  const actions = onSend ? plotActions(report) : [];
  const order = report.order;
  const act = async (key) => {
    const line = plotCommand(report, key, picked);
    if (!line || busy) return;
    setBusy(true);
    try { if (await onSend(line)) setSent(line); } finally { setBusy(false); }
  };
  return (
    <section className={`plotc is-${report.mode}`} aria-label={`plot report: ${report.task}`}>
      <header className="plotc-head">
        <span className="plotc-kicker">/plot</span>
        <span className={`plotc-mode is-${report.mode}`}>{MODE_LABEL[report.mode]}</span>
      </header>
      <div className="plotc-task"><Ticks text={report.task} /></div>

      {ROWS.some(([k]) => report[k].length) ? (
        <div className="plotc-rows">
          {ROWS.map(([k, label, cls]) => (report[k].length ? (
            <div key={k} className={`plotc-row ${cls}`}>
              <span className="plotc-row-k">{label}</span>
              <ul>
                {report[k].map((it, i) => (
                  <li key={i}><Ticks text={it.what} />{it.where ? <span className="file-tag">{it.where}</span> : null}</li>
                ))}
              </ul>
            </div>
          ) : null))}
        </div>
      ) : null}

      {report.spec || report.chunks.length ? (
        <div className="plotc-sec">
          <div className="plotc-sec-h">
            {report.chunks.length === 1 ? 'The chunk' : report.chunks.length ? `${report.chunks.length} chunks` : 'Where it goes'}
            {report.spec ? (
              <span className="plotc-spec">{report.spec.joined ? 'joins' : 'new spec'} <span className="file-tag">{report.spec.file}</span></span>
            ) : null}
          </div>
          {report.chunks.length ? <div className="plotc-chunks">{report.chunks.map((c, i) => <ChunkCard key={c.id || i} c={c} />)}</div> : null}
        </div>
      ) : null}

      {order && (order.before.length || order.after.length) ? (
        <div className="plotc-sec">
          <div className="plotc-sec-h">When /next builds it</div>
          <div className="plotc-order">
            <Lane label="now" ids={order.before} lit={[]} />
            <Lane label="after" ids={order.after} lit={order.lit} sub={aheadLabel(order.ahead)} />
          </div>
        </div>
      ) : null}

      {report.questions.length ? (
        <div className="plotc-sec">
          <div className="plotc-sec-h">Only you can answer</div>
          <div className="plotc-qs">
            {report.questions.map((q, i) => {
              const chosen = picked[i] ?? q.default;
              return (
                <div key={i} className="plotc-q">
                  <div className="plotc-q-t"><span className="plotc-q-n">{i + 1}</span><Ticks text={q.q} /></div>
                  <div className="choice" role="radiogroup" aria-label={q.q}>
                    {q.options.map((o) => (
                      <button
                        key={o} type="button" role="radio" aria-checked={chosen === o}
                        className={chosen === o ? 'is-on' : undefined} disabled={!!sent}
                        onClick={() => setPicked((p) => ({ ...p, [i]: o }))}
                      >
                        {o}{o === q.default ? <span className="plotc-def">default</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {actions.length ? (
        <footer className="plotc-acts">
          {sent ? <span className="plotc-sent">Sent <code>{sent}</code></span> : actions.map((a) => (
            <button key={a.key} type="button" className={`btn btn-s${a.primary ? ' btn-primary' : ''}`} disabled={busy} title={plotCommand(report, a.key, picked)} onClick={() => act(a.key)}>
              {a.label}
            </button>
          ))}
          {!sent && report.questions.length ? <span className="plotc-ans">{answersLine(report.questions, picked)}</span> : null}
        </footer>
      ) : null}
    </section>
  );
}
