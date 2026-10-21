// The plan board's pieces, markup as Board.dc.html draws it (PlanKit board):
// the row claim badge, the chunk row with its hover actions and request
// popover, the spec group with Chunk it, the plan PR card, the claims rail.
// Built on the shared ui/ kit where its markup matches the board exactly.
import {
  AiGlyph, SizeTag, Icon, Moon, Grip, Star, Pct, ChunkIt, CkQ, CRail, CrPerson, CrSess, CrClaim, ReqPop, ChoiceButtons, cx,
} from '../../ui/index.js';
import { CS } from './model.js';

/** The row's claim badge (.claim): a star session, the cloud loop, a hold, or a neutral initial. */
export function ClaimBadge({ cl, whole }) {
  const cls = cx('claim',
    cl.kind === 'sess' ? `sess-${cl.who}` : cl.kind === 'cloud' ? 'is-cloud' : cl.kind === 'held' ? 'is-held' : 'is-other',
    cl.stale && 'is-stale');
  let av = null;
  if (cl.kind === 'sess') av = <Star name={cl.who} />;
  else if (cl.kind === 'cloud') av = <Icon name="cloud" style={{ width: 11, height: 11 }} />;
  else if (cl.kind === 'held') av = <Icon name="hold" style={{ width: 11, height: 11 }} />;
  else av = <span>{cl.initial || ''}</span>;
  return (
    <span className={cls}>
      <span className="claim-av">{av}</span>
      <span className="claim-who">{whole ? `${cl.label} · whole spec` : cl.label}</span>
      <span className="claim-since">{cl.since}</span>
    </span>
  );
}

function Act({ icon, ghost, children, onClick, busy, ...rest }) {
  return (
    <button className={cx('btn btn-s', ghost && 'btn-ghost')} type="button" onClick={onClick} disabled={busy} aria-busy={busy || undefined} {...rest}>
      <Icon name={icon} size={14} />{children}
    </button>
  );
}

/**
 * .crow: one chunk. r is a rowModel; on: { claim, request, sendRequest,
 * closePop, release, hold, unhold, reassign, open } handlers by id.
 */
export function BoardRow({ r, on, repo, ownerName, busy }) {
  const cl = r.claim;
  const b = busy === r.id;
  return (
    <div className={cx('crow', CS[r.state], r.closed && 'is-closed', r.plotted && 'is-plotted', r.covered && 'is-covered', r.hover && 'is-hover', r.bloom && 'is-bloom')} style={r.delay != null ? { '--d': `${r.delay}ms` } : undefined} role="listitem">
      <Grip />
      <Moon state={r.state === 'closed' ? 'settled' : r.state} />
      <span className="chunk-id">{r.id}</span>
      <span className="crow-t">
        <span className="tt">{r.t}</span>
        {r.ai ? <AiGlyph /> : null}
        {r.plotted ? <span className="plotted-tag">{r.plottedLabel}</span> : null}
      </span>
      <SizeTag size={r.size} />
      <span className="crow-state">{r.stateLabel}</span>
      {cl ? <ClaimBadge cl={cl} /> : <span className="crow-free">{r.freeLabel}</span>}
      <div className="crow-acts">
        {r.canClaim ? <Act icon="flag" busy={b} onClick={() => on.claim(r.id)}>Claim</Act> : null}
        {r.canRequest ? <Act icon="flag" busy={b} onClick={() => on.request(r.id)} aria-expanded={r.showPop ? 'true' : 'false'}>Request claim</Act> : null}
        {r.canRelease ? <Act icon="release" ghost busy={b} onClick={() => on.release(r.id)}>Release</Act> : null}
        {r.canHold ? <Act icon="hold" ghost busy={b} onClick={() => on.hold(r.id)}>Hold</Act> : null}
        {r.canUnhold ? <Act icon="hold" ghost busy={b} onClick={() => on.unhold(r.id)}>Unhold</Act> : null}
        {r.canReassign ? <Act icon="swap" ghost busy={b} onClick={() => on.reassign(r.id)}>Reassign</Act> : null}
        <a className="btn btn-s btn-ghost btn-icon" href={`#spec-${r.spec}`} aria-label={`Open ${r.id} in its spec`} onClick={(e) => { e.preventDefault(); on.open(r.spec); }}>
          <Icon name="external" size={14} />
        </a>
      </div>
      {r.showPop ? (
        <ReqPop onSend={() => on.sendRequest(r.id)} onCancel={on.closePop}>
          <span><b>Claims are protected in {repo}.</b> The claims branch only takes pushes from {ownerName}, so nexus sends a request instead. {ownerName} gets a one-tap yes or no; most come back in minutes.</span>
          <span>Until then <b>{r.id}</b> stays unclaimed, and /next keeps offering it to everyone.</span>
        </ReqPop>
      ) : null}
    </div>
  );
}

/** .chunkit-flow: the spec's questions (recommended answer preselected), then Make the chunks. */
export function ChunkFlow({ qs, answers, onPick, onMake, onCancel, note, making }) {
  return (
    <div className="chunkit-flow">
      <span className="t-caps c-2">Chunk it · {qs.length} question{qs.length === 1 ? '' : 's'}</span>
      {qs.map((q, qi) => (
        <CkQ key={qi} q={q.q}>
          <ChoiceButtons label={q.q} options={q.opts.map((label, oi) => ({ value: oi, label }))} value={answers[qi] ?? q.rec ?? 0} onChange={(oi) => onPick(qi, oi)} />
        </CkQ>
      ))}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-primary btn-s" type="button" onClick={onMake} disabled={making} aria-busy={making || undefined}>
          {making ? <span className="spin" /> : <Icon name="rays8" size={14} />}Make the chunks
        </button>
        <button className="btn btn-ghost btn-s" type="button" onClick={onCancel}>Cancel</button>
        <span className="t-body-s c-3">{note}</span>
      </div>
    </div>
  );
}

/**
 * .spec: a spec with its chunks nested. s: { id, title, file, prog, open,
 * claim, rows, empty }. ck: this spec's Chunk it state, or null.
 */
export function BoardSpec({ s, on, rowOn, repo, ownerName, busy, ck, prot, owner, note }) {
  const sc = s.claim;
  const title = `${s.id} · ${s.title}`;
  const canClaim = !sc && !s.empty && s.prog.done < s.prog.total;
  const asking = ck && (ck.phase === 'asking' || ck.phase === 'making');
  return (
    <section className={cx('spec', s.open && 'is-open', sc && 'is-claimed')} id={`spec-${s.id}`} aria-label={title}>
      <div className="spec-h">
        <button className="spec-tog" type="button" onClick={() => on.toggle(s.id)} aria-expanded={s.open ? 'true' : 'false'} aria-label={`Show chunks of ${title}`}>
          <Icon name="chevronRight" size={14} />
        </button>
        <div className="spec-name"><b>{title}</b><span>{s.file}</span></div>
        <Pct pct={s.prog.pct} n={s.prog.text} />
        <div className="spec-acts">
          {sc ? <ClaimBadge cl={sc} whole /> : null}
          {canClaim ? <Act icon="flag" busy={busy === `spec ${s.id}`} onClick={() => on.claim(s.id)}>{prot ? 'Request spec' : 'Claim spec'}</Act> : null}
          {canClaim && !prot ? <Act icon="hold" ghost busy={busy === `spec ${s.id}`} onClick={() => on.hold(s.id)}>Hold</Act> : null}
          {sc && (owner || sc.person === 'you') && sc.kind !== 'cloud' ? <Act icon="release" ghost busy={busy === `spec ${s.id}`} onClick={() => on.release(s.id)}>Release</Act> : null}
        </div>
      </div>
      {s.open && !s.empty ? (
        <div className="spec-body" role="list" aria-label={`Chunks of ${title}`}>
          {s.rows.map((r) => <BoardRow key={r.id} r={r} on={rowOn} repo={repo} ownerName={ownerName} busy={busy} />)}
        </div>
      ) : null}
      {s.open && s.empty && !asking ? <ChunkIt onClick={() => on.startChunk(s.id)} /> : null}
      {s.open && s.empty && asking ? (
        <ChunkFlow qs={ck.qs} answers={ck.answers} making={ck.phase === 'making'} note={note}
          onPick={(qi, oi) => on.pickAnswer(qi, oi)} onMake={() => on.makeChunks(s.id)} onCancel={on.cancelChunk} />
      ) : null}
    </section>
  );
}

/** .planpr: what the last plot or Chunk it added, as a plan PR or landed on main. */
export function PlanPr({ pr }) {
  return (
    <div className={cx('planpr', pr.landed && 'is-landed')}>
      <div className="planpr-head">
        <Icon name="list" style={{ color: 'var(--accent)' }} />
        <span className="planpr-title">{pr.title}</span>
        <span className={cx('pill pill-pr', pr.landed ? 'is-merged' : 'is-open')} style={{ marginLeft: 'auto', height: 22 }}><span className="num">{pr.pill}</span></span>
      </div>
      {pr.adds.map((a) => (
        <div className="planpr-add" key={a.id}><span className="plus">+</span><span className="id">{a.id}</span><span>{a.t}</span></div>
      ))}
      {pr.note ? <span className="t-body-s c-3">{pr.note}</span> : null}
    </div>
  );
}

/** The claims rail (.crail): by person, then session; actions on hover per mode. */
export function ClaimsRail({ people, owner, onRelease, onReassign, busy, note, empty }) {
  return (
    <CRail cap={owner ? 'you can release or reassign any claim' : 'your own claims show actions'}>
      {note ? <span className="t-body-s c-3">{note}</span> : null}
      {!people.length && !note ? <span className="t-body-s c-3">{empty}</span> : null}
      {people.map((pp) => (
        <CrPerson key={pp.name} initial={pp.initial} av={pp.av} name={pp.name} d={pp.d}>
          {pp.sessions.map((x) => (
            <CrSess key={x.key} session={x.star ? { name: x.star, kind: 'local' } : null} title={x.name} state={x.d}>
              {x.claims.map((c) => {
                const cl = c.v;
                const isCloud = cl.kind === 'cloud';
                const canRelease = (pp.you || owner) && !isCloud;
                const canReassign = owner && !pp.you && !isCloud;
                const acts = canRelease || canReassign ? (
                  <>
                    {canRelease ? <button className="btn btn-ghost" type="button" disabled={busy === c.rawId} onClick={() => onRelease(c.rawId)}>Release</button> : null}
                    {canReassign ? <button className="btn btn-ghost" type="button" disabled={busy === c.rawId} onClick={() => onReassign(c.rawId)}>Reassign</button> : null}
                  </>
                ) : <span className="exp" style={{ visibility: 'visible' }}>{cl.exp}</span>;
                return (
                  <CrClaim key={c.id} id={c.id} t={c.t} exp={cl.exp} expKind={cl.kind === 'held' ? 'held' : cl.stale ? 'stale' : undefined} gone={c.gone} acts={acts} />
                );
              })}
            </CrSess>
          ))}
        </CrPerson>
      ))}
    </CRail>
  );
}
