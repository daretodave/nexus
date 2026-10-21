// The design handoff (spec 43, A7): "Hand off a design" takes a Claude Design artifact link and runs
// `/design ingest <link>` in a session (the home one, or a new one), and the gallery shows a handoff's boards with each
// one's port status: ported (the files that draw it), skipped (its reason) or pending (the chunk it waits on).
// Deep-linkable: /design?h=<handoff folder>.
//
// No Claude Design board draws this screen: it is built from the design system's own classes (Recover's
// .rec-wrap/.rec-side/.side-card layout, Plot's .ideas/.idea cards, .flag for status), logged in
// design/handoff/README.md under "Additions no board draws". Cards show a board's name and status, no thumbnail: a
// board needs the design tool's runtime to draw, and renders are never run on page load.
//
// Data: GET /api/design (useDesign; server/design.mjs, the repo's scripts/design/port-map.mjs).
// Action: POST /api/design/handoff { link, session? } (server.designHandoff); the link is checked here first.
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ViewFrame, ViewHead, ViewTitle, InboxBtn, Icon, Flag, Seg, ChoiceButtons, ToastHost, Err, cx, useShell } from '../ui/index.js';
import { useDesign, server } from '../data/index.js';
import { PATHS } from '../routes.js';
import { useToasts } from './fleet/toasts.js';
import { plural } from './fleet/util.js';
import { artifactLink } from '../../shared/design-link.mjs';
import { galleryOf, handoffPick, statusLook, STATUSES } from './design/model.js';

function Empty({ title, body }) {
  return (
    <div className="empty" style={{ paddingTop: 72 }}>
      <div className="empty-art" aria-hidden="true">
        <i style={{ left: 14, top: 30 }} /><i style={{ left: 48, top: 12 }} /><i className="lit" style={{ left: 82, top: 40 }} /><i style={{ left: 116, top: 20 }} />
      </div>
      <div className="empty-title">{title}</div>
      <div className="empty-body">{body}</div>
    </div>
  );
}

/** The hand-off form: an artifact link, checked before it is sent, and where it runs. */
function HandOff({ push }) {
  const [text, setText] = useState('');
  const [where, setWhere] = useState('home');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    const l = artifactLink(text);
    if (!l.ok) { setErr(l.error); return; }
    setErr('');
    setBusy(true);
    try {
      const r = await server.designHandoff(l.link, where === 'new' ? 'new' : undefined);
      setSent(r);
      setText('');
    } catch (x) {
      push({ kind: 'error', title: "Couldn't hand off the design", body: `${x.message}. Run it from a terminal: /design ingest ${l.link}` });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="side-card" onSubmit={submit} aria-label="Hand off a design">
      <span className="t-title-s">Hand off a design</span>
      <span className="t-body-s c-2">Paste the artifact link Claude Design shared. A session reads every board into the repo, keeps them as the source of truth and plots the port.</span>
      <div className={cx('field', err && 'is-focus')} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 12px' }}>
        <span className="t-mono-xs c-3">link</span>
        <input
          type="url"
          aria-label="Artifact link"
          aria-invalid={err ? true : undefined}
          placeholder="https://claude.ai/artifact/..."
          value={text}
          onChange={(e) => { setText(e.target.value); if (err) setErr(''); }}
          spellCheck={false}
          style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', outline: 'none', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}
        />
      </div>
      {err ? <span className="t-body-s" role="alert" style={{ color: 'var(--st-failed)' }}>{err}</span> : null}
      <Seg name="design-where" label="Run it in" value={where} onChange={setWhere} options={[{ value: 'home', label: 'This session' }, { value: 'new', label: 'A new session' }]} />
      <button className="btn btn-primary" type="submit" disabled={busy}><Icon name="arrowRight" size={14} />{busy ? 'Sending…' : 'Hand off'}</button>
      {sent ? (
        <div className="resume-note">
          <Icon name="check" style={{ color: 'var(--accent)', flex: 'none', marginTop: 2 }} />
          <span><b>Sent to {sent.name || 'the home session'}.</b> It runs <code className="t-mono-xs">{sent.command}</code>; the new boards show here once the handoff lands. <Link to={PATHS.cockpit(sent.session)}>Open its cockpit</Link></span>
        </div>
      ) : null}
    </form>
  );
}

function BoardCard({ b }) {
  return (
    <div className="idea" style={{ minHeight: 88 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span className="idea-t" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
        <span className="idea-tag"><Flag kind={b.kind}>{b.label}</Flag></span>
      </div>
      {b.detail ? <span className={cx('idea-q', b.status === 'ported' && 't-mono-xs')} title={b.detail}>{b.detail}</span> : null}
    </div>
  );
}

export default function Design() {
  const { repo } = useShell();
  const [params, setParams] = useSearchParams();
  const res = useDesign();
  const { toasts, push } = useToasts();
  const [only, setOnly] = useState(null);
  const data = res.status === 'ready' ? res.data || {} : {};
  const handoffs = Array.isArray(data.handoffs) ? data.handoffs : [];
  const h = handoffPick(handoffs, params.get('h') || '');
  const g = useMemo(() => galleryOf(h, { only }), [h, only]);
  const filters = STATUSES.filter((s) => s !== 'unmapped' || g.counts.unmapped).map((s) => ({ value: s, label: `${statusLook(s).label} ${g.counts[s]}` }));

  let main;
  if (res.status === 'loading') main = <Empty title="Reading the handoffs" body="Asking the repo's port map for each board's status." />;
  else if (res.status === 'error') main = <Err title="Couldn't read the design handoffs" body="Nothing was changed." detail={res.error} actions={<button className="btn btn-s" type="button" onClick={res.reload}>Try again</button>} />;
  else if (res.status === 'missing') main = <Empty title="This server doesn't read handoffs yet" body="Update @usenexus/cli to see the gallery. Hand off a design still works from a terminal: /design ingest <link>." />;
  else if (!data.available) main = <Empty title="No port map in this repo" body={data.note || 'The gallery reads each board\'s status from scripts/design/port-map.mjs.'} />;
  else if (!h) main = <Empty title="No design handoff yet" body="Hand off a Claude Design artifact on the left. Its boards land in design/handoff/ and show here with their port status." />;
  else {
    main = (
      <div className="rec-main">
        <div className="run-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <Icon name="image" style={{ color: 'var(--accent)', flex: 'none' }} />
            <span className="t-title-s" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.id}</span>
          </div>
          {h.ok ? <Flag kind="active">port map checks</Flag> : <Flag kind="orphan">{plural(h.problems.length, 'problem')}</Flag>}
          <div className="meta">
            <span><b>{g.counts.total}</b> boards</span>
            <span><b>{g.counts.ported}</b> ported</span>
            <span><b>{g.counts.skipped}</b> skipped</span>
            <span><b>{g.counts.pending}</b> pending</span>
          </div>
        </div>
        {!h.ok && h.problems.length ? (
          <Err title="The port map has problems" body={`node ${data.script} check names them; the gate's design leg fails until they are fixed.`} detail={h.problems.slice(0, 6).join('\n')} />
        ) : null}
        <div className="pb-tools">
          <span className="t-label">Show</span>
          <ChoiceButtons label="Filter by status" options={filters} value={only} onChange={(v) => setOnly((o) => (o === v ? null : v))} />
        </div>
        {g.pages.map((p) => (
          <section key={p.id ?? '-'} aria-label={p.name} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="t-caps c-2">{p.name}</span>
            <div className="ideas" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {p.boards.map((b) => <BoardCard key={b.name} b={b} />)}
            </div>
          </section>
        ))}
        {!g.pages.length ? <span className="t-body-s c-3">No board is {only ? statusLook(only).label : 'in this handoff'}.</span> : null}
      </div>
    );
  }

  return (
    <ViewFrame current="board" title={repo || 'nexus'} sub="Design" label="Design handoff" actions={<InboxBtn />}>
      <ViewHead>
        <ViewTitle title={<h1 className="t-title-l">Design handoff</h1>} sub="Every board Claude Design delivered, and where each one went: ported, skipped with a reason, or waiting on a chunk." />
        <div className="view-acts"><Link className="btn" to={PATHS.board}><Icon name="list" size={14} />Plan</Link></div>
      </ViewHead>
      <div className="rec-wrap">
        <aside className="rec-side" aria-label="Hand off and pick a handoff">
          <HandOff push={push} />
          {handoffs.length > 1 ? (
            <div className="side-card" style={{ gap: 2, padding: '10px 8px' }}>
              <span className="t-caps c-2" style={{ padding: '4px 8px 6px' }}>Handoffs</span>
              {handoffs.map((x) => {
                const c = galleryOf(x).counts;
                return (
                  <button key={x.id} className={cx('rec-pick', h && x.id === h.id && 'is-current')} type="button" onClick={() => setParams({ h: x.id })}>
                    <span className={x.ok ? 'urg is-done' : 'urg is-parked'} />
                    <span style={{ minWidth: 0 }}>{x.id.split('/').pop()}<span className="d">{x.id}</span></span>
                    <span className="t-mono-xs c-3">{c.ported}/{c.total}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </aside>
        {main}
      </div>
      <ToastHost toasts={toasts} />
    </ViewFrame>
  );
}
