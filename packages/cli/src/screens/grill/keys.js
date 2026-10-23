// Grill me's keys (0.5.1). Single keys only fire with focus outside a text field; none while an IME is composing.
// Ctrl/Cmd+Enter and Alt+1..4 work anywhere (in the box too, where ui/answer-box.jsx takes them first).

/** The sheet the ? key shows. */
export const KEY_SHEET = [
  ['Ctrl ⏎', 'keep and next'],
  ['⏎', 'keep and next, or write'],
  ['1-4', 'pick a choice'],
  ['W', 'suggest answers again'],
  ['Shift W', 'suggest for the rest of this spec'],
  ['S', 'skip for now'],
  ['D', 'you decide'],
  ['← →', 'previous, next'],
  ['[ ]', 'previous, next spec'],
  ['/', 'write your answer'],
  ['Esc', 'leave the box, then Grill me'],
  ['?', 'these keys'],
];

/**
 * The action a key asks for: a string ('keep', 'enter', 'go', 'wand', 'wandSpec', 'skip', 'decide', 'prev', 'next',
 * 'prevSpec', 'nextSpec', 'focus', 'exit', 'keys') or { pick: 0..3 }, or null. `inField`: focus is in a text field;
 * `bare`: nothing in particular has focus (Tab then focuses the answer).
 */
export function keyAction(e, { inField = false, bare = false } = {}) {
  if (!e || e.isComposing || e.keyCode === 229) return null;
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === 'Enter' && mod) return 'keep';
  if (e.altKey && /^[1-4]$/.test(e.key)) return { pick: Number(e.key) - 1 };
  if (inField || mod || e.altKey) return null;
  switch (e.key) {
    case 'Enter': return 'enter';
    case '1': case '2': case '3': case '4': return { pick: Number(e.key) - 1 };
    case 'w': return 'wand';
    case 'W': return 'wandSpec';
    case 's': case 'S': return 'skip';
    case 'd': case 'D': return 'decide';
    case 'ArrowLeft': return 'prev';
    case 'ArrowRight': return 'next';
    case '[': return 'prevSpec';
    case ']': return 'nextSpec';
    case '/': return 'focus';
    case 'Tab': return bare ? 'focus' : null;
    case 'Escape': return 'exit';
    case '?': return 'keys';
    default: return null;
  }
}

/** Is this element a text field (where single keys are typing)? */
export const isField = (el) => !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes(el.type)) || el.isContentEditable);
