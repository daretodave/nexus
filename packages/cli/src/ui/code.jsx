// Highlighted code as React (the tokens of ui/syntax/*, drawn as spans; never innerHTML): the token runs, a code
// block with its language, copy button and fold, inline code, a foldable JSON tree, a coloured diff and the typing
// overlay that colours a textarea or an input as it is typed. The grammar engine arrives lazily
// (syntax/highlighter.js); until it does, and on the server, the quick tokens draw. Styles: styles/syntax.css.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { foldPlan, hasColour, lineCount, rainbow, splitLines, takeLines, tokenClass } from './syntax/tokens.js';
import { codeTokens, useCodeTokens, useGrammarVersion } from './syntax/highlighter.js';
import { langOf, langOfPath } from './syntax/langs.js';
import { draftTokens, inlineTokens } from './syntax/draft.js';
import { defaultFolds, jsonRows, parseJson, prettyJson } from './syntax/json.js';
import { diffLines, trimContext } from './syntax/diff.js';
import { Icon } from './icons.jsx';
import { cx } from './controls.jsx';
import '../styles/syntax.css';

export { langOf, langOfPath };

/** Tokens as runs: plain text as text, every other kind a span with its class. */
export function Tok({ tokens }) {
  return tokens.map((tk, i) => {
    const cls = tokenClass(tk);
    return cls ? <span key={i} className={cls}>{tk.v}</span> : <Fragment key={i}>{tk.v}</Fragment>;
  });
}

const useIsoLayout = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Copy a text to the clipboard; the button says so for a moment. */
export function CopyButton({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return undefined;
    const t = setTimeout(() => setDone(false), 1400);
    return () => clearTimeout(t);
  }, [done]);
  const copy = () => {
    try { navigator.clipboard?.writeText(String(text ?? '')).then(() => setDone(true), () => {}); } catch { /* no clipboard: the text stays on screen to select */ }
  };
  return (
    <button className={cx('code-btn', done && 'is-done')} type="button" onClick={copy} aria-label={done ? 'Copied' : `${label} to clipboard`}>
      <Icon name={done ? 'check' : 'copy2'} size={12} />{done ? 'Copied' : label}
    </button>
  );
}

/** The "Show all N lines" bar under a folded block. */
export function FoldBar({ open, total, onToggle }) {
  return (
    <button className="code-more" type="button" aria-expanded={open} onClick={onToggle}>
      {open ? 'Show less' : `Show all ${total} lines`}<Icon name="chevronDown" size={14} />
    </button>
  );
}

/** Is an unlabelled block JSON? Only when it parses as an object or an array: a stack trace never does. */
function sniff(text) {
  const s = String(text || '').trim();
  if (!/^[[{]/.test(s) || !/[\]}]$/.test(s)) return '';
  return parseJson(s) ? 'json' : '';
}

/**
 * A block of code: coloured by `lang` (a grammar name or a fence word), rainbow brackets, a language label and a
 * copy button, and past FOLD_AT lines folded to its head with a "Show all" bar. A block still streaming (`open`)
 * never folds, so its newest lines stay in view. With no language the text draws plain, exactly as given.
 * `tokens` draws ready-made tokens instead (a Grep result); `numbered` puts each line's number in a gutter.
 */
export function CodeBlockView({ text, lang = '', label, open = false, className = 'code-pre', preClass, fold = true, copy = true, numbered = null, tokens: given = null }) {
  const s = String(text ?? '');
  const grammar = langOf(lang) || (!lang ? sniff(s) : '');
  const raw = useCodeTokens(grammar, s);
  const tokens = useMemo(() => given || (grammar ? rainbow(raw) : null), [raw, grammar, given]);
  const total = lineCount(s);
  const plan = fold && !open ? foldPlan(total) : { fold: false, keep: total };
  const [all, setAll] = useState(false);
  const folded = plan.fold && !all;
  const shown = tokens ? (folded ? takeLines(tokens, plan.keep) : tokens) : null;
  const plain = folded ? s.split('\n').slice(0, plan.keep).join('\n') : s;
  let body;
  if (numbered) {
    const lines = shown ? splitLines(shown) : plain.split('\n').map((l) => (l ? [{ t: 'text', v: l }] : []));
    if (!folded && lines.length > 1 && lines[lines.length - 1].length === 0 && s.endsWith('\n')) lines.pop();
    body = lines.map((l, i) => <Fragment key={i}>{i ? '\n' : null}<span className="code-ln">{numbered[i] ?? ''}</span><Tok tokens={l} /></Fragment>);
  } else body = shown ? <Tok tokens={shown} /> : plain;
  const word = label ?? (lang || (grammar === 'json' ? 'json' : ''));
  return (
    <div className={cx('code-box', folded && 'is-folded')}>
      <pre className={cx(preClass || className, open && 'is-open')} data-lang={lang || undefined}><code>{body}</code></pre>
      {copy && s ? <div className="code-tools">{word ? <span className="code-lang">{String(word).toLowerCase()}</span> : null}<CopyButton text={s} /></div> : null}
      {plan.fold ? <FoldBar open={all} total={total} onToggle={() => setAll((a) => !a)} /> : null}
    </div>
  );
}

/** Inline `code`: a /command, a shell line, a path, a flag or a snippet coloured; a plain word as it always was. */
export function InlineCode({ text }) {
  const tokens = useMemo(() => rainbow(inlineTokens(text)), [text]);
  return <code>{hasColour(tokens) ? <Tok tokens={tokens} /> : text}</code>;
}

/**
 * A JSON value as a tree that folds by node (syntax/json.js); deep or crowded boxes start folded. A text that does
 * not parse (a summary clipped mid-string) draws as coloured JSON tokens instead.
 */
export function JsonView({ value, text, className = 'code-pre', fold = true }) {
  const parsed = useMemo(() => (value !== undefined ? { value } : parseJson(text)), [value, text]);
  const [folded, setFolded] = useState(() => (parsed && fold ? defaultFolds(parsed.value) : new Set()));
  const rows = useMemo(() => (parsed ? jsonRows(parsed.value, folded) : null), [parsed, folded]);
  if (!parsed) return <CodeBlockView text={text} lang="json" className={className} />;
  const toggle = (path) => setFolded((f) => { const n = new Set(f); if (n.has(path)) n.delete(path); else n.add(path); return n; });
  const pretty = prettyJson(parsed.value);
  const total = rows.length;
  return (
    <div className="code-box">
      <pre className={cx(className, 'code-json')}><code>
        {rows.map((r, i) => (
          <span key={i} className={cx('json-row', r.fold && !r.fold.open && 'is-folded')} onClick={r.fold && !r.fold.open ? () => toggle(r.fold.path) : undefined}>
            {r.fold ? (
              <button className="json-fold" type="button" aria-expanded={r.fold.open} aria-label={r.fold.open ? 'Fold' : `Unfold ${r.fold.count}`} onClick={(e) => { e.stopPropagation(); toggle(r.fold.path); }}>
                <Icon name="chevronDown" size={12} />
              </button>
            ) : null}
            <Tok tokens={r.tokens} />{i < total - 1 ? '\n' : null}
          </span>
        ))}
      </code></pre>
      <div className="code-tools"><span className="code-lang">json</span><CopyButton text={pretty} /></div>
    </div>
  );
}

/** Past this many diff lines (after trimming the context), the diff folds to its head. */
const DIFF_FOLD = 40;
const DIFF_KEEP = 24;

/** One side of an edit, coloured as a whole (so a string or a comment spanning lines stays one), split into lines. */
function useSideLines(lang, text) {
  const raw = useCodeTokens(lang, text);
  return useMemo(() => splitLines(rainbow(raw)), [raw]);
}

/**
 * An edit's change as a coloured diff: nexus.css's .diff rows, each line in the file's language, the unchanged runs
 * past three lines folded into a count.
 */
export function DiffView({ file, before = '', after = '', lang }) {
  const grammar = lang || langOfPath(file);
  const lines = useMemo(() => trimContext(diffLines(before, after)), [before, after]);
  const old = useSideLines(grammar, before);
  const neu = useSideLines(grammar, after);
  const [all, setAll] = useState(false);
  const add = lines.filter((l) => l.kind === 'add').length;
  const del = lines.filter((l) => l.kind === 'del').length;
  const fold = lines.length > DIFF_FOLD;
  const shown = fold && !all ? lines.slice(0, DIFF_KEEP) : lines;
  return (
    <>
      <div className="diff code-diff">
        <div className="diff-head">
          <b title={file}>{file || 'change'}</b>
          <span className="add">+{add}</span><span className="del">−{del}</span>
        </div>
        <div className="code-diff-lines">
          {shown.map((l, i) => {
            if (l.kind === 'skip') return <div key={i} className="dl dl-hunk dl-skip"><span className="ln" /><span className="sg">⋯</span><span>{l.count} unchanged {l.count === 1 ? 'line' : 'lines'}</span></div>;
            const toks = (l.kind === 'add' ? neu[l.b] : old[l.a]) || [{ t: 'text', v: l.text }];
            const ln = l.kind === 'add' ? l.b : l.a;
            return (
              <div key={i} className={cx('dl', l.kind === 'add' && 'dl-add', l.kind === 'del' && 'dl-del')}>
                <span className="ln">{ln + 1}</span>
                <span className="sg">{l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '}</span>
                <span><Tok tokens={toks} /></span>
              </div>
            );
          })}
        </div>
      </div>
      {fold ? <FoldBar open={all} total={lines.length} onToggle={() => setAll((a) => !a)} /> : null}
    </>
  );
}

/** The styles a mirror copies from its field so every glyph lands on the field's own. */
const MIRROR_PROPS = [
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'fontVariant', 'fontKerning', 'fontFeatureSettings',
  'fontVariantLigatures', 'letterSpacing', 'wordSpacing', 'lineHeight', 'textTransform', 'textIndent', 'tabSize',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth',
  'borderLeftWidth', 'direction', 'textAlign',
];

/** Keep a mirror over its field: the same box metrics, the scrollbar's room kept, scrolled where the field is. */
function useMirror(field, mirror, deps) {
  const sync = () => {
    const f = field.current;
    const m = mirror.current;
    if (!f || !m || typeof getComputedStyle !== 'function') return;
    const cs = getComputedStyle(f);
    for (const p of MIRROR_PROPS) m.style[p] = cs[p];
    m.style.borderStyle = 'solid';
    m.style.borderColor = 'transparent';
    // A textarea's scrollbar narrows its text; the mirror keeps the same room on the right.
    const bars = f.offsetWidth - f.clientWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
    if (bars > 0) m.style.paddingRight = `${parseFloat(cs.paddingRight) + bars}px`;
    m.scrollTop = f.scrollTop;
    m.scrollLeft = f.scrollLeft;
  };
  useIsoLayout(sync, deps);
  useEffect(() => {
    const f = field.current;
    if (!f || typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(() => sync());
    ro.observe(f);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return sync;
}

const setRef = (ref, el) => { if (typeof ref === 'function') ref(el); else if (ref) ref.current = el; };

/** The tokens a field shows as typed: draft.js's, fence bodies in their grammar once it has loaded. */
function useDraftTokens(value) {
  const v = useGrammarVersion(null);
  return useMemo(() => rainbow(draftTokens(value, codeTokens)), [value, v]);
}

/**
 * A textarea that colours what is typed in it: a /command, `code`, ``` fences, paths and urls, brackets by depth.
 * The textarea is the real field (value, keys, paste, drop, caret, selection all its own) with its text transparent;
 * the coloured copy is drawn over it, untouchable, in the same metrics, and scrolls with it.
 */
export function SyntaxTextarea({ ref, value, className, wrapClassName, onScroll, ...rest }) {
  const field = useRef(null);
  const mirror = useRef(null);
  const text = String(value ?? '');
  const tokens = useDraftTokens(text);
  const sync = useMirror(field, mirror, [text]);
  return (
    <div className={cx('syn-field', wrapClassName)}>
      <textarea ref={(el) => { field.current = el; setRef(ref, el); }} value={text} className={cx(className, 'syn-input')} onScroll={(e) => { sync(); onScroll?.(e); }} {...rest} />
      <div ref={mirror} className="syn-mirror" aria-hidden="true"><Tok tokens={tokens} />{text.endsWith('\n') ? '​' : null}</div>
    </div>
  );
}

/** The one-line field's version: the copy scrolls sideways with the input. */
export function SyntaxInput({ ref, value, className, wrapClassName, onScroll, onSelect, ...rest }) {
  const field = useRef(null);
  const mirror = useRef(null);
  const text = String(value ?? '');
  const tokens = useDraftTokens(text);
  const sync = useMirror(field, mirror, [text]);
  // An input scrolls sideways with the caret and fires no scroll event for it; a selection change is when it moves.
  return (
    <span className={cx('syn-field is-line', wrapClassName)}>
      <input ref={(el) => { field.current = el; setRef(ref, el); }} value={text} className={cx(className, 'syn-input')} onScroll={(e) => { sync(); onScroll?.(e); }} onSelect={(e) => { sync(); onSelect?.(e); }} {...rest} />
      <span ref={mirror} className="syn-mirror" aria-hidden="true"><Tok tokens={tokens} /></span>
    </span>
  );
}
