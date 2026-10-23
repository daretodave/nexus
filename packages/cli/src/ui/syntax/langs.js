// Fence languages and file names to the grammar that draws them. Pure data and two lookups; the grammars themselves
// load in highlighter.js, one chunk each, only when a block in that language first shows.

/** Every spelling a fence or a file extension uses, to the grammar's name. */
const ALIAS = {
  js: 'javascript', javascript: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', node: 'javascript',
  ts: 'typescript', typescript: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  json: 'json', jsonc: 'json', json5: 'json', jsonl: 'json', ndjson: 'json', geojson: 'json',
  py: 'python', python: 'python', python3: 'python', pyi: 'python',
  rb: 'ruby', ruby: 'ruby', gemfile: 'ruby',
  go: 'go', golang: 'go', rs: 'rust', rust: 'rust',
  java: 'java', kt: 'kotlin', kts: 'kotlin', kotlin: 'kotlin', swift: 'swift',
  c: 'c', h: 'c', cpp: 'cpp', 'c++': 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp',
  cs: 'csharp', csharp: 'csharp', 'c#': 'csharp', php: 'php', lua: 'lua',
  css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', vue: 'xml', svelte: 'xml', xhtml: 'xml', plist: 'xml',
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini', properties: 'ini', env: 'ini',
  sql: 'sql', psql: 'sql', mysql: 'sql', sqlite: 'sql', pgsql: 'sql',
  graphql: 'graphql', gql: 'graphql',
  diff: 'diff', patch: 'diff',
  dockerfile: 'dockerfile', docker: 'dockerfile', makefile: 'makefile', make: 'makefile', mk: 'makefile',
  powershell: 'powershell', ps1: 'powershell', psm1: 'powershell', pwsh: 'powershell', ps: 'powershell',
  sh: 'shell', bash: 'shell', shell: 'shell', zsh: 'shell', console: 'shell', shellsession: 'shell', fish: 'shell',
  cmd: 'shell', bat: 'shell', batch: 'shell', terminal: 'shell',
};

/** The grammar for a fence's language word ('' when there is none or it is not one we draw). */
export function langOf(word) {
  const w = String(word || '').trim().toLowerCase().replace(/^\{?\.?/, '').replace(/\}$/, '');
  return ALIAS[w] || '';
}

/** The grammar for a file path, by its extension or its whole name (Dockerfile, Makefile). */
export function langOfPath(path) {
  const base = String(path || '').split(/[\\/]/).pop().toLowerCase();
  if (!base) return '';
  if (base === 'dockerfile' || base.startsWith('dockerfile.')) return 'dockerfile';
  if (base === 'makefile' || base === 'gnumakefile') return 'makefile';
  if (base === '.env' || base.startsWith('.env.')) return 'ini';
  if (base === '.gitignore' || base === '.npmrc' || base === '.editorconfig') return 'ini';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? ALIAS[base.slice(dot + 1)] || '' : '';
}

/**
 * How the quick tokenizer (lite.js) reads a grammar: which comments it has and whether it is data. The grammar
 * engine knows more; this is what shows before it arrives, and all that shows where it never does.
 */
export const FAMILY = {
  javascript: 'c', typescript: 'c', java: 'c', kotlin: 'c', swift: 'c', c: 'c', cpp: 'c', csharp: 'c', go: 'c',
  rust: 'c', php: 'c', css: 'css', scss: 'c', less: 'c', graphql: 'hash',
  python: 'hash', ruby: 'hash', yaml: 'yaml', ini: 'ini', dockerfile: 'hash', makefile: 'hash', powershell: 'hash',
  sql: 'sql', lua: 'sql', json: 'json', diff: 'diff', shell: 'shell', xml: 'xml', markdown: 'text',
};

/** Grammars the engine loads (shell stays with the hand-written tokenizer: it knows commands from arguments). */
export const ENGINE_LANGS = new Set(Object.keys(FAMILY).filter((l) => l !== 'shell'));
