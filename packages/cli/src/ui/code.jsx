// Highlighted code as React (the tokens of ui/syntax/*, drawn as spans; never innerHTML): the token runs, a code
// block with its language, copy button and fold, inline code, a foldable JSON tree, a coloured diff and the typing
// overlay that colours a textarea or an input as it is typed. The grammar engine arrives lazily
// (syntax/highlighter.js); until it does, and on the server, the quick tokens draw. Styles: styles/syntax.css.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { dropLines, FOLD_AT, foldPlan, hasColour, lastLines, lineCount, rainbow, splitLines, takeLines, tokenClass } from './syntax/tokens.js';
import { codeTokens, useCodeTokens, useGrammarVersion } from './syntax/highlighter.js';
import { langOf, langOfPath } from './syntax/langs.js';
import { draftTokens, inlineTokens } from './syntax/draft.js';
import { allFolds, defaultFolds, jsonRows, parseJson, prettyJson } from './syntax/json.js';
import { diffLines, trimContext } from './syntax/diff.js';
import { CRON_FIELDS, cronTokens, cronWords } from './syntax/cron.js';
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
    <button className={cx('code-btn', done && 'is-done')} type="button" onClick={copy} aria-label={done ? 'Copied' : `${label} to clipboard`} title={done ? 'Copied' : label}>
      <Icon name={done ? 'check' : 'copy2'} size={12} /><span className="code-btn-word">{done ? 'Copied' : label}</span>
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
 * folds the moment it passes the limit but shows its tail: its last FOLD_AT lines, so it never shrinks as it folds
 * and the newest line stays in view. One that streamed here keeps its tail when it finishes, so the lines being read
 * neither jump nor swap for its head; a block that arrives whole folds to its head. While streaming it draws with the quick
 * tokens: a grammar pass over the whole block on every delta would cost frames, so it waits for the block to close.
 * With no language the text draws plain, exactly as given.
 * `tokens` draws ready-made tokens instead (a Grep result); `numbered` puts each line's number in a gutter.
 */
export function CodeBlockView({ text, lang = '', label, open = false, className = 'code-pre', preClass, fold = true, copy = true, numbered = null, tokens: given = null }) {
  const s = String(text ?? '');
  const grammar = langOf(lang) || (!lang ? sniff(s) : '');
  const raw = useCodeTokens(grammar, s, { quick: open });
  const tokens = useMemo(() => given || (grammar ? rainbow(raw) : null), [raw, grammar, given]);
  const total = lineCount(s);
  const plan = fold ? foldPlan(total) : { fold: false, keep: total };
  const [all, setAll] = useState(false);
  const folded = plan.fold && !all;
  // Streamed past the fold here (now, or before it finished): its last FOLD_AT lines, the height it had reached.
  const streamed = useRef(false);
  if (open && plan.fold) streamed.current = true;
  const tail = folded && (open || streamed.current);
  const keep = tail ? Math.min(total, FOLD_AT) : plan.keep;
  const from = tail ? total - keep : 0;
  const shown = tokens ? (tail ? dropLines(tokens, from) : folded ? takeLines(tokens, keep) : tokens) : null;
  const plain = tail ? lastLines(s, keep) : folded ? s.split('\n').slice(0, keep).join('\n') : s;
  let body;
  if (numbered) {
    const lines = shown ? splitLines(shown) : plain.split('\n').map((l) => (l ? [{ t: 'text', v: l }] : []));
    if (!folded && lines.length > 1 && lines[lines.length - 1].length === 0 && s.endsWith('\n')) lines.pop();
    body = lines.map((l, i) => <Fragment key={i}>{i ? '\n' : null}<span className="code-ln">{numbered[from + i] ?? ''}</span><Tok tokens={l} /></Fragment>);
  } else body = shown ? <Tok tokens={shown} /> : plain;
  const word = label ?? (lang || (grammar === 'json' ? 'json' : ''));
  return (
    <div className={cx('code-box', folded && (tail ? 'is-tail' : 'is-folded'))}>
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
 * A cron schedule as inline code: each field coloured and named on hover (minute, hour, ...), and its plain words
 * beside it ("every day at 03:30 UTC"). `words` overrides them (a server's own description); false leaves them out,
 * for a place that already says them.
 */
export function CronCode({ cron, words, className }) {
  const tokens = useMemo(() => cronTokens(cron), [cron]);
  const said = words === false ? '' : words || cronWords(cron);
  const runs = [];
  for (const tk of tokens) {
    const last = runs[runs.length - 1];
    if (tk.field != null && last && last.field === tk.field) last.tokens.push(tk);
    else runs.push({ field: tk.field, tokens: [tk] });
  }
  return (
    <span className={cx('cron', className)}>
      <code className="cron-code">
        {runs.map((r, i) => (r.field != null ? <span key={i} className="cron-field" title={CRON_FIELDS[r.field]}><Tok tokens={r.tokens} /></span> : <Tok key={i} tokens={r.tokens} />))}
      </code>
      {said ? <span className="cron-words">{said}</span> : null}
    </span>
  );
}

/** A loop's schedule, every cron in it (a workflow can carry several): each one coloured, with its own words. */
export function CronList({ schedule, words }) {
  const crons = schedule?.crons?.length ? schedule.crons : schedule?.cron ? [schedule.cron] : [];
  return crons.map((c, i) => <Fragment key={c + i}>{i ? (i === crons.length - 1 ? ' and ' : ', ') : null}<CronCode cron={c} words={words} /></Fragment>);
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
  // Expand all while anything is folded; with everything open, Collapse all folds every box under the root.
  const anyFolded = folded.size > 0;
  const nested = anyFolded || rows.some((r) => r.fold && r.fold.path !== '');
  return (
    <div className="code-box">
      <pre className={cx(className, 'code-json')}><code>
        {rows.map((r, i) => (
          <span key={i} className={cx('json-row', r.fold && !r.fold.open && 'is-folded')} onClick={r.fold && !r.fold.open ? () => toggle(r.fold.path) : undefined}>
            {r.fold ? (
              <button className="json-fold" type="button" aria-expanded={r.fold.open} aria-label={r.fold.open ? `Fold ${r.fold.name}` : `Unfold ${r.fold.name} (${r.fold.count})`} onClick={(e) => { e.stopPropagation(); toggle(r.fold.path); }}>
                <Icon name="chevronDown" size={12} />
              </button>
            ) : null}
            <Tok tokens={r.tokens} />{i < total - 1 ? '\n' : null}
          </span>
        ))}
      </code></pre>
      <div className="code-tools">
        <span className="code-lang">json</span>
        {nested ? (
          <button className={cx('code-btn', 'json-all', !anyFolded && 'is-open')} type="button" onClick={() => setFolded(anyFolded ? new Set() : allFolds(parsed.value))} aria-label={anyFolded ? 'Expand all nodes' : 'Collapse all nodes'} title={anyFolded ? 'Expand all' : 'Collapse all'}>
            <Icon name="chevronDown" size={12} /><span className="code-btn-word">{anyFolded ? 'Expand all' : 'Collapse all'}</span>
          </button>
        ) : null}
        <CopyButton text={pretty} />
      </div>
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

/**
 * Copy a field's box metrics onto its mirror; returns what placeMirror needs (the right padding and the borders it
 * measures a scrollbar against). `cs` is the field's computed style.
 */
export function measureMirror(m, cs) {
  for (const p of MIRROR_PROPS) m.style[p] = cs[p];
  m.style.borderStyle = 'solid';
  m.style.borderColor = 'transparent';
  return { padRight: parseFloat(cs.paddingRight) || 0, borders: (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0), bars: null };
}

/** Scroll a mirror to where its field is, keeping a scrollbar's room on the right; writes the padding only on a change. */
export function placeMirror(f, m, box) {
  // A textarea's scrollbar narrows its text; the mirror keeps the same room on the right.
  const bars = Math.max(0, f.offsetWidth - f.clientWidth - box.borders);
  if (bars !== box.bars) { box.bars = bars; m.style.paddingRight = `${box.padRight + bars}px`; }
  m.scrollTop = f.scrollTop;
  m.scrollLeft = f.scrollLeft;
}

/**
 * Keep a mirror over its field: the same box metrics, the scrollbar's room kept, scrolled where the field is. The
 * metrics (fonts, padding, borders) change only with the field's size, so they are copied on mount and on resize; a
 * keystroke or a scroll only moves the mirror and checks whether a scrollbar came or went, so typing never writes
 * styles and then reads layout back (a forced reflow per key).
 */
function useMirror(field, mirror, deps) {
  const box = useRef(null);
  const place = () => {
    if (field.current && mirror.current && box.current) placeMirror(field.current, mirror.current, box.current);
  };
  const measure = () => {
    const f = field.current;
    const m = mirror.current;
    if (!f || !m || typeof getComputedStyle !== 'function') return;
    box.current = measureMirror(m, getComputedStyle(f));
    place();
  };
  useIsoLayout(measure, []);
  useIsoLayout(place, deps);
  useEffect(() => {
    const f = field.current;
    if (!f || typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(() => measure());
    ro.observe(f);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return place;
}

export const setRef = (ref, el) => { if (typeof ref === 'function') ref(el); else if (ref) ref.current = el; };

/** Past this many characters a field's copy draws as one plain run: a pasted log would be tokenized on every key. */
export const DRAFT_MAX = 20000;
/** A fence body as typed: the grammar's tokens, kept out of the cache since every key makes a new text. */
const draftCode = (lang, text) => codeTokens(lang, text, { cache: false });

/** The tokens a field shows as typed: draft.js's, fence bodies in their grammar once it has loaded. */
function useDraftTokens(value) {
  const v = useGrammarVersion(null);
  return useMemo(() => (value.length > DRAFT_MAX ? [{ t: 'text', v: value }] : rainbow(draftTokens(value, draftCode))), [value, v]);
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
