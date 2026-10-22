// Settings' "Permissions for new sessions" (spec 49, A10): the checkout's GUI pref (POST /api/prefs permissionMode,
// default Ask), read when a session's conversation starts; a running one keeps the mode it started with. Allow
// everything is bypassPermissions and carries a plain warning; `nexus run` refuses it whatever this says.
// Styles: styles/permission-mode.css (.check pieces from nexus.css, drawn round).
import { Icon } from '../../ui/icons.jsx';

export const PERMISSION_CHOICES = [
  { value: 'default', label: 'Ask', sub: 'The cockpit asks before any tool the repo has not allowed.' },
  { value: 'acceptEdits', label: 'Accept edits', sub: 'File edits go through; anything else still asks.' },
  { value: 'auto', label: 'Auto', sub: 'A classifier approves or denies each call, and asks when it cannot tell.' },
  { value: 'bypassPermissions', label: 'Allow everything', sub: 'No prompts at all.' },
];

export const BYPASS_WARNING = 'The agent runs every tool without asking, in this checkout\'s sessions, on a machine that holds real tokens. It is like starting Claude Code with --dangerously-skip-permissions.';

/** The mode Settings shows as chosen: a mode it does not list (plan, or none saved) reads as Ask. */
export function shownMode(mode) {
  return PERMISSION_CHOICES.some((c) => c.value === mode) ? mode : 'default';
}

export function PermissionModes({ value, onChange, name = 'perm-mode' }) {
  const v = shownMode(value);
  return (
    <div className="perm-modes">
      <div className="perm-list" role="radiogroup" aria-label="Permissions for new sessions">
        {PERMISSION_CHOICES.map((c) => (
          <label key={c.value} className="check perm-opt">
            <input type="radio" name={name} value={c.value} checked={v === c.value} onChange={() => onChange?.(c.value)} />
            <span className="perm-dot" />
            <span className="check-text">
              <span className="check-title">{c.label}{c.value === 'default' ? <> <span className="badge-def">default</span></> : null}</span>
              <span className="check-sub">{c.sub}</span>
            </span>
          </label>
        ))}
      </div>
      {v === 'bypassPermissions' ? (
        <p className="perm-warn" role="note"><Icon name="warn" size={14} /><span>{BYPASS_WARNING}</span></p>
      ) : null}
    </div>
  );
}
