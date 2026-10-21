// STUB (41.3 foundation). Screen agent: build settings from
// design/handoff/Settings.dc.html and SettingsContributor (+ Light): the
// .set-panel sections (owner switch only with .owner, run mode checks,
// phase length, cloud loop, appearance). Appearance is already live here.
// Data: useAppState(), useLocalSettings(), server.setPrefs / setOwner.
import { ViewFrame, ThemeSeg, useShell } from '../ui/index.js';

export default function Settings() {
  const { repo } = useShell();
  return (
    <ViewFrame current="settings" title="Settings" sub={repo}>
      <div className="set-panel">
        <section className="set-sec" style={{ padding: '18px 26px', gap: 28 }}>
          <div><h2 className="set-h">Appearance</h2><p className="set-d">Motion always respects your system's reduced-motion setting.</p></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span className="t-body-s c-2" style={{ width: 120 }}>Theme</span>
              <ThemeSeg />
            </div>
          </div>
        </section>
      </div>
    </ViewFrame>
  );
}
