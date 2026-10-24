// The breakout (0.5.3, #85): a short side conversation about one oversight question before you answer it. Closed it
// is one quiet button under the card; opened, its first turn asks the helper model what the question really asks,
// what it affects and the trade-off of each choice, and then you can ask more. POST /api/oversight/explain
// (server/choices.mjs explain). Nothing runs until it is opened, and each turn after is pressed. A conversation is
// kept per question while the page is open, so switching rows and back finds it. CSS: styles/breakout.css.
import { useEffect, useRef, useState } from 'react';
import { Icon, Markdown, cx } from '../../ui/index.js';
import '../../styles/breakout.css';

// client.js reads the page's URL as it loads; it comes in on first use, as data/choices.js does.
const client = () => import('../../data/client.js');

/** id -> { open, turns: [{ role: 'you'|'claude', text }], error } for this page's life. */
const kept = new Map();

export function Breakout({ id }) {
  const [st, setSt] = useState(() => kept.get(id) || { open: false, turns: [], error: '' });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const live = useRef(true);
  const endRef = useRef(null);
  useEffect(() => () => { live.current = false; }, []);
  useEffect(() => { kept.set(id, st); }, [id, st]);
  useEffect(() => { if (st.open) endRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [st.turns.length, busy, st.open]);

  async function ask(turns) {
    setBusy(true);
    setSt((s) => ({ ...s, turns, error: '' }));
    try {
      const c = await client();
      const r = await c.server.explain(id, turns);
      const next = { open: true, turns: r?.reply ? [...turns, { role: 'claude', text: r.reply }] : turns, error: r?.reply ? '' : r?.error || 'no reply' };
      kept.set(id, next);
      if (live.current) setSt(next);
    } catch (e) {
      const next = { open: true, turns, error: e?.message || 'it failed' };
      kept.set(id, next);
      if (live.current) setSt(next);
    } finally {
      if (live.current) setBusy(false);
    }
  }

  const open = () => {
    setSt((s) => ({ ...s, open: true }));
    if (!st.turns.length && !busy) ask([]);
  };
  const send = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    ask([...st.turns, { role: 'you', text: t }]);
  };

  if (!st.open) {
    return (
      <button className="btn btn-ghost btn-s bko-open" type="button" onClick={open} title="Ask Claude about this question before you answer">
        <Icon name="question" size={14} />Talk it through
      </button>
    );
  }
  return (
    <section className="bko" aria-label="Talk it through">
      <div className="bko-head">
        <Icon name="question" size={14} />
        <span>Talk it through</span>
        <span className="bko-note">a side chat: nothing here is sent to the session</span>
        <button className="btn btn-ghost btn-s bko-close" type="button" onClick={() => setSt((s) => ({ ...s, open: false }))} aria-label="Close the side chat"><Icon name="xSmall" size={14} /></button>
      </div>
      <div className="bko-turns" aria-live="polite">
        {st.turns.map((t, i) => (
          <div key={i} className={cx('bko-turn', t.role === 'you' ? 'is-you' : 'is-claude')}>
            {t.role === 'you' ? <p>{t.text}</p> : <Markdown text={t.text} />}
          </div>
        ))}
        {busy ? <div className="bko-turn is-claude is-busy"><span className="bko-dots" aria-label="Thinking"><i /><i /><i /></span></div> : null}
        {st.error && !busy ? (
          <div className="bko-err">
            <Icon name="warn" size={14} /><span>Couldn't get an answer ({st.error}).</span>
            <button className="btn btn-ghost btn-s" type="button" onClick={() => ask(st.turns)}>Try again</button>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
      <div className="bko-bar">
        <input
          className="field bko-field" type="text" value={text} placeholder="Ask about this question..." aria-label="Ask about this question"
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
        />
        <button className="btn btn-s" type="button" onClick={send} disabled={busy || !text.trim()}>Ask<Icon name="arrowRight" size={14} /></button>
      </div>
    </section>
  );
}
