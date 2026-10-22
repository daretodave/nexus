// A repo with no vault yet (spec 47, A2): an empty state in the design's .empty style, never a red error. The owner
// sets the vault up (POST /api/secrets/setup: the CLI's own secrets scripts, one commit on main); a contributor reads
// that it is the owner's and may propose it as a pull request. Onboarding's Secrets step and the Vault screen share it.
import { useState } from 'react';
import { Empty, Icon } from '../../ui/index.js';
import { server } from '../../data/index.js';
import { VAULT_DOCS, missingCopy, setupToast } from './model.js';

export default function VaultSetup({ owner, envNames = 0, reload, toast, sky = 'quiet' }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const copy = missingCopy({ owner, envNames });
  const go = async () => {
    setBusy(true);
    try {
      const r = await server.setupVault();
      setDone(r);
      const t = setupToast(r);
      if (t) toast?.(t);
      reload?.();
    } catch (e) {
      toast?.({ kind: 'error', title: 'The vault was not set up', body: e.message });
    } finally {
      setBusy(false);
    }
  };
  const proposed = done && done.landed === 'branch';
  const action = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      {proposed ? (
        <span className="t-body-s c-2">{done.pr ? <a href={done.pr} target="_blank" rel="noreferrer">The pull request</a> : done.branch} adds the vault; it lands when the owner merges it.</span>
      ) : (
        <button className={owner ? 'btn btn-primary' : 'btn'} type="button" onClick={go} disabled={busy}>
          <Icon name="key" size={14} />{busy ? (owner ? 'Setting up the vault…' : 'Opening a pull request…') : copy.action}
        </button>
      )}
      {done && done.landed === 'main' && !done.here ? <span className="t-body-s c-2">{done.note}</span> : null}
      <a className="t-body-s" href={VAULT_DOCS} target="_blank" rel="noreferrer">How the vault works</a>
    </div>
  );
  return <Empty title={copy.title} body={copy.body} sky={sky} action={action} />;
}
