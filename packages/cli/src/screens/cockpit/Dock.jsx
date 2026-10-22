// The dock at the bottom of the left pane (Cockpit board): the parked tray
// (Working only), the context strip, and the composer: text goes as typed; a guessed route is a chip to accept.
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Composer, Ctx, Dock as DockBox, Parked } from '../../ui/index.js';
import { clock } from './model.js';

export { routeFor, routeShowing, suggestFor } from './compose.js';

const MAX_ATTACH = 200 * 1024;

/**
 * tray: { count, item: { q, who, a, at, arriving } } or null.
 * composer: { value, onChange, route, onRoute, suggest, onDismissSuggest, plotMode,
 * onPlotMode, why, mode, onTogglePin, pausedText, onResume, formingText, onSend(text, files, { as }) }.
 * `route` is armed by the person; `suggest` is the classifier's guess, sent only when accepted.
 */
export default function Dock({ tray, inboxTo, layers, short, composer }) {
  const [files, setFiles] = useState([]);
  const pick = useRef(null);
  const attach = async (list) => {
    const read = await Promise.all([...list].map(async (f) => {
      if (f.size > MAX_ATTACH) return { name: f.name, meta: `${Math.round(f.size / 1024)} KB`, state: 'error' };
      const text = await f.text();
      // Binary files carry NULs; only text goes into a prompt.
      if (text.includes('\u0000')) return { name: f.name, meta: 'not text', state: 'error' };
      return { name: f.name, meta: `${Math.max(1, Math.round(f.size / 1024))} KB`, text };
    }));
    setFiles((cur) => [...cur.filter((c) => !read.some((r) => r.name === c.name)), ...read]);
  };
  const chips = files.map((f) => ({ name: f.name, meta: f.meta, state: f.state, onRemove: () => setFiles((cur) => cur.filter((c) => c.name !== f.name)) }));
  return (
    <DockBox>
      {tray ? (
        <div className="tray">
          <Link className="tray-head" to={inboxTo} style={{ color: 'var(--text-2)', textDecoration: 'none' }}>
            <span className="tray-count">{tray.count}</span><b>parked</b><span>· defaults taken · you review them at the end</span>
          </Link>
          {tray.item ? <Parked q={tray.item.q} who={tray.item.who} a={tray.item.a} t={clock(tray.item.at)} arriving={tray.item.arriving} /> : null}
        </div>
      ) : null}
      <Ctx layers={layers} short={short} />
      <input ref={pick} type="file" multiple hidden onChange={(e) => { attach(e.target.files || []); e.target.value = ''; }} />
      <Composer
        dock
        value={composer.value} onChange={composer.onChange}
        route={composer.route} onRoute={composer.onRoute}
        suggest={composer.suggest} onDismissSuggest={composer.onDismissSuggest}
        plotMode={composer.plotMode} onPlotMode={composer.onPlotMode} why={composer.why}
        mode={composer.mode} onTogglePin={composer.onTogglePin}
        pausedText={composer.pausedText} onResume={composer.onResume} formingText={composer.formingText}
        chips={chips} attached={files.filter((f) => f.text != null).length} onAttach={() => pick.current?.click()}
        onSend={async (text, as) => { if (await composer.onSend(text, files.filter((f) => f.text != null), { as })) setFiles([]); }}
      />
    </DockBox>
  );
}
