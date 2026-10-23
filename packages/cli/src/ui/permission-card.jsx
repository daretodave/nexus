// The cockpit's permission card (spec 49, A11): a pending tug that reads like a tool row. Its title is the input's
// description (else the tool), its body the argument a tool row shows (shared/tool-arg.mjs), highlighted as the row
// highlights it (a Bash command as shell) and wrapped in full; the input's JSON only behind a closed "Raw input",
// as a coloured tree that folds by node. An edit shows the change it asks to make as a coloured diff, a write the
// file it would write, so the answer is made on what will happen, not on a path.
// Styles: styles/permission-card.css (imported by the cockpit's Working) and styles/syntax.css.
import { Tug } from './tug.jsx';
import { ToolArgs } from './markdown.jsx';
import { JsonView } from './code.jsx';
import { ToolDetail, callView } from './tool-detail.jsx';
import { toolArgFromJson } from '../../shared/tool-arg.mjs';

/** Tools whose card shows the change itself (a diff, the file) under the path. */
const SHOWS_CHANGE = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);

/** What the card shows for a permission view ({ tool, title, args, summary, input, reason }). */
export function permissionCard(req) {
  const tool = req?.tool || 'a tool';
  const args = req?.args != null && req.args !== '' ? String(req.args) : toolArgFromJson(req?.tool, req?.summary);
  const input = req?.input && typeof req.input === 'object' ? req.input : null;
  const clipped = Array.isArray(req?.clipped) && req.clipped.length ? req.clipped : null;
  const change = input && SHOWS_CHANGE.has(tool) && callView(tool, input, args, clipped)?.kind !== 'json';
  return { tool, title: req?.title || tool, args, raw: req?.summary || '', input, clipped, change: !!change, reason: req?.reason || null };
}

export function PermissionCard({ req, who, onAnswer }) {
  const c = permissionCard(req);
  const options = [{ label: 'Allow', rec: true }, ...(req?.canAlways ? [{ label: 'Always allow' }] : []), { label: 'Deny' }];
  const body = (
    <div className="perm-card-body">
      {c.args ? <pre className="perm-arg"><ToolArgs tool={c.tool} args={c.args} /></pre> : null}
      {c.change ? <div className="perm-change"><ToolDetail tool={c.tool} args={c.args} input={c.input} clipped={c.clipped} /></div> : null}
      {c.raw || c.input ? (
        <details className="perm-raw">
          <summary>Raw input</summary>
          {c.input ? <JsonView value={c.input} className="code-pre perm-json" /> : <JsonView text={c.raw} className="code-pre perm-json" />}
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
