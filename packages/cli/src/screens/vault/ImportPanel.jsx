// The owner's import (VaultImport board; the import states of VaultKit): a dropzone (or a dotenv the server found at
// the root), then the names it holds with what each looks like and where each goes, then one line once it is done.
// The file's text goes to the local server in a POST body for a names-only preview and once more to store what was
// kept; nothing here draws a value, and the text is dropped when the panel closes.
import { useEffect, useRef, useState } from 'react';
import { Icon, TickBox, EnvFile, KeyOrb, MASK_DOTS, cx } from '../../ui/index.js';
import { server } from '../../data/index.js';
import { DESTS, SHORT, importBody, importLine, importNote, importRows, importTick, keepToggle } from './model.js';

/** A picked or dropped file's text (the browser reads it; nothing is uploaded until the preview call). */
export const readText = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result || ''));
  r.onerror = () => reject(new Error(`could not read ${file.name}`));
  r.readAsText(file);
});

/** The import's source and preview, shared by the owner's panel and a contributor's local keys. */
export function useImport({ status, owner, onDone, toast }) {
  const src = useRef(null);
  const [phase, setPhase] = useState('empty');
  const [name, setName] = useState('');
  const [preview, setPreview] = useState(null);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  useEffect(() => () => { src.current = null; }, []);

  const load = async (source, label) => {
    setBusy(true);
    try {
      const p = await server.importSecrets(source);
      src.current = source;
      setName(label);
      setPreview(p);
      setRows(importRows(p, status, { owner }));
      setPhase('loaded');
    } catch (e) {
      toast?.({ kind: 'error', title: `${label} did not read`, body: e.message });
    } finally {
      setBusy(false);
    }
  };
  const fromFile = async (file) => { if (file) await load({ text: await readText(file) }, file.name); };
  const fromRoot = (file) => load({ file }, file);
  const reset = () => { src.current = null; setPreview(null); setRows([]); setPhase('empty'); setDone(null); };
  const setRow = (i, patch) => setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const confirm = async () => {
    if (!src.current) return;
    setBusy(true);
    try {
      const r = await server.importSecrets(importBody(rows, src.current, { owner }));
      src.current = null;
      setDone(r);
      setPhase('done');
      const refused = (r.pushed || []).filter((p) => !p.ok);
      if (refused.length) toast?.({ kind: 'error', title: `${refused.length === 1 ? 'A place' : `${refused.length} places`} refused a push`, body: refused.map((p) => `${p.name} to ${SHORT[p.destination] || p.destination}: ${p.error || 'refused'}`).join('; ') });
      onDone?.(r);
    } catch (e) {
      toast?.({ kind: 'error', title: 'Nothing was imported', body: e.message });
    } finally {
      setBusy(false);
    }
  };
  return { phase, name, preview, rows, busy, done, fromFile, fromRoot, reset, setRow, confirm, kept: rows.filter((r) => r.keep).length };
}

/** A hidden file input and the call that opens it. */
export function useFilePick(onFile) {
  const ref = useRef(null);
  const input = <input ref={ref} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />;
  return [input, () => ref.current?.click()];
}

export default function ImportPanel({ status, onClose, onDone, toast }) {
  const imp = useImport({ status, owner: true, onDone, toast });
  const [over, setOver] = useState(false);
  const [fileInput, pick] = useFilePick(imp.fromFile);
  const found = status?.envFiles || [];
  const drop = (e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer?.files?.[0]; if (f) imp.fromFile(f); };
  const overName = over ? 'the file' : '';

  return (
    <div className="vt" style={{ padding: '14px 16px 16px', gap: 14 }}>
      {fileInput}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="t-title-s">Import a .env</span>
        <span className="tb-spacer" style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-s" type="button" onClick={() => { imp.reset(); onClose(); }}><Icon name="x" size={14} />Close</button>
      </div>
      {imp.phase === 'empty' ? (
        <div
          className={cx('dropzone', over && 'is-over')} role="button" tabIndex={0} aria-label="Drop a .env to import"
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}
        >
          <Icon name="fileOne" style={{ width: 28, height: 28, color: 'var(--accent)' }} />
          {over ? (
            <>
              <span className="t-title-s">Let go to read {overName}</span>
              <span className="t-body-s c-2">Names come in; values go straight to the places you tick.</span>
            </>
          ) : (
            <>
              <span className="t-title-s">Drop a .env to import</span>
              <span className="t-body-s c-2">nexus reads the names and keeps the values out of every session. You choose which to keep and where each one syncs.</span>
              <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button className="btn btn-s" type="button" onClick={(e) => { e.stopPropagation(); pick(); }} disabled={imp.busy}><Icon name="fileOne" size={14} />Pick a file</button>
                {found.map((f) => <button key={f} className="btn btn-s btn-ghost" type="button" onClick={(e) => { e.stopPropagation(); imp.fromRoot(f); }} disabled={imp.busy}>Read {f}</button>)}
              </span>
            </>
          )}
        </div>
      ) : null}
      {imp.phase === 'loaded' ? (
        <>
          <EnvFile name={imp.name} line={importLine(imp.preview)} action={<button className="btn btn-ghost btn-s" type="button" onClick={imp.reset}>Choose another</button>} />
          <div className="env-rows" role="table" aria-label="Parsed names">
            <div className="env-head" role="row"><span /><span>Name</span><span>Value</span><span>Notes</span>{DESTS.map((d) => <span key={d} className="dest">{d === 'local' ? 'Local' : SHORT[d]}</span>)}</div>
            {imp.rows.map((e, i) => {
              const n = importNote(e, true);
              return (
                <div key={e.name} className={cx('env-row', !e.keep && 'is-off')} role="row">
                  <TickBox checked={e.keep} onChange={() => imp.setRow(i, keepToggle(e))} label={`Keep ${e.name}`} />
                  <span className="sec-name"><b>{e.name}</b></span>
                  <span className="mask">{MASK_DOTS}</span>
                  <span className={n.cls}>{n.note}</span>
                  {DESTS.map((d) => { const t = importTick(e, d); return <TickBox key={d} checked={t.checked} disabled={t.disabled} title={t.title} label={`${e.name} to ${SHORT[d]}`} onChange={() => imp.setRow(i, { dests: { ...e.dests, [d]: !e.dests[d] } })} />; })}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" type="button" onClick={imp.confirm} disabled={!imp.kept || imp.busy}><Icon name="check" size={14} />Import {imp.kept} {imp.kept === 1 ? 'name' : 'names'} and write the manifest</button>
            <span className="t-body-s c-2" style={{ flex: 1, minWidth: 280 }}>Writes <code className="t-mono-s c-1">nexus.secrets.json</code> with names only. Values go to your vault and the destinations you tick; the manifest never holds one.</span>
          </div>
        </>
      ) : null}
      {imp.phase === 'done' ? (
        <div className="secret-set">
          <KeyOrb state="set" />
          <span className="t"><b>{imp.done?.stored?.length || 0} {(imp.done?.stored?.length || 0) === 1 ? 'name' : 'names'}</b> imported · manifest written to <b>nexus.secrets.json</b>, names only</span>
          <button className="btn btn-s" type="button" onClick={() => { imp.reset(); onClose(); }}>Back to the vault</button>
        </div>
      ) : null}
    </div>
  );
}
