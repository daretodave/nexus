// The warning over the vault when git would commit the root .env (GET /api/secrets envIgnore): the vault refuses to
// write it until then, so the fix sits right here. "Add .env to .gitignore" (POST /api/secrets/gitignore) appends the
// line and re-asks git; a tracked .env is the person's to untrack, so that one only says how. Styles: vault-loop.css.
import { useState } from 'react';
import { Icon } from '../../ui/index.js';
import { server } from '../../data/index.js';
import { ignoreWarn } from './model.js';
import '../../styles/vault-loop.css';

export default function IgnoreWarn({ status, reload, toast }) {
  const [busy, setBusy] = useState(false);
  const w = ignoreWarn(status);
  if (!w) return null;
  const fix = async () => {
    setBusy(true);
    try {
      const r = await server.ignoreEnv();
      toast?.({ kind: 'shipped', title: r.already ? '.env was ignored already' : '.gitignore now ignores .env', body: r.already ? '' : 'Commit .gitignore so every checkout keeps it out.' });
      reload?.();
    } catch (e) {
      toast?.({ kind: 'error', title: '.gitignore was not changed', body: e.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="vault-ignore-warn" role="alert">
      <Icon name="warn" size={16} />
      <span className="t"><b>{w.title}</b><span>{w.body}</span></span>
      {w.fix ? <button className="btn btn-s btn-warn" type="button" onClick={fix} disabled={busy}>{busy ? 'Adding…' : 'Add .env to .gitignore'}</button> : null}
    </div>
  );
}
