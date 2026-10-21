// The Vault rail item's view. The vault itself (design/handoff Vault,
// VaultContributor, VaultImport, VaultKit) is 42.8's port, on 42.7's
// GET /api/secrets; until then this view shows the design's empty state,
// in the rail's own words for each checkout, never made-up names.
import { ViewFrame, ViewHead, ViewTitle, Empty, InboxBtn, useShell } from '../ui/index.js';
import { useSecrets } from '../data/index.js';
import { MANIFEST } from './cloud-settings/secrets.js';

export default function Vault() {
  const { owner, repo } = useShell();
  const secrets = useSecrets();
  const missing = secrets.status === 'missing';
  const sub = owner ? 'secret names for this repo' : 'no project secrets needed';
  return (
    <ViewFrame current="vault" title="Vault" sub={repo ? `${repo} · ${sub}` : sub} actions={<InboxBtn />}>
      <ViewHead>
        <ViewTitle
          title={<h1 className="t-title-l">Vault</h1>}
          sub={owner
            ? 'nexus agents see names, not values. Values live in your keychain and the places you sync them to.'
            : "Contributors open PRs; the owner's loop deploys."}
        />
      </ViewHead>
      {secrets.status === 'loading' ? null : owner ? (
        <Empty sky="none" title="No secret names to show yet" body={`${missing ? "This nexus server doesn't serve the vault yet. " : ''}The names live in ${MANIFEST}; node scripts/secrets.mjs status lists them.`} />
      ) : (
        <Empty sky="quiet" title="No project secrets needed" body={`Local keys never leave this machine.${missing ? " This nexus server doesn't list them yet;" : ''} node scripts/secrets.mjs status lists them.`} />
      )}
    </ViewFrame>
  );
}
