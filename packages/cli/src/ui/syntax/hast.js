// The grammar engine's output (a hast tree from lowlight, highlight.js's scopes as class names) as the GUI's token
// stream (tokens.js). Pure: no lowlight import here, so the mapping is tested without loading a grammar. The tree is
// walked for its text only; no HTML is ever made from it.

/** highlight.js scopes (the first class, `hljs-` cut, plus its sub-scope) to token kinds. */
const SCOPE = {
  keyword: 'kw', built_in: 'builtin', type: 'type', literal: 'lit', number: 'num', operator: 'op',
  punctuation: 'punct', property: 'prop', regexp: 're', string: 'str', char: 'esc', subst: 'var', symbol: 'lit',
  class: 'type', function: 'fn', title: 'fn', params: 'param', comment: 'comment', doctag: 'kw', meta: 'meta',
  section: 'kw', tag: 'tag', name: 'tag', attr: 'prop', attribute: 'prop', variable: 'var', 'template-tag': 'kw',
  'template-variable': 'var', bullet: 'punct', code: 'str', link: 'url', quote: 'comment', 'selector-tag': 'tag',
  'selector-id': 'fn', 'selector-class': 'type', 'selector-attr': 'prop', 'selector-pseudo': 'kw',
  addition: 'add', deletion: 'del', emphasis: 'text', strong: 'text', formula: 'num',
};
/** Sub-scopes that say more than their parent: title.class_ is a type, variable.language_ (this, self) a builtin. */
const SUB = { 'title.class_': 'type', 'title.function_': 'fn', 'title.class_.inherited__': 'type', 'variable.language_': 'builtin', 'variable.constant_': 'lit', 'meta.keyword': 'meta', 'meta.string': 'str', 'char.escape_': 'esc', 'function.dispatch': 'fn' };
/** An outer kind that holds its own colour over what nests in it (true and null are a keyword inside a literal). */
const HOLD = new Set(['lit', 'num', 'comment', 're', 'add', 'del']);

/** The kind for one element's className list, or null when it says nothing we colour. */
export function scopeKind(className) {
  const cls = (Array.isArray(className) ? className : [className]).map(String);
  const head = (cls[0] || '').replace(/^hljs-/, '');
  if (!head) return null;
  const full = [head, ...cls.slice(1)].join('.');
  for (const k of Object.keys(SUB)) if (full === k || full.startsWith(`${k}.`)) return SUB[k];
  return SCOPE[head] || null;
}

/** A hast root's text as tokens: each text node takes the kind of the nearest element that has one. */
export function hastTokens(root) {
  const out = [];
  const walk = (node, kind) => {
    if (!node) return;
    if (node.type === 'text') {
      if (!node.value) return;
      const t = kind || (/^\s+$/.test(node.value) ? 'ws' : 'text');
      const last = out[out.length - 1];
      if (last && last.t === t) last.v += node.value; else out.push({ t, v: node.value });
      return;
    }
    let k = kind;
    if (node.type === 'element') {
      const own = scopeKind(node.properties?.className || []);
      if (own && !(kind && HOLD.has(kind))) k = own;
    }
    for (const c of node.children || []) walk(c, k);
  };
  walk(root, null);
  return out;
}
