// scripts/plan/pending.mjs: what a branch lands on the plan without editing a shared file.
//
// A chunk's close, a /plot's roadmap rows, a new decision or a footgun sighting is one new file in plan/pending/,
// and only settle (scripts/plan/settle.mjs: the owner, on main, one run at a time) turns it into edits of the spec,
// plan/README.md, ARCHIVE.md, the decisions and the footgun list. Two branches never write the same file, so they
// never conflict on the plan; until it settles, readers count a pending close as closed (`pendingArchiveLines`).
//
// A pending file, `plan/pending/<chunk id or a slug>.md`:
//   ---
//   close: 07.3                     a chunk id (omit for a /plot or a lone decision)
//   date: 2026-10-14
//   says: Empty query shows the empty state   ≤ 10 words, what now works (the close's archive line)
//   commits: 30a55bdc..4c99eb6e     optional: settle works the range out from git when it's left out
//   footguns: guard-test-noop, clock-edge-test   optional: sightings to bump (seen +1, last = date)
//   ---
//   ## Edit plan/07-search.md               exact text, applied once at settle (the config's `editable` only)
//   ~~~ old
//   …
//   ~~~
//   ~~~ new
//   …
//   ~~~
//   ## Add plan/07-search.md                new work for an existing spec, quoting no line of it: numbered and
//   ~~~ acceptance                          placed at settle, so any number of branches add to one spec and never
//   - **A?strip** The empty strip shows …   collide. `A?<slug>` and `07.?<slug>` become the spec's next free A-ID
//   ~~~                                     and chunk id (past the spec and ARCHIVE.md, in merge order), here and
//   ~~~ chunks                              in this file's Edit texts; settle appends each part to its section and
//   - [ ] **07.?strip** … · closes A?strip  keeps the Measure line and the roadmap's "N left" true. Parts:
//   ~~~                                     acceptance, chunks (sub-bullets at any depth), questions (the Open
//                                           questions list, numbered when it is) and `section <Heading>` (the end
//                                           of that ## section; a new one before ## Acceptance when it's absent;
//                                           never Chunks or Acceptance, whose own parts number their entries)
//   ## Decisions                            entries as the decisions file writes them, numbered at settle:
//   - **D?empty-copy** · 2026-10-14 · …     `D?empty-copy` anywhere in the repo becomes the number it gets
//   ## Footguns                             new lines, the footgun format, appended to their status's list
//   - **new-slug** · trap → rule · seen 1× · last 2026-10-14 · open
//   ## Notes                                appended first under the notes file's `## Inbox` as written
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DEFAULTS, mayEdit } from './config.mjs';
import { FOOTGUN_LINE } from './footguns.mjs';

export const PENDING_DIR = 'plan/pending';
const KEYS = new Set(['close', 'date', 'says', 'commits', 'footguns']);
/** A chunk id: the spec's number, a dot, a sequence and an optional suffix (07.3, 07.3a). */
export const CLOSE_ID = /^\d{2,}\.\w+$/;

/** The text split at each "## " heading outside a ~~~ fence (an edit's old or new text may hold a heading). */
function sections(body) {
  const parts = [''];
  let fenced = false;
  for (const line of body.split('\n')) {
    if (/^~~~/.test(line)) fenced = !fenced;
    if (!fenced && line.startsWith('## ')) parts.push(line.slice(3));
    else parts[parts.length - 1] += (parts[parts.length - 1] || parts.length > 1 ? '\n' : '') + line;
  }
  return parts;
}

/** One pending file's parts, or throws naming what's wrong. `cfg` is settle's config (plan/config.mjs). */
export function parsePending(raw, name, cfg = DEFAULTS) {
  const text = raw.replace(/\r\n/g, '\n');
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!fm) throw new Error(`${name}: no front matter (--- … ---) at the top`);
  const meta = {};
  for (const line of fm[1].split('\n')) {
    if (!line.trim()) continue;
    const m = /^(\w+):\s*(.*)$/.exec(line);
    if (!m) throw new Error(`${name}: front matter line "${line}" isn't "key: value"`);
    if (!KEYS.has(m[1])) throw new Error(`${name}: unknown key "${m[1]}" (known: ${[...KEYS].join(', ')})`);
    meta[m[1]] = m[2].trim();
  }
  if (!/^\d{4}-\d\d-\d\d$/.test(meta.date ?? '')) throw new Error(`${name}: "date: YYYY-MM-DD" is required`);
  if (meta.close !== undefined && !CLOSE_ID.test(meta.close)) throw new Error(`${name}: close "${meta.close}" isn't a chunk id`);
  if (meta.close && !meta.says) throw new Error(`${name}: a close needs "says:" (≤ 10 words, what now works)`);
  if (meta.commits && !/^[0-9a-f]{7,40}\.\.[0-9a-f]{7,40}$/.test(meta.commits)) throw new Error(`${name}: commits "${meta.commits}" isn't <sha>..<sha>`);
  const footguns = (meta.footguns ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const f of footguns) if (!/^[a-z0-9-]+$/.test(f)) throw new Error(`${name}: footgun "${f}" isn't a slug`);

  const edits = [];
  const adds = [];
  const decisions = [];
  const newFootguns = [];
  const notes = [];
  const parts = sections(text.slice(fm[0].length));
  if (parts[0].trim()) throw new Error(`${name}: text before the first "## " section (only sections follow the front matter)`);
  for (const part of parts.slice(1)) {
    const nl = part.indexOf('\n');
    const head = (nl < 0 ? part : part.slice(0, nl)).trim();
    const body = nl < 0 ? '' : part.slice(nl + 1);
    const edit = /^Edit (\S+)$/.exec(head);
    if (edit) {
      const file = edit[1];
      if (!mayEdit(file, cfg.editable)) throw new Error(`${name}: "## Edit ${file}": settle edits only ${cfg.editable.join(', ')}`);
      const pairs = [...body.matchAll(/^~~~ ?old\n([\s\S]*?)\n?^~~~[ \t]*\n\s*^~~~ ?new\n([\s\S]*?)\n?^~~~[ \t]*$/gm)];
      if (!pairs.length) throw new Error(`${name}: "## Edit ${file}" holds no ~~~ old / ~~~ new pair`);
      for (const p of pairs) {
        if (!p[1]) throw new Error(`${name}: an empty old text in "## Edit ${file}" (old must say where)`);
        edits.push({ path: file, old: p[1], new: p[2] });
      }
    } else if (/^Add /.test(head)) {
      adds.push(parseAdd(head.slice(4).trim(), body, name, adds, cfg));
    } else if (head === 'Decisions') {
      decisions.push(...entries(body, /^- \*\*D\?[a-z0-9-]+\*\* · /, `${name}: a decision starts "- **D?<slug>** · "`));
      // The decisions file's line cap, checked here so settle refuses the file before it writes anything.
      for (const d of decisions) {
        const lines = d.replace(/\n+$/, '').split('\n').length;
        if (lines > cfg.limits.decisionLines) throw new Error(`${name}: a decision is at most ${cfg.limits.decisionLines} lines; ${d.slice(0, 40)}… is ${lines}`);
      }
    } else if (head === 'Notes') {
      const t = body.replace(/^\n+|\n+$/g, '');
      if (!t) throw new Error(`${name}: "## Notes" is empty`);
      notes.push(t);
    } else if (head === 'Footguns') {
      newFootguns.push(...entries(body, /^- \*\*[a-z0-9-]+\*\* · /, `${name}: a footgun starts "- **<slug>** · "`));
      for (const f of newFootguns) if (f.includes('\n')) throw new Error(`${name}: a footgun is one line`);
      // The list's own format, checked here so settle refuses the file before it writes anything.
      for (const f of newFootguns) {
        if (!FOOTGUN_LINE.test(f)) throw new Error(`${name}: not in the footgun format "- **slug** · trap → rule · seen N× · last YYYY-MM-DD · open | watch | guarded by …": ${f.slice(0, 60)}`);
        const bytes = Buffer.byteLength(f.replace(/\n+$/, ''), 'utf8');
        if (bytes > cfg.limits.footgunBytes) throw new Error(`${name}: a footgun is at most ${cfg.limits.footgunBytes} bytes; ${f.slice(0, 40)}… is ${bytes}`);
      }
    } else {
      throw new Error(`${name}: unknown section "## ${head}" (Edit <path>, Add <spec>, Decisions, Footguns, Notes)`);
    }
  }
  const slugs = new Set(adds.flatMap((a) => [...a.acceptance, ...a.chunks].map(slugOf)));
  // Settle fills the numbers into the file's notes, decisions and footgun lines too, so a placeholder there must be
  // defined as well.
  for (const ref of new Set([...JSON.stringify({ edits, adds, notes, decisions, newFootguns }).matchAll(PLACEHOLDER)].map((m) => m[0]))) {
    if (!slugs.has(ref)) throw new Error(`${name}: ${ref} is used but no "## Add" part defines it`);
  }
  if (!meta.close && !edits.length && !adds.length && !decisions.length && !newFootguns.length && !footguns.length && !notes.length) throw new Error(`${name}: nothing to settle`);
  return { name, close: meta.close ?? null, date: meta.date, says: meta.says ?? '', commits: meta.commits ?? null, footguns, edits, adds, decisions, newFootguns, notes };
}

/** An A-ID or chunk id a pending file names before settle numbers it: `A?strip`, `07.?strip`. */
export const PLACEHOLDER = /(?<![\w?])(?:A|\d{2,}\.)\?[a-z0-9-]+(?![a-z0-9-])/g;
/** An Add's entry holds its sub-bullets and their wrapped lines at any depth. */
const DEEP = /^ {2,}\S/;
const ADD_PART = /^~~~ ?(acceptance|chunks|questions|section [^\n]+?)[ \t]*\n([\s\S]*?)\n?^~~~[ \t]*$/gm;
const slugOf = (entry) => /\*\*(\S+?)\*\*/.exec(entry)[1];

/** One `## Add plan/NN-*.md` section: its acceptance, chunk and question entries and its section texts. */
function parseAdd(file, body, name, earlier, cfg) {
  const spec = /^plan\/(\d{2,})-[^/]+\.md$/.exec(file)?.[1];
  if (!spec) throw new Error(`${name}: "## Add ${file}": an Add names a spec, plan/NN-<topic>.md`);
  if (!mayEdit(file, cfg.editable)) throw new Error(`${name}: "## Add ${file}": settle edits only ${cfg.editable.join(', ')}`);
  // The ladder spec is settle's own (it opens, numbers and removes it): nothing else writes there.
  if (cfg.ladder && file === `plan/${cfg.ladder.file}`) throw new Error(`${name}: "## Add ${file}": the ladder spec takes no Add (settle writes it)`);
  if (earlier.some((a) => a.path === file)) throw new Error(`${name}: "## Add ${file}" twice (one section per spec)`);
  const add = { path: file, spec, acceptance: [], chunks: [], questions: [], sections: [] };
  const parts = [...body.matchAll(ADD_PART)];
  if (!parts.length) throw new Error(`${name}: "## Add ${file}" holds no ~~~ acceptance / chunks / questions / section part`);
  const where = `"## Add ${file}"`;
  // Anything outside the parts (a misspelt fence, `~~~ chunk`, or a line under none) would be dropped without a word.
  const stray = parts.reduce((rest, p) => rest.replace(p[0], ''), body).split('\n').find((l) => l.trim());
  if (stray !== undefined) throw new Error(`${name}: "## Add ${file}": only ~~~ acceptance / chunks / questions / section <Heading> parts go here; read "${stray}"`);
  for (const [, kind, text] of parts) {
    // A heading in a part would open a section of its own in the spec (a second ## Chunks, say): `### ` and below only.
    const heading = text.split('\n').find((l) => /^#{1,2} /.test(l));
    if (heading) throw new Error(`${name}: "## Add ${file}": a part holds no # or ## heading (### and below only); read "${heading}"`);
    // Text at the end of Chunks or Acceptance would sit after the list as no chunk and no A-ID: their own parts number them.
    const list = /^section (chunks|acceptance)$/i.exec(kind)?.[1].toLowerCase();
    if (list) throw new Error(`${name}: ${where}: "~~~ ${kind}" would append plain text after the ${list === 'chunks' ? 'chunk' : 'acceptance'} list: use the ~~~ ${list} part`);
    if (kind === 'acceptance') add.acceptance.push(...entries(text, /^- \*\*A\?[a-z0-9-]+\*\* \S/, `${name}: ${where}: an acceptance entry starts "- **A?<slug>** "`, DEEP));
    else if (kind === 'chunks') add.chunks.push(...entries(text, new RegExp(`^- \\[ \\] \\*\\*${spec}\\.\\?[a-z0-9-]+\\*\\* \\S`), `${name}: ${where}: a chunk starts "- [ ] **${spec}.?<slug>** "`, DEEP));
    else if (kind === 'questions') add.questions.push(...entries(text, /^- \S/, `${name}: ${where}: a question starts "- "`, DEEP));
    else if (text.trim()) add.sections.push({ heading: kind.slice('section '.length).trim(), text: text.replace(/^\n+|\n+$/g, '') });
  }
  const before = earlier.flatMap((a) => [...a.acceptance, ...a.chunks].map(slugOf));
  const own = [...add.acceptance, ...add.chunks].map(slugOf);
  const twice = own.find((s, i) => own.indexOf(s) !== i || before.includes(s));
  if (twice) throw new Error(`${name}: ${where} defines ${twice} twice`);
  if (!own.length && !add.questions.length && !add.sections.length) throw new Error(`${name}: ${where} adds nothing`);
  return add;
}

/** Bullet entries in a section body: a line matching `start`, plus the lines indented under it. */
function entries(body, start, why, under = /^ {2}\S/) {
  const out = [];
  for (const line of body.split('\n')) {
    if (!line.trim()) continue;
    if (start.test(line)) out.push(line);
    else if (under.test(line) && out.length) out[out.length - 1] += `\n${line}`;
    else throw new Error(`${why}; read "${line}"`);
  }
  return out;
}

/**
 * The specs a pending file adds to or edits, read from its text or from a diff that adds it (`gh pr diff <n>`: its
 * `+` lines): what an open pull request changes in the plan without touching a spec file, so a /plot sees "already in
 * PR #N" for a spec extended only through plan/pending/.
 */
export function pendingSpecs(text) {
  return [...new Set([...text.replace(/\r\n/g, '\n').matchAll(/^\+?## (?:Add|Edit) (plan\/\d{2,}-[^/\s]+\.md)[ \t]*$/gm)].map((m) => m[1]))];
}

/** The pending files in a checkout: [{ file, text }] by name. */
export function pendingFiles(root) {
  const dir = path.join(root, PENDING_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.md') && n !== 'README.md')
    .sort()
    .map((n) => ({ file: `${PENDING_DIR}/${n}`, text: fs.readFileSync(path.join(dir, n), 'utf8') }));
}

/** The pending files at a git ref (origin/main), read without a checkout. */
export function pendingAtRef(cwd, ref) {
  let names;
  try {
    names = execFileSync('git', ['ls-tree', '--name-only', `${ref}:${PENDING_DIR}`], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\n');
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith('.md') && n !== 'README.md')
    .sort()
    .map((n) => ({ file: `${PENDING_DIR}/${n}`, text: execFileSync('git', ['show', `${ref}:${PENDING_DIR}/${n}`], { cwd, encoding: 'utf8' }) }));
}

/** ARCHIVE.md-shaped lines for the closes not yet settled, so a reader of the archive counts them closed. */
export function pendingArchiveLines(files, cfg = DEFAULTS) {
  const out = [];
  for (const { file, text } of files) {
    try {
      const p = parsePending(text, file, cfg);
      if (p.close) out.push(`- ${p.date} · ${p.close} · ${p.says}`);
    } catch {
      // A malformed file closes nothing until it's fixed; settle names what's wrong with it.
    }
  }
  return out;
}

/** The chunk ids the pending files close (a malformed file closes nothing). */
export function pendingCloses(files, cfg = DEFAULTS) {
  const out = new Set();
  for (const { file, text } of files) {
    try {
      const p = parsePending(text, file, cfg);
      if (p.close) out.add(p.close);
    } catch {
      // as above
    }
  }
  return out;
}
