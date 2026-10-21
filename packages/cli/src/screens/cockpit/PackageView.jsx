// Package (CockpitPackage board + the Package board's states): what the
// session hands back. The ready preview stacks on the PR it builds on; the
// card then walks forming, blocked, opening, opened and merged.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CiPill, Icon, ParkMark, Pkg, PkgHead, PkgRow, PkgSec, PrPill, Retarget, Stack, cx } from '../../ui/index.js';
import { dur } from './model.js';

const BAR = 24;
const num = (n) => (n == null ? '' : Number(n).toLocaleString('en-US'));
const CI_WORD = { green: 'CI green', red: 'CI red', running: 'CI running', queued: 'CI queued' };

/** The two-line ASCII strip: every chunk with its tick, then acceptance as a bar. */
function Strip({ closed, ac, worked }) {
  const filled = ac && ac.total ? Math.round((ac.met / ac.total) * BAR) : 0;
  return (
    <div className="pkg-strip">
      <div>
        chunks
        {closed.map((c) => (
          <span key={c.id}>{' '}<span className="ok"><i className="g">✓</i></span> {c.id}{c.fix ? <> <span className="d">fix</span></> : null} </span>
        ))}
      </div>
      {ac && ac.total ? (
        <div>AC     <span className="a">{'█'.repeat(filled)}</span><span className="d">{'░'.repeat(BAR - filled)}</span> {ac.met}/{ac.total}  {worked ? <span className="d">{worked}</span> : null}</div>
      ) : null}
    </div>
  );
}

function Forming({ count }) {
  return (
    <Pkg state="forming" style={{ gap: 8, padding: '14px 16px' }}>
      <div className="pkg-head">
        <span className="pkg-ic" style={{ width: 28, height: 28, background: 'transparent', boxShadow: 'inset 0 0 0 1px var(--line-2)', color: 'var(--text-2)' }}><Icon name="package" /></span>
        <span><span className="pkg-title" style={{ display: 'block', fontSize: 14 }}>Package · forming</span><span className="pkg-sub">{count} chunk{count === 1 ? '' : 's'} so far · builds at the end</span></span>
      </div>
    </Pkg>
  );
}

/**
 * ledger: the session ledger (null without one). live closed chunks feed
 * the forming card when there is no ledger. onOpen() / onSaveDescription(text)
 * resolve true when the server took it.
 */
export default function PackageView({ ledger, phase, liveClosed, reviewTo, onOpen, onSaveDescription, busy }) {
  const [editing, setEditing] = useState(null);
  const L = ledger || {};
  const p = L.package || {};
  const closed = L.closed || [];
  const parked = L.parked || [];
  const open = parked.filter((x) => (x.state || 'pending') === 'pending');
  const base = L.base;

  let card;
  if (!ledger || (phase !== 'package' && !p.state)) {
    card = <Forming count={ledger ? closed.length : liveClosed} />;
  } else if (open.length) {
    card = (
      <Pkg state="blocked" style={{ gap: 10, padding: '14px 16px' }}>
        <div className="pkg-head">
          <span className="pkg-ic" style={{ width: 28, height: 28, background: 'color-mix(in oklab, var(--st-blocked) 16%, transparent)', color: 'var(--st-blocked)' }}><ParkMark /></span>
          <span><span className="pkg-title" style={{ display: 'block', fontSize: 14 }}>Review {open.length} parked question{open.length === 1 ? '' : 's'} to package</span><span className="pkg-sub">{[open[0].who, open[0].short || open[0].q].filter(Boolean).join(' · ')}</span></span>
        </div>
        <div className="pkg-foot"><button className="btn btn-primary btn-s" type="button" disabled>Open pull request</button><Link className="btn btn-s" to={reviewTo}>Review it</Link></div>
      </Pkg>
    );
  } else if (p.state === 'opening') {
    card = (
      <Pkg style={{ gap: 8, padding: '14px 16px', boxShadow: 'var(--e-2)' }}>
        <div className="pkg-head" style={{ alignItems: 'center' }}><span className="spin" /><span className="pkg-title" style={{ fontSize: 14 }}>Opening pull request…</span>{p.branch ? <span className="pkg-sub" style={{ marginLeft: 'auto' }}>pushing {p.branch}</span> : null}</div>
      </Pkg>
    );
  } else if (p.pr && p.pr.state === 'merged') {
    card = (
      <Pkg state="merged" style={{ gap: 8, padding: '14px 16px' }}>
        <div className="pkg-head" style={{ alignItems: 'center' }}><PrPill num={`#${p.pr.num}`} state="merged" msg="merged" /><span className="t-body-s c-2">{closed.length} chunks closed on main</span></div>
      </Pkg>
    );
  } else if (p.pr && p.pr.num) {
    card = (
      <Pkg style={{ gap: 8, padding: '14px 16px', boxShadow: 'var(--e-2)' }}>
        <div className="pkg-head" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <PrPill num={`#${p.pr.num}`} state={p.pr.state === 'draft' ? 'draft' : 'open'} msg="in review" />
          {p.pr.ci ? <CiPill state={p.pr.ci}>{CI_WORD[p.pr.ci]}</CiPill> : null}
          {p.pr.url ? <a href={p.pr.url} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', fontSize: 13 }}>View on your git host<Icon name="external2" size={12} style={{ marginLeft: 4, verticalAlign: -1 }} /></a> : null}
        </div>
      </Pkg>
    );
  } else {
    const answered = (L.questions || []).filter((q) => q.answer != null && q.how !== 'default').length;
    const defaults = (L.questions || []).filter((q) => q.how === 'default').length;
    const taken = parked.filter((x) => x.state === 'approved' || x.state === 'changed');
    const worked = dur(L.workedMs);
    card = (
      <Pkg style={{ gap: 12, padding: '14px 16px 16px' }}>
        <PkgHead title={p.title || 'Package'} sub={[p.branch, base?.num ? `stacks on #${base.num}` : 'main'].filter(Boolean).join(' → ')} />
        <Strip closed={closed} ac={p.ac} worked={worked} />
        <div className="pkg-grid" style={{ gap: '10px 16px' }}>
          <PkgSec k={`Chunks closed · ${closed.length}`}>
            {closed.map((c) => <PkgRow key={c.id} id={c.id} t={c.title} m={c.ac ? `${c.ac.met}/${c.ac.total}` : ''} />)}
          </PkgSec>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <div className="pkg-sec">
              <span className="pkg-k">Defaults taken · {taken.length}</span>
              {taken.map((x, i) => (
                <div key={i} className="pkg-row" style={{ gridTemplateColumns: '12px minmax(0, 1fr) auto' }}>
                  <span className={cx('park-mark', x.state === 'changed' ? 'is-changed' : 'is-ok')} />
                  <span className="t">{x.short || (x.state === 'changed' ? x.alts?.[x.pick ?? 1] : x.alts?.[0])}</span>
                  <span className="m">{x.state === 'changed' ? (x.fix || 'changed') : 'ok'}</span>
                </div>
              ))}
            </div>
            <PkgSec k={`Answers given · ${answered + defaults}`}>
              <span className="t-body-s c-2">{answered} answered, {defaults} defaults, all quoted in the description.</span>
            </PkgSec>
          </div>
        </div>
        {base?.num ? <Retarget><>Targets <b>#{base.num}</b>'s branch; retargets to main by itself when #{base.num} merges.</></Retarget> : null}
        {editing != null ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea className="field" rows={8} aria-label="Pull request description" value={editing} onChange={(e) => setEditing(e.target.value)} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-s" type="button" disabled={busy} onClick={async () => { if (await onSaveDescription(editing)) setEditing(null); }}>Save description</button>
              <button className="btn btn-ghost btn-s" type="button" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        ) : null}
        <div className="pkg-foot">
          <button className="btn btn-primary" type="button" disabled={busy} onClick={onOpen}><Icon name="contrib" />Open pull request</button>
          <button className="btn btn-ghost" type="button" disabled={editing != null} onClick={() => setEditing(p.description || '')}>Edit description</button>
          <span className="tb-spacer" />
          {p.diff ? <span className="t-mono-xs c-3">+{num(p.diff.add)} −{num(p.diff.del)}</span> : null}
        </div>
      </Pkg>
    );
  }

  return (
    <div className="lp" style={{ paddingTop: 18 }}>
      {base?.num ? (
        <Stack bases={[{ content: <><PrPill num={`#${base.num}`} state="open" icon="prOpen" /><span>{base.title ? <b>{base.title}</b> : null}{[base.title ? '' : null, base.state, CI_WORD[base.ci]].filter((x) => x != null).join(' · ')}</span></> }]}>
          {card}
        </Stack>
      ) : card}
    </div>
  );
}
