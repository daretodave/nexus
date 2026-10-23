// A typed answer (spec 51, A1): the "Other…" field with its Send button always beside it, saved as it is typed
// (data/drafts.js, keyed by `draftKey`) and shown again where it was left, with a quiet word for where it is
// (saving, saved, sending, sent). Enter sends too. What is typed is coloured as it is typed (ui/code.jsx
// SyntaxInput). CSS: styles/answers.css.
import { Icon } from './icons.jsx';
import { SyntaxInput } from './code.jsx';
import { useDraft, DRAFT_WORDS } from '../data/drafts.js';
import '../styles/answers.css';

export function AnswerField({ draftKey, onSend, placeholder = 'Other…', button = 'Send', disabled = false, label = 'Other answer' }) {
  const d = useDraft(draftKey);
  const v = d.value;
  const send = () => { const t = v.trim(); if (t && !disabled) onSend(t); };
  const word = DRAFT_WORDS[d.state] || '';
  return (
    <span className="ans-field">
      <SyntaxInput
        className="field tug-other" type="text" aria-label={label} placeholder={placeholder} value={v}
        onChange={(e) => d.set(e.target.value)} onBlur={d.blur}
        onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
      />
      <button className="btn btn-s btn-primary" type="button" onClick={send} disabled={disabled || !v.trim()}>{button}<Icon name="arrowRight" size={14} /></button>
      {word ? <span className={`ans-state is-${d.state}`} aria-live="polite">{word}</span> : null}
    </span>
  );
}
