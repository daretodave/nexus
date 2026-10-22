// Step 2 · Permissions (spec 50, A1). How much the agent may do without asking, asked before anything in onboarding
// starts a session: 49.10's control (screens/cloud-settings/permission-mode.jsx, the same labels and the same warning
// on Allow everything), Ask preselected unless the checkout's prefs already hold a mode, saved through
// POST /api/prefs the moment it changes. The Plot step's /plot and Launch's session read it when they start.
// The onboarding frame and panel come from nexus.css; the radios from styles/permission-mode.css.
import { useState } from 'react';
import { useShell, stepCount, stepAfter, stepBefore, stepNo } from '../../ui/index.js';
import { server } from '../../data/index.js';
import { PATHS } from '../../routes.js';
import { ObFrame, Back, Next } from './frame.jsx';
import { PermissionModes } from '../cloud-settings/permission-mode.jsx';
import '../../styles/permission-mode.css';

export const HEADLINE = 'How much may the agent do on its own?';
export const LEDE = 'Agents in this checkout run tools: they read files, edit them and run commands. Ask stops for each new kind of command; the others ask less. You can change it any time in Settings.';

/** Save the chosen mode for this checkout (POST /api/prefs), then let the shell read the new prefs. */
export async function savePermission(mode, { setPrefs = server.setPrefs, reload } = {}) {
  const prefs = await setPrefs({ permissionMode: mode });
  reload?.();
  return prefs;
}

export default function Permissions() {
  const shell = useShell();
  const app = shell.app;
  const [mine, setMine] = useState(null);
  const [err, setErr] = useState(null);
  const mode = mine ?? app?.data?.prefs?.permissionMode ?? 'default';
  const change = async (m) => {
    setMine(m);
    setErr(null);
    try { await savePermission(m, { reload: app?.reload }); } catch (e) { setErr(e.message); }
  };

  const foot = (
    <>
      <Back to={stepBefore('permissions')} />
      <span className="ob-count">{stepCount('permissions')}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Next to={PATHS.onboarding(stepAfter('permissions'))} />
      </div>
    </>
  );

  return (
    <ObFrame step="permissions" foot={foot}>
      <div className="shape-grid">
        <div className="ob-copy">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="kicker">step {stepNo('permissions')} · permissions</span>
            <h1 className="t-display-s">{HEADLINE}</h1>
          </div>
          <p className="t-body-l ob-lede">{LEDE}</p>
        </div>
        <div className="panel" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <span className="t-caps c-2">Permissions for new sessions</span>
          <PermissionModes value={mode} onChange={change} name="ob-perm-mode" />
          {err ? <span className="t-body-s" style={{ color: 'var(--st-blocked)' }}>The mode was not saved: {err}</span> : null}
        </div>
      </div>
    </ObFrame>
  );
}
