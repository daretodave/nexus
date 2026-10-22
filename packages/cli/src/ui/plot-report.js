// The /plot report as data (spec 47, A6): /plot ends its prose report with one fenced block tagged nexus-plot
// holding this JSON, and the transcript draws it as a card (ui/plot-card.jsx). The contract lives here and in
// customization/plot-report.md. Pure, no React: a block that does not parse or does not validate (a streaming
// half, a wrong type) is simply no card, never a throw.
//
// {
//   task:       string                          the task, restated (required)
//   mode:       'peek' | 'plotted' | 'done'     peek changed nothing; plotted landed the plan; done also built it (required)
//   built:      [{ what: string, where?: string }]   already built (where: a file or a feature)
//   notBuilt:   [{ what, where? }]              planned but not built (where: a spec or an A-ID)
//   notPlanned: [{ what, where? }]              neither: what this plot adds
//   spec:       { file: string, joined: bool } | null   the spec it extends (joined) or adds
//   chunks:     [{ id, title, size: 'S'|'M'|'L', closes: string[]|string, needs: string[]|string, files?: string[] }]
//   order:      { before: string[], after: string[], lit: string[], ahead: int >= 0 }   /next's build order; lit = the new ids
//   questions:  [{ q: string, options: string[], default: string (one of options) }]
//   move:       { plot?: string, asap?: string, doNow?: string }   exact commands, each a single /plot or /next line
// }
//
// Every list is optional and defaults to []; spec, order and move may be absent. Unknown keys are ignored.

export const PLOT_LANG = 'nexus-plot';
export const MODES = ['peek', 'plotted', 'done'];
export const SIZES = ['S', 'M', 'L'];
const COMMAND = /^\/(plot|next)\b[^\n\r]*$/;
const NONE = /^(—|-|none|nothing)?$/i;

const isStr = (v) => typeof v === 'string' && v.trim() !== '';
const strList = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');

/** closes / needs as a list: a string splits on commas; an empty mark (— or none) is no ids. */
function idList(v, where, errors) {
  if (v == null) return [];
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter((s) => !NONE.test(s));
  if (strList(v)) return v.map((s) => s.trim()).filter((s) => !NONE.test(s));
  errors.push(`${where}: a string or a list of strings`);
  return [];
}

function items(v, where, errors) {
  if (v == null) return [];
  if (!Array.isArray(v)) { errors.push(`${where}: a list`); return []; }
  return v.flatMap((it, i) => {
    if (typeof it === 'string' && it.trim()) return [{ what: it.trim(), where: '' }];
    if (!it || typeof it !== 'object' || !isStr(it.what)) { errors.push(`${where}[${i}].what: a string`); return []; }
    if (it.where != null && typeof it.where !== 'string') { errors.push(`${where}[${i}].where: a string`); return []; }
    return [{ what: it.what.trim(), where: (it.where || '').trim() }];
  });
}

/**
 * Check a parsed nexus-plot value against the schema above.
 * Returns { ok: true, report } (normalized: every list present, closes/needs as lists) or { ok: false, errors }.
 */
export function validatePlotReport(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: ['the block: an object'] };
  const v = value;
  if (!isStr(v.task)) errors.push('task: a string');
  if (!MODES.includes(v.mode)) errors.push(`mode: one of ${MODES.join(', ')}`);
  const built = items(v.built, 'built', errors);
  const notBuilt = items(v.notBuilt, 'notBuilt', errors);
  const notPlanned = items(v.notPlanned, 'notPlanned', errors);

  let spec = null;
  if (v.spec != null) {
    if (typeof v.spec !== 'object' || !isStr(v.spec.file)) errors.push('spec.file: a string');
    else if (v.spec.joined != null && typeof v.spec.joined !== 'boolean') errors.push('spec.joined: true or false');
    else spec = { file: v.spec.file.trim(), joined: !!v.spec.joined };
  }

  const chunks = [];
  if (v.chunks != null && !Array.isArray(v.chunks)) errors.push('chunks: a list');
  (Array.isArray(v.chunks) ? v.chunks : []).forEach((c, i) => {
    const at = `chunks[${i}]`;
    if (!c || typeof c !== 'object') { errors.push(`${at}: an object`); return; }
    if (!isStr(c.id)) errors.push(`${at}.id: a string`);
    if (!isStr(c.title)) errors.push(`${at}.title: a string`);
    const size = typeof c.size === 'string' ? c.size.trim().toUpperCase() : '';
    if (!SIZES.includes(size)) errors.push(`${at}.size: S, M or L`);
    if (c.files != null && !strList(c.files)) errors.push(`${at}.files: a list of strings`);
    chunks.push({
      id: String(c.id ?? '').trim(), title: String(c.title ?? '').trim(), size,
      closes: idList(c.closes, `${at}.closes`, errors), needs: idList(c.needs, `${at}.needs`, errors),
      files: strList(c.files) ? c.files.filter((f) => f.trim()) : [],
    });
  });

  let order = null;
  if (v.order != null) {
    const o = v.order;
    if (typeof o !== 'object' || Array.isArray(o)) errors.push('order: an object');
    else {
      for (const k of ['before', 'after', 'lit']) if (o[k] != null && !strList(o[k])) errors.push(`order.${k}: a list of strings`);
      if (o.ahead != null && !(Number.isInteger(o.ahead) && o.ahead >= 0)) errors.push('order.ahead: a whole number, 0 or more');
      order = {
        before: strList(o.before) ? o.before : [], after: strList(o.after) ? o.after : [],
        lit: strList(o.lit) ? o.lit : [], ahead: Number.isInteger(o.ahead) && o.ahead >= 0 ? o.ahead : null,
      };
    }
  }

  const questions = [];
  if (v.questions != null && !Array.isArray(v.questions)) errors.push('questions: a list');
  (Array.isArray(v.questions) ? v.questions : []).forEach((q, i) => {
    const at = `questions[${i}]`;
    if (!q || typeof q !== 'object' || !isStr(q.q)) { errors.push(`${at}.q: a string`); return; }
    if (!strList(q.options) || !q.options.some((o) => o.trim())) { errors.push(`${at}.options: a list of strings, at least one`); return; }
    const options = q.options.map((o) => o.trim()).filter(Boolean);
    const def = typeof q.default === 'string' ? q.default.trim() : '';
    if (!options.includes(def)) { errors.push(`${at}.default: one of its options`); return; }
    questions.push({ q: q.q.trim(), options, default: def });
  });

  const move = {};
  if (v.move != null) {
    if (typeof v.move !== 'object' || Array.isArray(v.move)) errors.push('move: an object');
    else {
      for (const k of ['plot', 'asap', 'doNow']) {
        if (v.move[k] == null) continue;
        const cmd = typeof v.move[k] === 'string' ? v.move[k].trim() : '';
        if (!COMMAND.test(cmd)) errors.push(`move.${k}: one /plot or /next line`);
        else move[k] = cmd;
      }
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, report: { task: v.task.trim(), mode: v.mode, built, notBuilt, notPlanned, spec, chunks, order, questions, move } };
}

const OPEN = new RegExp(`^ {0,3}(\`{3,}|~{3,})[ \\t]*${PLOT_LANG}[ \\t]*$`);

/**
 * A message split around its nexus-plot block: { prose, report, errors }. prose is the text with the block taken out
 * (only when the block validates); report is null when there is no closed block, it is not JSON, or it fails the
 * schema, and then prose is the whole text, so the markdown draws the block as code.
 */
export function extractPlotReport(text) {
  const src = String(text ?? '');
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  // The last closed block wins: a report that quotes an example block ends with its own.
  let found = null;
  for (let i = 0; i < lines.length; i += 1) {
    const m = OPEN.exec(lines[i]);
    if (!m) continue;
    const mark = m[1];
    const close = new RegExp(`^ {0,3}${mark[0] === '`' ? '`' : '~'}{${mark.length},}[ \\t]*$`);
    let j = i + 1;
    while (j < lines.length && !close.test(lines[j])) j += 1;
    if (j >= lines.length) break; // still streaming
    found = { start: i, end: j };
    i = j;
  }
  if (!found) return { prose: src, report: null, errors: [] };
  let value;
  try { value = JSON.parse(lines.slice(found.start + 1, found.end).join('\n')); } catch (e) {
    return { prose: src, report: null, errors: [`not JSON: ${e.message}`] };
  }
  const r = validatePlotReport(value);
  if (!r.ok) return { prose: src, report: null, errors: r.errors };
  const prose = [...lines.slice(0, found.start), ...lines.slice(found.end + 1)].join('\n').trim();
  return { prose, report: r.report, errors: [] };
}

/** The action buttons a report offers, by mode: [{ key, label, primary }], only for commands it carries. */
export function plotActions(report) {
  if (!report) return [];
  const want = report.mode === 'peek'
    ? [['plot', 'Plot it', false], ['asap', 'Plot asap', false], ['doNow', 'Plot and build now', true]]
    : report.mode === 'plotted' ? [['doNow', 'Build now', true]] : [];
  return want.filter(([k]) => report.move[k]).map(([key, label, primary]) => ({ key, label, primary }));
}

/** The answers as one line: "Answers: 1) every card 2) seconds" (each unpicked question takes its default), or ''. */
export function answersLine(questions, picked = {}) {
  if (!questions || !questions.length) return '';
  const parts = questions.map((q, i) => {
    const a = picked[i];
    return `${i + 1}) ${typeof a === 'string' && q.options.includes(a) ? a : q.default}`;
  });
  return `Answers: ${parts.join(' ')}`;
}

/** The exact line an action sends: the report's command, then the answers. */
export function plotCommand(report, key, picked = {}) {
  const cmd = report?.move?.[key];
  if (!cmd) return '';
  const answers = answersLine(report.questions, picked);
  return answers ? `${cmd} ${answers}` : cmd;
}

/** The line under the lane: how many chunks /next builds first. */
export function aheadLabel(ahead) {
  if (ahead == null) return '';
  if (ahead === 0) return 'next in line';
  return `behind ${ahead} chunk${ahead === 1 ? '' : 's'}`;
}
