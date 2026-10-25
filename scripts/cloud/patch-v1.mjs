#!/usr/bin/env node
// scripts/cloud/patch-v1.mjs: the quota governor for a repo still on v1 (spec 55.10). Every loop on one Claude
// subscription shares its seven_day window, and a v1 loop burns it with no gate and on the busiest cron minute.
// This adds, to a v1 repo's march.yml and night.yml, exactly what the governor needs and nothing else:
//
//   - "Quota cache restore" and "Quota gate" before the claude-code-action step, which gains
//     `if: steps.quota_gate.outputs.skip != 'true'` (and an id, when it has none);
//   - "Quota read", "Quota cache save" and "Pause on the weekly quota" right after it;
//   - `&& steps.quota.outputs.status != 'rejected'` on each later step that opens an issue (a lockout is not a crash);
//   - `issues: write` in that job's permissions (the gate closes the pause issue; the pause step opens it);
//   - every `- cron:` minute off :00 (`0` becomes `17`, hours kept);
//   - scripts/cloud/quota.mjs, copied from templates/scripts/cloud/quota.mjs.
//
//   node scripts/cloud/patch-v1.mjs --repo <path> [--write] [--minute 17] [--force]
//       Dry run by default: prints the diff it would apply. --write applies it in <path>'s working tree; it never
//       commits, never pushes. It refuses a dirty workflow file (--force overrides), a step id it would collide
//       with, and any workflow-lint problem the patch would introduce. A file that already has a Quota gate step
//       is left as it is. Owner-run per adopter repo, on a fresh scratch clone of its origin, never a working
//       checkout. Zero dependencies.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lintWorkflow } from '../../templates/scripts/workflow-lint.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const QUOTA_SOURCE = path.join(HERE, '..', '..', 'templates', 'scripts', 'cloud', 'quota.mjs');
export const QUOTA_TARGET = 'scripts/cloud/quota.mjs';
export const WORKFLOWS = ['.github/workflows/march.yml', '.github/workflows/night.yml'];
export const DEFAULT_MINUTE = 17;
const CLAUDE = /^\s*(-\s+)?uses:\s*['"]?anthropics\/claude-code-action@/;
const GATE_IF = "steps.quota_gate.outputs.skip != 'true'";
const QUIET_IF = "steps.quota.outputs.status != 'rejected'";
const RUN_URL = '${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}';

// ---- the steps it adds (kept in step with templates/.github/workflows/march.yml; the test holds them there) ----

/** The steps before the model: the cached reading, then the gate. */
export function gateSteps() {
  return [
    '# The quota governor (scripts/cloud/quota.mjs): every loop on',
    '# your Claude subscription shares one seven_day window. The',
    '# newest reading any march or night run cached comes back first.',
    '- name: Quota cache restore',
    '  uses: actions/cache/restore@v4',
    '  with:',
    '    path: .nexus/quota.json',
    '    key: nexus-quota-${{ github.run_id }}',
    '    restore-keys: nexus-quota-',
    '',
    "# Skips the model (a clean exit) while the pause issue's reset",
    '# is ahead, or, for a scheduled tick, when the cached utilization',
    '# is at or above the repo variable NEXUS_QUOTA_MAX (default 0.90;',
    '# `off` disables that soft cap). Manual runs ignore the soft cap.',
    '# Fails open.',
    '- name: Quota gate',
    '  id: quota_gate',
    '  env:',
    '    GH_TOKEN: ${{ github.token }}',
    '    EVENT: ${{ github.event_name }}',
    "    QUOTA_MAX: ${{ vars.NEXUS_QUOTA_MAX || '0.90' }}",
    '  run: |',
    "    grep -qx '.nexus/' .git/info/exclude 2>/dev/null || echo '.nexus/' >> .git/info/exclude",
    '    node scripts/cloud/quota.mjs gate --event "$EVENT" --max "$QUOTA_MAX" || echo "skip=false" >> "$GITHUB_OUTPUT"',
  ];
}

/** The steps after the model: its reading, the cache the next run's gate reads, and the pause issue. */
export function readSteps(id) {
  return [
    "# The tick's own reading, from the action's execution file:",
    '# one summary line, the `quota` output, and the cache the next',
    "# run's gate reads.",
    '- name: Quota read',
    '  id: quota',
    `  if: always() && (steps.${id}.outcome == 'success' || steps.${id}.outcome == 'failure')`,
    '  env:',
    `    EXEC_FILE: \${{ steps.${id}.outputs.execution_file }}`,
    '  run: node scripts/cloud/quota.mjs read "$EXEC_FILE"',
    '',
    '- name: Quota cache save',
    "  if: always() && steps.quota.outputs.quota != ''",
    '  uses: actions/cache/save@v4',
    '  with:',
    '    path: .nexus/quota.json',
    '    key: nexus-quota-${{ github.run_id }}-${{ github.run_attempt }}',
    '',
    '# A weekly lockout is not a crash: ONE "Loop paused: weekly',
    '# quota until <ISO>" issue (label loop:paused-quota), opened or',
    '# retitled, and no crash issue. The gate closes it after the reset.',
    '- name: Pause on the weekly quota',
    "  if: always() && steps.quota.outputs.status == 'rejected'",
    '  env:',
    '    GH_TOKEN: ${{ github.token }}',
    '    RESETS: ${{ steps.quota.outputs.resets }}',
    `    RUN_URL: ${RUN_URL}`,
    '  run: node scripts/cloud/quota.mjs pause --resets "$RESETS" --run-url "$RUN_URL"',
  ];
}

// ---- cron ------------------------------------------------------------------------------------------------------

/**
 * A cron expression with its minute off :00, hours kept: { cron, note }. A list that holds 0 shifts by `minute`
 * when nothing wraps past :59 (`0,30` → `17,47`), else 0 alone becomes `minute`; `*\/N` (N divides 60) becomes its
 * explicit list from `minute % N`. Anything else (no :00, `*`, a range) is left as it is, with a note when it
 * still fires at :00.
 */
export function offsetCron(expr, minute = DEFAULT_MINUTE) {
  const fields = String(expr).trim().split(/\s+/);
  if (fields.length !== 5) return { cron: expr, note: `not a five-field cron, left as it is: ${expr}` };
  const m = fields[0];
  const rest = fields.slice(1).join(' ');
  if (/^\d+(,\d+)*$/.test(m)) {
    const mins = m.split(',').map(Number);
    if (!mins.includes(0)) return { cron: expr, note: null };
    const shifted = mins.every((x) => x + minute < 60)
      ? mins.map((x) => x + minute)
      : mins.map((x) => (x === 0 ? minute : x));
    const list = [...new Set(shifted)].sort((a, b) => a - b).join(',');
    return { cron: `${list} ${rest}`, note: null };
  }
  const step = /^(?:\*|0)\/(\d+)$/.exec(m);
  if (step) {
    const n = Number(step[1]);
    if (n > 0 && n < 60 && 60 % n === 0) {
      const list = [];
      for (let x = minute % n; x < 60; x += n) list.push(x);
      return { cron: `${list.join(',')} ${rest}`, note: null };
    }
  }
  return { cron: expr, note: `cron minute '${m}' left as it is (move it off :00 by hand if it fires there): ${expr}` };
}

/** Every `- cron:` line offset; returns the notes. Mutates `lines`. */
function patchCrons(lines, minute, notes) {
  for (let i = 0; i < lines.length; i++) {
    const c = /^(\s*-\s*cron:\s*)(['"]?)([^'"#]+?)\2(\s*(#.*)?)$/.exec(lines[i]);
    if (!c) continue;
    const { cron, note } = offsetCron(c[3], minute);
    if (note) notes.push(note);
    if (cron !== c[3]) lines[i] = `${c[1]}${c[2]}${cron}${c[2]}${c[4]}`;
  }
}

// ---- reading the workflow's shape (line based: the indentation the file uses, never assumed) ------------------

const indentOf = (line) => /^(\s*)/.exec(line)[1].length;
const isBlank = (line) => line.trim() === '';
const isComment = (line) => /^\s*#/.test(line);

/** The jobs: [{ name, start, end }] with end exclusive. */
export function jobsOf(lines) {
  const top = lines.findIndex((l) => /^jobs:\s*(#.*)?$/.test(l));
  if (top < 0) return [];
  let jobIndent = -1;
  const jobs = [];
  for (let i = top + 1; i < lines.length; i++) {
    const l = lines[i];
    if (isBlank(l) || isComment(l)) continue;
    const ind = indentOf(l);
    if (ind === 0) break;
    if (jobIndent < 0) jobIndent = ind;
    if (ind === jobIndent) {
      const k = /^\s*([\w-]+):/.exec(l);
      if (k) {
        if (jobs.length) jobs[jobs.length - 1].end = i;
        jobs.push({ name: k[1], start: i, end: lines.length, indent: ind });
      }
    }
  }
  if (jobs.length) {
    const last = jobs[jobs.length - 1];
    for (let i = last.start + 1; i < lines.length; i++) {
      if (!isBlank(lines[i]) && !isComment(lines[i]) && indentOf(lines[i]) === 0) {
        last.end = i;
        break;
      }
    }
  }
  return jobs;
}

/** A job's steps: [{ start, end, dash, key }] (end exclusive, trailing blanks and comments excluded). */
export function stepsOf(lines, job) {
  const s = lines.findIndex((l, i) => i > job.start && i < job.end && /^\s*steps:\s*(#.*)?$/.test(l));
  if (s < 0) return [];
  const stepsIndent = indentOf(lines[s]);
  let dash = -1;
  const steps = [];
  for (let i = s + 1; i < job.end; i++) {
    const l = lines[i];
    if (isBlank(l) || isComment(l)) continue;
    const ind = indentOf(l);
    if (ind <= stepsIndent && !(ind === stepsIndent && /^\s*-\s/.test(l))) break;
    if (dash < 0 && /^\s*-\s/.test(l)) dash = ind;
    if (ind === dash && /^\s*-\s/.test(l)) {
      const key = dash + /^\s*-(\s+)/.exec(l)[1].length + 1;
      steps.push({ start: i, end: i + 1, dash, key });
    } else if (ind <= dash) break;
  }
  for (let n = 0; n < steps.length; n++) {
    const st = steps[n];
    const limit = n + 1 < steps.length ? steps[n + 1].start : job.end;
    let end = st.start + 1;
    for (let i = st.start + 1; i < limit; i++) {
      const l = lines[i];
      if (isBlank(l) || isComment(l)) continue;
      if (indentOf(l) <= st.dash) break;
      end = i + 1;
    }
    st.end = end;
  }
  return steps;
}

/** The line index of a step's own `key:` (at its key indent, or on its dash line), or -1. */
function keyLine(lines, step, key) {
  const re = new RegExp(`^\\s*(-\\s+)?${key}:`);
  for (let i = step.start; i < step.end; i++) {
    const l = lines[i];
    if (!re.test(l)) continue;
    if (i === step.start || indentOf(l) === step.key) return i;
  }
  return -1;
}

const valueOf = (line, key) => new RegExp(`^\\s*(?:-\\s+)?${key}:\\s*(.*?)\\s*$`).exec(line)?.[1] ?? '';

/** A plain YAML value split from a trailing ` #...` comment that sits outside quotes: [value, comment]. */
export function splitComment(v) {
  let q = '';
  for (let i = 0; i < v.length; i++) {
    const ch = v[i];
    if (q) {
      if (q === '"' && ch === '\\') i++;
      else if (ch === q) q = '';
    } else if (ch === '"' || ch === "'") q = ch;
    else if (ch === '#' && (i === 0 || /\s/.test(v[i - 1]))) {
      const value = v.slice(0, i).trimEnd();
      return [value, v.slice(value.length)];
    }
  }
  return [v, ''];
}

/** A wholly quoted YAML scalar unquoted ('' and \" unescaped); the text as it is when unquoted; null when it is
 *  quoted but not one whole scalar (it cannot be extended safely). */
export function unquote(c) {
  if (c[0] === "'") {
    const m = /^'((?:[^']|'')*)'$/.exec(c);
    return m ? m[1].replace(/''/g, "'") : null;
  }
  if (c[0] === '"') {
    const m = /^"((?:[^"\\]|\\.)*)"$/.exec(c);
    if (!m || /\\[^"\\]/.test(m[1])) return null;
    return m[1].replace(/\\(["\\])/g, '$1');
  }
  return c;
}

/** `cond && extra`, parenthesized when cond has a top-level `||`; quotes and a `${{ }}` wrapper are unwrapped
 *  first. null when cond is quoted in a way it cannot unwrap. */
export function andIf(cond, extra) {
  let c = unquote(String(cond).trim());
  if (c === null) return null;
  c = c.trim();
  const wrapped = /^\$\{\{([\s\S]*)\}\}$/.exec(c);
  if (wrapped) c = wrapped[1].trim();
  if (!c) return extra;
  if (c.includes(extra)) return c;
  return `${/\|\|/.test(c) ? `(${c})` : c} && ${extra}`;
}

/** Append `extra` to a step's single-line `if:` (keeping a trailing comment), or insert one; false when the `if:`
 *  is a block or a quoted value it cannot edit. */
function addIf(lines, step, extra, afterLine) {
  const at = keyLine(lines, step, 'if');
  if (at >= 0) {
    const [v, comment] = splitComment(valueOf(lines[at], 'if'));
    if (/^[|>]/.test(v)) return false;
    const cond = andIf(v, extra);
    if (cond === null) return false;
    const prefix = /^(\s*(?:-\s+)?if:\s*)/.exec(lines[at])[1];
    lines[at] = prefix + cond + comment;
    return true;
  }
  lines.splice(afterLine + 1, 0, `${' '.repeat(step.key)}if: ${extra}`);
  return true;
}

// ---- the patch -------------------------------------------------------------------------------------------------

/**
 * One workflow file patched: { text, notes, changed, already }. `kind` is 'march' or 'night' (it names the id a
 * claude step without one gets). Throws on what it refuses (a colliding step id, a block `if:` it cannot extend).
 */
export function patchWorkflow(text, { kind = 'march', minute = DEFAULT_MINUTE } = {}) {
  const notes = [];
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  if (lines.some((l) => /^\s*-?\s*name:\s*['"]?Quota gate['"]?\s*$/.test(l))) {
    return { text, notes: ['already has a Quota gate step; left as it is'], changed: false, already: true };
  }
  patchCrons(lines, minute, notes);

  let patchedJobs = 0;
  // Bottom-up, so an insertion never moves a job still to come.
  for (const job of jobsOf(lines).reverse()) {
    const steps = stepsOf(lines, job);
    const ci = steps.findIndex((st) => lines.slice(st.start, st.end).some((l) => CLAUDE.test(l)));
    if (ci < 0) continue;
    if (steps.filter((st) => lines.slice(st.start, st.end).some((l) => CLAUDE.test(l))).length > 1) {
      notes.push(`job ${job.name}: more than one claude-code-action step; only the first is gated`);
    }
    for (const st of steps) {
      const at = keyLine(lines, st, 'id');
      const id = at >= 0 ? valueOf(lines[at], 'id').replace(/^['"]|['"]$/g, '') : '';
      if (id === 'quota' || id === 'quota_gate') throw new Error(`job ${job.name}: a step already has id ${id}`);
    }
    const claude = steps[ci];
    const pad = (block) => block.map((l) => (l === '' ? '' : ' '.repeat(claude.dash) + l));

    // After the claude step, bottom-up: issue steps go quiet on a lockout, then the read steps.
    for (const st of steps.slice(ci + 1).reverse()) {
      const body = lines.slice(st.start, st.end).join('\n');
      if (!/gh issue create/.test(body)) continue;
      const at = keyLine(lines, st, 'if');
      if (at < 0) continue; // runs only on success: never on a crash, so never on a lockout either
      if (!addIf(lines, st, QUIET_IF, at)) notes.push(`job ${job.name}: an issue step's block or quoted if: was left as it is`);
      else notes.push(`job ${job.name}: "${valueOf(lines[st.start], '(?:name|uses)')}" stays quiet on a lockout`);
    }

    // The claude step: an id to read its execution file by, and the gate's if.
    let idAt = keyLine(lines, claude, 'id');
    let id = idAt >= 0 ? valueOf(lines[idAt], 'id').replace(/^['"]|['"]$/g, '') : '';
    let grew = 0;
    if (!id) {
      id = kind === 'night' ? 'run_digest' : 'run_march';
      const taken = steps.some((st) => {
        const a = keyLine(lines, st, 'id');
        return a >= 0 && valueOf(lines[a], 'id').replace(/^['"]|['"]$/g, '') === id;
      });
      if (taken) id = 'claude_run';
      lines.splice(claude.start + 1, 0, `${' '.repeat(claude.key)}id: ${id}`);
      idAt = claude.start + 1;
      grew++;
      claude.end++;
    }
    const before = lines.length;
    if (!addIf(lines, claude, GATE_IF, idAt)) throw new Error(`job ${job.name}: the claude step's if: is a block or a quoted value it cannot extend; gate it by hand`);
    grew += lines.length - before;
    claude.end += lines.length - before;

    lines.splice(claude.end, 0, '', ...pad(readSteps(id)));

    // Before the claude step, above the comment lines that introduce it.
    let top = claude.start;
    while (top - 1 > job.start && isComment(lines[top - 1]) && indentOf(lines[top - 1]) === claude.dash) top--;
    lines.splice(top, 0, ...pad(gateSteps()), '');

    // The job's token reads and closes the pause issue (gate) and opens it (pause).
    ensureIssuesWrite(lines, job, notes);
    patchedJobs++;
  }
  if (!patchedJobs) notes.push('no claude-code-action step; no quota steps added');
  const out = lines.join(eol);
  return { text: out, notes, changed: out !== text, already: false };
}

/** `issues: write` in a job's own permissions block (read becomes write, a missing scope is added). */
function ensureIssuesWrite(lines, job, notes) {
  const end = jobsOf(lines).find((j) => j.start === job.start)?.end ?? job.end;
  const p = lines.findIndex((l, i) => i > job.start && i < end && /^\s*permissions:\s*(#.*)?$/.test(l));
  if (p < 0) {
    const inline = lines.findIndex((l, i) => i > job.start && i < end && /^\s*permissions:\s*\S/.test(l));
    if (inline >= 0) notes.push(`job ${job.name}: permissions are set inline; make sure the token has issues: write`);
    return;
  }
  const pInd = indentOf(lines[p]);
  let scopeInd = -1;
  let last = p;
  for (let i = p + 1; i < end; i++) {
    const l = lines[i];
    if (isBlank(l) || isComment(l)) continue;
    if (indentOf(l) <= pInd) break;
    if (scopeInd < 0) scopeInd = indentOf(l);
    last = i;
    const m = /^(\s*issues:\s*)(\w+)(.*)$/.exec(l);
    if (m) {
      if (m[2] !== 'write') {
        lines[i] = `${m[1]}write${m[3]}`;
        notes.push(`job ${job.name}: issues: ${m[2]} -> write (the gate closes, and the pause step opens, the pause issue)`);
      }
      return;
    }
  }
  lines.splice(last + 1, 0, `${' '.repeat(scopeInd < 0 ? pInd + 2 : scopeInd)}issues: write   # the quota gate and the pause issue`);
  notes.push(`job ${job.name}: issues: write added (the quota gate and the pause issue)`);
}

// ---- the diff --------------------------------------------------------------------------------------------------

/** A unified diff (3 lines of context) of two texts, or '' when they match. */
export function unifiedDiff(a, b, file, context = 3) {
  if (a === b) return '';
  const x = a.split(/\r?\n/);
  const y = b.split(/\r?\n/);
  const n = x.length;
  const m = y.length;
  const lcs = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) ops.push([' ', x[i++], j++]);
    else if (i < n && (j >= m || lcs[i + 1][j] >= lcs[i][j + 1])) ops.push(['-', x[i++]]);
    else ops.push(['+', y[j++]]);
  }
  const out = [`--- a/${file}`, `+++ b/${file}`];
  let k = 0;
  while (k < ops.length) {
    if (ops[k][0] === ' ') {
      k++;
      continue;
    }
    let s = Math.max(0, k - context);
    let e = k;
    while (e < ops.length) {
      if (ops[e][0] !== ' ') {
        e++;
        continue;
      }
      let run = 0;
      while (e + run < ops.length && ops[e + run][0] === ' ') run++;
      if (e + run >= ops.length || run > context * 2) {
        e = Math.min(ops.length, e + context);
        break;
      }
      e += run;
    }
    const hunk = ops.slice(s, e);
    const aStart = ops.slice(0, s).filter((o) => o[0] !== '+').length + 1;
    const bStart = ops.slice(0, s).filter((o) => o[0] !== '-').length + 1;
    const aLen = hunk.filter((o) => o[0] !== '+').length;
    const bLen = hunk.filter((o) => o[0] !== '-').length;
    out.push(`@@ -${aStart},${aLen} +${bStart},${bLen} @@`);
    for (const o of hunk) out.push(o[0] + o[1]);
    k = e;
  }
  return out.join('\n') + '\n';
}

// ---- the command -----------------------------------------------------------------------------------------------

function shRun(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 30000, ...opts });
  return { ok: r.status === 0, stdout: r.stdout ?? '', stderr: r.stderr ?? (r.error ? String(r.error.message) : '') };
}

function parseArgs(argv) {
  const out = { write: false, force: false, minute: String(DEFAULT_MINUTE), repo: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write') out.write = true;
    else if (a === '--force') out.force = true;
    else if (a === '--repo') out.repo = argv[++i] ?? '';
    else if (a === '--minute') out.minute = argv[++i] ?? '';
    else if (a === '-h' || a === '--help') out.help = true;
    else out.bad = a;
  }
  return out;
}

const USAGE = 'usage: node scripts/cloud/patch-v1.mjs --repo <path> [--write] [--minute 17] [--force]';

/**
 * Patch one repo. Returns an exit code: 0 done (or nothing to do), 1 refused, 2 usage.
 * `run` reaches git (injected by the tests); `out` takes each line printed.
 */
export function main(argv, { run = shRun, out = (s) => console.log(s), quotaSource = QUOTA_SOURCE } = {}) {
  const o = parseArgs(argv);
  if (o.help || o.bad || !o.repo) {
    out(o.bad ? `patch-v1: unknown argument ${o.bad}\n${USAGE}` : USAGE);
    return 2;
  }
  const minute = Number(o.minute);
  if (!Number.isInteger(minute) || minute < 1 || minute > 59) {
    out('patch-v1: --minute wants a whole minute from 1 to 59');
    return 2;
  }
  const repo = path.resolve(o.repo);
  if (!fs.existsSync(path.join(repo, WORKFLOWS[0]))) {
    out(`patch-v1: no ${WORKFLOWS[0]} under ${repo}`);
    return 1;
  }
  const inside = run('git', ['-C', repo, 'rev-parse', '--is-inside-work-tree']);
  if (!inside.ok || inside.stdout.trim() !== 'true') {
    out(`patch-v1: ${repo} is not a git working tree (patch a fresh clone of the repo's origin)`);
    return 1;
  }
  const origin = run('git', ['-C', repo, 'remote', 'get-url', 'origin']);
  out(`patch-v1: ${repo}${origin.ok ? ` (origin ${origin.stdout.trim()})` : ''}${o.write ? '' : ' - dry run'}`);

  const writes = [];
  let refused = false;
  for (const rel of WORKFLOWS) {
    const file = path.join(repo, rel);
    if (!fs.existsSync(file)) {
      out(`${rel}: absent, skipped`);
      continue;
    }
    const before = fs.readFileSync(file, 'utf8');
    let r;
    try {
      r = patchWorkflow(before, { kind: path.basename(rel, '.yml') === 'night' ? 'night' : 'march', minute });
    } catch (e) {
      out(`${rel}: refused - ${e.message}`);
      refused = true;
      continue;
    }
    for (const n of r.notes) out(`${rel}: ${n}`);
    if (!r.changed) continue;
    const name = path.basename(rel);
    const had = new Set(lintWorkflow(name, before));
    const added = lintWorkflow(name, r.text).filter((p) => !had.has(p));
    if (added.length) {
      for (const p of added) out(`${rel}: refused - the patch would add a workflow-lint problem: ${p}`);
      refused = true;
      continue;
    }
    out(unifiedDiff(before, r.text, rel).trimEnd());
    writes.push([rel, r.text]);
  }

  const quota = fs.readFileSync(quotaSource, 'utf8');
  const quotaAt = path.join(repo, QUOTA_TARGET);
  const quotaHad = fs.existsSync(quotaAt) ? fs.readFileSync(quotaAt, 'utf8') : null;
  // The steps run it in place: it goes in whenever a workflow is (or already was) gated, and is not there as is.
  const gated = writes.length || WORKFLOWS.some((rel) => {
    const f = path.join(repo, rel);
    return fs.existsSync(f) && /name:\s*['"]?Quota gate/.test(fs.readFileSync(f, 'utf8'));
  });
  if (gated && quotaHad !== quota) {
    out(`${QUOTA_TARGET}: ${quotaHad === null ? 'added' : 'replaced'} from templates/scripts/cloud/quota.mjs (${quota.split('\n').length} lines)`);
    writes.push([QUOTA_TARGET, quota]);
  }

  if (refused) {
    out('patch-v1: refused; nothing written');
    return 1;
  }
  if (!writes.length) {
    out('patch-v1: nothing to change');
    return 0;
  }
  if (!o.write) {
    out(`patch-v1: dry run; ${writes.length} file(s) would change. Re-run with --write to apply (it never commits).`);
    return 0;
  }
  const dirty = run('git', ['-C', repo, 'status', '--porcelain', '--', ...writes.map(([rel]) => rel)]);
  if (!o.force && (!dirty.ok || dirty.stdout.trim())) {
    out(`patch-v1: refused - ${dirty.ok ? `uncommitted changes in ${dirty.stdout.split('\n').filter((l) => l.trim()).map((l) => l.slice(3)).join(', ')}` : 'git status failed'} (--force overrides)`);
    return 1;
  }
  for (const [rel, text] of writes) {
    const file = path.join(repo, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  out(`patch-v1: wrote ${writes.map(([rel]) => rel).join(', ')}. Nothing committed: review with git diff, commit and push from that clone.`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2));
}
