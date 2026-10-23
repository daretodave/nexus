// Take a value out of the vault (POST /api/secrets/:name/remove; the repo's own `secrets unset`), from the row's
// Replace editor: a quiet button, then one line that says where it leaves and what keeps a copy, and Remove or Keep.
// Nothing is removed until the second click. Styles: styles/vault-loop.css.
import { useState } from 'react';
import { Icon } from '../../ui/index.js';
import { server } from '../../data/index.js';
import { removeNote, removedToast } from './model.js';
import '../../styles/vault-loop.css';

export default function RemoveValue({ name, rings = [], pushedTo = [], busy = false, toast, onDone }) {
  const [sure, setSure] = useState(false);
  const [working, setWorking] = useState(false);
  if (!sure) {
    return (
      <button className="btn btn-s btn-ghost vault-remove" type="button" onClick={() => setSure(true)} disabled={busy}>
        <Icon name="trash" size={14} />Remove it
      </button>
    );
  }
  const remove = async () => {
    setWorking(true);
    try {
      const r = await server.removeSecret(name);
      toast?.(removedToast(r, name));
      onDone?.(r);
    } catch (e) {
      toast?.({ kind: 'error', title: `${name} was not removed`, body: e.message });
    } finally {
      setWorking(false);
      setSure(false);
    }
  };
  return (
    <div className="vault-remove-ask" role="group" aria-label={`Remove ${name}`}>
      <span className="t-body-s c-2">{removeNote({ name, rings, pushedTo })}</span>
      <button className="btn btn-s btn-danger" type="button" onClick={remove} disabled={working || busy}>{working ? 'Removing…' : 'Remove'}</button>
      <button className="btn btn-s btn-ghost" type="button" onClick={() => setSure(false)} disabled={working}>Keep it</button>
    </div>
  );
}
