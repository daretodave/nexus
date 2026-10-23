// A spec group's Continue (spec 53, A1): "Send 2 answers to vega and continue", live from the first kept answer,
// with a "send to…" picker (the handoff's .menu) to aim it at another live session or a new one. Its look:
// styles/plan-answers.css; where it goes and what it sends: planAnswers.js.
import { useState } from 'react';
import { Menu } from '../../ui/controls.jsx';
import { continueLabel } from './planAnswers.js';
import '../../styles/plan-answers.css';

/** A spec group's Continue bar and its "send to…" picker (styles/plan-answers.css). */
export function ContinueBar({ count, target, asked, choices, sending, onPick, onSend }) {
  const [open, setOpen] = useState(false);
  const note = !count ? 'Answers are kept here as you give them.' : asked ? `${target.name} asked these.` : target.kind === 'new' ? 'No live session to go back to: a new one starts.' : `Goes to ${target.name}, the most recent live session.`;
  return (
    <div className="pans-bar" role="group" aria-label="Send these answers and continue">
      <span className="t-body-s c-2 pans-bar-t">{note}</span>
      <span className="pans-to">
        <button className="btn btn-ghost btn-s" type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>send to…</button>
        {open ? (
          <Menu
            label="Send to" head="Send to" role="menu"
            items={choices.map((c) => ({ key: c.id, icon: c.kind === 'new' ? 'plus' : 'arrowRight', label: c.name, role: 'menuitemradio', active: c.id === target.id, onSelect: () => { onPick(c.id); setOpen(false); } }))}
          />
        ) : null}
      </span>
      <button className="btn btn-primary btn-s" type="button" disabled={!count || sending} onClick={onSend}>{sending ? 'Sending…' : continueLabel(count, target)}</button>
    </div>
  );
}
