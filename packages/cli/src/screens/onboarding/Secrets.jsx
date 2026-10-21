// Step 4 · Secrets, optional (boards Secrets, SecretsContributor, SecretsLight). An owner starts the vault: import a
// dotenv (the one found at the root, or a picked file; names come in, the values go to the vault and the places
// ticked), start an empty manifest, or skip. A contributor (4b) reads "No project secrets needed", what a chunk that
// needs one looks like on the board, and may add their own local keys for this machine.
import { Fragment, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, TickBox, EnvFile, KeyNote, VaultNote, KeyBadge, KeyMoon, MASK_DOTS, ToastHost, cx, useShell, stepNo, stepCount, stepBefore, stepAfter } from '../../ui/index.js';
import { server, usePlan, useSecrets } from '../../data/index.js';
import { PATHS } from '../../routes.js';
import { ObFrame, Back } from './frame.jsx';
import { useDraft } from './draft.js';
import { useImport, useFilePick } from '../vault/ImportPanel.jsx';
import LocalKeys from '../vault/LocalKeys.jsx';
import { importNote, importTick, keepToggle, waitingOn } from '../vault/model.js';
import { useToasts } from '../fleet/toasts.js';

const PICKS = [
  { k: 'imp', label: 'Import a .env', rec: true },
  { k: 'empty', label: 'Start empty' },
  { k: 'skip', label: 'Skip for now' },
];

export default function Secrets() {
  const shell = useShell();
  const owner = !!shell.owner;
  const repo = shell.repo || 'this repo';
  const res = useSecrets();
  const st = res.data;
  const [d, patch] = useDraft();
  const pick = d.vault || 'imp';
  const nav = useNavigate();
  const { toasts, push: toast } = useToasts();
  const [busy, setBusy] = useState(false);
  const imp = useImport({ status: st, owner: true, toast });
  const [fileInput, pickFile] = useFilePick(imp.fromFile);
  const found = st?.envFiles || [];

  // The found dotenv is read for its names as soon as the step knows of it (owner, Import picked).
  useEffect(() => {
    if (owner && pick === 'imp' && found.length && imp.phase === 'empty' && !imp.busy) imp.fromRoot(found[0]);
  }, [owner, pick, found.join(), imp.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = PATHS.onboarding(stepAfter('secrets'));
  const go = async () => {
    if (!owner || pick === 'skip') { nav(next); return; }
    setBusy(true);
    try {
      if (pick === 'imp' && imp.kept) await imp.confirm();
      if (pick === 'empty') await server.startManifest();
      nav(next);
    } catch (e) {
      toast({ kind: 'error', title: 'The vault did not start', body: e.message });
    } finally {
      setBusy(false);
    }
  };
  const cta = !owner ? 'Continue'
    : pick === 'imp' ? (imp.kept ? `Import ${imp.kept} ${imp.kept === 1 ? 'name' : 'names'} and continue` : 'Continue')
      : pick === 'empty' ? 'Write an empty manifest' : 'Continue without secrets';

  const foot = (
    <>
      <Back to={stepBefore('secrets')} />
      <span className="ob-count">{stepCount('secrets')} · optional</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {owner ? <Link className="btn btn-ghost" to={next} onClick={() => patch({ vault: 'skip' })}>Skip</Link> : null}
        <button className="btn btn-primary btn-l" type="button" onClick={go} disabled={busy}>{cta}<Icon name="arrowRight" size={14} /></button>
      </div>
    </>
  );

  const example = imp.rows.find((r) => r.keep)?.name || 'SMTP_PASSWORD';
  const plan = usePlan();
  const wait = owner ? null : waitingOn(plan.status === 'ready' ? plan.data : null);
  const waitChunk = wait ? (plan.data?.specs || []).flatMap((s) => s.chunks || []).find((c) => String(c.id) === wait.chunk) : null;

  return (
    <ObFrame step="secrets" foot={foot}>
      {fileInput}
      <div className={cx('secrets-grid', !owner && 'is-contrib')}>
        {owner ? (
          <div className="ob-copy">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="kicker">step {stepNo('secrets')} · secrets · optional</span>
              <h1 className="t-display-s">Names in, values never</h1>
            </div>
            <p className="t-body-l ob-lede">nexus agents work with names like <code className="secret-code">{example}</code> and never see a value. Bring in what {repo} already uses, or let each chunk ask when it needs one.</p>
            <div className="ob-q">
              <div className="ob-q-h"><span className="n">1</span>Start the vault with</div>
              <div className="sched sched-col" role="radiogroup" aria-label="Start the vault with">
                {PICKS.map((p) => (
                  <Fragment key={p.k}>
                    <input type="radio" name="vstart" id={`vs-${p.k}`} checked={pick === p.k} onChange={() => patch({ vault: p.k })} />
                    <label htmlFor={`vs-${p.k}`}>
                      <b>{p.label}{p.rec ? <> <span className="badge-def">recommended</span></> : null}</b>
                      <span>
                        {p.k === 'imp' ? (found.length ? `found ${found[0]} in ${repo} · names come in, values go to your vault` : 'pick a file · names come in, values go to your vault')
                          : p.k === 'empty' ? 'an empty manifest; chunks ask for a name when they need one'
                            : 'nothing written; the vault is in the rail whenever you want it'}
                      </span>
                    </label>
                  </Fragment>
                ))}
              </div>
            </div>
            <VaultNote />
          </div>
        ) : (
          <div className="ob-copy">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="kicker">step {stepNo('secrets')} · secrets · optional</span>
              <h1 className="t-display-s">No project secrets needed</h1>
            </div>
            <p className="t-body-l ob-lede">Contributors open PRs; the owner&apos;s loop deploys.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="t-caps c-2">When a chunk needs one</span>
              {wait ? (
                <div className="pb-list" style={{ padding: '4px 6px' }}>
                  <div className="crow cs-secret" style={{ gridTemplateColumns: '16px 40px minmax(0, 1fr) auto' }}>
                    <KeyMoon />
                    <span className="chunk-id">{wait.chunk}</span>
                    <span className="crow-t"><span className="tt">{waitChunk?.title || wait.title}</span><KeyBadge>{wait.name}</KeyBadge></span>
                    <span className="crow-state">needs secret</span>
                  </div>
                </div>
              ) : null}
              <span className="t-body-s c-2">It waits on the plan board and the owner adds the value in their vault. Nothing on this checkout asks you for a project secret.</span>
            </div>
            <VaultNote />
          </div>
        )}

        {owner && pick === 'imp' ? (
          <div className="panel" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {imp.phase === 'loaded' ? (
              <>
                <EnvFile name={imp.name} line={`found in ${repo} · ${(imp.preview?.names || []).length} entries · values stay masked`} action={<button className="btn btn-ghost btn-s" type="button" onClick={pickFile}>Choose another</button>} />
                <div className="env-rows is-two" role="table" aria-label={`Names in ${imp.name}`}>
                  <div className="env-head" role="row"><span /><span>Name</span><span>Value</span><span>Notes</span><span className="dest">Local</span><span className="dest">Actions</span></div>
                  {imp.rows.map((e, i) => {
                    const n = importNote(e, true);
                    const local = importTick(e, 'local');
                    const actions = importTick(e, 'github-actions');
                    return (
                      <div key={e.name} className={cx('env-row', !e.keep && 'is-off')} role="row">
                        <TickBox checked={e.keep} onChange={() => imp.setRow(i, keepToggle(e))} label={`Keep ${e.name}`} />
                        <span className="sec-name"><b>{e.name}</b></span>
                        <span className="mask">{MASK_DOTS}</span>
                        <span className={n.cls}>{n.note}</span>
                        <TickBox checked={local.checked} disabled={local.disabled} title={local.title} label={`${e.name} in your vault`} />
                        <TickBox checked={actions.checked} disabled={actions.disabled} title={actions.title} label={`${e.name} to GitHub Actions`} onChange={() => imp.setRow(i, { dests: { ...e.dests, 'github-actions': !e.dests['github-actions'] } })} />
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="dropzone" style={{ minHeight: 168 }}>
                <Icon name="fileOne" style={{ width: 28, height: 28, color: 'var(--accent)' }} />
                <span className="t-title-s">{imp.busy ? 'Reading the names…' : 'No .env found here'}</span>
                <span className="t-body-s c-2">Pick one and nexus reads its names; the values never reach a session.</span>
                <button className="btn btn-s" type="button" onClick={pickFile} disabled={imp.busy}><Icon name="fileOne" size={14} />Pick a file</button>
              </div>
            )}
            <KeyNote>Writes nexus.secrets.json with names only. Vercel and Cloudflare connect later, from the vault.</KeyNote>
          </div>
        ) : null}
        {owner && pick === 'empty' ? (
          <div className="panel" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span className="t-caps c-2">An empty manifest</span>
            <div className="code" style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--well)' }}>
              <div><span className="c">{'// nexus.secrets.json · names only, never a value'}</span></div>
              <div><span className="c">{'// a chunk adds its name here when it asks'}</span></div>
              <div><span className="v">{'{ "version": 1, "secrets": [] }'}</span></div>
            </div>
            <div className="secret-wait">
              <span className="key-orb"><Icon name="key" /></span>
              <span><b>When a chunk needs one</b>, a key card comes to you in Oversight: the name, why it is needed, where to get it and a masked field. The agent only ever sees the name.</span>
            </div>
          </div>
        ) : null}
        {owner && pick === 'skip' ? (
          <div className="panel" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span className="t-caps c-2">Nothing written</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span className="rail-item is-current" style={{ flex: 'none', pointerEvents: 'none' }}><Icon name="key" /><span>Vault</span></span>
              <span className="t-body c-2">No manifest yet. The vault sits in the rail; import a .env or add a name there whenever you like.</span>
            </div>
            <span className="t-body-s c-3">A chunk that needs a secret still asks for it, and shows needs secret on the plan board until it has one.</span>
          </div>
        ) : null}
        {!owner ? (
          <div className="panel" style={{ padding: '18px 20px' }}>
            <LocalKeys status={st} repo={shell.repo} reload={res.reload} toast={toast} bare />
          </div>
        ) : null}
      </div>
      <ToastHost toasts={toasts} />
    </ObFrame>
  );
}
