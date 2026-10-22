// The cockpit's permission card (spec 49, A11): a pending tug that reads like a tool row. Its title is the input's
// description (else the tool), its body the argument a tool row shows (shared/tool-arg.mjs), highlighted as the row
// highlights it (a Bash command as shell) and wrapped in full; the input's JSON only behind a closed "Raw input".
// Styles: styles/permission-card.css (imported by the cockpit's Working).
import { Tug } from './tug.jsx';
import { ToolArgs } from './markdown.jsx';
import { toolArgFromJson } from '../../shared/tool-arg.mjs';

/** What the card shows for a permission view ({ tool, title, args, summary, reason }). */
export function permissionCard(req) {
  const tool = req?.tool || 'a tool';
  const args = req?.args != null && req.args !== '' ? String(req.args) : toolArgFromJson(req?.tool, req?.summary);
  return { tool, title: req?.title || tool, args, raw: req?.summary || '', reason: req?.reason || null };
}

export function PermissionCard({ req, who, onAnswer }) {
  const c = permissionCard(req);
  const options = [{ label: 'Allow', rec: true }, ...(req?.canAlways ? [{ label: 'Always allow' }] : []), { label: 'Deny' }];
  const body = (
    <div className="perm-card-body">
      {c.args ? <pre className="perm-arg"><ToolArgs tool={c.tool} args={c.args} /></pre> : null}
      {c.raw ? (
        <details className="perm-raw">
          <summary>Raw input</summary>
          <pre>{c.raw}</pre>
        </details>
      ) : null}
    </div>
  );
  return (
    <Tug
      who={who} src={`wants to use ${c.tool}`} question={c.title} body={body} why={c.reason}
      options={options} compact label={`Permission for ${c.tool} from ${who}`}
      onPick={(label) => onAnswer?.(label !== 'Deny', label === 'Always allow')}
    />
  );
}
