// An agent's markdown, drawn (spec 47, A5): the tree ui/markdown.js parses,
// as React elements (never innerHTML: a tag in the text is text), and a tool
// row's command coloured from the --syn-* tokens. Styles: styles/markdown.css.
import { Fragment, useMemo } from 'react';
import { parseInline, parseMarkdown } from './markdown.js';
import { SHELL_LANGS, tokenizeShell, toolArgTokens } from './shell-syntax.js';
import { cx } from './controls.jsx';

/** Shell tokens as coloured runs. */
export function SynRuns({ tokens }) {
  return tokens.map((tk, i) => (tk.t === 'ws' || tk.t === 'text'
    ? <Fragment key={i}>{tk.v}</Fragment>
    : <span key={i} className={`syn-${tk.t}`}>{tk.v}</span>));
}

/** A tool row's summary, highlighted by tool (Bash as shell, Grep as a string, file tools as a path). */
export function ToolArgs({ tool, args }) {
  const tokens = useMemo(() => toolArgTokens(tool, args), [tool, args]);
  return <SynRuns tokens={tokens} />;
}

function Inlines({ nodes }) {
  return nodes.map((n, i) => {
    switch (n.type) {
      case 'text': return <Fragment key={i}>{n.text}</Fragment>;
      case 'br': return <br key={i} />;
      case 'code': return <code key={i}>{n.text}</code>;
      case 'strong': return <strong key={i}><Inlines nodes={n.children} /></strong>;
      case 'em': return <em key={i}><Inlines nodes={n.children} /></em>;
      case 'link': return <a key={i} href={n.href} target="_blank" rel="noreferrer"><Inlines nodes={n.children} /></a>;
      default: return <Fragment key={i}><Inlines nodes={n.children || []} /></Fragment>;
    }
  });
}

function CodeBlock({ b }) {
  const lang = b.lang.toLowerCase();
  return (
    <pre className={cx('md-pre', b.open && 'is-open')} data-lang={lang || undefined}>
      <code>{SHELL_LANGS.has(lang) ? <SynRuns tokens={tokenizeShell(b.text)} /> : b.text}</code>
    </pre>
  );
}

function Blocks({ blocks, tight }) {
  return blocks.map((b, i) => {
    if (tight && b.type === 'paragraph') {
      return <Fragment key={i}>{i > 0 ? <br /> : null}<Inlines nodes={b.children} /></Fragment>;
    }
    switch (b.type) {
      case 'heading': {
        const H = `h${Math.min(b.level, 4)}`;
        return <H key={i} className="md-h"><Inlines nodes={b.children} /></H>;
      }
      case 'paragraph': return <p key={i}><Inlines nodes={b.children} /></p>;
      case 'code': return <CodeBlock key={i} b={b} />;
      case 'hr': return <hr key={i} />;
      case 'quote': return <blockquote key={i}><Blocks blocks={b.children} /></blockquote>;
      case 'list': {
        // A tight list (GitHub's): an item's paragraphs draw as bare lines, no <p> spacing.
        const items = b.items.map((it, k) => <li key={k}><Blocks blocks={it.children} tight={b.tight} /></li>);
        return b.ordered ? <ol key={i} start={b.start !== 1 ? b.start : undefined}>{items}</ol> : <ul key={i}>{items}</ul>;
      }
      case 'table': return (
        <div key={i} className="md-table">
          <table>
            <thead><tr>{b.head.map((c, k) => <th key={k} style={b.align[k] ? { textAlign: b.align[k] } : undefined}><Inlines nodes={c} /></th>)}</tr></thead>
            <tbody>{b.rows.map((r, ri) => <tr key={ri}>{r.map((c, k) => <td key={k} style={b.align[k] ? { textAlign: b.align[k] } : undefined}><Inlines nodes={c} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      default: return null;
    }
  });
}

/**
 * .md: a markdown text as elements. `inline` draws only the inline marks
 * (code, bold, links, line breaks) in a span, for a line that sits inside a <p>.
 * A `text` that is not a string (elements) is drawn as given.
 */
export function Markdown({ text, inline, className, style }) {
  const plain = typeof text !== 'string';
  const tree = useMemo(() => (plain ? null : inline ? parseInline(text) : parseMarkdown(text)), [text, inline, plain]);
  if (plain) return text ?? null; // already elements: drawn as given
  if (inline) return <span className={cx('md md-inline', className)} style={style}><Inlines nodes={tree} /></span>;
  return <div className={cx('md', className)} style={style}><Blocks blocks={tree} /></div>;
}
