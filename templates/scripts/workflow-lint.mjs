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
//      variable, or read the event payload file.
//
//   node scripts/workflow-lint.mjs [dir …]     (default .github/workflows) → exit 1 and one line per problem
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

/** Each place the context rule covers: run-name, the workflow's own `env:`, and each job's `env:`. */
export function placesIn(yml) {
  const lines = yml.split(/\r?\n/);
  const places = [];
  let inJobs = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const rn = /^run-name:\s*(.*)$/.exec(line);
    if (rn) places.push({ where: 'run-name', text: rn[1] });
    if (/^env:\s*$/.test(line)) places.push({ where: 'env', text: blockUnder(lines, i).join('\n') });
    if (/^jobs:\s*$/.test(line)) inJobs = true;
    else if (/^\S/.test(line)) inJobs = false;
    if (inJobs && /^ {4}env:\s*$/.test(line)) places.push({ where: 'jobs.<id>.env', text: blockUnder(lines, i).join('\n') });
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
  for (const script of runScripts(text)) {
    for (const expr of expressions(script)) {
      if (UNTRUSTED.test(expr)) problems.push(`${name}: a run script interpolates \${{${expr}}} (outsider text: pass it through env: instead)`);
    }
  }
  return problems;
}

/** Lint every .yml/.yaml file in each directory; a missing directory has nothing to say. */
export function lintDirs(dirs) {
  const problems = [];
  let files = 0;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => /\.ya?ml$/.test(x)).sort()) {
      files++;
      const rel = path.join(dir, f).split(path.sep).join('/');
      problems.push(...lintWorkflow(rel, fs.readFileSync(path.join(dir, f), 'utf8')));
    }
  }
  return { problems, files };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dirs = process.argv.slice(2);
  const { problems, files } = lintDirs(dirs.length ? dirs : ['.github/workflows']);
  for (const p of problems) console.error(p);
  console.log(`workflow-lint: ${files} workflow(s), ${problems.length} problem(s)`);
  process.exit(problems.length ? 1 : 0);
}
