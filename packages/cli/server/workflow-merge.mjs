// The workflow merge (spec 58, "The workflow merge"): a v1 march.yml merged into the kit's v2 owner-job shape, never
// replaced by it. Kept from the v1 file: the cron lines, the ceiling number, the model pin, every extra env entry
// (deploy tokens by name), the concurrency group, extra checkout inputs and job permissions, extra claude_args flags
// and action inputs, any step the kit never shipped, and every prompt line no kit version ever held (judged against
// kit-text.json's `march.yml` entry, as the train is). The v1 toolchain steps (everything between the checkout and the
// ceiling check: package manager, install, browser install) become .github/actions/setup/action.yml, which the v2
// jobs call. The model pin and env go to the owner job only: the pull-request build job holds no token by design.
//
// Line-based, like scripts/workflow-lint.mjs: indentation is read, not assumed. Pure: text in, text out.
import { isKitPara, promptOf } from './kit-text.mjs';

export const MARCH_YML = '.github/workflows/march.yml';
export const SETUP_ACTION = '.github/actions/setup/action.yml';

const indentOf = (l) => /^(\s*)/.exec(l)[1].length;
const isContent = (l) => l.trim() !== '' && !/^\s*#/.test(l);
const lf = (t) => String(t ?? '').replace(/\r\n/g, '\n');
const CLAUDE = /^\s*(?:-\s+)?uses:\s*['"]?anthropics\/claude-code-action@/;
const CHECKOUT = /^\s*(?:-\s+)?uses:\s*['"]?actions\/checkout@/;
const SETUP = /^\s*(?:-\s+)?uses:\s*['"]?\.\/\.github\/actions\/setup['"]?\s*$/;
const SECRET = /\$\{\{[^}]*\b(secrets\.|github\.token\b)/;
/** Step names the kit shipped in a v1 or v2 march job (and the quota patch's): never custom. */
const KIT_STEPS = new Set(['daily commit ceiling check', 'run /march (cloud mode)', 'open cloud-failed issue if action crashed',
  'quota cache restore', 'quota gate', 'quota read', 'quota cache save', 'pause on the weekly quota', 'idle cache restore',
  'idle probe', 'idle record', 'idle cache save', 'no-op reason', 'lost-to-background check', 'owner mode for this checkout',
  'project toolchain', 'configure git author for cloud commits']);
/** Claude step inputs the merge sets itself. */
const OWN_INPUTS = new Set(['prompt', 'claude_args', 'model', 'anthropic_model']);

/** The end (exclusive) of the block under line i: every following line blank, or indented deeper than it. */
function blockEnd(lines, i, from = i + 1) {
  const ind = indentOf(lines[i]);
  let end = from;
  for (let j = from; j < lines.length; j++) {
    if (!lines[j].trim() || /^\s*#/.test(lines[j]) ? false : indentOf(lines[j]) <= ind) break;
    end = j + 1;
  }
  // Trailing blank and comment lines belong to whatever follows.
  while (end > from && !isContent(lines[end - 1])) end--;
  return end;
}

/** A top-level key's line, or -1. */
const topKey = (lines, key) => lines.findIndex((l) => new RegExp(`^${key}:`).test(l));

/** The `key:` line among the direct children of line `at` (its block), or -1. */
function childKey(lines, at, key, end = blockEnd(lines, at)) {
  const ind = childIndent(lines, at, end);
  if (ind == null) return -1;
  for (let j = at + 1; j < end; j++) {
    if (isContent(lines[j]) && indentOf(lines[j]) === ind && new RegExp(`^\\s*(?:-\\s+)?${key}:`).test(lines[j].replace(/^(\s*)-\s+/, '$1  '))) return j;
  }
  return -1;
}

/** The indent of the first content line under `at`, or null. */
function childIndent(lines, at, end = blockEnd(lines, at)) {
  for (let j = at + 1; j < end; j++) if (isContent(lines[j])) return indentOf(lines[j]);
  return null;
}

/** The mapping entries under line `at`: [{ key, start, end, lines }], each with its deeper lines. */
export function entriesUnder(lines, at) {
  if (at < 0) return [];
  const end = blockEnd(lines, at);
  const ind = childIndent(lines, at, end);
  const out = [];
  for (let j = at + 1; j < end; j++) {
    if (!isContent(lines[j]) || indentOf(lines[j]) !== ind) continue;
    const m = /^\s*([\w.-]+):/.exec(lines[j]);
    if (!m) continue;
    const e = blockEnd(lines, j);
    out.push({ key: m[1], start: j, end: e, lines: lines.slice(j, e) });
  }
  return out;
}

/** The steps of the job at line `job`: [{ start, end, lead, lines, name, id, uses, indent }] (lead: comments above it). */
export function stepsOf(lines, job) {
  const at = childKey(lines, job, 'steps');
  if (at < 0) return [];
  const end = blockEnd(lines, at);
  const starts = [];
  let ind = null;
  for (let j = at + 1; j < end; j++) {
    if (!isContent(lines[j]) || !/^\s*-\s/.test(lines[j])) continue;
    if (ind == null) ind = indentOf(lines[j]);
    if (indentOf(lines[j]) === ind) starts.push(j);
  }
  return starts.map((s, k) => {
    let e = k + 1 < starts.length ? starts[k + 1] : end;
    while (e > s + 1 && !isContent(lines[e - 1])) e--;
    let lead = s;
    while (lead > at + 1 && lines[lead - 1].trim() && /^\s*#/.test(lines[lead - 1]) && indentOf(lines[lead - 1]) === ind) lead--;
    const body = lines.slice(s, e);
    const field = (k2) => body.map((l) => new RegExp(`^\\s*(?:-\\s+)?${k2}:\\s*(.*)$`).exec(l)).find((m) => m && true)?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? null;
    return { start: s, end: e, lead, lines: body, leadLines: lines.slice(lead, s), name: field('name'), id: field('id'), uses: field('uses'), indent: ind };
  });
}

/** Each job: [{ id, line }]. */
function jobsOf(lines) {
  const at = topKey(lines, 'jobs');
  if (at < 0) return [];
  return entriesUnder(lines, at).map((e) => ({ id: e.key, line: e.start }));
}

/** Re-indent lines from one base indent to another (relative structure kept). */
function reindent(lines, from, to) {
  return lines.map((l) => {
    if (!l.trim()) return '';
    const d = indentOf(l) - from;
    return ' '.repeat(Math.max(0, to + d)) + l.trimStart();
  });
}

/**
 * Lines of one step with its first line (`- name: …`) turned into a bare parent key at the step's indent, so the
 * step's own keys (with, env, …) read as that line's children. Same length: line numbers hold.
 */
const asMapping = (step) => step.lines.map((l, i) => (i === 0 ? `${' '.repeat(step.indent)}__step:` : l));

/** A v1 claude_args value as its flags: [[flag, ...values]], from a block scalar or an inline string. */
function argsOf(entry) {
  if (!entry) return [];
  const first = entry.lines[0].replace(/^\s*claude_args:\s*/, '');
  const text = /^[|>][-+]?\s*$/.test(first) ? entry.lines.slice(1).join(' ') : first.replace(/^['"]|['"]$/g, '');
  const tokens = text.split(/\s+/).filter(Boolean);
  const out = [];
  for (const t of tokens) {
    if (t.startsWith('--') || !out.length) out.push([t]);
    else out[out.length - 1].push(t);
  }
  return out;
}

/** The ceiling the v1 step allows: `ceiling=N`, else the `-ge N` / `-gt N` test; null when there is no number. */
export function ceilingOf(step) {
  if (!step) return null;
  const text = step.lines.join('\n');
  const m = /^\s*ceiling=["']?(\d+)/m.exec(text) || /-g[et]\s+["']?(\d+)/.exec(text);
  return m ? Number(m[1]) : null;
}

/**
 * Everything the merge keeps from a v1 march.yml: { crons, schedule, concurrency, workflowEnv, job, steps, claude,
 * ceilingStep, model, claudeEnv, jobEnv, permissions, checkoutWith, inputs, args, toolchain, custom, prompt, v2 }.
 * Null when the file has no claude-code-action step (not a march workflow).
 */
export function readV1(yml) {
  const lines = lf(yml).split('\n');
  const jobs = jobsOf(lines);
  let job = null;
  let steps = [];
  for (const j of jobs) {
    const s = stepsOf(lines, j.line);
    if (s.some((st) => st.lines.some((l) => CLAUDE.test(l)))) { job = j; steps = s; break; }
  }
  if (!job) return null;
  const v2 = jobs.some((j) => /vars\.NEXUS_LOOP_MODE/.test(lines[childKey(lines, j.line, 'if')] ?? ''));
  const on = topKey(lines, 'on');
  const schedule = on >= 0 ? childKey(lines, on, 'schedule') : -1;
  const scheduleBody = schedule >= 0 ? lines.slice(schedule + 1, blockEnd(lines, schedule)) : [];
  const crons = scheduleBody.map((l) => /^\s*-\s*cron:\s*(['"]?)([^'"#]+?)\1\s*(#.*)?$/.exec(l)).filter(Boolean).map((m) => m[2].trim());
  const conc = topKey(lines, 'concurrency');
  const concurrency = conc >= 0 ? lines.slice(conc, blockEnd(lines, conc)) : null;
  const group = conc >= 0 ? entriesUnder(lines, conc).find((e) => e.key === 'group') : null;
  const claude = steps.find((s) => s.lines.some((l) => CLAUDE.test(l)));
  const claudeAt = claude.start;
  const mapLines = [...lines.slice(0, claudeAt), ...asMapping(claude), ...lines.slice(claude.end)];
  const withAt = childKey(mapLines, claudeAt, 'with');
  const inputs = entriesUnder(mapLines, withAt);
  const envAt = childKey(mapLines, claudeAt, 'env');
  const claudeEnv = entriesUnder(mapLines, envAt);
  const args = argsOf(inputs.find((e) => e.key === 'claude_args'));
  const modelArg = args.find((a) => a[0] === '--model');
  const modelInput = inputs.find((e) => e.key === 'model' || e.key === 'anthropic_model');
  const model = modelArg?.[1] ?? modelInput?.lines[0].replace(/^\s*[\w-]+:\s*/, '').replace(/^['"]|['"]$/g, '').trim() ?? null;
  const ceilingStep = steps.find((s) => s.id === 'ceiling' || /ceiling/i.test(s.name || ''));
  const checkout = steps.find((s) => s.lines.some((l) => CHECKOUT.test(l)));
  let checkoutWith = [];
  if (checkout) {
    const m = [...lines.slice(0, checkout.start), ...asMapping(checkout), ...lines.slice(checkout.end)];
    checkoutWith = entriesUnder(m, childKey(m, checkout.start, 'with'));
  }
  // Toolchain: every step between the checkout and the control plane (the ceiling check, else the model step).
  const fence = steps.indexOf(ceilingStep ?? claude);
  const toolchain = [];
  const custom = [];
  const claudeK = steps.indexOf(claude);
  steps.forEach((s, k) => {
    if (s === checkout || s === claude || s === ceilingStep) return;
    if (s.lines.some((l) => SETUP.test(l))) return;
    if (k < fence) { toolchain.push(s); return; }
    if (KIT_STEPS.has(String(s.name || '').toLowerCase())) return;
    // `after`: it ran after the model step in v1 (it reads that run's outputs), so it stays after it.
    custom.push({ ...s, after: k > claudeK });
  });
  return {
    lines, v2, job: job.id,
    crons, schedule: schedule >= 0, scheduleBody,
    concurrency, group: group ? group.lines[0].replace(/^\s*group:\s*/, '').trim() : null,
    workflowEnv: entriesUnder(lines, topKey(lines, 'env')),
    jobEnv: entriesUnder(lines, childKey(lines, job.line, 'env')),
    permissions: entriesUnder(lines, childKey(lines, job.line, 'permissions')),
    claude, claudeId: claude.id ?? null, claudeEnv, inputs, args, model, ceilingStep, ceiling: ceilingOf(ceilingStep), checkoutWith,
    toolchain, custom, usesSetup: steps.some((s) => s.lines.some((l) => SETUP.test(l))),
    prompt: promptOf(claude.lines.join('\n')),
  };
}

/** The repo's package manager for the kit's `<PACKAGE_MANAGER>`: its lockfile, else the v1 prompt's verify line, else npm. */
export function packageManager(has, v1Text = '') {
  if (has('pnpm-lock.yaml')) return 'pnpm';
  if (has('yarn.lock')) return 'yarn';
  if (has('bun.lockb') || has('bun.lock')) return 'bun';
  if (has('package-lock.json')) return 'npm';
  const m = /`(pnpm|yarn|npm|bun)(?: run)? verify`/.exec(v1Text);
  return m ? m[1] : 'npm';
}

/** The kit's placeholders the merged files carry, filled. `<ISO>` (a comment's date) stays. */
export function fill(text, { project, pm, branch }) {
  return text.replace(/<PROJECT>/g, project).replace(/<PACKAGE_MANAGER>/g, pm).replace(/<DEFAULT_BRANCH>/g, branch);
}

/** Splice: replace lines[a, b) with `add` (in place), returning the length change. */
function splice(lines, a, b, add) {
  lines.splice(a, b - a, ...add);
  return add.length - (b - a);
}

/** The env entries' lines, re-indented to `to`. */
const envLines = (entries, to) => entries.flatMap((e) => reindent(e.lines, indentOf(e.lines[0]), to));

/**
 * Merge a v1 march.yml (`v1`, from readV1) into the kit's v2 march.yml (`template`, placeholders filled).
 * `kitPrompt` is the kit-text entry (fromJson) for march.yml's prompt. Returns { text, kept, notes, warnings }:
 * `kept` is what came across ({ cron, ceiling, model, env, concurrency, ... }) for the report.
 */
export function mergeMarch(v1, template, { kitPrompt = null } = {}) {
  const lines = lf(template).split('\n');
  const warnings = [];
  const kept = { cron: v1.crons, ceiling: null, model: null, env: [], concurrency: v1.group, steps: [], prompt: 0, args: [], inputs: [], permissions: [], checkout: [] };

  // The cron: the v1 schedule's body verbatim (its comments too), or no schedule when v1 had none.
  const on = topKey(lines, 'on');
  const sched = childKey(lines, on, 'schedule');
  if (sched >= 0) {
    const end = blockEnd(lines, sched);
    if (v1.schedule && v1.crons.length) {
      const from = Math.min(...v1.scheduleBody.filter((l) => l.trim()).map(indentOf));
      splice(lines, sched + 1, end, reindent(v1.scheduleBody, from, childIndent(lines, sched)).filter((l, i, a) => l || i < a.length - 1));
    } else {
      let lead = sched;
      while (lead > on + 1 && /^\s*#/.test(lines[lead - 1])) lead--;
      splice(lines, lead, end, []);
      warnings.push(`${MARCH_YML}: the v1 workflow had no schedule, so the merged one has none (dispatch only)`);
    }
  }

  // The concurrency group: the v1 block verbatim.
  if (v1.concurrency) {
    const at = topKey(lines, 'concurrency');
    if (at >= 0) splice(lines, at, blockEnd(lines, at), v1.concurrency);
  }

  // The workflow's own env: a non-secret entry stays there; a secret goes to the model step (workflow-lint rule 2).
  const wfSecret = v1.workflowEnv.filter((e) => SECRET.test(e.lines.join('\n')));
  const wfPlain = v1.workflowEnv.filter((e) => !SECRET.test(e.lines.join('\n')));
  if (wfPlain.length) {
    const at = topKey(lines, 'jobs');
    splice(lines, at, at, ['env:', ...envLines(wfPlain, 2), '']);
  }
  if (wfSecret.length) warnings.push(`${MARCH_YML}: ${wfSecret.map((e) => e.key).join(', ')} moved from the workflow's env to the owner job's model step (a secret in a workflow env reaches every step)`);

  // The owner job.
  const owner = jobsOf(lines).find((j) => /vars\.NEXUS_LOOP_MODE\s*==\s*'owner'/.test(lines[childKey(lines, j.line, 'if')] ?? ''));
  if (!owner) throw new Error('the kit march.yml has no owner job');
  const steps = () => stepsOf(lines, owner.line);
  const stepBy = (pred) => steps().find(pred);

  // Job env (non-secret) and extra permissions.
  const jobSecret = v1.jobEnv.filter((e) => SECRET.test(e.lines.join('\n')));
  const jobPlain = v1.jobEnv.filter((e) => !SECRET.test(e.lines.join('\n')));
  const perms = childKey(lines, owner.line, 'permissions');
  if (perms >= 0) {
    const have = new Set(entriesUnder(lines, perms).map((e) => e.key));
    const extra = v1.permissions.filter((e) => !have.has(e.key));
    if (extra.length) {
      const end = blockEnd(lines, perms);
      splice(lines, end, end, envLines(extra, childIndent(lines, perms)));
      kept.permissions = extra.map((e) => e.key);
    }
    if (jobPlain.length) splice(lines, perms, perms, [`${' '.repeat(indentOf(lines[perms]))}env:`, ...envLines(jobPlain, indentOf(lines[perms]) + 2)]);
  }
  if (jobSecret.length) warnings.push(`${MARCH_YML}: ${jobSecret.map((e) => e.key).join(', ')} moved from the job's env to the owner job's model step (a secret in a job env reaches every step)`);

  // The ceiling: the number on the owner job's `ceiling=` line.
  const ceil = stepBy((s) => s.id === 'ceiling');
  if (ceil && v1.ceiling != null) {
    const i = lines.findIndex((l, k) => k >= ceil.start && k < ceil.end && /^\s*ceiling=\d+\s*$/.test(l));
    if (i >= 0) { lines[i] = lines[i].replace(/\d+/, String(v1.ceiling)); kept.ceiling = v1.ceiling; }
  } else if (v1.ceilingStep) warnings.push(`${MARCH_YML}: the v1 ceiling step holds no number the merge can read; the kit default stands: check it`);

  // Checkout inputs the kit's checkout lacks (a user-author token, say).
  const co = stepBy((s) => s.lines.some((l) => CHECKOUT.test(l)));
  if (co && v1.checkoutWith.length) {
    const map = [...lines.slice(0, co.start), ...asMapping(co), ...lines.slice(co.end)];
    const w = childKey(map, co.start, 'with');
    if (w >= 0) {
      const have = new Set(entriesUnder(map, w).map((e) => e.key));
      const extra = v1.checkoutWith.filter((e) => !have.has(e.key));
      if (extra.length) {
        const end = blockEnd(map, w);
        splice(lines, end, end, envLines(extra, childIndent(map, w)));
        kept.checkout = extra.map((e) => e.key);
      }
    }
  }

  // The model step: extra flags and inputs, every env entry, the adopter's prompt lines. Each change re-reads the
  // step (a splice moves every line after it).
  const runStart = stepBy((s) => s.lines.some((l) => CLAUDE.test(l))).start;
  const under = (key) => {
    const s = stepBy((x) => x.start === runStart);
    const m = [...lines.slice(0, s.start), ...asMapping(s), ...lines.slice(s.end)];
    const at = childKey(m, runStart, key);
    return { m, at, entries: entriesUnder(m, at) };
  };
  {
    // Extra claude_args flags (not the model, not the permission mode the kit requires).
    const extraArgs = v1.args.filter((a) => !['--model', '--permission-mode'].includes(a[0]));
    const ca = under('with').entries.find((e) => e.key === 'claude_args');
    if (ca && extraArgs.length) {
      const ind = indentOf(lines[ca.start + 1] ?? lines[ca.start]);
      splice(lines, ca.end, ca.end, extraArgs.map((a) => `${' '.repeat(ind)}${a.join(' ')}`));
      kept.args = extraArgs.map((a) => a[0]);
    }
    // Extra inputs: kept; one the kit sets too takes the v1 value. A v1 API key with no OAuth token replaces the
    // kit's OAuth input.
    const extraIn = v1.inputs.filter((e) => !OWN_INPUTS.has(e.key));
    if (extraIn.some((e) => e.key === 'anthropic_api_key') && !extraIn.some((e) => e.key === 'claude_code_oauth_token')) {
      const oauth = under('with').entries.find((e) => e.key === 'claude_code_oauth_token');
      if (oauth) splice(lines, oauth.start, oauth.end, []);
    }
    for (const e of extraIn) {
      const { entries } = under('with');
      const have = entries.find((x) => x.key === e.key);
      if (have) splice(lines, have.start, have.end, reindent(e.lines, indentOf(e.lines[0]), indentOf(lines[have.start])));
      else splice(lines, entries[0].start, entries[0].start, envLines([e], indentOf(lines[entries[0].start])));
      kept.inputs.push(e.key);
    }
    // The env: a key the kit sets too takes the v1 value; every other v1 entry goes after the kit's entries and
    // their trailing comments.
    const all = [...v1.claudeEnv, ...jobSecret, ...wfSecret];
    for (const e of all) {
      const { m, at, entries } = under('env');
      const have = entries.find((x) => x.key === e.key);
      if (have) { splice(lines, have.start, have.end, reindent(e.lines, indentOf(e.lines[0]), indentOf(lines[have.start]))); continue; }
      let after = blockEnd(m, at);
      while (after < lines.length && lines[after].trim() && /^\s*#/.test(lines[after]) && indentOf(lines[after]) > indentOf(lines[at])) after++;
      splice(lines, after, after, envLines([e], childIndent(m, at)));
    }
    kept.env = all.map((e) => e.key);
    // The adopter's prompt lines (no kit version held them), before the kit prompt's closing line.
    const mine = kitPrompt ? v1.prompt.filter((l) => l.trim() && !isKitPara(l, kitPrompt)) : [];
    const p = mine.length ? under('with').entries.find((e) => e.key === 'prompt') : null;
    if (p) {
      const body = lines.slice(p.start + 1, p.end);
      const pad = ' '.repeat(Math.min(...body.filter((l) => l.trim()).map(indentOf)));
      let at = p.end;
      for (let k = p.end - 1; k > p.start; k--) if (/^\s*Begin\./.test(lines[k])) { at = k; break; }
      splice(lines, at, at, [`${pad}Carried from the v1 march.yml prompt by nexus upgrade (verbatim; check each line still applies):`, '', ...mine.map((l) => `${pad}${l}`), '']);
      kept.prompt = mine.length;
    }
  }
  const run = stepBy((s) => s.start === runStart);

  // The model pin: the owner job's model step only (the pull-request build job keeps the kit's).
  if (v1.model) {
    for (let k = run.start; k < run.end; k++) if (isContent(lines[k])) lines[k] = lines[k].replace(/(--model\s+)[\w.:@/-]+/, `$1${v1.model}`);
    kept.model = v1.model;
  }

  // Steps the kit never shipped, on their v1 side of the model step: one that ran before it is kept ahead of the
  // owner-mode step (after the control plane), one that ran after it directly after it. A reference to the v1 model
  // step's id (`steps.<id>.outputs.execution_file`) is pointed at the kit's.
  if (v1.custom.length) {
    const toId = run.id ?? 'run_march';
    const ref = v1.claudeId && v1.claudeId !== toId ? new RegExp(`\\bsteps\\.${v1.claudeId.replace(/[-]/g, '\\-')}\\.`, 'g') : null;
    const block = (list, ind) => list.flatMap((s) => [...reindent([...s.leadLines, ...s.lines], s.indent, ind), ''])
      .map((l) => (ref ? l.replace(ref, `steps.${toId}.`) : l));
    const before = v1.custom.filter((s) => !s.after);
    const after = v1.custom.filter((s) => s.after);
    if (after.length) splice(lines, run.end, run.end, ['', ...block(after, run.indent)].slice(0, -1));
    if (before.length) {
      const anchor = stepBy((s) => /owner mode for this checkout/i.test(s.name || '')) ?? stepBy((s) => s.start === runStart);
      splice(lines, anchor.lead, anchor.lead, block(before, anchor.indent));
    }
    kept.steps = v1.custom.map((s) => s.name || s.id || s.uses || '(unnamed)');
    const where = [before.length && `${before.length} ahead of the model step`, after.length && `${after.length} after it`].filter(Boolean).join(', ');
    warnings.push(`${MARCH_YML}: ${kept.steps.length} v1 step(s) the kit never shipped kept in the owner job (${where}, as in v1): ${kept.steps.join(', ')}; check each still applies`);
  }
  // Toolchain steps that stay in the job (they read a secret, or the repo keeps its own setup action): in v1 order,
  // directly ahead of the owner job's setup action, so a step the install depends on (a private registry's .npmrc)
  // still runs before it, as it did in v1.
  const stayToolchain = v1.stayToolchain ?? [];
  if (stayToolchain.length) {
    const anchor = stepBy((s) => s.lines.some((l) => SETUP.test(l))) ?? stepBy((s) => /owner mode for this checkout/i.test(s.name || '')) ?? run;
    const add = stayToolchain.flatMap((s) => [...reindent([...s.leadLines, ...s.lines], s.indent, anchor.indent), '']);
    splice(lines, anchor.lead, anchor.lead, add);
  }
  if (!v1.model) warnings.push(`${MARCH_YML}: no model pin in the v1 workflow; the kit's stands`);
  return { text: lines.join('\n'), kept, warnings };
}

/**
 * The v1 toolchain steps as the composite action (`template`: the kit's action.yml, placeholders filled): the kit's
 * header, then the steps, each `run:` step given `shell: bash` (a composite step needs one). A step that reads a
 * secret cannot move (a composite action has no secrets context): it is returned in `stay`. No toolchain steps: the
 * kit's action with the browser steps dropped (the v1 job installed no browser). { text, moved, stay }.
 */
export function setupAction(v1, template) {
  const lines = lf(template).split('\n');
  const stepsAt = (() => { const r = topKey(lines, 'runs'); return r >= 0 ? childKey(lines, r, 'steps') : -1; })();
  if (stepsAt < 0) throw new Error('the kit setup action has no runs.steps');
  const stepInd = childIndent(lines, stepsAt);
  const stay = v1.toolchain.filter((s) => SECRET.test(s.lines.join('\n')));
  const moved = v1.toolchain.filter((s) => !stay.includes(s));
  if (!moved.length) {
    const fake = [...lines];
    const steps = stepsOfBlock(fake, stepsAt);
    for (const s of steps.reverse()) if (/playwright/i.test(s.name || '')) fake.splice(s.lead, s.end - s.lead);
    return { text: fake.join('\n').replace(/\n{3,}/g, '\n\n'), moved: [], stay };
  }
  const body = moved.flatMap((s) => {
    const keyInd = stepInd + 2;
    // A composite step takes no timeout-minutes (the action fails to load with one): the job's timeout bounds it.
    const out = reindent([...s.leadLines, ...s.lines], s.indent, stepInd).filter((l) => !new RegExp(`^\\s{${keyInd}}timeout-minutes:`).test(l));
    const hasShell = out.some((l) => new RegExp(`^\\s{${keyInd}}shell:`).test(l) || new RegExp(`^\\s{${stepInd}}-\\s+shell:`).test(l));
    const runAt = out.findIndex((l) => new RegExp(`^\\s{${keyInd}}run:`).test(l) || new RegExp(`^\\s{${stepInd}}-\\s+run:`).test(l));
    if (runAt >= 0 && !hasShell) {
      if (/^\s*-\s+run:/.test(out[runAt])) out.splice(runAt + 1, 0, `${' '.repeat(keyInd)}shell: bash`);
      else out.splice(runAt, 0, `${' '.repeat(keyInd)}shell: bash`);
    }
    return [...out, ''];
  });
  while (body.length && !body[body.length - 1]) body.pop();
  const head = lines.slice(0, stepsAt + 1);
  const note = [`${' '.repeat(stepInd)}# Moved from the v1 march.yml by nexus upgrade: the job's toolchain steps, verbatim.`];
  return { text: [...head, ...note, ...body, ''].join('\n'), moved, stay };
}

/** The steps of a composite action's `steps:` block (same shape as stepsOf). */
function stepsOfBlock(lines, stepsAt) {
  const fakeJob = [...lines];
  // stepsOf wants the job's line; the `steps:` key's parent works the same way.
  const parent = (() => { for (let k = stepsAt - 1; k >= 0; k--) if (isContent(fakeJob[k]) && indentOf(fakeJob[k]) < indentOf(fakeJob[stepsAt])) return k; return -1; })();
  return stepsOf(fakeJob, parent);
}

/**
 * The whole merge: { march, action, kept, warnings, notes } or { skip: reason } when there is nothing to merge
 * (no v1 march.yml, no model step in it, or it is already the v2 shape). `repoAction` is the repo's own setup
 * action from before the kit copy (it is kept). `fills`: { project, pm, branch }.
 */
export function mergeWorkflow({ v1Text, template, actionTemplate, repoAction = null, fills, kitPrompt = null }) {
  if (v1Text == null) return { skip: `no ${MARCH_YML}: no cloud loop to merge` };
  const v1 = readV1(v1Text);
  if (!v1) return { skip: `${MARCH_YML} has no claude-code-action step: left as it is` };
  if (v1.v2) return { skip: `${MARCH_YML} is already the v2 shape (a NEXUS_LOOP_MODE job): left as it is` };
  const warnings = [];
  let action = null;
  let stayed = [];
  if (repoAction != null) {
    if (v1.toolchain.length) {
      stayed = v1.toolchain;
      warnings.push(`${SETUP_ACTION}: the repo has its own, kept; the v1 toolchain steps stay in the owner job instead`);
    }
  } else {
    const a = setupAction(v1, fill(actionTemplate, fills));
    action = a.text;
    stayed = a.stay;
    if (a.stay.length) warnings.push(`${SETUP_ACTION}: ${a.stay.map((s) => s.name || '(unnamed)').join(', ')} read a secret, so they stay in the owner job (a composite action has no secrets context)`);
  }
  const merged = mergeMarch({ ...v1, stayToolchain: stayed }, fill(template, fills), { kitPrompt });
  return { march: merged.text, action, kept: { ...merged.kept, toolchain: v1.toolchain.length - stayed.length }, warnings: [...warnings, ...merged.warnings] };
}

/** The report's one-line summary of what the merge kept. */
export function keptLine(kept) {
  const parts = [];
  if (kept.cron?.length) parts.push(`cron ${kept.cron.join(' + ')}`);
  if (kept.ceiling != null) parts.push(`ceiling ${kept.ceiling}`);
  if (kept.model) parts.push(`model ${kept.model}`);
  if (kept.env?.length) parts.push(`env ${kept.env.join(', ')}`);
  if (kept.concurrency) parts.push(`concurrency ${kept.concurrency}`);
  if (kept.toolchain) parts.push(`${kept.toolchain} toolchain step${kept.toolchain === 1 ? '' : 's'} -> ${SETUP_ACTION}`);
  if (kept.steps?.length) parts.push(`${kept.steps.length} custom step${kept.steps.length === 1 ? '' : 's'}`);
  if (kept.prompt) parts.push(`${kept.prompt} prompt line${kept.prompt === 1 ? '' : 's'}`);
  return parts.join('; ');
}
