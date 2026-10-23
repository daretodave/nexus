// The default a plan question names (spec 53): "Recommendation:", "Default:", "Default if unanswered:", "Defaults
// to", or an option marked "(recommended)". Pure, shared by the inbox (src/screens/headsdown-inbox/inboxModel.js
// re-exports it) and the server (server/choices.mjs folds it into the wand's choices).

const bare = (s) => s.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();

// The phrasings that name a default before its words (spec 53): "Recommendation:", "Recommended:", "Default:",
// "Default if unanswered:" (bold, italic or neither), and "Defaults to".
const NAMED = [
  /(?:^|[\s(*_-])(?:recommend(?:ation|ed)|default(?:\s+(?:if|when)\s+(?:unanswered|not\s+answered|no\s+one\s+answers|nobody\s+answers|left\s+open))?)\s*[*_]*\s*:\s*[*_]*\s*(.+)/im,
  /(?:^|[\s(*_-])defaults\s+to\s*[*_]*\s*:?\s*(.+)/im,
];
const NOT_AN_END = /\b(?:e\.g|i\.e|etc|vs|cf|approx|incl)$/i;

/**
 * The rest of a sentence: to the first `.`, `!` or `?` that ends it (outside parentheses, followed by a space or the
 * end, not "e.g." and the like), or the end of its line.
 */
export function restOfSentence(s) {
  const t = String(s || '');
  let depth = 0;
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (c === '\n') return t.slice(0, i);
    if (c === '(' || c === '[') depth += 1;
    else if ((c === ')' || c === ']') && depth > 0) depth -= 1;
    else if (depth === 0 && /[.!?]/.test(c) && (i + 1 === t.length || /\s/.test(t[i + 1])) && !(c === '.' && NOT_AN_END.test(t.slice(0, i)))) return t.slice(0, i);
  }
  return t;
}

/**
 * The default a plan question names, or null: the words after "Recommendation:", "Default:", "Default if
 * unanswered:" or "Defaults to" (the rest of that sentence, parentheticals kept), or the option marked
 * "(recommended)" or "(default)". Only a question that names one takes part in Batch-answer with defaults; the rest
 * wait for a person's words.
 */
export function recommendedDefault(text) {
  const t = String(text || '');
  const named = NAMED.map((re) => re.exec(t)).filter(Boolean).sort((a, b) => a.index - b.index)[0];
  if (named) {
    const words = bare(restOfSentence(named[1].replace(/^[*_\s]+/, ''))).replace(/[.;:,]+$/, '').trim();
    if (words) return words;
  }
  const marked = /([^\n]*?)\s*\((?:recommended|default|the default|the recommended default)\)/i.exec(t);
  if (marked) {
    const parts = marked[1].split(/[,;:?]|\bor\b|^\s*[-*+]\s|^\s*\d+[.)]\s|\s-\s/i);
    const words = bare(parts[parts.length - 1] || '');
    if (words) return words;
  }
  return null;
}
