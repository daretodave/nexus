// A contributor's own local keys (the Vault board's contributor face, onboarding 4b; VaultKit's four states: keys,
// empty, adding, importing). This machine only: no destination checkboxes, a lock in their place, never on the plan
// board, never asked for by a chunk. Add, Replace and Import store through the same POST bodies the owner's vault
// uses; the server keeps a contributor's keys local and refuses every sink.
import { useState } from 'react';
import { Icon, MaskField, TickBox, EnvFile, MASK_DOTS, cx } from '../../ui/index.js';
import { server } from '../../data/index.js';
import { localRows, localSub, importNote, nameInput, validName } from './model.js';
import { useImport, useFilePick } from './ImportPanel.jsx';

const Lock = ({ children = 'this machine only' }) => <span className="lk-dest is-locked"><Icon name="lockOne" />{children}</span>;

export default function LocalKeys({ status, repo, reload, toast, bare }) {
  const [mode, setMode] = useState('list');
  const [edit, setEdit] = useState(null);
  const [draft, setDraft] = useState('');
  const [nw, setNw] = useState({ name: '', value: '' });
  const [fresh, setFresh] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const imp = useImport({
    status, owner: false, toast,
    onDone: (r) => { setFresh(new Set(r.stored || [])); setMode('list'); reload?.(); },
  });
  const [fileInput, pick] = useFilePick(imp.fromFile);
  const rows = localRows(status, { fresh, edit });
  const found = status?.envFiles || [];

  const store = async (name, value, after) => {
    setBusy(true);
    try {
      await server.storeSecret(name, { value });
      setFresh(new Set([name]));
      after();
      reload?.();
    } catch (e) {
      toast?.({ kind: 'error', title: `${name} was not saved`, body: e.message });
    } finally {
      setBusy(false);
    }
  };
  const openImport = () => {
    setEdit(null);
    setMode('importing');
    imp.reset();
    if (found.length) imp.fromRoot(found[0]); else pick();
  };
  const adding = mode === 'adding';
  const importing = mode === 'importing';
  const n = rows.length;

  return (
    <section className={cx('lk', bare && 'is-bare')} aria-label="Your local keys">
      {fileInput}
      <div className="lk-head">
        <div className="lk-title"><b>Your local keys</b><span>{localSub(n, repo)}</span></div>
        <div className="lk-acts">
          <button className="btn btn-s btn-ghost" type="button" onClick={openImport}><Icon name="fileOne" size={14} />Import a .env</button>
          <button className="btn btn-s" type="button" onClick={() => { setEdit(null); setNw({ name: '', value: '' }); setMode('adding'); }}><Icon name="plus" size={14} />Add a key</button>
        </div>
      </div>
      {n === 0 && !adding && !importing ? <div className="lk-empty">None. Add one if the app needs it to run locally.</div> : null}
      {n > 0 ? (
        <div className="lk-rows" role="table" aria-label="Your local keys">
          {rows.map((k) => (
            <div key={k.name} className={cx('lk-row', k.editing && 'is-editing', k.fresh && 'is-fresh')} role="row">
              <span className="sec-name"><b>{k.name}</b><span>{k.sub}</span></span>
              <span className="mask" aria-label="value hidden">{MASK_DOTS}</span>
              <span className="lk-dest"><Icon name="laptop" />this machine</span>
              <span className="vt-acts"><button className="btn btn-s btn-ghost" type="button" onClick={() => { setMode('list'); setDraft(''); setEdit(k.name); }}>Replace</button></span>
              {k.editing ? (
                <div className="vt-edit">
                  <MaskField value={draft} onChange={setDraft} label={`New value for ${k.name}`} placeholder="Paste the new value" autoFocus onEnter={() => draft && store(k.name, draft, () => { setEdit(null); setDraft(''); })} />
                  <button className="btn btn-s btn-primary" type="button" disabled={!draft || busy} onClick={() => store(k.name, draft, () => { setEdit(null); setDraft(''); })}>Save</button>
                  <button className="btn btn-s btn-ghost" type="button" onClick={() => { setEdit(null); setDraft(''); }}>Cancel</button>
                  <span className="t-body-s c-3">Replaces it on this machine only.</span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {adding ? (
        <div className="lk-form" role="group" aria-label="Add a local key">
          <div className="lk-form-fields">
            <input className="field" type="text" value={nw.name} onChange={(e) => setNw({ ...nw, name: nameInput(e.target.value) })} aria-label="Key name" placeholder="NAME_LIKE_THIS" style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }} autoFocus />
            <MaskField value={nw.value} onChange={(v) => setNw({ ...nw, value: v })} label="Value" />
          </div>
          <div className="lk-form-foot">
            <span className="t-label c-2">Store it</span>
            <Lock />
            <span style={{ flex: 1 }} />
            <button className="btn btn-s btn-primary" type="button" disabled={!validName(nw.name) || !nw.value || busy} onClick={() => store(nw.name, nw.value, () => { setNw({ name: '', value: '' }); setMode('list'); })}>Save on this machine</button>
            <button className="btn btn-s btn-ghost" type="button" onClick={() => setMode('list')}>Cancel</button>
          </div>
        </div>
      ) : null}
      {importing && imp.phase === 'loaded' ? (
        <div className="lk-form" role="group" aria-label={`Import ${imp.name} to this machine`}>
          <EnvFile name={imp.name} line={`found in ${repo || 'this repo'} · ${(imp.preview?.names || []).length} entries · values stay masked`} />
          <div className="env-rows is-local" role="table" aria-label={`Names in ${imp.name}`}>
            {imp.rows.map((e, i) => {
              const nt = importNote(e, false);
              return (
                <div key={e.name} className={cx('env-row', !e.keep && 'is-off')} role="row">
                  <TickBox checked={e.keep} onChange={() => imp.setRow(i, { keep: !e.keep })} label={`Keep ${e.name}`} />
                  <span className="sec-name"><b>{e.name}</b></span>
                  <span className="mask">{MASK_DOTS}</span>
                  <span className={nt.cls}>{nt.note}</span>
                </div>
              );
            })}
          </div>
          <div className="lk-form-foot">
            <span className="t-label c-2">Store it</span>
            <Lock />
            <span style={{ flex: 1 }} />
            <button className="btn btn-s btn-primary" type="button" disabled={!imp.kept || imp.busy} onClick={imp.confirm}>Import {imp.kept} {imp.kept === 1 ? 'key' : 'keys'} to this machine</button>
            <button className="btn btn-s btn-ghost" type="button" onClick={() => { imp.reset(); setMode('list'); }}>Cancel</button>
          </div>
        </div>
      ) : null}
      {importing && imp.phase !== 'loaded' ? (
        <div className="lk-form" role="group" aria-label="Import a .env to this machine">
          <div className="lk-form-foot">
            <span className="t-body-s c-2">{imp.busy ? 'Reading the names…' : 'Pick a .env to read its names.'}</span>
            <span style={{ flex: 1 }} />
            <button className="btn btn-s" type="button" onClick={pick} disabled={imp.busy}><Icon name="fileOne" size={14} />Pick a file</button>
            <button className="btn btn-s btn-ghost" type="button" onClick={() => { imp.reset(); setMode('list'); }}>Cancel</button>
          </div>
        </div>
      ) : null}
      <div className="lk-note"><Icon name="lockOne" /><span><b>Local keys never leave this machine.</b> They never show on the plan board, and no chunk can ask for them.</span></div>
    </section>
  );
}
