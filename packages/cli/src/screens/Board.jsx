// The plan board (Board / BoardOwner boards, Light variants by token):
// every chunk in /next's pick order or grouped by spec, with claims on each
// row and a claims-by-person rail. Claim, hold, release, reassign and
// request run from the rows; an empty spec offers Chunk it. Owner mode
// (effective: .owner and not switched off) lands plan changes on main and
// may release or reassign anyone's claim; a contributor in a repo with
// protected claims requests instead. Pieces: screens/board/parts.jsx; the
// rules: screens/board/model.js.
import { useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ViewFrame, ViewHead, ViewTitle, InboxBtn, LoopStatus, Seg, ChoiceButtons, Icon, Protect, PbSec, PbFold,
  Empty, Err, ToastHost, useShell,
} from '../ui/index.js';
import { api, server, usePlan, useClaims, useSummaries, useSessions, useLocalSettings, useCloudLoop } from '../data/index.js';
import { PATHS, lastSession } from '../routes.js';
import {
  normalizePlan, indexClaims, meWhoFrom, withClaim, rowModel, lanes, specProgress, subLine, railPeople, hhmm,
} from './board/model.js';
import { BoardRow, BoardSpec, ClaimsRail, PlanPr } from './board/parts.jsx';

const SORTS = [
  { value: 'next', label: 'Next up' },
  { value: 'spec', label: 'By spec' },
  { value: 'size', label: 'By size' },
  { value: 'claim', label: 'Claimed / unclaimed' },
];
const FILTERS = [
  { value: 'mine', label: 'mine' },
  { value: 'unclaimed', label: 'unclaimed' },
  { value: 'held', label: 'held' },
];
const VERB = { claim: 'claim', hold: 'hold', unhold: 'unhold', reassign: 'reassign', request: 'request', release: 'release' };

const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

export default function Board() {
  const shell = useShell();
  const local = useLocalSettings();
  const owner = !!shell.owner && !(local.status === 'ready' && local.data?.ownerMode === false);
  const planR = usePlan();
  const claimsR = useClaims(15000);
  const sums = useSummaries();
  const sessR = useSessions(8000);
  const cloud = useCloudLoop();

  const [view, setView] = useState(null);
  const [sort, setSort] = useState('next');
  const [flt, setFlt] = useState([]);
  const [req, setReq] = useState({});
  const [pop, setPop] = useState(null);
  const [openOv, setOpenOv] = useState({});
  const [showClosed, setShowClosed] = useState(false);
  const [ck, setCk] = useState(null);
  const [bloom, setBloom] = useState({});
  const [madePr, setMadePr] = useState(null);
  const [busy, setBusy] = useState(null);
  const [protLive, setProtLive] = useState(false);
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((t) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((l) => [...l, { ...t, id }]);
    setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), 6000);
  }, []);

  const plan = useMemo(() => normalizePlan(planR.status === 'ready' ? planR.data : null), [planR.status, planR.data]);
  const repo = plan?.repo || shell.repo || '';
  const ownerName = plan?.ownerName || (owner ? 'you' : 'the owner');
  const prot = !owner && (!!plan?.protected || protLive);
  const rows = claimsR.status === 'ready' && Array.isArray(claimsR.data?.rows) ? claimsR.data.rows : [];
  const sessions = sessR.status === 'ready' && Array.isArray(sessR.data) ? sessR.data : [];
  const cloudNext = cloud.status === 'ready' && cloud.data?.next ? (/T/.test(cloud.data.next) ? hhmm(cloud.data.next) : String(cloud.data.next)) : '';
  const me = claimsR.status === 'ready' ? claimsR.data?.me || null : null;
  const ctx = useMemo(() => ({ meWho: meWhoFrom(rows, owner, me), owner, ownerName, sessions, cloudNext }), [rows, owner, me, ownerName, sessions, cloudNext]);
  const claims = useMemo(() => indexClaims(rows, ctx), [rows, ctx]);

  const chunks = useMemo(() => {
    if (!plan) return [];
    const sum = sums.status === 'ready' ? sums.data || {} : {};
    return plan.chunks.map((c) => {
      const s = sum[c.id];
      // The server sends a line only for a chunk the plan leaves without words (server/summaries.mjs).
      const named = s ?{ t: s.text ?? String(s), ai: true } : null;
      const b = bloom[c.id];
      return withClaim({ ...c, ...named, ...(b != null ? { bloom: true, delay: b, plotted: c.plotted || 'main' } : null) }, claims);
    });
  }, [plan, sums.status, sums.data, claims, bloom]);
  const byId = useMemo(() => Object.fromEntries(chunks.map((c) => [c.id, c])), [chunks]);
  const specById = useMemo(() => Object.fromEntries((plan?.specs || []).map((s) => [s.id, s])), [plan]);

  const v = view ?? (owner ? 'spec' : 'all');
  const f = { mine: flt.includes('mine'), unclaimed: flt.includes('unclaimed'), held: flt.includes('held') };
  const anyF = flt.length > 0;
  const ui = { owner, prot, ownerName, req, pop };

  // ---- actions -------------------------------------------------------------
  // Every verb is one run of the repo's claims CLI on the server (POST /api/claims/:verb), as the home session; a
  // release or unhold of your own claim names that claim's session, so a claim another of your sessions made is
  // still yours to drop (the CLI matches the person as well as the session).
  const act = useCallback(async (verb, id, extra = {}) => {
    setBusy(/^\d+$/.test(id) ? `spec ${id}` : id);
    try {
      const own = verb === 'release' || verb === 'unhold' ? rows.find((r) => String(r.id) === String(id) && (r.mine || (ctx.meWho && r.who === ctx.meWho))) : null;
      const res = await server.claimAction(verb, { id, ...(own?.session ? { session: own.session } : null), ...extra });
      if (res && res.ok === false) {
        const msg = res.error || res.out || 'The claims module said no.';
        if (/protected/i.test(msg)) setProtLive(true);
        toast({ kind: 'error', title: `Couldn't ${VERB[verb]} ${id}`, body: msg });
        return false;
      }
      if (verb === 'request') {
        const n = res?.issue?.number;
        toast({ kind: 'info', title: `Asked ${ownerName} for ${/^\d+$/.test(id) ? `spec ${id}` : id}`, body: n ? `Issue #${n} carries the request${res.issue.url ? `: ${res.issue.url}` : ''}.` : 'The request is an issue on the repo.' });
      }
      claimsR.reload();
      return true;
    } catch (e) {
      if (e.status === 404) {
        toast({ kind: 'info', title: `This server can't ${VERB[verb]} yet`, body: `Run it from a terminal for now: node scripts/claims.mjs ${verb === 'unhold' ? 'release' : verb === 'hold' ? 'assign' : verb} ${id}` });
      } else {
        if (/protected/i.test(e.message)) setProtLive(true);
        toast({ kind: 'error', title: `Couldn't ${VERB[verb]} ${id}`, body: e.message });
      }
      return false;
    } finally {
      setBusy(null);
    }
  }, [claimsR, toast, rows, ctx.meWho, ownerName]);

  /** Reassign: the person's GitHub login (the target picker is 40.12's); their claims name when a hold already carries it. */
  const reassign = useCallback((id) => {
    let login = '';
    try { login = (window.prompt(`Reassign ${id} to whom? Their GitHub login:`) || '').trim().replace(/^@/, ''); } catch { /* no prompt: nothing to do */ }
    if (!login) return;
    const known = rows.find((r) => r.held && String(r.held).toLowerCase() === login.toLowerCase());
    act('reassign', id, { login, ...(known?.who ? { to: known.who } : null) });
  }, [rows, act]);

  const openSpec = useCallback((spec) => {
    setView('spec');
    setOpenOv((o) => ({ ...o, [spec]: true }));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.getElementById(`spec-${spec}`)?.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
    }));
  }, []);

  const rowOn = {
    claim: (id) => act('claim', id),
    request: (id) => setPop((p) => (p === id ? null : id)),
    sendRequest: async (id) => { setPop(null); if (await act('request', id, { title: byId[id]?.t || '' })) setReq((r) => ({ ...r, [id]: true })); },
    closePop: () => setPop(null),
    release: (id) => act('release', id),
    hold: (id) => act('hold', id),
    unhold: (id) => act('unhold', id),
    reassign,
    open: openSpec,
  };

  const startChunk = async (spec) => {
    setCk({ spec, phase: 'loading', qs: [], answers: {} });
    try {
      const res = await api('/api/plan/chunk', { spec });
      const qs = (res.questions || []).map((q) => ({ q: q.q ?? q.question, opts: q.opts ?? q.options ?? [], rec: q.rec ?? 0 }));
      setCk({ spec, phase: 'asking', qs, answers: {} });
    } catch (e) {
      setCk(null);
      if (e.status === 404) {
        // No in-page chunking yet: start /next chunk in this server's session, as the GUI starts every skill (server.send).
        try {
          await server.send(`/next chunk ${spec}`);
          toast({ kind: 'info', title: `Started /next chunk ${spec}`, body: 'The session chunks it; the new chunks show here once they land.' });
        } catch (err) {
          toast({ kind: 'info', title: `Couldn't start /next chunk ${spec}`, body: `Run it from a terminal: /next chunk ${spec}${err?.message ? ` (${err.message})` : ''}` });
        }
      } else toast({ kind: 'error', title: `Couldn't start chunking spec ${spec}`, body: e.message });
    }
  };
  const makeChunks = async (spec) => {
    if (!ck) return;
    const answers = ck.qs.map((q, qi) => q.opts[ck.answers[qi] ?? q.rec ?? 0]);
    setCk({ ...ck, phase: 'making' });
    try {
      const res = await api('/api/plan/chunk', { spec, answers });
      const made = (res.chunks || []).map((c) => ({ id: String(c.id), t: c.t ?? c.title ?? '' }));
      setBloom((b) => ({ ...b, ...Object.fromEntries(made.map((c, i) => [c.id, i * 120])) }));
      setOpenOv((o) => ({ ...o, [spec]: true }));
      const landed = owner || !!res.landed;
      setMadePr({
        landed, adds: made,
        title: landed ? `Landed on main · spec ${spec}` : `Plan PR #${res.pr ?? ''} · adds ${made.length} chunk${made.length === 1 ? '' : 's'} to spec ${spec}`,
        pill: landed ? 'on main' : 'open',
        note: landed
          ? `You own ${repo}, so chunked and plotted work lands straight on main. No plan PR to wait for.`
          : `${ownerName} reviews it; until then ${made.length === 2 ? 'both chunks show' : made.length === 1 ? 'the chunk shows' : 'the chunks show'} as just plotted.`,
      });
      setCk(null);
      planR.reload();
    } catch (e) {
      setCk({ ...ck, phase: 'asking' });
      toast({ kind: 'error', title: `Couldn't chunk spec ${spec}`, body: e.message });
    }
  };

  const specOn = {
    toggle: (id) => setOpenOv((o) => ({ ...o, [id]: !(o[id] ?? specOpenDefault(id)) })),
    claim: (id) => (prot ? act('request', id, { title: specById[id]?.title || '' }).then((ok) => ok && setReq((r) => ({ ...r, [`spec${id}`]: true }))) : act('claim', id)),
    hold: (id) => act('hold', id),
    release: (id) => act('release', id),
    startChunk,
    pickAnswer: (qi, oi) => setCk((c) => (c ? { ...c, answers: { ...c.answers, [qi]: oi } } : c)),
    makeChunks,
    cancelChunk: () => setCk(null),
  };

  // ---- the model -----------------------------------------------------------
  const firstUp = new Set((plan?.order || []).slice(0, 3));
  function specOpenDefault(id) {
    const s = specById[id];
    if (!s) return false;
    if (s.open != null) return !!s.open;
    const list = chunks.filter((c) => c.spec === id);
    if (!list.length) return true;
    if (list.every((c) => c.state === 'closed')) return false;
    return !!claims.spec[id] || list.some((c) => c.plotted || c.claim || firstUp.has(c.id) || c.state === 'building');
  }

  const items = plan ? lanes(plan, chunks, sort, f, claims.spec) : [];
  const closedList = chunks.filter((c) => c.state === 'closed');
  const specs = (plan?.specs || []).map((s) => {
    const list = chunks.filter((c) => c.spec === s.id);
    const sc = claims.spec[s.id] || null;
    const prog = specProgress(list, s);
    return {
      id: s.id, title: s.title, file: s.file, prog, claim: sc, empty: list.length === 0,
      open: openOv[s.id] ?? specOpenDefault(s.id),
      rows: list.filter((c) => {
        const cover = sc && c.state !== 'closed' && !c.claim ? sc : null;
        return !anyF || (f.mine && (c.claim || cover)?.person === 'you') || (f.unclaimed && !(c.claim || cover) && c.state !== 'closed') || (f.held && (c.claim || cover)?.kind === 'held');
      }).map((c) => rowModel(c, sc && c.state !== 'closed' && !c.claim ? sc : null, ui)),
    };
  });
  const people = railPeople(rows, ctx, byId, specById);

  const planPr = madePr || (plan?.planPr ? fromPlanPr(plan.planPr, byId) : null);

  // ---- render ----------------------------------------------------------------
  const sub = plan ? subLine(repo, plan, owner) : repo;
  const modeLabel = owner ? 'Owner · plan changes land on main' : 'Contributor · plan changes go up as plan PRs';
  const last = lastSession();
  const plotTo = last ? PATHS.cockpit(last) : PATHS.fleet;
  const loop = cloud.status === 'ready' && cloud.data
    ? <LoopStatus paused={!!cloud.data.paused}>{cloud.data.paused ? 'paused' : cloudNext ? `next ${cloudNext}` : 'idle'}</LoopStatus>
    : null;

  let main;
  if (planR.status === 'loading') main = null;
  else if (planR.status === 'ready' && planR.data?.available === false) {
    main = <Empty sky="none" title="No plan to show yet" body={planR.data.note || 'This repo has no plan scripts yet.'} />;
  } else if (planR.status === 'missing') {
    main = <Empty sky="none" title="No plan to show yet" body="This nexus server doesn't serve the plan yet. Claims still show on the right, live." />;
  } else if (planR.status === 'error') {
    main = <Err title="Couldn't read the plan" body="Nothing changed in the repo. The plan files are where they were." detail={planR.error} actions={<button className="btn btn-s" type="button" onClick={planR.reload}>Try again</button>} />;
  } else if (v === 'all') {
    const nothing = !items.length;
    main = nothing && !anyF && !closedList.length ? (
      <Empty sky="flat" title="Nothing ready" body="Every planned chunk is claimed or done. Plot more work, or let the loop rest." action={<Link className="btn btn-s" to={plotTo}>/plot</Link>} />
    ) : (
      <div className="pb-list" role="list" aria-label="All chunks">
        {nothing && anyF ? <PbSec title="Nothing matches" d="no chunk passes these filters; clear one to see more" /> : null}
        {nothing && !anyF ? <PbSec title="Nothing open" d="every chunk in the plan is closed" /> : null}
        {items.map((sec) => [
          <PbSec key={`s-${sec.title}`} asap={sec.asap} title={sec.title} n={sec.rows.length} d={sec.d} />,
          ...sec.rows.map(([c, cover]) => <BoardRow key={c.id} r={rowModel(c, cover, ui)} on={rowOn} repo={repo} ownerName={ownerName} busy={busy} />),
        ])}
        {!anyF && closedList.length ? (
          <PbFold open={showClosed} onClick={() => setShowClosed((x) => !x)}>
            <span>{showClosed ? `Hide ${closedList.length} closed` : `${closedList.length} closed · ${closedList.slice(0, 3).map((c) => c.id).join(', ')}…`}</span>
          </PbFold>
        ) : null}
        {!anyF && showClosed ? closedList.map((c) => <BoardRow key={c.id} r={rowModel(c, null, ui)} on={rowOn} repo={repo} ownerName={ownerName} busy={busy} />) : null}
      </div>
    );
  } else {
    main = specs.length ? (
      <div className="specs">
        {specs.map((s) => (
          <BoardSpec key={s.id} s={s} on={specOn} rowOn={rowOn} repo={repo} ownerName={ownerName} busy={busy} prot={prot} owner={owner}
            ck={ck && ck.spec === s.id ? ck : null}
            note={owner ? 'They land on main as soon as you make them.' : `They go up as a plan PR for ${ownerName} to review.`} />
        ))}
      </div>
    ) : (
      <Empty sky="flat" title="Nothing ready" body="Every planned chunk is claimed or done. Plot more work, or let the loop rest." action={<Link className="btn btn-s" to={plotTo}>/plot</Link>} />
    );
  }

  const claimsNote = claimsR.status === 'ready' && claimsR.data?.available === false ? (claimsR.data.note || 'No claims module in this repo yet.')
    : claimsR.status === 'ready' && claimsR.data?.error ? `Couldn't read the claims branch: ${claimsR.data.error}`
      : claimsR.status === 'error' ? `Couldn't read the claims: ${claimsR.error}`
        : claimsR.status === 'missing' ? "This server doesn't read claims yet." : null;

  return (
    <ViewFrame current="board" title={repo || 'nexus'} sub={modeLabel} label="Plan board" actions={<>{loop}<InboxBtn /></>}>
      <ViewHead>
        <ViewTitle title={<h1 className="t-title-l">Plan</h1>} sub={sub} />
        <div className="view-acts">
          <Seg name="pbview" label="View" value={v} onChange={(x) => { setView(x); setPop(null); }} options={[{ value: 'all', label: 'All chunks' }, { value: 'spec', label: 'By spec' }]} />
          <Link className="btn" to={plotTo}><Icon name="plus" size={14} />Plot something</Link>
        </div>
      </ViewHead>
      <div className="pboard">
        <div className="pb-main">
          <div className="pb-tools">
            {v === 'all' ? (
              <>
                <span className="t-label">Sort</span>
                <ChoiceButtons label="Sort" options={SORTS} value={sort} onChange={setSort} />
              </>
            ) : null}
            <span className="t-label">Show</span>
            <ChoiceButtons label="Filter" multi options={FILTERS} value={flt} onChange={(k) => setFlt((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]))} />
            <span className="tb-spacer" />
            {prot ? <Protect>Claims protected · requests go to {ownerName}</Protect> : null}
            {owner ? (
              <span className="protect" style={{ background: 'transparent', boxShadow: 'inset 0 0 0 1px var(--line-2)' }}>
                <Icon name="lockOne" />You own this plan · changes land on main
              </span>
            ) : null}
          </div>
          {main}
        </div>
        <aside className="pb-main" aria-label="Claims by person">
          {planPr ? <PlanPr pr={planPr} /> : null}
          <ClaimsRail people={people} owner={owner} busy={busy} note={claimsNote}
            empty="Nobody holds a claim. Every open chunk is free to take."
            onRelease={(id) => act('release', id)} onReassign={reassign} />
        </aside>
      </div>
      <ToastHost toasts={toasts.map((t) => ({ ...t, onDismiss: () => setToasts((l) => l.filter((x) => x.id !== t.id)) }))} />
    </ViewFrame>
  );
}

/** The plan's own plan PR record -> the card's fields. */
function fromPlanPr(pr, byId) {
  const adds = (pr.adds || []).map((a) => (typeof a === 'string' ? { id: a, t: byId[a]?.t || '' } : { id: String(a.id), t: a.t ?? a.title ?? byId[a.id]?.t ?? '' }));
  const landed = !!pr.landed || pr.state === 'merged' || pr.state === 'main';
  const spec = adds[0] ? adds[0].id.split('.')[0] : '';
  return {
    landed, adds,
    title: pr.title || (landed ? `Landed on main · spec ${spec}` : `Plan PR #${pr.number ?? ''} · adds ${adds.length} chunk${adds.length === 1 ? '' : 's'} to spec ${spec}`),
    pill: landed ? 'on main' : (pr.state || 'open'),
    note: pr.note || '',
  };
}

