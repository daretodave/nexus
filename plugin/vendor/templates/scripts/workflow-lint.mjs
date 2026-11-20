#!/usr/bin/env node
// scripts/workflow-lint.mjs: the rules a cloud-loop workflow keeps, checked before GitHub ever parses it.
//
// Learned from a mature adopter, where each rule was a run that failed (or leaked) first:
//   1. Runners. A workflow that reads `secrets.*` runs every job on a GitHub-hosted runner (ubuntu-*, macos-*,
//      windows-*): a self-hosted runner keeps its disk from one job to the next, so a secret on it outlives the job.
//      A secret-free workflow may also name `${{ vars.NEXUS_RUNNER || 'ubuntu-latest' }}` (one repo variable moves it
//      to your own box and back); no other label.
//   2. Contexts. `run-name` may read only github, inputs and vars; a job's own `env:` only github, needs, strategy,
//      matrix, vars and inputs. GitHub refuses the whole file for a context that doesn't exist where it sits
//      (`runner.temp` in a job's env is the classic), and a secret in a job's or the workflow's `env:` is printed into
//      every step's log header and handed to every step, the agent's included: secrets (and `github.token`) go on the
//      step that needs them.
//   3. Injection. A `run:` script never interpolates text a pull request or an issue author wrote
//      (`${{ github.event.pull_request.title }}`, `${{ github.head_ref }}`, …): pass it through `env:` and read the
//      variable, or read the event payload file. The same holds for an action's `with:` inputs that become a model's
//      instructions (`prompt`, `direct_prompt`, `claude_args`): issue text in a prompt steers the agent, so only an
//      issue NUMBER crosses, and the agent reads the rest as data.
//   4. Composite actions (.github/actions/<name>/action.yml) keep rule 3 for their own run scripts, and read no
//      secret: a composite action has no secrets context, so the secret comes in as an input.
//
// Indentation is read, not assumed: a job's keys sit wherever the file puts them (two spaces or four).
//
//   node scripts/workflow-lint.mjs [dir …]     (default .github/workflows .github/actions) → exit 1 and one line per problem
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const HOSTED = /^(ubuntu|macos|windows)-[\w.-]+$/;
export const RUNNER_VAR = "${{ vars.NEXUS_RUNNER || 'ubuntu-latest' }}";
export const ALLOWED = {
  'run-name': ['github', 'inputs', 'vars'],
  'jobs.<id>.env': ['github', 'needs', 'strategy', 'matrix', 'vars', 'inputs'],
  env: ['github', 'inputs', 'vars'],
};
const FUNCTIONS = new Set(['contains', 'startsWith', 'endsWith', 'format', 'join', 'toJSON', 'fromJSON', 'hashFiles', 'true', 'false', 'null']);
/** Event fields an outsider writes: titles, bodies, messages, branch names, labels, author names and emails. */
const UNTRUSTED = /\bgithub\.(head_ref\b|event\.[\w.[\]*]*\.(title|body|message|ref|label|name|email|page_name)\b)/;

/** The context names an expression reads: identifiers not after a dot, strings removed, functions and literals skipped. */
export function contextsIn(expr) {
  const bare = expr.replace(/'(?:[^']|'')*'/g, "''");
  return [...bare.matchAll(/(?<![.\w-])([A-Za-z_][\w-]*)/g)].map((m) => m[1]).filter((n) => !FUNCTIONS.has(n));
}

export const expressions = (text) => [...text.matchAll(/\$\{\{([\s\S]*?)\}\}/g)].map((m) => m[1]);

/** The block of lines under line i that are indented deeper than it (blank lines included). */
function blockUnder(lines, i) {
  const indent = /^(\s*)/.exec(lines[i])[1].length;
  const out = [];
  for (let j = i + 1; j < lines.length; j++) {
    if (lines[j].trim() === '' || /^(\s*)/.exec(lines[j])[1].length > indent) out.push(lines[j]);
    else break;
  }
  return out;
}

const indentOf = (line) => /^(\s*)/.exec(line)[1].length;
const isContent = (line) => line.trim() !== '' && !/^\s*#/.test(line);

/**
 * Each place the context rule covers: run-name, the workflow's own `env:`, and each job's `env:`. A job id sits at the
 * indent of the first line under `jobs:`, and its keys at the indent of the first line under the id, whatever both are.
 */
export function placesIn(yml) {
  const lines = yml.split(/\r?\n/);
  const places = [];
  let inJobs = false;
  let jobIndent = null;
  let keyIndent = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const rn = /^run-name:\s*(.*)$/.exec(line);
    if (rn) places.push({ where: 'run-name', text: rn[1] });
    if (/^env:\s*$/.test(line)) places.push({ where: 'env', text: blockUnder(lines, i).join('\n') });
    if (!isContent(line)) continue;
    if (/^\S/.test(line)) {
      inJobs = /^jobs:\s*$/.test(line);
      jobIndent = keyIndent = null;
      continue;
    }
    if (!inJobs) continue;
    const indent = indentOf(line);
    if (jobIndent === null) jobIndent = indent;
    if (indent <= jobIndent) {
      keyIndent = null;
      continue;
    }
    if (keyIndent === null) keyIndent = indent;
    if (indent === keyIndent && /^\s*env:\s*$/.test(line)) places.push({ where: 'jobs.<id>.env', text: blockUnder(lines, i).join('\n') });
  }
  return places;
}

/** Each `run:` script's text (an inline one or a block). */
export function runScripts(yml) {
  const lines = yml.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(?:- )?run:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    out.push(/^[|>][-+]?\s*$/.test(m[1]) ? blockUnder(lines, i).join('\n') : m[1]);
  }
  return out;
}

/** The `with:` keys whose value an agent reads as its instructions. */
export const PROMPT_INPUTS = ['prompt', 'direct_prompt', 'claude_args'];

/**
 * Each prompt input's text under a `with:` block: `{ key, text }`, an inline value or a block scalar. Only keys at the
 * with-block's own indent count, so a nested map that happens to name `prompt` is left alone.
 */
export function promptInputs(yml) {
  const lines = yml.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*(?:- )?with:\s*$/.test(lines[i])) continue;
    const block = blockUnder(lines, i);
    const first = block.find(isContent);
    if (!first) continue;
    const keyIndent = indentOf(first);
    for (let j = 0; j < block.length; j++) {
      if (!isContent(block[j]) || indentOf(block[j]) !== keyIndent) continue;
      const m = /^\s*([\w-]+):\s*(.*)$/.exec(block[j]);
      if (!m || !PROMPT_INPUTS.includes(m[1])) continue;
      out.push({ key: m[1], text: /^[|>][-+]?\s*$/.test(m[2]) ? blockUnder(block, j).join('\n') : m[2] });
    }
  }
  return out;
}

/** What's wrong with one workflow file, one line per problem. */
export function lintWorkflow(name, text) {
  const problems = [];
  // A token is a secret too, and `secrets: inherit` hands a called workflow every one.
  const secrets = /\bsecrets\.|\bgithub\.token\b|^\s*secrets:\s*inherit\b/m.test(text);
  for (const m of text.matchAll(/^\s*runs-on:(.*)$/gm)) {
    const label = m[1].trim();
    if (HOSTED.test(label)) continue;
    // A matrix axis is fine when every value it lists is a hosted label (`os: [ubuntu-latest, windows-latest]`).
    const axis = /^\$\{\{\s*matrix\.([\w-]+)\s*\}\}$/.exec(label);
    const values = axis && new RegExp(`^\\s*${axis[1]}:\\s*\\[([^\\]]*)\\]`, 'm').exec(text);
    if (values && values[1].split(',').map((v) => v.trim().replace(/^['"]|['"]$/g, '')).every((v) => HOSTED.test(v))) continue;
    if (label === RUNNER_VAR) {
      if (secrets) problems.push(`${name}: reads secrets.* but may run on NEXUS_RUNNER (a secret runs on hosted runners only)`);
      continue;
    }
    problems.push(`${name}: runs-on ${label || '(a list)'} is neither a hosted label nor ${RUNNER_VAR}`);
  }
  for (const { where, text: placeText } of placesIn(text)) {
    for (const expr of expressions(placeText)) {
      if (where !== 'run-name' && /\bgithub\.token\b/.test(expr)) problems.push(`${name}: ${where} reads github.token (a token is a secret: put it on the step that needs it)`);
      for (const ctx of contextsIn(expr)) {
        if (!ALLOWED[where].includes(ctx)) problems.push(`${name}: ${where} reads ${ctx} in \${{${expr}}}${ctx === 'secrets' ? ' (put the secret on the step that needs it)' : ''}`);
      }
    }
  }
  problems.push(...injections(name, text));
  return problems;
}

/** Rule 3: each run script or prompt input that interpolates outsider text, one line each. */
function injections(name, text) {
  const problems = [];
  for (const script of runScripts(text)) {
    for (const expr of expressions(script)) {
      if (UNTRUSTED.test(expr)) problems.push(`${name}: a run script interpolates \${{${expr}}} (outsider text: pass it through env: instead)`);
    }
  }
  for (const { key, text: input } of promptInputs(text)) {
    for (const expr of expressions(input)) {
      if (UNTRUSTED.test(expr)) problems.push(`${name}: with: ${key} interpolates \${{${expr}}} (outsider text steers the agent: pass the issue number, the agent reads the rest as data)`);
    }
  }
  return problems;
}

/** What's wrong with one composite action (rule 4): its run scripts keep rule 3, and it reads no secret. */
export function lintAction(name, text) {
  const problems = [];
  for (const expr of expressions(text)) {
    if (contextsIn(expr).includes('secrets')) problems.push(`${name}: reads secrets in \${{${expr}}} (a composite action has no secrets context: pass it in as an input)`);
  }
  problems.push(...injections(name, text));
  return problems;
}

const ACTION_FILE = /^action\.ya?ml$/;

/**
 * Lint each directory: an action.yml/action.yaml at any depth as a composite action, any other .yml/.yaml directly in
 * it as a workflow. A missing directory has nothing to say; `files` counts both kinds.
 */
export function lintDirs(dirs) {
  const problems = [];
  let files = 0;
  const walk = (dir, top) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, false);
      else if (/\.ya?ml$/.test(e.name) && (top || ACTION_FILE.test(e.name))) {
        files++;
        const rel = full.split(path.sep).join('/');
        const text = fs.readFileSync(full, 'utf8');
        problems.push(...(ACTION_FILE.test(e.name) ? lintAction(rel, text) : lintWorkflow(rel, text)));
      }
    }
  };
  for (const dir of dirs) if (fs.existsSync(dir)) walk(dir, true);
  return { problems, files };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dirs = process.argv.slice(2);
  const { problems, files } = lintDirs(dirs.length ? dirs : ['.github/workflows', '.github/actions']);
  for (const p of problems) console.error(p);
  console.log(`workflow-lint: ${files} file(s), ${problems.length} problem(s)`);
  process.exit(problems.length ? 1 : 0);
}
