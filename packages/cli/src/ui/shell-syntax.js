// Shell commands, tokenized for colour (spec 47, A5): a tool row's command
// as runs the transcript paints from the --syn-* theme tokens
// (styles/markdown.css). Pure and lossless: the tokens' text, joined, is the
// input. Not a shell parser; a wrong colour is the worst it does.
//
// Token kinds: cmd · flag · str · path · num · var · op · comment · text · ws

const OPS = ['&&', '||', ';;', '>>', '2>&1', '&>', '2>', '1>', '$(', '|', ';', '&', '>', '<', '(', ')', '{', '}', '`'];
/** After these the next word is a command. */
const STARTS = new Set(['&&', '||', ';;', '$(', '|', ';', '&', '(', '{', '`']);
const WORD_END = /[\s|&;<>()`'"{}]/;

function wordKind(w) {
  if (/^-{1,2}[\w-]/.test(w) || w === '-' || w === '--') return 'flag';
  if (/^[+-]?\d+(?:\.\d+)?$/.test(w)) return 'num';
  if (/[/\\]/.test(w) || /^[.~]/.test(w) || /\.[A-Za-z0-9]{1,6}$/.test(w)) return 'path';
  return 'text';
}

/** The tokens of a shell command line: [{ t, v }]. */
export function tokenizeShell(src) {
  const s = String(src ?? '');
  const out = [];
  const push = (t, v) => {
    const last = out[out.length - 1];
    if (last && last.t === t && (t === 'ws' || t === 'text')) last.v += v; else out.push({ t, v });
  };
  let cmdNext = true;
  let heredoc = null; // { word, dash } after <<WORD, until the line that ends it
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j += 1;
      const nl = s.indexOf('\n', i);
      if (heredoc && nl !== -1 && nl < j) {
        // A heredoc's body is one string, from the line after <<WORD to the line that is WORD.
        push('ws', s.slice(i, nl + 1));
        let k = nl + 1;
        let end = s.length;
        let close = '';
        while (k <= s.length) {
          const e = s.indexOf('\n', k);
          const line = s.slice(k, e === -1 ? s.length : e);
          if ((heredoc.dash ? line.trim() : line) === heredoc.word) { end = k; close = line; break; }
          if (e === -1) break;
          k = e + 1;
        }
        if (end > nl + 1) push('str', s.slice(nl + 1, end));
        if (close) push('op', close);
        i = end + close.length;
        heredoc = null;
        cmdNext = true;
        continue;
      }
      push('ws', s.slice(i, j));
      if (s.slice(i, j).includes('\n')) cmdNext = true;
      i = j;
      continue;
    }
    // A here-string (`<<< word`) is one operator; taken whole here, so its second '<' never reads as a heredoc's first.
    if (s.startsWith('<<<', i)) { push('op', '<<<'); i += 3; cmdNext = false; continue; }
    const here = c === '<' && s[i + 1] === '<' ? /^<<(-?)[ \t]*(['"]?)([A-Za-z_][\w-]*)\2/.exec(s.slice(i, i + 80)) : null;
    if (here) {
      push('op', here[0]);
      heredoc = { word: here[3], dash: !!here[1] };
      i += here[0].length;
      cmdNext = false;
      continue;
    }
    if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) {
      const j = s.indexOf('\n', i);
      const end = j === -1 ? s.length : j;
      push('comment', s.slice(i, end));
      i = end;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== c) j += c === '"' && s[j] === '\\' ? 2 : 1;
      const end = Math.min(j + 1, s.length);
      push('str', s.slice(i, end));
      i = end;
      cmdNext = false;
      continue;
    }
    if (c === '$' && s[i + 1] !== '(') {
      const m = /^\$(?:\{[^}]*\}?|[A-Za-z_]\w*|[0-9?#@*!$-])/.exec(s.slice(i));
      if (m) { push('var', m[0]); i += m[0].length; cmdNext = false; continue; }
    }
    const op = OPS.find((o) => s.startsWith(o, i));
    if (op) {
      push('op', op);
      i += op.length;
      cmdNext = STARTS.has(op);
      continue;
    }
    let j = i;
    while (j < s.length && !WORD_END.test(s[j]) && !(s[j] === '$' && j > i)) j += 1;
    if (j === i) j = i + 1;
    const w = s.slice(i, j);
    if (cmdNext && /^[A-Za-z_]\w*=/.test(w)) {
      push('var', w); // an env assignment before the command
    } else if (cmdNext) {
      push('cmd', w);
      cmdNext = false;
    } else {
      push(wordKind(w), w);
    }
    i = j;
  }
  return out;
}

const PATH_TOOLS = new Set(['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Glob', 'LS']);

/**
 * A tool row's summary as tokens: a Bash (or PowerShell) command highlighted, a Grep pattern
 * as one string, a file tool's path as a path; any other tool plain.
 */
export function toolArgTokens(tool, args) {
  const s = String(args ?? '');
  if (!s) return [];
  if (tool === 'Bash' || tool === 'BashOutput' || tool === 'PowerShell') return tokenizeShell(s);
  if (tool === 'Grep') return [{ t: 'str', v: s }];
  if (PATH_TOOLS.has(tool)) return [{ t: 'path', v: s }];
  return [{ t: 'text', v: s }];
}

/** The fence languages drawn as shell. */
export const SHELL_LANGS = new Set(['sh', 'bash', 'shell', 'zsh', 'console', 'shellsession', 'powershell', 'ps1', 'pwsh', 'cmd', 'bat']);
