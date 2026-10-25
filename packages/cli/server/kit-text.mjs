// What counts as kit text in a v1 repo's skills/march.md and skills/iterate.md (spec 58, "Carrying the train").
//
// A v1 adopter forked its skills months before v1.0.0, and the kit's march.md changed many times since, so a diff
// against one kit version would call the drift custom. The kit-text list instead holds every section header and a
// hash of every paragraph that templates/skills/march.md and iterate.md ever held in nexus history
// (scripts/upgrade-kit-text.mjs builds it; the CLI bundles it as kit/upgrade/kit-text.json). Against it:
//
//   - a section whose header is in the list is kit text: replaced, except any paragraph in it that matches no
//     historical hash (kept as custom, under that header);
//   - a section whose header is not in the list is custom, with every deeper section under it: kept whole.
//
// A kit paragraph that held a placeholder (`<PROJECT>`) is kept as a pattern too, so a copy with it filled in still
// reads as kit text. Headers and paragraphs compare with whitespace collapsed (a re-wrapped paragraph is the same).
// Pure: no fs, no git.
import crypto from 'node:crypto';

/** The skills whose custom text moves into a lanes file: skill file -> { lanes file, kind }. */
export const TRAIN = Object.freeze({
  'march.md': { lanes: 'skills/march.lanes.md', kind: 'march' },
  'iterate.md': { lanes: 'skills/iterate.lanes.md', kind: 'iterate' },
});

const HEAD = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;
const PLACEHOLDER = /<[A-Z][A-Z0-9_]*>/g;

export const normHeader = (h) => String(h).replace(/^#+\s*/, '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
export const normPara = (p) => String(p).replace(/\s+/g, ' ').trim();
export const hashPara = (p) => crypto.createHash('sha1').update(normPara(p)).digest('hex');

/**
 * A markdown file split at its headers (fences respected, so a `# comment` in a code block is no header):
 * { front, sections: [{ level, header, line, body }] }. `front` is a YAML front matter block (kept apart, always kit);
 * the first section is the text before any header (level 0, header null). `header` is the line verbatim; `body` its
 * lines up to the next header.
 */
export function sections(md) {
  const lines = String(md ?? '').replace(/\r\n/g, '\n').split('\n');
  let front = [];
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) front = lines.splice(0, end + 1);
  }
  const out = [{ level: 0, header: null, line: front.length, body: [] }];
  let fence = false;
  lines.forEach((l, i) => {
    if (FENCE.test(l)) fence = !fence;
    const h = !fence && HEAD.exec(l);
    if (h) out.push({ level: h[1].length, header: l, line: front.length + i, body: [] });
    else out[out.length - 1].body.push(l);
  });
  return { front, sections: out };
}

/** A section body's paragraphs (blank-line separated, a fenced block whole): [string], rules (`---`) left out. */
export function paragraphs(body) {
  const out = [];
  let cur = [];
  let fence = false;
  const flush = () => {
    if (cur.length && !/^\s*([-*_]\s*){3,}$/.test(cur.join('\n'))) out.push(cur.join('\n'));
    cur = [];
  };
  for (const l of body) {
    if (FENCE.test(l)) fence = !fence;
    if (!fence && !l.trim() && !FENCE.test(l)) flush();
    else cur.push(l);
  }
  flush();
  return out;
}

/** One skill file's kit text: { headers: Set, paras: Set (sha1), patterns: Set (normalized text with placeholders) }. */
export function textOf(md) {
  const t = { headers: new Set(), paras: new Set(), patterns: new Set() };
  for (const s of sections(md).sections) {
    if (s.header) t.headers.add(normHeader(s.header));
    for (const p of paragraphs(s.body)) {
      t.paras.add(hashPara(p));
      if (PLACEHOLDER.test(p)) t.patterns.add(normPara(p));
      PLACEHOLDER.lastIndex = 0;
    }
  }
  return t;
}

/** Union of kit texts (any mix of textOf results and parsed JSON entries). */
export function mergeText(...all) {
  const t = { headers: new Set(), paras: new Set(), patterns: new Set() };
  for (const a of all) {
    if (!a) continue;
    for (const k of ['headers', 'paras', 'patterns']) for (const v of a[k] || []) t[k].add(v);
  }
  return t;
}

/** A kit text as its JSON entry (sorted arrays). */
export const toJson = (t) => ({ headers: [...t.headers].sort(), paras: [...t.paras].sort(), patterns: [...t.patterns].sort() });

/** A JSON entry (kit-text.json's `march.md`) back to sets; patterns compiled once. */
export function fromJson(j) {
  const t = mergeText(j);
  t.regexes = [...t.patterns].map((p) => new RegExp(`^${p.split(/<[A-Z][A-Z0-9_]*>/).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+?')}$`));
  return t;
}

/** Is this paragraph kit text: its hash in the list, or a placeholder paragraph it fills in. */
export function isKitPara(p, t) {
  if (t.paras.has(hashPara(p))) return true;
  const n = normPara(p);
  return (t.regexes || []).some((r) => r.test(n));
}

/** The march step a v1 tick picked its work at: custom text before it ran ahead of the work (`pre`), after it, `queue`. */
const PICK = /pending (phase|chunk)|ready (phase|chunk)/;

/**
 * The custom text in `md` against kit text `t` (from fromJson): [{ kind: 'section' | 'paras', header, text, before }]
 * in file order. A `section` unit is a custom header with its body and every deeper section under it, verbatim; a
 * `paras` unit is the custom paragraphs of one kit section, verbatim, under that kit section's header line.
 * `before` is true when the unit sits ahead of the step that picked the tick's work (march: a `pre` lane).
 */
export function customUnits(md, t) {
  const { sections: secs } = sections(md);
  const units = [];
  let picked = false;
  for (let i = 0; i < secs.length; i++) {
    const s = secs[i];
    const kit = s.header === null || t.headers.has(normHeader(s.header));
    if (kit && s.header && PICK.test(normHeader(s.header))) picked = true;
    if (!kit) {
      const lines = [s.header, ...s.body];
      while (i + 1 < secs.length && secs[i + 1].level > s.level) lines.push(secs[++i].header, ...secs[i].body);
      units.push({ kind: 'section', header: s.header, text: trimBlank(lines).join('\n'), before: !picked });
      continue;
    }
    const mine = paragraphs(s.body).filter((p) => !isKitPara(p, t));
    if (mine.length) units.push({ kind: 'paras', header: s.header, text: [s.header ?? '### (the top of the v1 skill)', ...mine].join('\n\n'), before: !picked });
  }
  return units;
}

function trimBlank(lines) {
  const out = [...lines];
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out;
}

/** A lane name from a header: its step numbering and markup dropped, lowercase words joined by hyphens. */
export function laneName(header, fallback = 'custom') {
  const text = String(header ?? '').replace(/^#+\s*/, '').replace(/[*_`]/g, '')
    .replace(/^(step|phase|dimension)\s+/i, '').replace(/^[0-9]+[a-z]?'?(\.[0-9]*[a-z]?'?)*\.?\s*([—–:-]\s*)?/i, '')
    .replace(/^[A-Z](\.|\s*[—–:-])\s+/, '');
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const cut = slug.length > 40 ? slug.slice(0, 40).replace(/-[^-]*$/, '') : slug;
  return cut || fallback;
}

/**
 * The lane blocks for one skill's custom units: { text, names }. Each unit becomes one lane (spec 57's block), its
 * text verbatim under it. march: a unit ahead of the pick step is a `pre` lane, else `queue`; a custom section ends
 * the tick (v1 dispatch was first match wins), custom paragraphs in a kit step continue. iterate: a `dimensions`
 * lane. `taken` holds names already in the lanes file; `rewrite` maps the moved text (the v1 references).
 */
export function laneBlocks(units, { kind, skill, taken = new Set(), rewrite = (s) => s }) {
  const names = [];
  const blocks = units.map((u) => {
    const base = laneName(u.header, u.header === null ? 'top' : 'custom') + (u.kind === 'paras' ? '-notes' : '');
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
    taken.add(name);
    names.push(name);
    const hook = kind === 'iterate' ? 'dimensions' : u.before ? 'pre' : 'queue';
    const ret = kind === 'march' && u.kind === 'section' ? 'end-tick' : 'continue';
    const what = u.kind === 'section' ? 'the section below' : 'the paragraphs below';
    return [
      `## lane: ${name}`,
      `- hook: ${hook}`,
      `- when: as ${what} says (moved verbatim from the v1 skills/${skill})`,
      `- run: ${what}${u.kind === 'paras' ? `, which amended the kit's step "${normHeader(u.header ?? '') || 'top'}"` : ''}`,
      `- return: ${ret}`,
      '',
      rewrite(u.text.replace('### (the top of the v1 skill)', `### (the top of the v1 skills/${skill})`)),
    ].join('\n');
  });
  return { text: blocks.join('\n\n'), names };
}
