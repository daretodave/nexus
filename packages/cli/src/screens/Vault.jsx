// The vault (boards Vault, VaultImport, VaultContributor and their Light boards; the parts from VaultKit). The owner's
// face: every name the manifest declares with eight dots for its value, a dot per destination (set, out of sync,
// missing, not used there), the chunk that asked, its age with a rotate nudge, Add value / Sync / Replace; the import;
// the open secret requests as key cards; where values go; and the audit log. A contributor's face: "No project
// secrets needed", what the plan waits on the owner for, and their own local keys.
//
// Data: GET /api/secrets (useSecrets; server/secrets.mjs); writes: POST /api/secrets/:name (a value, in its body
// only), /api/secrets/:name/push (Sync, Retry), /api/secrets/import. The view model: screens/vault/model.js.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ViewFrame, ViewHead, Icon, InboxBtn, Err, ToastHost, MaskField, KeyCard, KeyOrb, AuditLog, VaultNote, KeyNote, TickLabel, cx, useShell,
} from '../ui/index.js';
import { server, usePlan, useSecrets } from '../data/index.js';
import { PATHS } from '../routes.js';
import LoopLine from './fleet/LoopLine.jsx';
import { useToasts } from './fleet/toasts.js';
import ImportPanel from './vault/ImportPanel.jsx';
import LocalKeys from './vault/LocalKeys.jsx';
import { useKeyCards } from './vault/useKeyCards.js';
import VaultSetup from './vault/VaultSetup.jsx';
import {
  DESTS, SHORT, HEAD_TITLE, addBody, addTick, auditRows, destRows, keyCards, nameInput, staleList, subLine, validName, vaultMissing, vaultRows, waitingOn,
} from './vault/model.js';

const NEW_DESTS = { local: true, 'github-actions': true, vercel: false, cloudflare: false };
const NEW_LABEL = { local: 'Local', 'github-actions': 'Actions', vercel: 'Vercel', cloudflare: 'Cloudflare' };

export default function Vault() {
  const shell = useShell();
  const res = useSecrets(15000);
  const st = res.data;
  const owner = st ? !!st.owner : !!shell.owner;
  const { toasts, push: toast } = useToasts();
  const repo = shell.repo;

  const actions = <><LoopLine /><InboxBtn /></>;
  let body;
  if (res.status === 'loading' && !st) body = null;
  else if (vaultMissing(st)) {
    // No vault scripts here: an empty state with the way forward, not an error (spec 47, A2).
    body = <div className="vault-scroll"><div style={{ marginTop: 56 }}><VaultSetup owner={owner} envNames={st.rootEnv?.exists ? st.rootEnv.names : 0} reload={res.reload} toast={toast} /></div></div>;
  } else if (!st) {
    body = <Err title="The vault did not answer" body={res.error || 'GET /api/secrets did not answer.'} detail={null} actions={<button className="btn btn-s" type="button" onClick={res.reload}>Check again</button>} />;
  } else if (owner) body = <OwnerVault st={st} repo={repo} reload={res.reload} toast={toast} />;
  else body = <ContributorVault st={st} repo={repo} reload={res.reload} toast={toast} />;

  return (
    <ViewFrame current="vault" title="Vault" sub={repo} label="Vault" actions={actions}>
      {body}
      <ToastHost toasts={toasts} />
    </ViewFrame>
  );
}

function OwnerVault({ st, repo, reload, toast }) {
  const [panel, setPanel] = useState('table');
  const [adding, setAdding] = useState(false);
  const [nw, setNw] = useState({ name: '', for: '', value: '', dests: NEW_DESTS });
  const [edit, setEdit] = useState(null);
  const [draft, setDraft] = useState('');
  const [fresh, setFresh] = useState(new Set());
  const [freshAudit] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const now = Date.now();
  const kc = useKeyCards({ reload, onSaved: (card) => setFresh(new Set([card.name])) });

  const rows = vaultRows(st, { edit, fresh, now });
  const audit = auditRows(st, { now, fresh: freshAudit });
  const dests = destRows(st, { repo });
  const stale = staleList(st);
  const staleN = stale.reduce((n, x) => n + x.destinations.length, 0);
  const cards = useMemo(() => {
    const live = keyCards(st, { now });
    const keys = new Set(live.map((c) => c.key));
    return [...live, ...kc.held.filter((c) => !keys.has(c.key))];
  }, [st, kc.held]); // eslint-disable-line react-hooks/exhaustive-deps
  const empty = !rows.length;

  const run = async (fn, fail) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast({ kind: 'error', title: fail, body: e.message }); } finally { setBusy(false); }
  };
  const refused = (r, name) => {
    const bad = (r.pushed || []).filter((p) => !p.ok);
    if (bad.length) toast({ kind: 'error', title: `${name}: ${bad.map((p) => SHORT[p.destination] || p.destination).join(', ')} refused it`, body: bad.map((p) => p.error).filter(Boolean).join('; ') || 'Retry with Sync.' });
  };
  const saveDraft = (r) => run(async () => {
    const out = await server.storeSecret(r.name, { value: draft, destinations: r.pushTo });
    setEdit(null);
    setDraft('');
    setFresh(new Set([r.name]));
    refused(out, r.name);
    reload();
  }, `${r.name} was not saved`);
  const sync = (name, destinations) => run(async () => {
    const out = await server.pushSecret(name, destinations);
    setFresh(new Set([name]));
    refused(out, name);
    reload();
  }, `${name} did not sync`);
  const syncAll = () => run(async () => {
    for (const x of stale) refused(await server.pushSecret(x.name, x.destinations), x.name);
    setFresh(new Set(stale.map((x) => x.name)));
    reload();
  }, 'Sync stopped');
  // Declare (spec 49, A4): an undeclared vault name joins nexus.secrets.json, names only, through the manifest route.
  const declare = (name) => run(async () => {
    await server.startManifest({ fromEnv: true, names: [name] });
    setFresh(new Set([name]));
    toast({ kind: 'shipped', title: `nexus.secrets.json declares ${name}`, body: 'Names only; say what it is for in the manifest.' });
    reload();
  }, `${name} was not declared`);
  const addSecret = () => run(async () => {
    const out = await server.storeSecret(nw.name, addBody(nw));
    setAdding(false);
    setFresh(new Set([nw.name]));
    setNw({ name: '', for: '', value: '', dests: NEW_DESTS });
    refused(out, nw.name);
    reload();
  }, `${nw.name} was not added`);

  return (
    <>
      <ViewHead>
        <div className="view-title"><h1 className="t-title-l">Vault</h1><VaultNote /></div>
        <div className="view-acts">
          <span className="view-sub">{subLine(st)}</span>
          <button className="btn" type="button" onClick={() => { setPanel('import'); setAdding(false); setEdit(null); }}><Icon name="fileOne" size={14} />Import .env</button>
          <button className="btn btn-primary" type="button" onClick={() => { setAdding(true); setPanel('table'); setEdit(null); }}><Icon name="plus" size={14} />Add a secret</button>
        </div>
      </ViewHead>
      <div className="vault-wrap">
        <div className="vt-col">
          {panel === 'import' || (empty && !adding) ? (
            <ImportPanel status={st} toast={toast} onClose={() => setPanel('table')} onDone={(r) => { setFresh(new Set(r.stored || [])); reload(); }} />
          ) : null}
          {panel === 'table' && (!empty || adding) ? (
            <>
              <div className="vt" role="table" aria-label="Secrets">
                <div className="vt-head" role="row">
                  <span>Name</span><span>Value</span>
                  {DESTS.map((d) => <span key={d} className="dest" title={HEAD_TITLE[d]}>{d === 'local' ? 'Local' : SHORT[d]}</span>)}
                  <span>Chunk</span><span>Rotated</span><span />
                </div>
                {adding ? (
                  <div className="vt-row is-editing" role="row" style={{ gridTemplateColumns: 'minmax(0, 1fr)', paddingTop: 10, paddingBottom: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, .9fr) minmax(0, 1.1fr)', gap: 10 }}>
                      <input className="field" type="text" value={nw.name} onChange={(e) => setNw({ ...nw, name: nameInput(e.target.value) })} aria-label="Secret name" placeholder="NAME_LIKE_THIS" style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }} autoFocus />
                      <input className="field" type="text" value={nw.for} onChange={(e) => setNw({ ...nw, for: e.target.value })} aria-label="What it is for" placeholder="What it is for" />
                    </div>
                    <MaskField value={nw.value} onChange={(v) => setNw({ ...nw, value: v })} label="Value" />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                      <span className="t-label c-2">Store it</span>
                      {DESTS.map((d) => { const t = addTick(nw, d); return <TickLabel key={d} checked={t.checked} disabled={t.disabled} title={t.title} onChange={(on) => setNw({ ...nw, dests: { ...nw.dests, [d]: on } })}>{NEW_LABEL[d]}</TickLabel>; })}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button className="btn btn-s btn-primary" type="button" onClick={addSecret} disabled={!validName(nw.name) || !nw.value || busy}>Add to the vault</button>
                      <button className="btn btn-s btn-ghost" type="button" onClick={() => setAdding(false)}>Cancel</button>
                      <span className="t-body-s c-3">The manifest gets the name; the value goes only where you tick.</span>
                    </div>
                  </div>
                ) : null}
                {rows.map((r) => (
                  <div key={r.name} className={cx('vt-row', r.requested && 'is-requested', r.editing && 'is-editing', r.fresh && 'is-fresh')} role="row">
                    <span className="sec-name" role="cell"><b>{r.name}</b><span>{r.for}</span></span>
                    <span className={cx('mask', !r.set && 'is-empty')} role="cell" aria-label={r.maskAria}>{r.mask}</span>
                    {r.dots.map((x) => <span key={x.d} className={x.cls} role="img" aria-label={x.title} title={x.title} />)}
                    <span role="cell">{r.chunk ? <span className="chunk-id">{r.chunk}</span> : <span className="t-body-s c-3">—</span>}</span>
                    <span className="vt-age" role="cell">
                      <span>{r.age}</span>
                      {r.old ? <button className="rotate-nudge" type="button" onClick={() => { setDraft(''); setAdding(false); setEdit(r.name); }}><Icon name="refresh" size={12} />rotate?</button> : null}
                    </span>
                    <span className="vt-acts" role="cell">
                      {r.canAdd ? <button className="btn btn-s btn-primary" type="button" onClick={() => { setDraft(''); setAdding(false); setEdit(r.name); }}><Icon name="key" size={14} />Add value</button> : null}
                      {r.canSync ? <button className="btn btn-s" type="button" onClick={() => sync(r.name, r.stale)} disabled={busy}><Icon name="refresh" size={14} />Sync</button> : null}
                      {r.canReplace ? <button className="btn btn-s btn-ghost" type="button" onClick={() => { setDraft(''); setAdding(false); setEdit(r.name); }}>Replace</button> : null}
                      {r.canDeclare ? <button className="btn btn-s" type="button" onClick={() => declare(r.name)} disabled={busy}><Icon name="plus" size={14} />Declare</button> : null}
                    </span>
                    {r.editing ? (
                      <div className="vt-edit">
                        <MaskField value={draft} onChange={setDraft} label={`New value for ${r.name}`} placeholder={r.placeholder} autoFocus onEnter={() => draft && saveDraft(r)} />
                        <button className="btn btn-s btn-primary" type="button" onClick={() => saveDraft(r)} disabled={!draft || busy}>Save</button>
                        <button className="btn btn-s btn-ghost" type="button" onClick={() => { setEdit(null); setDraft(''); }}>Cancel</button>
                        <span className="t-body-s c-3">{r.editNote}</span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="dd-legend">
                <span><i className="dd is-set" />set</span><span><i className="dd is-stale" />out of sync</span><span><i className="dd is-missing" />missing</span><span><i className="dd is-none" />not used there</span>
                {rows.some((r) => r.dots.some((x) => x.cls === 'dd is-unknown')) ? <span><i className="dd is-unknown" />unknown: gh can&apos;t tell</span> : null}
                <span className="tb-spacer" style={{ flex: 1 }} />
                <span>Rotate nudges after {st.rotateDays || 90} days.</span>
              </div>
              {audit.length ? (
                <div className="side-card audit-card">
                  <div className="crail-h"><span className="t-caps c-2">Audit log</span><span className="tb-spacer" style={{ flex: 1 }} /><span className="cap">names and destinations only, never values</span></div>
                  <AuditLog rows={audit} />
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="vt-col" aria-label="Requests and destinations">
          {cards.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cards.map((c) => <KeyCard key={c.key} {...kc.props(c)} />)}
            </div>
          ) : null}
          <div className="side-card">
            <div className="crail-h">
              <span className="t-caps c-2">Where values go</span>
              <span className="tb-spacer" style={{ flex: 1 }} />
              {staleN ? <button className="btn btn-s" type="button" onClick={syncAll} disabled={busy}><Icon name="refresh" size={14} />Sync {staleN} out of sync</button> : null}
            </div>
            <div className="dest-list">
              {dests.map((g) => (
                <div key={g.d} className="dest-row"><span className={g.dot} /><span className="t"><b>{g.label}</b><span>{g.what}</span></span><span className="n">{g.count}</span></div>
              ))}
            </div>
            <KeyNote>A command that needs a value gets it at run time; nexus scrubs it from anything a session can read.</KeyNote>
          </div>
        </div>
      </div>
    </>
  );
}

function ContributorVault({ st, repo, reload, toast }) {
  const plan = usePlan();
  const wait = waitingOn(plan.status === 'ready' ? plan.data : null);
  const ownerName = (plan.data?.ownerName) || 'the owner';
  const Owner = ownerName === 'the owner' ? 'The owner' : ownerName;
  return (
    <div className="vault-scroll">
      <div className="vault-none is-contrib">
        <KeyOrb state="quiet" />
        <h1 className="t-title-l">No project secrets needed</h1>
        <p className="t-body c-2">Contributors open PRs; the owner&apos;s loop deploys. When a chunk needs a project secret, the plan board marks it needs secret and the owner adds the value.</p>
        {wait ? (
          <div className="vault-waiting">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="t-caps c-2">Waiting on {ownerName}</span>
              <span className="tb-spacer" style={{ flex: 1 }} />
              <Link className="btn btn-ghost btn-s" to={PATHS.board}><Icon name="list" size={14} />Open the plan board</Link>
            </div>
            <div className="secret-wait" role="note">
              <KeyOrb state="quiet" />
              <span><b>{wait.chunk} needs <code>{wait.name}</code>.</b> {Owner} adds it in the vault; the owner&apos;s loop deploys and picks {wait.chunk} back up. Contributors never handle project secrets.</span>
            </div>
          </div>
        ) : null}
        <LocalKeys status={st} repo={repo} reload={reload} toast={toast} />
        <VaultNote />
      </div>
    </div>
  );
}
