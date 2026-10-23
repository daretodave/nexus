// What an open tool row (and a permission card) shows of a call: the call itself in its own terms and what came
// back. A shell command whole and coloured, an edit as a coloured diff, a written file in its language, a search's
// matches with their paths, any other input as a foldable JSON tree; the result below it, a Read's lines numbered
// and coloured by the file's language. Long panels fold (ui/code.jsx). The input and output come clipped from the
// server (server/normalize.mjs clipInput, clipOutput); a call from before them shows its one-line summary.
import { useMemo } from 'react';
import { CodeBlockView, DiffView, JsonView } from './code.jsx';
import { Markdown } from './markdown.jsx';
import { langOfPath } from './syntax/langs.js';
import { cleanOutput, listTokens, parseNumbered } from './syntax/output.js';

const SHELL = new Set(['Bash', 'BashOutput']);
const LISTS = new Set(['Grep', 'Glob', 'LS']);
const PROSE = new Set(['Task', 'Agent', 'WebFetch', 'WebSearch']);
const str = (v) => (typeof v === 'string' ? v : '');

/** The call: { kind, ... } for the panel that draws it. Pure, so the choice is tested without rendering. */
export function callView(tool, input, args = '') {
  const i = input && typeof input === 'object' ? input : null;
  if (SHELL.has(tool) || tool === 'PowerShell') {
    const command = str(i?.command) || args;
    return command ? { kind: 'code', lang: tool === 'PowerShell' ? 'powershell' : 'shell', text: command, label: tool === 'PowerShell' ? 'powershell' : 'shell' } : null;
  }
  if (tool === 'Edit' && i && typeof i.old_string === 'string' && typeof i.new_string === 'string') {
    return { kind: 'diff', edits: [{ file: str(i.file_path) || args, before: i.old_string, after: i.new_string }] };
  }
  if (tool === 'MultiEdit' && i && Array.isArray(i.edits)) {
    const edits = i.edits.filter((e) => e && typeof e.old_string === 'string' && typeof e.new_string === 'string').map((e) => ({ file: str(i.file_path) || args, before: e.old_string, after: e.new_string }));
    return edits.length ? { kind: 'diff', edits } : null;
  }
  if (tool === 'Write' && i && typeof i.content === 'string') {
    const file = str(i.file_path) || args;
    return { kind: 'code', lang: langOfPath(file), text: i.content, label: file.split(/[\\/]/).pop() || 'file' };
  }
  if (tool === 'NotebookEdit' && i && typeof i.new_source === 'string') {
    return { kind: 'code', lang: i.cell_type === 'markdown' ? 'markdown' : 'python', text: i.new_source, label: 'cell' };
  }
  if (i && Object.keys(i).length) return { kind: 'json', value: i };
  return args ? { kind: 'code', lang: '', text: args, label: '' } : null;
}

/** The result: { kind, ... } for the panel that draws it, or null with nothing to show. */
export function outputView(tool, input, output) {
  const text = cleanOutput(output);
  if (!text.trim()) return null;
  if (tool === 'Read') {
    const n = parseNumbered(text);
    const lang = langOfPath(str(input?.file_path));
    if (n) return { kind: 'code', lang, text: n.code, numbered: n.nums };
    return { kind: 'code', lang: '', text };
  }
  if (LISTS.has(tool)) return { kind: 'list', text };
  if (PROSE.has(tool)) return { kind: 'prose', text };
  const t = text.trim();
  if (/^[[{]/.test(t) && /[\]}]$/.test(t)) {
    try { return { kind: 'json', value: JSON.parse(t) }; } catch { /* not JSON after all */ }
  }
  return { kind: 'code', lang: '', text };
}

function Panel({ view, error }) {
  if (!view) return null;
  if (view.kind === 'diff') {
    return view.edits.map((e, k) => <DiffView key={k} file={e.file} before={e.before} after={e.after} />);
  }
  if (view.kind === 'json') return <JsonView value={view.value} />;
  if (view.kind === 'list') return <CodeBlockView text={view.text} tokens={listTokens(view.text)} label="matches" />;
  if (view.kind === 'prose') return <Markdown className="msg-text tool-prose" text={view.text} />;
  return <CodeBlockView text={view.text} lang={view.lang} label={view.label} numbered={view.numbered || null} className={error ? 'code-pre is-error' : 'code-pre'} />;
}

/** An open tool row's body: the call, then its output or its error. */
export function ToolDetail({ tool, args, input, output, error }) {
  const call = useMemo(() => callView(tool, input, args), [tool, input, args]);
  const out = useMemo(() => outputView(tool, input, output), [tool, input, output]);
  return (
    <div className="tool-detail">
      <Panel view={call} />
      {out ? <><span className="code-cap">{tool === 'Read' ? 'contents' : 'output'}</span><Panel view={out} /></> : null}
      {error ? <><span className="code-cap">error</span><CodeBlockView text={error} className="code-pre is-error" /></> : null}
    </div>
  );
}
