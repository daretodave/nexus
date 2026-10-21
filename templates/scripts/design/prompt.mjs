#!/usr/bin/env node
// scripts/design/prompt.mjs: the Claude Design paste prompt and its addenda, drafted from the plan (/design prompt,
// /design addendum; nexus/playbooks/design-handoff.md steps 1 and 2).
//
//   node scripts/design/prompt.mjs prompt [<scope>] [--write] [--dir design/prompts] [--date YYYY-MM-DD]
//   node scripts/design/prompt.mjs addendum [--write] [--dir design/prompts] [--date YYYY-MM-DD]
//
// Scope picks the specs (plan/NN-*.md) the prompt draws from:
//   (none)     every spec with UI work: a Design bullet or an Acceptance line naming the GUI, the UI, a screen, a
//              view, a page, a board, a panel, a dialog or onboarding; only those items are taken
//   41,42      those spec numbers (comma or space separated), every Design bullet and Acceptance line
//   <keyword>  the specs whose text holds the word (any case); their items that hold it or name UI work
//
// Each draft is stored as design/prompts/NNN-<date>.md (NNN counts every prompt and addendum, 001 up). Its front
// matter records the scope, the plan commit, the last section number and one hash per item it drew from, so the
// addendum writes only the items that are new or changed since the last stored file (and names the dropped ones),
// numbering its sections on from that file's last. A prompt starts its sections at 1 (a new Claude Design session);
// an addendum continues the running one. The draft leaves `<!-- fill: ... -->` notes for the model to write (the
// design system, wording); everything else is mechanical. Without --write it prints the draft and writes nothing.
// Zero dependencies; git only for the plan commit, and only when there is one.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PROMPTS_DIR = 'design/prompts';
export const STORED = /^(\d{3,})-(\d{4}-\d{2}-\d{2})\.md$/;
const SPEC_FILE = /^(\d{2,})-[a-z0-9][a-z0-9-]*\.md$/;
/** What makes a Design bullet or an Acceptance line UI work, when no scope narrows it. */
export const UI_WORDS = /\b(GUI|UI|screens?|views?|pages?|boards?|panels?|dialogs?|modals?|dashboards?|onboarding)\b/i;
export const USAGE = 'usage: node scripts/design/prompt.mjs prompt [<scope>] | addendum  [--write] [--dir design/prompts] [--plan plan] [--date YYYY-MM-DD]';

const slug = (s) => s.toLowerCase().replace(/[`*_]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
/** An item's hash: sha256 of its text with the whitespace folded (rewrapping a line is not a change), 8 hex. */
export const itemHash = (text) => crypto.createHash('sha256').update(text.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 8);

/** The `## <name>` sections of a markdown file, fenced blocks kept inside their section: Map name -> lines. */
function sections(text) {
  const out = new Map();
  let current = null;
  let fenced = false;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const h = !fenced && /^## (.+?)\s*$/.exec(line);
    if (h) { current = h[1]; out.set(current, []); continue; }
    if (current) out.get(current).push(line);
  }
  return out;
}

/** The top-level bullets of a section, each with its wrapped lines, nested lists and indented paragraphs. */
function bullets(lines = []) {
  const out = [];
  let open = false;
  for (const line of lines) {
    if (/^- /.test(line)) { out.push([line]); open = true; }
    else if (open && (/^\s+\S/.test(line) || line.trim() === '')) out[out.length - 1].push(line);
    else if (line.trim()) open = false; // a paragraph at column 0 ends the bullet
  }
  return out.map((b) => { while (b.length && !b[b.length - 1].trim()) b.pop(); return b.join('\n'); });
}

/** One spec file: { num, file, title, summary, items: [{ key, kind, text }] } (kind: design or acceptance). */
export function parseSpec(file, text) {
  const num = (SPEC_FILE.exec(path.basename(file)) || [])[1] ?? null;
  const body = text.replace(/\r\n/g, '\n');
  const title = (/^# (.+)$/m.exec(body)?.[1] ?? path.basename(file, '.md')).replace(/^\d+\s*[—·-]\s*/, '').trim();
  const quote = /^((?:>.*\n?)+)/m.exec(body.slice(body.indexOf('\n') + 1).replace(/^\s*\n/, ''));
  const summary = quote ? quote[1].split('\n').map((l) => l.replace(/^>\s?/, '')).join(' ').replace(/\s+/g, ' ').trim() : '';
  const secs = sections(body);
  const items = [];
  const seen = new Set();
  for (const text of bullets(secs.get('Design'))) {
    const lead = /^- \*\*([^*]+?)[:.]?\*\*/.exec(text)?.[1] ?? text.slice(2).split(/\s+/).slice(0, 5).join(' ');
    let key = slug(lead) || 'item';
    for (let n = 2; seen.has(key); n++) key = `${slug(lead)}-${n}`;
    seen.add(key);
    items.push({ key, kind: 'design', text });
  }
  for (const text of bullets(secs.get('Acceptance'))) {
    const id = /^- \*\*(A\d+)\*\*/.exec(text)?.[1];
    if (id) items.push({ key: id, kind: 'acceptance', text });
  }
  return { num, file, title, summary, text: body, items };
}

/** Read the plan folder's spec files. */
export function loadSpecs(planDir) {
  if (!fs.existsSync(planDir)) return [];
  return fs.readdirSync(planDir).filter((f) => SPEC_FILE.test(f)).sort()
    .map((f) => parseSpec(f, fs.readFileSync(path.join(planDir, f), 'utf8')));
}

/** What a scope string means: { kind: 'ui' } | { kind: 'numbers', numbers } | { kind: 'keyword', word }. */
export function parseScope(scope) {
  const s = (scope ?? '').trim();
  if (!s || s === 'ui') return { kind: 'ui', label: 'ui' };
  const parts = s.split(/[\s,]+/).filter(Boolean);
  if (parts.every((p) => /^\d{1,}$/.test(p))) return { kind: 'numbers', numbers: parts.map((p) => p.padStart(2, '0')), label: parts.join(',') };
  return { kind: 'keyword', word: s.toLowerCase(), label: s };
}

/** The specs a scope selects, each with only the items it draws from (specs left with none are dropped). */
export function select(specs, scope) {
  const sc = typeof scope === 'string' || scope == null ? parseScope(scope) : scope;
  const out = [];
  for (const spec of specs) {
    let items;
    if (sc.kind === 'numbers') items = sc.numbers.includes(spec.num) ? spec.items : [];
    else if (sc.kind === 'keyword') items = spec.text.toLowerCase().includes(sc.word)
      ? spec.items.filter((i) => i.text.toLowerCase().includes(sc.word) || UI_WORDS.test(i.text)) : [];
    else items = spec.items.filter((i) => UI_WORDS.test(i.text));
    if (items.length) out.push({ ...spec, items });
  }
  return out;
}

/** Who a block of plan text is for: 'owner', 'contributor', 'owner and contributor', or null when it names neither. */
export function roles(text) {
  const owner = /\bowners?\b/i.test(text);
  const contributor = /\bcontributors?\b/i.test(text);
  return owner && contributor ? 'owner and contributor' : owner ? 'owner' : contributor ? 'contributor' : null;
}

/** A stored prompt or addendum's front matter: { number, kind, continues, date, scope, plan, last, items: Map }. */
export function parseStored(text) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!fm) return null;
  const get = (k) => new RegExp(`^${k}:[ \\t]*(.*)$`, 'm').exec(fm[1])?.[1].trim() ?? null;
  const items = new Map();
  for (const m of fm[1].matchAll(/^ {2}- (\S+) ([0-9a-f]{8})\s*$/gm)) items.set(m[1], m[2]);
  const last = Number((/(\d+)\s*$/.exec(get('sections') ?? '') || [])[1] ?? 0);
  return { number: Number(get('design-prompt')), kind: get('kind'), continues: Number(get('continues')), date: get('date'), scope: get('scope'), plan: get('plan'), last, items };
}

/** The newest stored file in a prompts folder: { file, number, ...parseStored } or null. */
export function lastStored(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => STORED.test(f)).sort((a, b) => Number(STORED.exec(a)[1]) - Number(STORED.exec(b)[1]));
  if (!files.length) return null;
  const file = files[files.length - 1];
  const parsed = parseStored(fs.readFileSync(path.join(dir, file), 'utf8'));
  if (!parsed) throw new Error(`${file}: no front matter (a stored prompt starts with --- design-prompt: ... ---)`);
  return { ...parsed, file, number: Number(STORED.exec(file)[1]) };
}

export const fileName = (number, date) => `${String(number).padStart(3, '0')}-${date}.md`;
const key = (spec, item) => `${spec.num}/${item.key}`;

function frontMatter({ number, kind, continues, date, scope, plan, first, last, specs }) {
  const items = specs.flatMap((s) => s.items.map((i) => `  - ${key(s, i)} ${itemHash(i.text)}`));
  return ['---', `design-prompt: ${number}`, `kind: ${kind}`, `continues: ${continues}`, `date: ${date}`, `scope: ${scope}`,
    `plan: ${plan ?? 'none'}`, `sections: ${first}-${last}`, 'items:', ...items, '---'].join('\n');
}

function specBlock(spec, items, heading) {
  const design = items.filter((i) => i.kind === 'design');
  const acc = items.filter((i) => i.kind === 'acceptance');
  const who = roles(items.map((i) => i.text).join('\n'));
  const out = [heading, ''];
  if (spec.summary) out.push(spec.summary, '');
  if (design.length) out.push('What it must show:', '', ...design.map((i) => i.text), '');
  if (acc.length) out.push('Done when:', '', ...acc.map((i) => i.text), '');
  out.push(`Roles: ${who ? `${who}; draw each role's view where they differ.` : 'one view for everyone.'}`,
    'States: draw each screen empty, loading, with an error and busy, wherever it can be in them.', '');
  return out;
}

/** The full paste prompt: design system first, one section per spec, the constraints last. */
export function buildPrompt({ specs, scope, date, number, plan = null, product = 'the product' }) {
  if (!specs.length) return null;
  let n = 0;
  const body = [
    `# Claude Design prompt ${String(number).padStart(3, '0')}`, '',
    'Paste everything below the line into Claude Design.', '', '---', '',
    `You are designing ${product}. Design the system first, then every screen below. Each section is numbered;`,
    'later messages continue the numbering and change only what they name. Write real copy, not placeholder text.', '',
    `## ${++n}. Design system first`, '',
    '<!-- fill: the tokens (colour, type, space, radius, elevation, motion), both themes if the product has two, then',
    'the component classes every screen below uses; from plan/bearings.md and the product\'s voice. -->', '',
  ];
  for (const spec of specs) body.push(...specBlock(spec, spec.items, `## ${++n}. ${spec.title}`));
  body.push(`## ${++n}. Constraints`, '',
    '- No emoji anywhere: not in copy, icons, sample data or board names. Draw icons; use plain glyphs.',
    '- Real copy, not lorem ipsum: the words the product will ship.',
    '- One board per screen and state, named after the screen, grouped into pages by area.', '');
  const fm = frontMatter({ number, kind: 'prompt', continues: number, date, scope, plan, first: 1, last: n, specs });
  return `${fm}\n\n${body.join('\n').replace(/\n+$/, '')}\n`;
}

/** What changed since a stored file: { added: [{spec,item}], changed: [...], dropped: [key] }. */
export function changes(specs, prev) {
  const added = [];
  const changed = [];
  const now = new Set();
  for (const spec of specs) {
    for (const item of spec.items) {
      const k = key(spec, item);
      now.add(k);
      if (!prev.items.has(k)) added.push({ spec, item });
      else if (prev.items.get(k) !== itemHash(item.text)) changed.push({ spec, item });
    }
  }
  const dropped = [...prev.items.keys()].filter((k) => !now.has(k));
  return { added, changed, dropped };
}

/** The addendum: only what changed since `prev`, numbered on from its last section. Null when nothing changed. */
export function buildAddendum({ specs, prev, date, number, plan = null }) {
  const { added, changed, dropped } = changes(specs, prev);
  if (!added.length && !changed.length && !dropped.length) return null;
  const continues = prev.continues || prev.number;
  let n = prev.last;
  const first = n + 1;
  const body = [
    `# Claude Design addendum ${String(number).padStart(3, '0')} (continues prompt ${String(continues).padStart(3, '0')})`, '',
    'Paste everything below the line into the running Claude Design session.', '', '---', '',
    `An addendum to the brief: sections ${first} on continue its numbering. Change only what they name; every other`,
    'board stays as it is.', '',
  ];
  const touched = new Set([...added, ...changed].map((c) => c.spec.num));
  for (const spec of specs.filter((s) => touched.has(s.num))) {
    const isNew = !spec.items.some((i) => prev.items.has(key(spec, i)));
    const mine = (list) => list.filter((c) => c.spec.num === spec.num).map((c) => c.item);
    if (isNew) { body.push(...specBlock(spec, spec.items, `## ${++n}. ${spec.title} (new)`)); continue; }
    body.push(`## ${++n}. ${spec.title}: what changed`, '');
    const a = mine(added);
    const c = mine(changed);
    if (a.length) body.push('New:', '', ...a.map((i) => i.text), '');
    if (c.length) body.push('Changed (it now reads):', '', ...c.map((i) => i.text), '');
    const who = roles([...a, ...c].map((i) => i.text).join('\n'));
    if (who) body.push(`Roles: ${who}.`, '');
  }
  if (dropped.length) {
    body.push(`## ${++n}. Dropped from the plan`, '',
      'These items left the plan; their boards stay unless they only existed for them:', '',
      ...dropped.map((k) => `- ${k}`), '');
  }
  const fm = frontMatter({ number, kind: 'addendum', continues, date, scope: prev.scope ?? 'ui', plan, first, last: n, specs });
  return `${fm}\n\n${body.join('\n').replace(/\n+$/, '')}\n`;
}

function planCommit(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch { return null; }
}

function productName(cwd) {
  try { return JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')).name || path.basename(cwd); } catch { return path.basename(cwd); }
}

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function main(argv, { cwd = process.cwd(), out = console.log, err = console.error } = {}) {
  const flags = { write: false, dir: PROMPTS_DIR, date: today(), plan: 'plan' };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write') flags.write = true;
    else if (['--dir', '--date', '--plan'].includes(a)) flags[a.slice(2)] = argv[++i];
    else rest.push(a);
  }
  const [mode, ...scopeWords] = rest;
  if (!['prompt', 'addendum'].includes(mode) || !/^\d{4}-\d{2}-\d{2}$/.test(flags.date ?? '')) { err(USAGE); return 1; }
  const dir = path.resolve(cwd, flags.dir);
  const prev = lastStored(dir);
  const number = (prev?.number ?? 0) + 1;
  const all = loadSpecs(path.resolve(cwd, flags.plan));
  const plan = planCommit(cwd);
  let text;
  if (mode === 'prompt') {
    const scope = parseScope(scopeWords.join(' '));
    text = buildPrompt({ specs: select(all, scope), scope: scope.label, date: flags.date, number, plan, product: productName(cwd) });
    if (!text) { err(`design prompt: no spec in ${flags.plan}/ matches scope "${scope.label}"`); return 1; }
  } else {
    if (scopeWords.length) { err('design addendum: takes no scope (it keeps the last prompt\'s)'); return 1; }
    if (!prev) { err(`design addendum: no stored prompt in ${flags.dir}/ (write one first: prompt --write)`); return 1; }
    text = buildAddendum({ specs: select(all, prev.scope), prev, date: flags.date, number, plan });
    if (!text) { out(`design addendum: nothing changed since ${prev.file}`); return 0; }
  }
  if (!flags.write) { out(text); return 0; }
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, fileName(number, flags.date));
  fs.writeFileSync(file, text);
  out(path.relative(cwd, file).replace(/\\/g, '/'));
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let code;
  try { code = main(process.argv.slice(2)); } catch (e) { console.error(`design: ${String(e?.message || e).split(/\r?\n/)[0]}`); code = 1; }
  process.exit(code);
}
