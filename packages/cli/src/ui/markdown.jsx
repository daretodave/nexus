// An agent's markdown, drawn (spec 47, A5): the tree ui/markdown.js parses,
// as React elements (never innerHTML: a tag in the text is text), and a tool
// row's command coloured from the --syn-* tokens. Code blocks and inline code go through ui/code.jsx: every fenced
// language coloured (the grammar engine lazily, the quick tokens first), rainbow brackets, a copy button and a fold.
// Styles: styles/markdown.css and styles/syntax.css.
import { Fragment, useMemo } from 'react';
import { parseInline, parseMarkdown } from './markdown.js';
import { toolArgTokens } from './shell-syntax.js';
import { rainbow } from './syntax/tokens.js';
import { CodeBlockView, InlineCode, Tok } from './code.jsx';
import { cx } from './controls.jsx';

/** Tokens as coloured runs (any kind, brackets included). */
export function SynRuns({ tokens }) {
  return <Tok tokens={tokens} />;
}

/** A tool row's summary, highlighted by tool (Bash as shell, Grep as a string, file tools as a path), brackets by depth. */
export function ToolArgs({ tool, args }) {
  const tokens = useMemo(() => rainbow(toolArgTokens(tool, args)), [tool, args]);
  return <SynRuns tokens={tokens} />;
}

function Inlines({ nodes }) {
  return nodes.map((n, i) => {
    switch (n.type) {
      case 'text': return <Fragment key={i}>{n.text}</Fragment>;
      case 'br': return <br key={i} />;
      case 'code': return <InlineCode key={i} text={n.text} />;
      case 'strong': return <strong key={i}><Inlines nodes={n.children} /></strong>;
      case 'em': return <em key={i}><Inlines nodes={n.children} /></em>;
      case 'link': return <a key={i} href={n.href} target="_blank" rel="noreferrer"><Inlines nodes={n.children} /></a>;
      default: return <Fragment key={i}><Inlines nodes={n.children || []} /></Fragment>;
    }
  });
}

/** A fenced block: coloured in its language, folded past a dozen lines once it stops streaming. */
function CodeBlock({ b }) {
  return <CodeBlockView text={b.text} lang={b.lang.toLowerCase()} open={b.open} preClass="md-pre" />;
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
