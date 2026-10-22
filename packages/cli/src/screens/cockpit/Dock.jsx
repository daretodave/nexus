// The dock at the bottom of the left pane (Cockpit board): the parked tray
// (Working only), the context strip, and the composer: text goes as typed; a guessed route is a chip to accept.
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Composer, Ctx, Dock as DockBox, Parked } from '../../ui/index.js';
import { clock } from './model.js';
import { readAttachment, readyOf, noteOf } from '../../ui/attachments.js';

export { routeFor, routeShowing, suggestFor } from './compose.js';

/**
 * tray: { count, item: { q, who, a, at, arriving } } or null.
 * composer: { value, onChange, route, onRoute, suggest, onDismissSuggest, plotMode,
 * onPlotMode, why, mode, onTogglePin, pausedText, onResume, formingText, onSend(text, attachments, { as }) }.
 * `route` is armed by the person; `suggest` is the classifier's guess, sent only when accepted.
 * Attachments (spec 51): picked, pasted or dropped; images go as images, text files as text (ui/attachments.js).
 */
export default function Dock({ tray, inboxTo, layers, short, composer }) {
  const [files, setFiles] = useState([]);
  const pick = useRef(null);
  const attach = async (list) => {
    const read = await Promise.all([...list].map((f) => readAttachment(f)));
    // A file picked again replaces its chip; pasted images are each their own.
    setFiles((cur) => [...cur.filter((c) => !read.some((r) => r.name === c.name)), ...read]);
  };
  const ready = readyOf(files);
  const chips = files.map((f) => ({
    key: f.id, name: f.name, meta: f.meta, state: f.state, title: f.title || f.name, thumb: f.preview,
    onRemove: () => setFiles((cur) => cur.filter((c) => c.id !== f.id)),
  }));
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
      <input ref={pick} type="file" multiple hidden accept="image/png,image/jpeg,image/gif,image/webp,text/*,.md,.json,.js,.mjs,.jsx,.ts,.tsx,.py,.go,.rs,.yml,.yaml,.toml,.csv,.log,.diff,.patch,.sh,.html,.css,.sql,.txt" onChange={(e) => { attach(e.target.files || []); e.target.value = ''; }} />
      <Composer
        dock
        value={composer.value} onChange={composer.onChange}
        route={composer.route} onRoute={composer.onRoute}
        suggest={composer.suggest} onDismissSuggest={composer.onDismissSuggest}
        plotMode={composer.plotMode} onPlotMode={composer.onPlotMode} why={composer.why}
        mode={composer.mode} onTogglePin={composer.onTogglePin}
        pausedText={composer.pausedText} onResume={composer.onResume} formingText={composer.formingText}
        chips={chips} attached={ready.length} note={noteOf(files)} onAttach={() => pick.current?.click()} onFiles={attach}
        onSend={async (text, as) => { if (await composer.onSend(text, ready, { as })) setFiles([]); }}
      />
    </DockBox>
  );
}
