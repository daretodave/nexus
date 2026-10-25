// scripts/plan/improve.mjs: the improvement dial. One line in plan/bearings.md, under `## Plan expansion posture`,
// sets how hard the loop pushes beyond its plan:
//
//   Improve: off | gentle | steady | bold
//
// The dial sets each expansion knob's default. A knob line of its own (`Support:`, `Promote:`, `stall_action:`,
// `loop:`, `UI cadence:` or `UI:`, `Research:`, a `## Generators` list) overrides the dial for that knob only, and
// so does a set repo variable (NEXUS_SUPPORT, NEXUS_CADENCE): the variables stay the cloud's source of truth for the
// knobs that live there, and one that disagrees with the bearings value is a warning. No `Improve:` line reads
// `gentle`, the loop as it ran before the dial.
//
//   knob           off     gentle        steady            bold
//   Support        off     triage-only   fix-small         fix-all            (NEXUS_SUPPORT)
//   Promote        owner   owner         aged              aged
//   Generators     none    none          generic           generic + project
//   stall_action   off     alert         alert             promote
//   loop           off     off           on                on                 (/iterate dimension I)
//   UI             none    none          critique          both               (the UI walk's cadence)
//   Research       off     off           monthly           weekly             (the field-research generator)
//   Cadence        calm    steady        steady            eager              (NEXUS_CADENCE)
//
// Generators: `generic` is the kit's three (issue-age, stale-candidate, motion, at the lines below); `project` adds
// every other scripts/generators/<name>.mjs the repo carries, at `weekly · target 2 · cap 2/wk` (never `research`,
// which its own Research knob gates). A `## Generators` section holding a list line (a generator, or `- (none)`) is
// an override; one holding only prose or a commented example defers to the dial. UI: the dial sets when the walk
// runs, never where; `UI: none` is an override (nothing browses, whatever `UI cadence:` says), a `UI cadence:` line is
// one, and a `UI: url|dev` target with no cadence line walks at `critique` when the dial says none (as it did before
// the dial). With no target at all the walk has nothing to open, whatever the cadence.
//
// Skills read knobs through this script, never by grepping bearings themselves.
//
//   node scripts/plan/improve.mjs [--json] [--line] [--knob <name>] [--cloud <name>] [--bearings <file>]
//                                 [--root <dir>] [--vars <file>] [--gh]
//
// Prints `Improve <dial> (bearings|default)`, then one line per knob, `<knob> <value> (dial|override)`, then a
// `warn: ...` line per disagreement. --line prints only /digest's pulse line (the dial and any overrides). --json
// prints { improve, knobs, warnings }. The variables come from the environment (a cloud tick's env), or from
// --vars (`gh variable list --json name,value`) or --gh (that command, read only). --knob <name> prints that knob's
// value alone (a name from the table, or its variable: `--knob Support`, `--knob NEXUS_CADENCE`), its warnings on
// stderr: what a skill reads. --cloud <name> prints what a cloud step takes when the knob's repo variable is unset:
// the value under an `Improve:` line other than gentle, else an empty line (the step's own default stands; gentle is
// the loop as it ran). Exit 0, 64 on bad usage or an unknown knob.
//
// Zero dependencies.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const POSITIONS = Object.freeze(['off', 'gentle', 'steady', 'bold']);
export const DEFAULT_POSITION = 'gentle';

/** The kit's generic generators, at the lines concepts/generators.md and the bearings template carry. */
export const GENERIC_GENERATORS = Object.freeze([
  'issue-age · daily · target 3 · cap 5/wk',
  'stale-candidate · weekly · target 2 · cap 2/wk',
  'motion · daily · target 1 · cap 1/wk',
]);
/** The line a project generator runs at when the dial (bold) turns it on. */
export const PROJECT_LINE = 'weekly · target 2 · cap 2/wk';

/**
 * The dial table: one row per expansion knob, a value at every position. `line` is the bearings line that overrides
 * it (null: none), `var` the repo variable that does, `accepts` the values an override may take. The upgrade's knob
 * registry (packages/cli/server/upgrade.mjs KNOBS) marks each knob the dial sets `dial: true`; registryGaps() fails a
 * registry row the table lacks, or a row here missing a position.
 */
export const DIAL = Object.freeze([
  { knob: 'Support', line: 'Support', var: 'NEXUS_SUPPORT', accepts: ['off', 'triage-only', 'fix-small', 'fix-all'], at: { off: 'off', gentle: 'triage-only', steady: 'fix-small', bold: 'fix-all' } },
  { knob: 'Promote', line: 'Promote', accepts: ['owner', 'aged', 'autonomous'], at: { off: 'owner', gentle: 'owner', steady: 'aged', bold: 'aged' } },
  { knob: 'Generators', line: null, at: { off: 'none', gentle: 'none', steady: 'generic', bold: 'generic+project' } },
  { knob: 'stall_action', line: 'stall_action', accepts: ['off', 'alert', 'promote'], at: { off: 'off', gentle: 'alert', steady: 'alert', bold: 'promote' } },
  { knob: 'loop', line: 'loop', accepts: ['on', 'off'], at: { off: 'off', gentle: 'off', steady: 'on', bold: 'on' } },
  { knob: 'UI', line: 'UI cadence', accepts: ['none', 'critique', 'iterate', 'both'], at: { off: 'none', gentle: 'none', steady: 'critique', bold: 'both' } },
  { knob: 'Research', line: 'Research', accepts: ['off', 'monthly', 'weekly'], at: { off: 'off', gentle: 'off', steady: 'monthly', bold: 'weekly' } },
  { knob: 'Cadence', line: null, var: 'NEXUS_CADENCE', accepts: ['calm', 'steady', 'eager', 'sprint', 'off'], at: { off: 'calm', gentle: 'steady', steady: 'steady', bold: 'eager' } },
].map((r) => Object.freeze({ ...r, at: Object.freeze(r.at) })));

/** Bearings text with HTML comments and fenced code blanked (line numbers kept): an example is no setting. */
export function plain(text = '') {
  return String(text ?? '').replace(/\r\n/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ''))
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, (m) => m.replace(/[^\n]/g, ''));
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every value a `<key>: <value>` line carries (bullet, bold and backticks allowed; a trailing `# note`, `(note)` or
 * `— note` too), first first. Case-sensitive key, lowercased value. A line whose value runs on (`off | gentle`) is
 * prose, not a setting.
 */
export function lineValues(text, key) {
  const re = new RegExp(`^[ \\t]*(?:[-*][ \\t]+)?[*\`]*${esc(key)}[*\`]*[ \\t]*:[*\`]*[ \\t]*[*\`]*([A-Za-z][\\w-]*)[*\`]*[ \\t]*(?:$|#|\\(|—|--)`, 'gm');
  return [...plain(text).matchAll(re)].map((m) => m[1].toLowerCase());
}

/** The first value of `key` the knob accepts, or null. */
function own(text, key, accepts) {
  return lineValues(text, key).find((v) => !accepts || accepts.includes(v)) ?? null;
}

/** The dial: { value, source: bearings | default, problem }. An unknown value reads gentle, with a problem. */
export function dialOf(bearings = '') {
  const found = lineValues(bearings, 'Improve');
  const v = found.find((x) => POSITIONS.includes(x));
  if (v) return { value: v, source: 'bearings', problem: null };
  const bad = found.length ? `Improve: ${found[0]} is not a dial position (${POSITIONS.join(', ')}); read as ${DEFAULT_POSITION}` : null;
  return { value: DEFAULT_POSITION, source: 'default', problem: bad };
}

/** The `## Generators` section: null when absent or holding no list line, else [{ name, line }] (`- (none)`: []). */
export function generatorsSection(bearings = '') {
  const lines = plain(bearings).split('\n');
  const start = lines.findIndex((l) => /^##\s+Generators\s*$/.test(l));
  if (start < 0) return null;
  const out = [];
  let listed = false;
  for (let i = start + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
    const l = lines[i].trim();
    if (!/^[-*]\s/.test(l)) continue;
    listed = true;
    const body = l.replace(/^[-*]\s+/, '').replace(/`/g, '').trim();
    if (/^\(?none\)?$/i.test(body)) continue;
    out.push({ name: body.split('·')[0].trim(), line: body });
  }
  return listed ? out : null;
}

/** The generator list a dial value names: [{ name, line }]. `project` is the repo's own generator names. */
export function dialGenerators(value, project = []) {
  if (value === 'none') return [];
  const generic = GENERIC_GENERATORS.map((line) => ({ name: line.split('·')[0].trim(), line }));
  if (value === 'generic') return generic;
  const have = new Set(generic.map((g) => g.name));
  return [...generic, ...project.filter((n) => !have.has(n)).sort().map((name) => ({ name, line: `${name} · ${PROJECT_LINE}` }))];
}

/** Generators a knob of their own gates, never listed as a project generator: research (the Research knob). */
export const KNOB_GATED = Object.freeze(['research']);

/** The repo's own generators: the names of scripts/generators/*.mjs under root, less KNOB_GATED (none when the folder is missing). */
export function projectGenerators(root = process.cwd()) {
  const dir = path.join(root, 'scripts', 'generators');
  try {
    return fs.readdirSync(dir).filter((n) => /^[a-z0-9][a-z0-9-]*\.mjs$/.test(n)).map((n) => n.replace(/\.mjs$/, '')).filter((n) => !KNOB_GATED.includes(n)).sort();
  } catch {
    return [];
  }
}

/** The `UI:` target mode: none | url | dev, or null when no line sets it. */
export function uiTarget(bearings = '') {
  const re = /^[ \t]*(?:[-*][ \t]+)?[*`]*UI[*`]*[ \t]*:[*`]*[ \t]*[*`]*(none|url|dev)\b/gm;
  const m = re.exec(plain(bearings));
  return m ? m[1] : null;
}

const varValue = (vars, name) => {
  const v = String(vars?.[name] ?? '').trim().toLowerCase();
  return v || null;
};

/**
 * Every knob's effective value: { improve: { value, source }, knobs: [{ knob, value, source: dial | override, from:
 * dial | bearings | var, dial, var?, list? (Generators), target? (UI) }], warnings }. `vars` holds the repo variables
 * (NEXUS_SUPPORT, NEXUS_CADENCE) when known; `project` the repo's own generator names.
 */
export function resolve(bearings = '', { vars = {}, project = [] } = {}) {
  const dial = dialOf(bearings);
  const pos = dial.value;
  const warnings = dial.problem ? [dial.problem] : [];
  const knobs = [];
  for (const row of DIAL) {
    const atDial = row.at[pos];
    let value = atDial;
    let from = 'dial';
    let extra = {};
    if (row.knob === 'Generators') {
      const section = generatorsSection(bearings);
      const list = section ?? dialGenerators(atDial, project);
      if (section) from = 'bearings';
      value = list.length ? list.map((g) => g.name).join(',') : 'none';
      extra = { preset: section ? null : atDial, list: list.map((g) => g.line) };
    } else if (row.knob === 'UI') {
      const target = uiTarget(bearings);
      const cadence = own(bearings, 'UI cadence', row.accepts);
      if (target === 'none') { value = 'none'; from = 'bearings'; }
      else if (cadence) { value = cadence; from = 'bearings'; }
      else if ((target === 'url' || target === 'dev') && atDial === 'none') { value = 'critique'; from = 'bearings'; }
      extra = { target: target ?? 'none' };
    } else if (row.line) {
      const v = own(bearings, row.line, row.accepts);
      if (v) { value = v; from = 'bearings'; }
    }
    if (row.var) {
      const raw = varValue(vars, row.var);
      if (raw && !row.accepts.includes(raw)) warnings.push(`${row.var}=${raw} is not a ${row.knob} value (${row.accepts.join(', ')}); ignored`);
      else if (raw) {
        if (raw !== value) {
          const said = from === 'bearings' ? `${row.line}: ${value} in plan/bearings.md` : `the dial (Improve: ${pos} sets ${row.knob} ${value})`;
          warnings.push(`${row.var}=${raw} disagrees with ${said}; the variable wins in cloud`);
        }
        value = raw;
        from = 'var';
        extra = { ...extra, var: row.var };
      }
    }
    knobs.push({ knob: row.knob, value, source: from === 'dial' ? 'dial' : 'override', from, dial: atDial, ...extra });
  }
  return { improve: { value: pos, source: dial.source }, knobs, warnings };
}

/** A knob's row in the dial table, by its name or its repo variable (any case), or null. */
export function dialRow(name) {
  const n = String(name ?? '').trim().toLowerCase();
  return DIAL.find((r) => r.knob.toLowerCase() === n || (r.var && r.var.toLowerCase() === n)) ?? null;
}

/**
 * One knob's effective entry ({ knob, value, source, from, dial, ... }, as resolve() gives it), plus `improve` (the
 * dial's { value, source }) and `warnings`. The scripts that act on a knob (support, promote, motion, loop-rows,
 * refill, lanes, ui-walk) read it here, never with a regex of their own. Throws on a knob the table lacks.
 */
export function knobOf(bearings = '', name, opts = {}) {
  const row = dialRow(name);
  if (!row) throw new Error(`improve: no knob ${name} (${DIAL.map((r) => r.knob).join(', ')})`);
  const r = resolve(bearings, opts);
  return { ...r.knobs.find((k) => k.knob === row.knob), improve: r.improve, warnings: r.warnings };
}

/**
 * What a cloud step takes for a knob whose repo variable is unset (the nudge's Support, the Cadence step's
 * cadence): the resolved value when plan/bearings.md carries an `Improve:` line other than gentle, else ''. Gentle,
 * or no line, leaves the step's own default standing (no event ticks, the workflow's literals): the loop as it ran.
 * The variables never enter here; the step passes its own, and the variable wins.
 */
export function cloudValue(bearings = '', name, opts = {}) {
  const k = knobOf(bearings, name, { ...opts, vars: {} });
  return k.improve.source === 'bearings' && k.improve.value !== DEFAULT_POSITION ? k.value : '';
}

/** /digest's pulse line: the dial and every override, one line. */
export function pulseLine(result) {
  const over = result.knobs.filter((k) => k.source === 'override').map((k) => `${k.knob} ${k.knob === 'Generators' && k.list?.length > 1 ? `${k.list.length} listed` : k.value}`);
  const dial = `Improve: ${result.improve.value}${result.improve.source === 'default' ? ' (no line)' : ''}`;
  return over.length ? `${dial} · overrides: ${over.join(', ')}` : `${dial} · no overrides`;
}

/** The text report: the dial, one line per knob, the warnings. */
export function render(result) {
  return [
    `Improve ${result.improve.value} (${result.improve.source})`,
    ...result.knobs.map((k) => `${k.knob} ${k.value} (${k.source})`),
    ...result.warnings.map((w) => `warn: ${w}`),
  ].join('\n');
}

/**
 * Registry rows ({ knob, write, dial, value, at }, the upgrade's KNOBS) against the dial table: a written row that
 * says neither `dial: true` nor `dial: false`, a dial row the table lacks, a table row with no registry row, a
 * position with no value, or a gentle value that is not the registry's conservative one. [] when they agree.
 */
export function registryGaps(rows = [], table = DIAL) {
  const gaps = [];
  const byName = new Map();
  for (const t of table) {
    byName.set(t.knob, t);
    if (t.var) byName.set(t.var, t);
    for (const p of POSITIONS) if (!t.at?.[p]) gaps.push(`${t.knob}: no value at dial position ${p}`);
  }
  for (const r of rows) {
    if (r.write && typeof r.dial !== 'boolean') gaps.push(`${r.knob}: a written knob says dial: true (the dial sets it) or dial: false`);
    if (r.dial !== true) continue;
    const t = byName.get(r.knob);
    if (!t) { gaps.push(`${r.knob}: dial: true, but the dial table (scripts/plan/improve.mjs DIAL) has no row for it`); continue; }
    const gentle = r.value === '(none)' ? 'none' : r.value;
    if (r.at !== 'var' && gentle != null && t.at.gentle !== gentle) gaps.push(`${r.knob}: gentle reads ${t.at.gentle}, the upgrade's conservative value is ${r.value} (gentle is the loop as it ran)`);
  }
  const marked = new Set(rows.filter((r) => r.dial === true).map((r) => r.knob));
  for (const t of table) {
    if (!marked.has(t.knob) && !(t.var && marked.has(t.var))) gaps.push(`${t.knob}: in the dial table, but no registry row marks it dial: true`);
  }
  return gaps;
}

/** `gh variable list --json name,value` (or its text) → { NAME: value }. */
export function parseVars(text) {
  const out = {};
  let rows;
  try { rows = JSON.parse(String(text ?? '')); } catch { return out; }
  for (const r of Array.isArray(rows) ? rows : []) if (r?.name) out[String(r.name)] = String(r.value ?? '');
  return out;
}

const VAR_NAMES = DIAL.filter((r) => r.var).map((r) => r.var);

/** The CLI. `io` injects the environment, gh and output for tests. */
export function main(argv, io = {}) {
  const out = io.out ?? ((s) => process.stdout.write(`${s}\n`));
  const err = io.err ?? ((s) => process.stderr.write(`${s}\n`));
  const env = io.env ?? process.env;
  const gh = io.gh ?? (() => {
    const r = spawnSync('gh', ['variable', 'list', '--json', 'name,value'], { encoding: 'utf8' });
    return r.status === 0 ? r.stdout : null;
  });
  const flags = { json: false, line: false, gh: false, knob: null, cloud: null };
  let bearingsPath = null;
  let root = io.cwd ?? process.cwd();
  let varsPath = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') flags.json = true;
    else if (a === '--line') flags.line = true;
    else if (a === '--gh') flags.gh = true;
    else if ((a === '--knob' || a === '--cloud') && argv[i + 1]) flags[a.slice(2)] = argv[++i];
    else if (a === '--bearings' && argv[i + 1]) bearingsPath = argv[++i];
    else if (a === '--root' && argv[i + 1]) root = argv[++i];
    else if (a === '--vars' && argv[i + 1]) varsPath = argv[++i];
    else { err(`improve: unknown argument ${a}\nusage: node scripts/plan/improve.mjs [--json] [--line] [--knob <name>] [--cloud <name>] [--bearings <file>] [--root <dir>] [--vars <file>] [--gh]`); return 64; }
  }
  const file = bearingsPath ?? path.join(root, 'plan', 'bearings.md');
  let bearings = '';
  try { bearings = fs.readFileSync(file, 'utf8'); } catch { /* no bearings: every knob at the gentle dial */ }
  const vars = {};
  for (const n of VAR_NAMES) if (env[n]) vars[n] = env[n];
  let source = null;
  if (varsPath) { try { source = fs.readFileSync(varsPath, 'utf8'); } catch { err(`improve: cannot read ${varsPath}`); return 64; } }
  else if (flags.gh) source = gh();
  if (source != null) {
    const read = parseVars(source);
    for (const n of VAR_NAMES) { if (read[n]) vars[n] = read[n]; else delete vars[n]; }
  }
  const opts = { vars, project: projectGenerators(root) };
  const one = flags.knob ?? flags.cloud;
  if (one) {
    if (!dialRow(one)) { err(`improve: no knob ${one} (${DIAL.map((r) => r.knob).join(', ')})`); return 64; }
    const k = knobOf(bearings, one, opts);
    for (const w of k.warnings) err(`warn: ${w}`);
    out(flags.cloud ? cloudValue(bearings, one, opts) : k.value);
    return 0;
  }
  const result = resolve(bearings, opts);
  if (flags.json) out(JSON.stringify(result, null, 2));
  else if (flags.line) out(pulseLine(result));
  else out(render(result));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
