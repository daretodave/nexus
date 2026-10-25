#!/usr/bin/env node
// scripts/plan/settle.mjs: settle the plan. Turn plan/pending/'s files (scripts/plan/pending.mjs) into the edits they
// stand for, on main, one run at a time, so no branch ever writes a shared plan file. Only the owner settles
// (scripts/owner.mjs). For each pending file, oldest date first, what adds work before its date's closes (settleOrder):
//   - a close takes its chunk out of its spec (the chunk line, its sub-bullets, the A-IDs it closes, the chunk in other
//     chunks' needs), keeps the Measure line true, sets the roadmap row's "N left", drops the chunk from the Asap lane,
//     the roadmap rows and the build queue (when the config names one), and appends its ARCHIVE.md line with the
//     commits git shows it landed in;
//   - its Edit sections apply, each old text found exactly once;
//   - its Add parts are numbered past the spec and ARCHIVE.md in merge order (`A?<slug>`, `NN.?<slug>`, in its Edit
//     texts, notes, decisions and new footgun lines too), placed at their sections' ends, and the Measure line and the
//     roadmap row's "N left" kept true;
//   - its decisions get the next numbers, and `D?<slug>` becomes that number wherever the repo says it;
//   - its footgun sightings bump seen and last (a Watch line's second sighting moves it back to Open); one that reaches
//     2× while open gets an "automate <slug>" chunk in the ladder spec and an entry in the Asap lane (the ladder,
//     enforced), settle opening the ladder spec and its rows when it's gone and removing them when its last chunk
//     closes, so the plan still shrinks to empty; its new footguns join their status's list (one whose slug is listed
//     is a sighting; a new open one at 2× or more gets the same chunk); past the open budget the coldest single
//     sightings move to Watch, and Watch drops lines unseen for `watchDays` or past its cap (makeRoom);
//   - the pending file is deleted.
// One file's error skips that file whole (said, with why) and settles the rest. A chunk the tidy can't take out of a
// line (prose it doesn't parse) is named: the run then leaves its edits staged, uncommitted, for a hand (exit 2).
// What differs between repos (paths, the ladder's spec number, the budgets) is in plan/settle.json (plan/config.mjs).
//
//   node scripts/plan/settle.mjs [--dry-run | --no-commit]
//
// Exit 0 = settled (or nothing pending), 1 = a file was skipped, 2 = staged for a hand, 3 = not the owner or not on
// the settle branch, 64 = a bad argument. --dry-run says what it would write, and anyone may run it. --no-commit
// writes and stages the edits and prints the commit to make once the gate is green. NEXUS_DEBUG=1 prints the stack
// of each skipped file's error.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DEFAULTS, fill, loadConfig } from './config.mjs';
import { lintFootguns } from './footguns.mjs';
import { PLACEHOLDER, parsePending, pendingFiles } from './pending.mjs';
import { isOwner } from '../owner.mjs';

const CHUNK_LINE = (id) => new RegExp(`^- \\[ \\] \\*\\*${esc(id)}\\*\\*`);
const ANY_CHUNK = /^- \[ \] \*\*(\d{2,}\.\w+)\*\*/;
const ID = String.raw`\d{2,}\.\d+[a-z0-9]*`;
/** A chunk id's spec number: 07.3 → 07. */
const specNum = (id) => id.split('.')[0];

/**
 * The ladder spec as settle opens it: no A-ID or chunk yet, both carrying on from `n` (the next free number). No
 * `## Acceptance` heading either: an empty one is never written; ladderChunk adds it with the first A-ID.
 */
export function ladderSpec(n, cfg = DEFAULTS) {
  return [fill(cfg.ladder.heading, cfg.ladder), '', ...cfg.ladder.why.map((l) => fill(l, cfg.ladder)), '', '## Chunks', `Measure: 0 open · 0 closed · next A${n}`, ''].join('\n');
}

/** The next free ladder chunk number: past every id `taken` (the archive's) and every one a spec lists. */
export function nextLadderNumber(taken, cfg = DEFAULTS) {
  return Math.max(0, ...taken.filter((x) => x.startsWith(`${cfg.ladder.spec}.`)).map((x) => Number(/\.(\d+)/.exec(x)[1]))) + 1;
}

/** Insert `row` after the last line of the block of `match` lines that starts after the line `after` matches. */
function insertAfterBlock(text, after, match, row) {
  const lines = text.split('\n');
  const from = lines.findIndex((l) => after(l));
  if (from < 0) return text;
  const first = lines.findIndex((l, i) => i > from && match.test(l));
  if (first < 0) return text;
  let end = first;
  while (end + 1 < lines.length && match.test(lines[end + 1])) end++;
  lines.splice(end + 1, 0, row);
  return lines.join('\n');
}

/** The queue's row after the last phase row of the list headed by `queueAfter` (up to the next `**` heading). */
function afterLastPhase(queue, cfg) {
  const lines = queue.split('\n');
  const from = cfg.ladder.queueAfter ? lines.findIndex((l) => l.startsWith(cfg.ladder.queueAfter)) : -1;
  if (from < 0) return queue;
  let to = lines.findIndex((l, i) => i > from && l.startsWith('**'));
  if (to < 0) to = lines.length;
  let last = -1;
  for (let i = from + 1; i < to; i++) if (/^- \[[ x-]\] Phase /.test(lines[i])) last = i;
  if (last < 0) return queue;
  lines.splice(last + 1, 0, fill(cfg.ladder.rows.queue, cfg.ladder));
  return lines.join('\n');
}

/**
 * The ladder spec's rows as settle opens it: the roadmap table, the build queue's list, the root README's roadmap
 * (each only when the config gives its row). A file that is null (a repo without it) stays null; a row already there
 * isn't doubled.
 */
export function openLadderRows({ readme, queue, root }, cfg = DEFAULTS) {
  const name = cfg.ladder.file;
  const rows = cfg.ladder.rows;
  const has = (text) => text.includes(`${name})`);
  const skip = (text, row) => text === null || text === undefined || !row || has(text);
  return {
    readme: skip(readme, rows.plan) ? readme : insertAfterBlock(readme, (l) => /^\| # \| Initiative/.test(l), /^\|/, fill(rows.plan, cfg.ladder)),
    queue: skip(queue, rows.queue) ? queue : afterLastPhase(queue, cfg),
    root: skip(root, rows.root) || !cfg.ladder.rootAfter ? root : insertAfterBlock(root, (l) => l.startsWith(cfg.ladder.rootAfter), /^\|/, fill(rows.root, cfg.ladder)),
  };
}

/** The ladder spec's rows out, every line that links it, whatever its words became. */
export function closeLadderRows({ readme, queue, root }, cfg = DEFAULTS) {
  const name = esc(cfg.ladder.file);
  const drop = (text, re) => (text === null || text === undefined ? text : text.split('\n').filter((l) => !re.test(l)).join('\n'));
  return {
    readme: drop(readme, new RegExp(`^\\|.*\\]\\(${name}\\)`)),
    queue: drop(queue, new RegExp(`^- \\[.\\] Phase .*\\(\\.\\./${name}\\)`)),
    root: drop(root, new RegExp(`^\\|.*\\(plan/${name}\\)`)),
  };
}

/** A ladder chunk's own entry at the end of the Asap lane, headed by its id so its close drops it whole (tidyAhead). */
export function laneEntry(readme, id, slug, seen, cfg = DEFAULTS) {
  const lines = readme.split('\n');
  const start = lines.findIndex((l) => l.startsWith(cfg.lanes.asap));
  const held = lines.findIndex((l, i) => i > start && l.startsWith(cfg.lanes.held));
  if (start < 0 || held < 0) return readme;
  let at = held;
  while (at > start + 1 && !lines[at - 1].trim()) at--;
  const entry = `- **${id}** · automate footgun \`${slug}\` (seen ${seen}×), spec ${cfg.ladder.spec}'s ladder chunk.`;
  // A lane that says only "(none)" gets the entry in that line's place.
  const none = lines.slice(start + 1, at).findIndex((l) => /^- \(none( yet)?\)\s*$/.test(l));
  if (none >= 0) {
    lines.splice(start + 1 + none, 1, entry);
    return lines.join('\n');
  }
  lines.splice(at, 0, ...(lines.slice(start + 1, at).some((l) => l.startsWith('- ')) ? [] : ['']), entry);
  return lines.join('\n');
}

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The lines of a bullet block starting at i: the bullet and every line indented under it. */
function blockEnd(lines, i) {
  let j = i + 1;
  while (j < lines.length && /^ {2,}\S/.test(lines[j])) j++;
  return j;
}

/** A chunk line joined with its wrapped lines (not its sub-bullets). */
function chunkHead(lines, i) {
  let s = lines[i];
  for (let j = i + 1; j < lines.length && /^ {2}\S/.test(lines[j]) && !/^ {2}- /.test(lines[j]); j++) s += ` ${lines[j].trim()}`;
  return s;
}

/** The chunk ids a spec lists, in order. */
export function listedChunks(spec) {
  return spec.split('\n').flatMap((l) => (ANY_CHUNK.exec(l) ? [ANY_CHUNK.exec(l)[1]] : []));
}

/**
 * Take a chunk out of its spec: its block, the A-IDs it closes (never a `partial` one), and its id from other chunks'
 * needs, on their line or on the line under a `· needs` that ends it; then the Measure line counts again. Returns
 * { text, closes } or null when the spec doesn't list it.
 */
export function closeChunk(spec, id) {
  const lines = spec.split('\n');
  const i = lines.findIndex((l) => CHUNK_LINE(id).test(l));
  if (i < 0) return null;
  const head = chunkHead(lines, i);
  // "closes A1, A4 (partial), A5": a partial A-ID stays for the chunk that finishes it.
  const closes = (/· closes ([^·]+)/.exec(head)?.[1] ?? '')
    .split(',')
    .filter((part) => !/partial/i.test(part))
    .flatMap((part) => [...part.matchAll(/A\d+/g)].map((m) => m[0]));
  lines.splice(i, blockEnd(lines, i) - i);
  for (const a of closes) {
    const k = lines.findIndex((l) => l.startsWith(`- **${a}**`));
    if (k >= 0) lines.splice(k, blockEnd(lines, k) - k);
  }
  dropEmptyAcceptance(lines);
  return { text: recountMeasure(spec, dropNeeds(lines.join('\n'), id)), closes };
}

/** The `## Acceptance` heading out, in place, once nothing but blank lines sits under it (its last A-ID closed). */
function dropEmptyAcceptance(lines) {
  const h = lines.findIndex((l) => /^## Acceptance\b/.test(l));
  if (h < 0) return;
  let end = h + 1;
  while (end < lines.length && !/^#{1,2} /.test(lines[end])) end++;
  if (lines.slice(h + 1, end).every((l) => !l.trim())) lines.splice(h, end - h);
}

/**
 * A closed chunk's id out of every chunk's needs in a spec, on their line or on the line under a `· needs` that ends
 * it. Settle runs it over every other spec too: a chunk may need another spec's chunk.
 */
export function dropNeeds(spec, id) {
  const lines = spec.split('\n').map((l, i, all) => {
    // A needs clause wrapped onto a line of its own opens a clause only under a joint (`·`) ending the line above.
    if (/·\s*$/.test(all[i - 1] ?? '') && WRAPPED_NEEDS.test(l)) return dropNeed(l, id, WRAPPED_NEEDS);
    return ANY_CHUNK.test(l) || /^ {2}\S/.test(l) ? dropNeed(l, id) : l;
  });
  return dropWrappedNeed(lines, id).join('\n');
}

/** `  needs 07.3` on a wrapped line of its own, under a line that ends `·`. */
const WRAPPED_NEEDS = /^( {2}needs )(.+)$/;

/** A needs list on its own line under a chunk line that ends `· needs`: the id out of it, and `needs —` once empty. */
const NEED_LIST = /^ {2}(\d+\.\d+[a-z\d]*(?:,\s*\d+\.\d+[a-z\d]*)*)\s*$/;
function dropWrappedNeed(lines, id) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const list = /· needs\s*$/.test(lines[i]) ? NEED_LIST.exec(lines[i + 1] ?? '') : null;
    if (!list || !list[1].split(/,\s*/).includes(id)) {
      out.push(lines[i]);
      continue;
    }
    const kept = list[1].split(/,\s*/).filter((s) => s !== id);
    if (kept.length) out.push(lines[i], `  ${kept.join(', ')}`);
    else out.push(lines[i].replace(/· needs\s*$/, '· needs —'));
    i += 1;
  }
  return out;
}

/** `· needs 07.3` → `· needs —`, and out of a list. */
function dropNeed(line, id, clause = /(· needs )(.+)$/) {
  const m = clause.exec(line);
  if (!m) return line;
  const items = m[2].split(/,\s*/);
  if (!items.some((s) => s.trim() === id)) return line;
  const kept = items.filter((s) => s.trim() !== id);
  return line.slice(0, m.index) + m[1] + (kept.length ? kept.join(', ') : '—');
}

/** The Measure line after a change: open = the A-IDs listed, closed = the old total less those, next unchanged. */
export function recountMeasure(before, after) {
  const re = /^Measure: (\d+) open · (\d+) closed · next A(\d+)$/m;
  const m = re.exec(before);
  if (!m) return after;
  const open = new Set([...after.matchAll(/^- \*\*(A\d+)\*\*/gm)].map((x) => x[1])).size;
  const total = Number(m[1]) + Number(m[2]);
  return after.replace(re, `Measure: ${open} open · ${Math.max(total - open, 0)} closed · next A${m[3]}`);
}

/** The roadmap table row for a spec file gets "N left" (only a row that says "N left" already). */
export function setLeft(readme, specFile, n) {
  return readme
    .split('\n')
    .map((l) => (l.startsWith('|') && l.includes(`](${specFile})`) ? l.replace(/\| \d+ left \|\s*$/, `| ${n} left |`) : l))
    .join('\n');
}

const cmpId = (a, b) => {
  const [, an, as] = /^\d+\.(\d+)(.*)$/.exec(a);
  const [, bn, bs] = /^\d+\.(\d+)(.*)$/.exec(b);
  return Number(an) - Number(bn) || as.localeCompare(bs);
};

/** Say the ids as the plan does: "07.4", "07.4 and 07.5", "07.4 to 07.7". */
function sayIds(ids, range) {
  if (ids.length <= 1) return ids.join('');
  if (ids.length === 2) return `${ids[0]} and ${ids[1]}`;
  return range ? `${ids[0]} to ${ids.at(-1)}` : `${ids.slice(0, -1).join(', ')} and ${ids.at(-1)}`;
}

/** Ids in runs: "07.1 to 07.3 and 07.5", a run of three or more said as a range. */
function sayRuns(ids) {
  const runs = [];
  const plain = (x) => /^\d+\.\d+$/.test(x);
  for (const id of ids) {
    const last = runs.at(-1)?.at(-1);
    const next = last && plain(last) && plain(id) && specNum(id) === specNum(last) && Number(id.split('.')[1]) === Number(last.split('.')[1]) + 1;
    if (next) runs.at(-1).push(id);
    else runs.push([id]);
  }
  return sayIds(runs.flatMap((r) => (r.length >= 3 ? [`${r[0]} to ${r.at(-1)}`] : r)), false);
}

const SEP = String.raw`(?:, then |, and | and | then |, )`;
// A list of ids; one with a possessive ("07.4's empty state") is named in prose, not listed, and never matches.
const GROUP = () => new RegExp(`(?<![\\w.$])${ID}(?:${SEP}${ID})*(?!\\w|\\.\\d|['’]s\\b)`, 'g');

/**
 * Where the clause an emptied group opens ends, and how it goes: the plan names a chunk as the subject of its own
 * clause ("07.4 waits on …", "07.6, your own domain, first"), so the words after the ids up to the clause's end are
 * the closed chunk's and go with it. Null when that can't be told safely: the ids aren't the clause's opening words
 * ("until 07.5", "the canvas for 07.2 is in") or another chunk's clause leans on this one's verb ("07.4 waits on X,
 * 07.9 on Y"). `opens`: the line's start begins a clause (a wrapped line after a ":").
 */
function clauseCut(s, gs, ge, opens) {
  const before = s.slice(0, gs);
  // "a bug, then 07.12, answers" follows a step; "; then 07.4 on" opens a clause with its "then".
  const step = /\S,? then $/.test(before) && !/[;:(] then $/.test(before);
  const p = step ? gs : gs - (/(?:then|and) $/.exec(before)?.[0].length ?? 0);
  const head = s.slice(0, p);
  let left;
  if (step) left = { kind: 'then', at: p - /,? then $/.exec(head)[0].length };
  else if (/^\s*(?:- )?$/.test(head)) left = opens ? { kind: 'start', at: p } : null;
  else if (/\($/.test(head)) left = { kind: '(', at: p };
  else if (/; $/.test(head)) left = { kind: ';', at: p - 2 };
  else if (/[:·|] $/.test(head)) left = { kind: 'label', at: p };
  if (!left) return null;
  let depth = 0;
  let right = null;
  for (let k = ge; k <= s.length && !right; k++) {
    const rest = s.slice(k);
    if (k === s.length) right = { kind: 'end', at: k, to: k };
    else if (s[k] === '(') depth++;
    else if (s[k] === ')') {
      if (!depth) right = { kind: 'end', at: k, to: k };
      else depth--;
    } else if (depth) continue;
    else if (s[k] === ';') right = { kind: ';', at: k, to: k + (s[k + 1] === ' ' ? 2 : 1) };
    else if (/^,? then /.test(rest)) right = { kind: 'then', at: k, to: k + /^,? then /.exec(rest)[0].length };
    else if (/^(?:,|,? and|,? then)\s*$/.test(rest)) right = { kind: 'joint', at: k, to: s.length };
    else if (new RegExp(`^(?:,|,? and) (?:${ID})(?!\\w|\\.\\d)`).test(rest)) return null;
    else if (/^ [·|]/.test(rest) || (s[k] === '.' && (k + 1 === s.length || s[k + 1] === ' '))) right = { kind: 'end', at: k, to: k };
  }
  // Out goes the clause with one joint: the one after it when the next clause goes on in its place, else the one before.
  if (right.kind === 'joint') return { start: head.trimEnd().length, end: right.to, insert: '' };
  if (right.kind === 'then') return { start: p, end: right.to, insert: '' };
  if (right.kind === ';' && left.kind !== ';' && left.kind !== 'then') {
    const next = s.slice(right.to);
    // A label ("Asap: 07.2; near me 07.4") goes with its clause unless the next one goes on naming chunks.
    const keep = left.kind !== 'label' || new RegExp(`^(?:then )?${ID}(?!\\w|\\.\\d)`).test(next);
    let start = p;
    if (!keep && /: $/.test(head)) {
      const body = head.slice(0, -2);
      start = Math.max(0, ...['(', '· ', '; ', '| '].map((d) => (body.lastIndexOf(d) < 0 ? 0 : body.lastIndexOf(d) + d.length)));
    }
    return { start, end: right.to + (/^then /.test(next) ? 5 : 0), insert: '' };
  }
  if (left.kind === ';' || left.kind === 'then') return { start: left.at, end: right.at, insert: '' };
  return { start: p, end: right.at, insert: '' };
}

/**
 * A line without a closed chunk: out of a range ("07.3 to 07.5" → "07.4 and 07.5", from the chunks its spec still
 * lists), out of a list ("07.2, then 07.3" → "07.2"), or, when it was a clause's only subject, the clause with it
 * (clauseCut). A line it can't tidy safely keeps the id, so stillNamed names it for a hand. `listed` is every chunk id
 * the specs list after the close.
 */
export function tidyLine(line, closed, listed, { opens = true } = {}) {
  const spec = specNum(closed);
  // A range holding the close, at an end or inside ("07.3 to 07.5" names 07.4 too), says what's left in runs.
  const inRange = (a, b) => specNum(a) === spec && specNum(b) === spec && cmpId(closed, a) >= 0 && cmpId(closed, b) <= 0;
  const RANGE = () => new RegExp(`(?<![\\w.$])(${ID})(?: to |–)(${ID})(?!\\w|\\.\\d)`, 'g');
  if (![...line.matchAll(RANGE())].some(([, a, b]) => inRange(a, b)) && !new RegExp(`(?<![\\w.$])${esc(closed)}(?!\\w|\\.\\d)`).test(line)) return line;
  let out = line.replace(RANGE(), (all, a, b) => {
    if (!inRange(a, b)) return all;
    const left = listed.filter((x) => specNum(x) === spec && cmpId(x, a) >= 0 && cmpId(x, b) <= 0).sort(cmpId);
    return sayRuns(left);
  });
  out = out.replace(GROUP(), (all) => {
    const ids = all.split(new RegExp(SEP));
    if (!ids.includes(closed)) return all;
    const kept = ids.filter((x) => x !== closed);
    if (!kept.length) return all;
    if (/then/.test(all)) return kept.join(', then ');
    return sayIds(kept, false);
  });
  for (let from = 0; ; ) {
    const re = GROUP();
    re.lastIndex = from;
    let m;
    while ((m = re.exec(out)) && !m[0].split(new RegExp(SEP)).every((x) => x === closed));
    if (!m) break;
    const cut = clauseCut(out, m.index, m.index + m[0].length, opens);
    if (!cut) {
      from = m.index + m[0].length;
      continue;
    }
    out = out.slice(0, cut.start) + cut.insert + out.slice(cut.end);
    from = cut.start;
  }
  if (out === line) return line;
  // What emptying a clause leaves: a label with nothing after it ("· Asap: ; near me" → "· near me"), "()",
  // "x, )", a trailing "·", doubled spaces.
  return out
    .replace(/([:(]) ?(?:, then|, and|,) *$/, '$1')
    .replace(/([·(]\s?)[^·();:|]+?: ?[;,] ?/g, '$1')
    .replace(/([·(;]\s?)[^·();:|]+?: ?(?=\)|$)/g, '$1')
    .replace(/\s*\(\s*\)/g, '')
    .replace(/[,;] (?=[;)])/g, '')
    .replace(/\s*·\s*$/, '')
    .replace(/(\S) {2,}(?=\S)/g, '$1 ');
}

/** What broken prose a tidy can leave. */
const FLAWS = [
  [/\(\s*(?:[,;:]|\.(?=\s|\)|$))/g, 'a parenthesis opening on a joint'],
  [/[,;:]\s*\)/g, 'a joint closing a parenthesis'],
  [/[,;]\s*[,;.]/g, 'two joints in a row'],
  [/\b(?:and|then|or)\s*[,;:.)]/g, 'a stranded "and" or "then"'],
  [/(?:^|[(;:·|]\s*)(?:and|then)\b(?!\s+\S)/g, 'a stranded "and" or "then"'],
  [/(?:^|\s)['’]s\b/g, 'a possessive with no name'],
  [/\b(?:until|for|of|on|to|by|with|after|before|from|at|as)\s*[;)]/g, 'a word missing what follows it'],
  [/^\s*(?:- )?[,;:.)]/g, 'a line opening on punctuation'],
  [/^\s*- (?:and|then)\b/g, 'an entry opening on "and" or "then"'],
  [/:\s*[;,.]/g, 'a label with nothing after it'],
  [/\S {2,}\S/g, 'a doubled space'],
  [/\(\s*\)/g, 'empty parentheses'],
  [/·\s*[·|]|\|\s*·/g, 'an empty "·" part'],
];

/** The flaws a tidy added to a line ([] for none): only new ones count, so a line already odd is no refusal. */
export function proseFlaws(before, after) {
  return FLAWS.flatMap(([re, why]) => ((after.match(re) ?? []).length > (before.match(re) ?? []).length ? [why] : []));
}

/** A line a tidy emptied into the one above it; indented, so dropEmptied still reads it as part of its entry. */
const GONE = '  \u0001';

/** Whether the lane entry holding line i names no chunk once that line reads t. */
function entryEmptied(lines, i, t) {
  let a = i;
  while (a > 0 && !lines[a].startsWith('- ') && lines[a].startsWith('  ')) a--;
  let b = i + 1;
  while (b < lines.length && lines[b].startsWith('  ')) b++;
  const entry = lines.slice(a, b).map((l, k) => (a + k === i ? t : l));
  return !new RegExp(`(?<![\\w.$])${ID}(?!\\w|\\.\\d)`).test(entry.join(' '));
}

/**
 * Tidy a closed chunk out of the roadmap's Asap lane and rows and the build queue's rows (`queue` null: none);
 * returns { readme, queue, changed[] }.
 */
export function tidyAhead(readme, queue, closed, listed, cfg = DEFAULTS) {
  const changed = [];
  const fix = (text, where, pick) => {
    const lines = text.split('\n');
    let lane = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(cfg.lanes.asap)) lane = true;
      else if (lines[i].startsWith(cfg.lanes.held)) lane = false;
      if (!pick(lines[i], lane)) continue;
      // A lane entry headed by the closed chunk alone ("- **07.6** · your own domain: …", or with no middle dot:
      // "- **07.6** your own domain") goes whole.
      const headed = lane && /^- \*\*([^*]+)\*\*(?: · | |$)/.exec(lines[i]);
      if (headed && headed[1].split(/,\s*|\s+and\s+/).every((x) => x === closed)) {
        let j = i + 1;
        while (j < lines.length && /^ {2}\S/.test(lines[j])) j++;
        for (let k = i; k < j; k++) lines[k] = GONE;
        changed.push(`${where}:${i + 1}: dropped the lane entry ${closed} headed`);
        i = j - 1;
        continue;
      }
      // A wrapped line's start begins a clause only after a label or a joint on the line above.
      const opens = !/^\s/.test(lines[i]) || (i > 0 && /[:;(]\s*$/.test(lines[i - 1]));
      const t = tidyLine(lines[i], closed, listed, { opens });
      if (t === lines[i]) continue;
      // A wrapped line left with only its full stop ends the line above, in place of a label's colon left bare there.
      if (i > 0 && /^\s+[.;]?$/.test(t) && /\S/.test(lines[i - 1])) {
        const above = lines[i - 1].replace(/:\s*$/, '') + t.trim();
        if (proseFlaws(lines[i - 1], above).length) continue;
        lines[i - 1] = above;
        lines[i] = GONE;
        changed.push(`${where}:${i}: ${lines[i - 1].trim().slice(0, 140)}`);
        continue;
      }
      // Broken prose is never written: the line keeps the id, and stillNamed names it for a hand (exit 2). A lane entry
      // the close leaves naming no chunk is the exception: dropEmptied takes it whole.
      if (proseFlaws(lines[i], t).length && !(lane && entryEmptied(lines, i, t))) continue;
      changed.push(`${where}:${i + 1}: ${t.trim().slice(0, 140)}`);
      lines[i] = t;
    }
    return lines.join('\n');
  };
  const gone = (text) => text.split('\n').filter((l) => l !== GONE).join('\n');
  return {
    readme: gone(dropEmptied(readme, fix(readme, 'plan/README.md', (l, lane) => (lane && !l.startsWith('**')) || /^\|.*\]\(\d{2,}-[^)]+\.md\)/.test(l)), changed, cfg)),
    queue: queue === null || queue === undefined ? queue : gone(fix(queue, cfg.queue ?? 'queue', (l) => /^- \[ \] Phase /.test(l))),
    changed,
  };
}

/**
 * An Asap lane entry the tidy changed that now names no chunk goes whole, every line it wraps onto: its close was the
 * entry's last chunk (a line-by-line tidy would leave its words ending in ": ."). `changed` trades that entry's lines'
 * notes for one.
 */
function dropEmptied(before, after, changed, cfg) {
  const was = before.split('\n');
  const lines = after.split('\n');
  const out = [];
  let lane = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(cfg.lanes.asap)) lane = true;
    else if (lines[i].startsWith(cfg.lanes.held)) lane = false;
    if (!lane || !lines[i].startsWith('- ')) {
      out.push(lines[i]);
      continue;
    }
    let end = i + 1;
    while (end < lines.length && lines[end].startsWith('  ')) end++;
    const entry = lines.slice(i, end);
    const touched = entry.some((l, k) => l !== GONE && l !== was[i + k]);
    if (touched && !new RegExp(`(?<![\\w.$])${ID}(?!\\w|\\.\\d)`).test(entry.join(' '))) {
      for (let k = i; k < end; k++) {
        const at = changed.findIndex((c) => c.startsWith(`plan/README.md:${k + 1}: `));
        if (at >= 0) changed.splice(at, 1);
      }
      changed.push(`plan/README.md:${i + 1}: dropped the lane entry it emptied`);
    } else out.push(...entry);
    i = end - 1;
  }
  return out.join('\n');
}

/** Lines that still name a closed chunk where work ahead is listed. */
export function stillNamed(readme, queue, closed, cfg = DEFAULTS) {
  const re = new RegExp(`(?<![\\w.$])${esc(closed)}(?!\\w|\\.\\d)`);
  const out = [];
  let lane = false;
  (readme ?? '').split('\n').forEach((l, i) => {
    if (l.startsWith(cfg.lanes.asap)) lane = true;
    else if (l.startsWith(cfg.lanes.held)) lane = false;
    if (((lane && !l.startsWith('**')) || /^\|.*\]\(\d{2,}-[^)]+\.md\)/.test(l)) && re.test(l)) out.push(`plan/README.md:${i + 1}`);
  });
  (queue ?? '').split('\n').forEach((l, i) => {
    if (/^- \[ \] Phase /.test(l) && re.test(l)) out.push(`${cfg.queue}:${i + 1}`);
  });
  return out;
}

// ---- footguns: Open (read before building, in budget), Watch (single sightings, searched), Guarded ----

const FG_SLUG = /^- \*\*([a-z0-9]+(?:-[a-z0-9]+)*)\*\* · /;
const SECTION = { open: 'Open', watch: 'Watch', guarded: 'Guarded' };
const WATCH_HEADER = '## Watch (seen once: searched before adding a line, not read before building)';
const fgState = (line) => (/· open\s*$/.test(line) ? 'open' : /· watch\s*$/.test(line) ? 'watch' : /· guarded by \S/.test(line) ? 'guarded' : null);
const fgSeen = (line) => Number(/· seen (\d+)× ·/.exec(line)?.[1] ?? 0);
const fgLast = (line) => /· last (\d{4}-\d\d-\d\d) ·/.exec(line)?.[1] ?? '';
const fgAt = (lines, slug) => lines.findIndex((l) => l.startsWith(`- **${slug}** · `));

/** Put a line at the end of its section; a file without ## Watch gets one just before ## Guarded. */
function appendFootgun(lines, state, line, file = DEFAULTS.footguns) {
  let at = lines.findIndex((l) => l.startsWith(`## ${SECTION[state]}`));
  if (at < 0) {
    if (state !== 'watch') throw new Error(`${file} has no "## ${SECTION[state]}" section`);
    let g = lines.findIndex((l) => l.startsWith('## Guarded'));
    if (g < 0) g = lines.length;
    lines.splice(g, 0, WATCH_HEADER, '', '');
    at = g;
  }
  let end = lines.findIndex((l, i) => i > at && l.startsWith('## '));
  if (end < 0) end = lines.length;
  const floor = lines[at + 1] !== undefined && !lines[at + 1].trim() ? at + 2 : at + 1;
  while (end > floor && !lines[end - 1].trim()) end--;
  lines.splice(end, 0, line);
}

/**
 * Bump a footgun's sighting: { text, seen, open, promoted } or null when no line has the slug. A Watch line's second
 * sighting promotes it: status open, at the end of ## Open, where the ladder sees it.
 */
export function bumpFootgun(text, slug, date, cfg = DEFAULTS) {
  const lines = text.split('\n');
  const i = fgAt(lines, slug);
  if (i < 0) return null;
  let seen = 0;
  let line = lines[i]
    .replace(/· seen (\d+)× ·/, (_, n) => `· seen ${(seen = Number(n) + 1)}× ·`)
    .replace(/· last (\d{4}-\d\d-\d\d) ·/, (all, d) => (d < date ? `· last ${date} ·` : all));
  const promoted = fgState(line) === 'watch';
  if (promoted) {
    line = line.replace(/· watch\s*$/, '· open');
    lines.splice(i, 1);
    appendFootgun(lines, 'open', line, cfg.footguns);
  } else lines[i] = line;
  return { text: lines.join('\n'), seen, open: fgState(line) === 'open', promoted };
}

/**
 * Keep the lists in budget, with no judgment: past the open budget, the coldest single sightings (oldest `last`, then
 * earliest in the file) move to ## Watch, never a line seen twice (with none left, Open runs over); Watch drops a line
 * unseen for `watchDays`, then the oldest past its cap (git keeps them). Returns { text, demoted, dropped, notes }.
 */
export function makeRoom(text, today, cfg = DEFAULTS) {
  const { openFootguns, watchFootguns, watchDays } = cfg.limits;
  const lines = text.split('\n');
  const demoted = [];
  const dropped = [];
  const notes = [];
  const listed = (state) => lines.flatMap((l, i) => (FG_SLUG.test(l) && fgState(l) === state ? [{ l, i, slug: FG_SLUG.exec(l)[1] }] : []));
  const coldest = (xs) => xs.sort((a, b) => fgLast(a.l).localeCompare(fgLast(b.l)) || a.i - b.i)[0];
  for (let open = listed('open'); open.length > openFootguns; open = listed('open')) {
    const c = coldest(open.filter((x) => fgSeen(x.l) <= 1));
    if (!c) {
      // Every open line is seen twice or more, so each awaits automation: Open runs over.
      notes.push(`Open over budget: ${open.length} lines, every one awaiting automation (spec ${cfg.ladder.spec})`);
      break;
    }
    lines.splice(c.i, 1);
    appendFootgun(lines, 'watch', c.l.replace(/· open\s*$/, '· watch'), cfg.footguns);
    demoted.push(c.slug);
    notes.push(`footgun ${c.slug} (seen ${fgSeen(c.l)}×, last ${fgLast(c.l)}) moved to ## Watch to keep ## Open at ${openFootguns}`);
  }
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - watchDays * 86400000).toISOString().slice(0, 10);
  const drop = (x, why) => {
    lines.splice(x.i, 1);
    dropped.push({ slug: x.slug, why, last: fgLast(x.l) });
    notes.push(
      why === 'age'
        ? `footgun ${x.slug} left ## Watch: unseen since ${fgLast(x.l)}, past ${watchDays} days (git keeps it)`
        : `footgun ${x.slug} left ## Watch: the oldest past its ${watchFootguns} lines (git keeps it)`,
    );
  };
  for (let x = listed('watch').find((w) => fgLast(w.l) < cutoff); x; x = listed('watch').find((w) => fgLast(w.l) < cutoff)) drop(x, 'age');
  for (let watch = listed('watch'); watch.length > watchFootguns; watch = listed('watch')) drop(coldest(watch), 'cap');
  return { text: lines.join('\n'), demoted, dropped, notes };
}

/** Notes go first under `## Inbox` (newest first), else at the end. */
export function addNotes(text, notes) {
  const block = `${notes.join('\n\n')}\n`;
  const m = /^## Inbox[^\n]*\n\n?/m.exec(text);
  if (!m) return `${text.replace(/\n*$/, '\n\n')}${block}`;
  const at = m.index + m[0].length;
  return `${text.slice(0, at)}${block}\n${text.slice(at)}`;
}

/**
 * New footgun lines go at the end of their status's section (an open one in ## Open, a `guarded by` one in ## Guarded).
 * One whose slug is already listed anywhere is a sighting, dated its `last`:
 * { text, sightings: [{ slug, date }], added: [{ slug, seen, open }] }.
 */
export function addFootguns(text, add, cfg = DEFAULTS) {
  const lines = text.split('\n');
  const sightings = [];
  const added = [];
  for (const line of add) {
    const slug = FG_SLUG.exec(line)?.[1];
    if (!slug) throw new Error(`a footgun starts "- **<slug>** · ": ${line.slice(0, 40)}`);
    if (fgAt(lines, slug) >= 0) sightings.push({ slug, date: fgLast(line) });
    else {
      const state = fgState(line) ?? 'open';
      appendFootgun(lines, state, line, cfg.footguns);
      added.push({ slug, seen: fgSeen(line), open: state === 'open' });
    }
  }
  return { text: lines.join('\n'), sightings, added };
}

/**
 * One pending file's footguns, as settle writes them: its new lines, its sightings (and a new line naming a listed
 * slug), then room made. `ladder` is each line the file leaves open and seen twice or more, a sighting's bump or a
 * new line that arrives at 2× or more: once per slug, at its last count.
 */
export function settleFootguns(text, { add = [], footguns = [], date, today }, cfg = DEFAULTS) {
  const notes = [];
  const ladder = [];
  const climb = ({ slug, seen, open }) => {
    if (!open || seen < 2) return;
    const had = ladder.findIndex((l) => l.slug === slug);
    if (had >= 0) ladder.splice(had, 1);
    ladder.push({ slug, seen });
  };
  const added = addFootguns(text, add, cfg);
  let out = added.text;
  added.added.forEach(climb);
  for (const s of added.sightings) notes.push(`footgun ${s.slug} is already listed: its new line counts as a sighting`);
  for (const { slug, date: d } of [...footguns.map((slug) => ({ slug, date })), ...added.sightings]) {
    const b = bumpFootgun(out, slug, d, cfg);
    if (!b) throw new Error(`no footgun "${slug}" to bump (a new one goes under ## Footguns)`);
    out = b.text;
    if (b.promoted) notes.push(`footgun ${slug} seen ${b.seen}×: back from ## Watch to ## Open`);
    climb({ slug, seen: b.seen, open: b.open });
  }
  const room = makeRoom(out, today, cfg);
  return { text: room.text, notes: [...notes, ...room.notes], ladder, demoted: room.demoted, dropped: room.dropped };
}

/**
 * The ladder: an open footgun seen twice gets a chunk in the ladder spec (an A-ID, a chunk at the front of its list),
 * unless a chunk there already names it. `taken` is every ladder id the archive and pending closes used.
 */
export function ladderChunk(spec, slug, seen, taken, cfg = DEFAULTS) {
  const L = cfg.ladder.spec;
  // A chunk names the slug as a whole word, backticked (settle's own) or bare (a hand-written chunk).
  const named = new RegExp(`(^|[^a-z0-9-])${esc(slug)}(?![a-z0-9-])`);
  if (spec.split('\n').some((l) => ANY_CHUNK.test(l) && named.test(l.replace(ANY_CHUNK, '')))) return null;
  const m = /^Measure: (\d+) open · (\d+) closed · next A(\d+)$/m.exec(spec);
  if (!m) throw new Error(`spec ${L} has no Measure line`);
  const a = `A${m[3]}`;
  const used = [...listedChunks(spec), ...taken].filter((x) => x.startsWith(`${L}.`)).map((x) => Number(/\.(\d+)/.exec(x)[1]));
  const id = `${L}.${Math.max(0, ...used) + 1}`;
  const lines = spec.split('\n');
  let lastA = -1;
  lines.forEach((l, i) => {
    if (/^- \*\*A\d+\*\*/.test(l)) lastA = i;
  });
  const aLine = `- **${a}** \`${slug}\` is guarded: a test, hook or lint fails on the trap, and its footgun line says \`guarded by\` it.`;
  if (lastA >= 0) lines.splice(blockEnd(lines, lastA), 0, aLine);
  else {
    // Every chunk closed took its A-ID out, and its heading with the last one (or the spec is new): the bullet goes
    // first under the heading, which comes back before `## Chunks` when it's gone.
    const heading = lines.findIndex((l) => /^## Acceptance\b/.test(l));
    const chunks = lines.findIndex((l) => /^## Chunks\b/.test(l));
    if (heading >= 0) {
      lines.splice(heading + 1, 0, '', aLine);
      lastA = heading + 2;
    } else if (chunks >= 0) {
      lines.splice(chunks, 0, '## Acceptance', '', aLine, '');
      lastA = chunks + 2;
    }
  }
  const measure = lines.findIndex((l) => /^Measure: /.test(l));
  let at = measure + 1;
  while (at < lines.length && !lines[at].trim()) at++;
  const chunk = `- [ ] **${id}** Automate footgun \`${slug}\` (seen ${seen}×): a test, hook or lint, then mark it guarded · S · closes ${a} · needs —`;
  // No chunk listed: one blank line after the Measure line, then the chunk, then the file's end.
  if (at >= lines.length) lines.splice(measure + 1, lines.length, '', chunk, '');
  else lines.splice(at, 0, chunk);
  if (lastA < 0) throw new Error(`spec ${L} has no acceptance bullets to follow`);
  const text = lines.join('\n').replace(/^Measure: (\d+) open · (\d+) closed · next A(\d+)$/m, `Measure: ${Number(m[1]) + 1} open · ${m[2]} closed · next A${Number(m[3]) + 1}`);
  return { text, id };
}

/** Number decisions: { text, numbers: Map<'D?slug', 'D208'> }, appended to the year's file. `max` is the highest D-number in any year. */
export function numberDecisions(text, decisions, max) {
  const numbers = new Map();
  let n = max;
  const add = decisions.map((d) => {
    const key = /^- \*\*(D\?[a-z0-9-]+)\*\*/.exec(d)[1];
    if (!numbers.has(key)) numbers.set(key, `D${++n}`);
    return d;
  });
  const body = text.replace(/\n*$/, '\n') + add.join('\n') + '\n';
  return { text: renumber(body, numbers), numbers };
}

/** `D?slug` → its number, never inside a longer slug. */
export function renumber(text, numbers) {
  let out = text;
  for (const [key, num] of numbers) out = out.replace(new RegExp(`${esc(key)}(?![a-z0-9-])`, 'g'), num);
  return out;
}

/**
 * What the footgun lint would newly refuse in the list a pending file leaves (its budget of open lines above all):
 * null when nothing new, so a pending file that would break the list is skipped before settle writes.
 */
export function footgunsRefusal(before, after, cfg = DEFAULTS) {
  const had = new Set(lintFootguns(before, cfg.footguns, cfg.limits));
  const added = lintFootguns(after, cfg.footguns, cfg.limits).filter((p) => !had.has(p));
  return added.length ? `the footgun lint would refuse ${cfg.footguns}: ${added.join('; ')}` : null;
}

/** Apply a pending file's exact edits to a reader/writer of files; throws on a miss. */
export function applyEdits(edits, read, write) {
  for (const e of edits) {
    const text = read(e.path);
    if (text === null) throw new Error(`Edit ${e.path}: no such file`);
    const at = text.indexOf(e.old);
    if (at < 0) throw new Error(`Edit ${e.path}: the old text isn't there (main moved: write the edit again from main)`);
    if (text.indexOf(e.old, at + 1) >= 0) throw new Error(`Edit ${e.path}: the old text is there more than once (quote more of it)`);
    // An empty new text over whole lines takes the lines out, their newline too: a blank line left in a table's rows
    // ends the table there.
    const end = at + e.old.length;
    const wholeLines = e.new === '' && (at === 0 || text[at - 1] === '\n') && text[end] === '\n';
    write(e.path, text.slice(0, at) + e.new + text.slice(wholeLines ? end + 1 : end));
  }
}

const MEASURE = /^Measure: (\d+) open · (\d+) closed · next A(\d+)$/m;
const slugOf = (entry) => /\*\*(\S+?)\*\*/.exec(entry)[1];

/** The next free chunk number of spec `nn`: past every id it lists and every one ARCHIVE.md closed (07.4a counts as 4). */
export function nextChunkNumber(nn, listed, archive) {
  const archived = [...(archive ?? '').matchAll(/ · (\d{2,}\.\w+) · /g)].map((m) => m[1]);
  const nums = [...listed, ...archived].filter((id) => id.startsWith(`${nn}.`)).map((id) => Number(/^\d{2,}\.(\d+)/.exec(id)?.[1] ?? 0));
  return Math.max(0, ...nums) + 1;
}

/** The [start, end) of the `## ` section whose heading `test` accepts (end: the next `## ` line), or null. */
function sectionOf(lines, test) {
  const start = lines.findIndex((l) => l.startsWith('## ') && test(l.slice(3).trim()));
  if (start < 0) return null;
  const next = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return [start, next < 0 ? lines.length : next];
}

/** Where a section's last non-blank line ends: new entries go there, the blank lines before the next heading kept. */
function sectionTail(lines, [start, end]) {
  let at = end;
  while (at - 1 > start && !lines[at - 1].trim()) at--;
  // An empty section: after the blank line under its heading.
  return at === start + 1 ? Math.min(start + 2, end) : at;
}

/** A new `## heading` section, put before the first of the `before` sections there is (or at the end): its range. */
function openSection(lines, heading, before) {
  const range = before.map((b) => sectionOf(lines, (h) => h.startsWith(b))).find(Boolean);
  const at = range ? range[0] : lines.length;
  lines.splice(at, 0, `## ${heading}`, '', '');
  return [at, at + 2];
}

/**
 * Place one `## Add` in its spec: its sections' texts at their sections' ends, its acceptance entries after the last
 * A-ID, its questions at the end of Open questions (numbered when the list is), its chunks at the end of Chunks; then
 * the Measure line counts again with `nextA` as its next free A-ID. `fill` writes the numbers in.
 */
export function placeAdd(spec, add, fill, nextA) {
  const lines = spec.split('\n');
  const put = (range, rows) => lines.splice(sectionTail(lines, range), 0, ...rows);
  for (const s of add.sections) {
    const range = sectionOf(lines, (h) => h === s.heading) ?? openSection(lines, s.heading, ['Acceptance', 'Open questions', 'Chunks']);
    const held = lines.slice(range[0] + 1, range[1]).some((l) => l.trim());
    put(range, [...(held ? [''] : []), ...fill(s.text).split('\n')]);
  }
  if (add.acceptance.length) {
    const range = sectionOf(lines, (h) => h === 'Acceptance') ?? openSection(lines, 'Acceptance', ['Open questions', 'Chunks']);
    let last = -1;
    for (let i = range[0]; i < range[1]; i++) if (/^- \*\*A\d+\*\*/.test(lines[i])) last = i;
    const rows = add.acceptance.flatMap((e) => fill(e).split('\n'));
    if (last >= 0) lines.splice(blockEnd(lines, last), 0, ...rows);
    else put(range, rows);
  }
  if (add.questions.length) {
    const range = sectionOf(lines, (h) => h.startsWith('Open questions')) ?? openSection(lines, 'Open questions', ['Chunks']);
    const numbered = lines.slice(range[0], range[1]).map((l) => /^(\d+)\. /.exec(l)).filter(Boolean);
    let n = Math.max(0, ...numbered.map((m) => Number(m[1])));
    const rows = add.questions.flatMap((q) => {
      const text = fill(q).split('\n');
      if (!numbered.length) return text;
      const head = `${++n}. `;
      return [head + text[0].slice(2), ...text.slice(1).map((l) => ' '.repeat(head.length - 2) + l)];
    });
    put(range, rows);
  }
  if (add.chunks.length) {
    const range = sectionOf(lines, (h) => h === 'Chunks');
    if (!range) throw new Error(`Add ${add.path}: the spec has no "## Chunks" section`);
    put(range, add.chunks.flatMap((e) => fill(e).split('\n')));
  }
  const text = lines.join('\n');
  const m = MEASURE.exec(text);
  if (!m) return text;
  const open = new Set([...text.matchAll(/^- \*\*(A\d+)\*\*/gm)].map((x) => x[1])).size;
  return text.replace(MEASURE, `Measure: ${open} open · ${m[2]} closed · next A${nextA}`);
}

/**
 * A pending file's text changes as settle makes them, and as the settled view reads them: its Add parts numbered
 * against their specs as they stand (the Measure line's next A-ID, the next chunk id past the spec and ARCHIVE.md),
 * those numbers written into its Edit texts, its edits applied, then each Add placed and the roadmap's "N left" set.
 * Returns the numbers given (`A?strip` → `A19`, `07.?strip` → `07.10`). `only` limits the files written.
 */
export function applyPlanChanges(p, read, write, only = () => true) {
  const numbers = new Map();
  const nextA = new Map();
  for (const a of p.adds ?? []) {
    const spec = read(a.path);
    if (spec === null) throw new Error(`Add ${a.path}: no such spec`);
    const m = MEASURE.exec(spec);
    if (!m) throw new Error(`Add ${a.path}: no "Measure: N open · N closed · next A#" line`);
    let n = Number(m[3]);
    for (const e of a.acceptance) numbers.set(slugOf(e), `A${n++}`);
    nextA.set(a.path, n);
    let c = nextChunkNumber(a.spec, listedChunks(spec), read('plan/ARCHIVE.md'));
    for (const e of a.chunks) numbers.set(slugOf(e), `${a.spec}.${c++}`);
  }
  const fill = (t) => t.replace(PLACEHOLDER, (k) => numbers.get(k) ?? k);
  applyEdits(
    p.edits.filter((e) => only(e.path)).map((e) => ({ ...e, new: fill(e.new) })),
    read,
    write,
  );
  for (const a of p.adds ?? []) {
    if (!only(a.path)) continue;
    const text = placeAdd(read(a.path), a, fill, nextA.get(a.path));
    write(a.path, text);
    const readme = only('plan/README.md') ? read('plan/README.md') : null;
    if (readme !== null) write('plan/README.md', setLeft(readme, path.basename(a.path), listedChunks(text).length));
  }
  return numbers;
}

/** Whether a pending file adds work: a plot, an `## Add`, or an edit of the roadmap (a lane entry). */
export function addsWork(p) {
  return /^plot-/.test(path.basename(p.file)) || (p.adds ?? []).length > 0 || p.edits.some((e) => e.path === 'plan/README.md');
}

/**
 * The order settle takes pending files in: date first; within a date, what adds work before the rest (the closes), so
 * a close of a chunk a plot of the same day adds finds it numbered; then the name.
 */
export function settleOrder(parsed) {
  return [...parsed].sort((a, b) => a.date.localeCompare(b.date) || Number(addsWork(b)) - Number(addsWork(a)) || a.file.localeCompare(b.file));
}

// ---- the run (git and the files) ----

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** origin/`branch`'s commit, or null when this checkout has no such ref. */
function upstreamOf(cwd, branch) {
  try {
    return git(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}^{commit}`], cwd) || null;
  } catch {
    return null;
  }
}

/** Whether commit `a` is `b` or one of its ancestors. */
function isAncestor(cwd, a, b) {
  try {
    git(['merge-base', '--is-ancestor', a, b], cwd);
    return true;
  } catch {
    return false;
  }
}

/** Whether pending file `file` as commit `h` left it closes a chunk (a file the commit deleted closes nothing). */
function closesAt(cwd, h, file) {
  try {
    return /^close:[ \t]*\S/m.test(git(['show', `${h}:${file}`], cwd));
  } catch {
    return false;
  }
}

/** Whether commit `h` writes a pending file that closes a chunk (`names`: the files it touches, when already read). */
function closesIn(cwd, h, names = git(['show', '--name-only', '--format=', h], cwd).split('\n').filter(Boolean)) {
  return names.some((n) => n.startsWith('plan/pending/') && n !== 'plan/pending/README.md' && closesAt(cwd, h, n));
}

/**
 * Whether commit `h` writes a pending file that adds work (a plot, an `## Add`, an edit of the roadmap): a plot commit,
 * which belongs to no chunk.
 */
function plotsIn(cwd, h, names = git(['show', '--name-only', '--format=', h], cwd).split('\n').filter(Boolean)) {
  return names.some((n) => {
    if (!n.startsWith('plan/pending/') || n === 'plan/pending/README.md') return false;
    if (/^plot-/.test(path.basename(n))) return true;
    try {
      return /^## (Add |Edit plan\/README\.md[ \t]*$)/m.test(git(['show', `${h}:${n}`], cwd));
    } catch {
      return false;
    }
  });
}

/**
 * The chunk's own commits as the archive writes them (`first..last`, 8 characters): through a pull request, the merge's
 * branch side; pushed straight to main, the first-parent run back from the pending file's commit to the last merge,
 * settle, other pending close or archive write (a close made before the repo settled, so a first settle never reaches
 * back across old history). A plot commit (plotsIn) bounds the run as a close does and is in no chunk's range, so
 * back-to-back chunks in one worktree, and a `/plot ... and do`, never get ranges that cross; a plot commit that is a
 * pending file alone (answers editing the roadmap mid-chunk) is passed over like any lone pending file. A run landing
 * from a worktree (its close not on origin/`branch` yet) stops at what origin/`branch` already holds: another
 * session's commit pushed between two settles is not this chunk's. The pending file's own commit counts when it
 * carries work too, or when nothing else does.
 */
export function commitRange(cwd, file, { branch = 'main' } = {}) {
  const c = git(['log', '-1', '--diff-filter=A', '--format=%H', '--', file], cwd);
  if (!c) return null;
  const short = (h) => h.slice(0, 8);
  const firstParent = new Set(git(['rev-list', '--first-parent', 'HEAD'], cwd).split('\n'));
  let list = [];
  if (!firstParent.has(c)) {
    // The first merge on main's first-parent line that brought c in. (`--first-parent` with `--ancestry-path` lists
    // nothing for a commit off the first-parent line, so the two lists are crossed instead.)
    const brought = new Set(git(['rev-list', '--merges', '--ancestry-path', `${c}..HEAD`], cwd).split('\n').filter(Boolean));
    const merge = git(['rev-list', '--first-parent', '--merges', 'HEAD'], cwd).split('\n').filter((h) => brought.has(h)).at(-1);
    if (merge) list = git(['rev-list', '--no-merges', '--topo-order', '--reverse', `${merge}^1..${merge}^2`], cwd).split('\n').filter(Boolean);
    // A package (one pull request, several closes): this chunk's run is the commits after the close (or plot) before
    // it, through its own close, plus the review fixes after it when it is the branch's last close.
    const closes = list.map((h, i) => [h, i]).filter(([h]) => h !== c && (closesIn(cwd, h) || plotsIn(cwd, h)));
    const at = list.indexOf(c);
    if (at >= 0 && closes.length) {
      const before = closes.filter(([, i]) => i < at).at(-1)?.[1] ?? -1;
      const after = closes.find(([, i]) => i > at)?.[1];
      list = list.slice(before + 1, after === undefined ? list.length : at + 1);
    }
  } else {
    // A root commit has nothing before it to read.
    const rootCommit = git(['rev-list', '--max-parents=0', 'HEAD'], cwd).split('\n').includes(c);
    // Settled on main after the push, origin holds the close too: no bound then, the run reads as before.
    const upstream = upstreamOf(cwd, branch);
    const landing = upstream !== null && !isAncestor(cwd, c, upstream);
    for (const h of rootCommit ? [] : git(['rev-list', '--first-parent', '-n', '60', `${c}^`], cwd).split('\n').filter(Boolean)) {
      if (landing && isAncestor(cwd, h, upstream)) break;
      // A root commit's %P is empty, and the trim takes the tab with it: no tab, no parents.
      const shown = git(['show', '-s', '--format=%P%x09%s', h], cwd);
      const [parents, subject] = shown.includes('\t') ? shown.split('\t') : ['', shown];
      if (parents.includes(' ') || subject.startsWith('plan: settle')) break;
      const names = git(['show', '--name-only', '--format=', h], cwd).split('\n').filter(Boolean);
      // A close written straight into the archive (before the repo settled) bounds the run as a settle does.
      if (names.includes('plan/ARCHIVE.md')) break;
      // Another chunk's close bounds the run; a lone pending file (a decision, a footgun, an archive fix) is this run's.
      if (closesIn(cwd, h, names)) break;
      // A plot (its spec and pending file, a re-quote of its row) is no chunk's: it bounds the run as a close does. One
      // that is a pending file alone is passed over as any lone pending file is (and is never the range's first).
      if (plotsIn(cwd, h, names) && !names.every((n) => n.startsWith('plan/pending/'))) break;
      list.unshift(h);
    }
    // The close's own commit is work too when it touches more than plan/pending/ (the work and its close in one).
    list.push(c);
  }
  const touches = (h) => git(['show', '--name-only', '--format=', h], cwd).split('\n').filter(Boolean);
  const work = list.filter((h) => !touches(h).every((n) => n.startsWith('plan/pending/')));
  const pick = work.length ? work : [c];
  return `${short(pick[0])}..${short(pick.at(-1))}`;
}

const USAGE = 'usage: node scripts/plan/settle.mjs [--dry-run | --no-commit]';

/** Why this checkout may not settle (not the owner, or on a branch other than the config's), or null. */
export function settleRefusal(root, cfg, { owner = isOwner(root) } = {}) {
  if (!owner) return 'settle: only the owner settles (an untracked .owner at the primary checkout, owner mode on); a contributor lands pending files through a pull request';
  let branch = '';
  try {
    branch = git(['symbolic-ref', '--short', '-q', 'HEAD'], root);
  } catch {
    // detached: a worktree of origin/main
  }
  if (branch && branch !== cfg.branch) return `settle: runs on ${cfg.branch} (or a detached worktree of origin/${cfg.branch}), not on ${branch}`;
  return null;
}

export function main(argv, { cwd = process.cwd(), owner } = {}) {
  // Only --dry-run and --no-commit are arguments: anything else (a `--help`) is refused before a write.
  const unknown = argv.filter((a) => a !== '--dry-run' && a !== '--no-commit');
  if (unknown.length || (argv.includes('--dry-run') && argv.includes('--no-commit'))) {
    console.error(`settle: ${unknown.length ? `unknown argument ${unknown.join(' ')}` : '--dry-run and --no-commit together'}\n${USAGE}`);
    return 64;
  }
  const dry = argv.includes('--dry-run');
  const noCommit = argv.includes('--no-commit');
  const root = git(['rev-parse', '--show-toplevel'], cwd);
  let cfg;
  try {
    cfg = loadConfig(root);
  } catch (e) {
    console.error(`settle: ${e.message}`);
    return 64;
  }
  const files = pendingFiles(root);
  if (!files.length) {
    console.log('settle: nothing pending');
    return 0;
  }
  if (!dry) {
    const refusal = settleRefusal(root, cfg, owner === undefined ? {} : { owner });
    if (refusal) {
      console.error(refusal);
      return 3;
    }
  }
  const cache = new Map();
  const abs = (p) => path.join(root, p);
  const read = (p) => (cache.has(p) ? cache.get(p) : fs.existsSync(abs(p)) ? fs.readFileSync(abs(p), 'utf8').replace(/\r\n/g, '\n') : null);
  // The specs as this run leaves them: on disk or written by an earlier pending file, less any it removed (null).
  const specFiles = () =>
    [...new Set([...fs.readdirSync(abs('plan')).map((f) => `plan/${f}`), ...cache.keys()])].filter((f) => /^plan\/\d{2,}-[^/]*\.md$/.test(f) && read(f) !== null).sort();
  const specOf = (id) => specFiles().find((f) => f.startsWith(`plan/${specNum(id)}-`)) ?? null;
  const allListed = () => specFiles().flatMap((f) => listedChunks(read(f)));
  const decisionMax = () =>
    fs.existsSync(abs(cfg.decisions))
      ? Math.max(0, ...fs.readdirSync(abs(cfg.decisions)).flatMap((f) => [...(read(`${cfg.decisions}/${f}`) ?? '').matchAll(/\*\*D(\d+)\*\*/g)].map((m) => Number(m[1]))))
      : 0;
  const ladderFile = `plan/${cfg.ladder.file}`;

  // The settle date, in this machine's zone: Watch's age rule counts from it.
  const today = new Date().toLocaleDateString('en-CA');
  const parsed = [];
  const skipped = [];
  for (const f of files) {
    try {
      parsed.push({ ...parsePending(f.text, f.file, cfg), file: f.file });
    } catch (e) {
      skipped.push(e.message);
    }
  }
  const order = settleOrder(parsed);

  const settled = [];
  const notes = [];
  const leftovers = [];
  const renumbers = new Map();
  // A close whose chunk isn't listed (yet): a file still to settle may add it.
  const unlisted = (message) => Object.assign(new Error(message), { unlisted: true });
  // One pending file into the cache, or an error and nothing written: its notes and numbers count only once it settles.
  const settleOne = (p) => {
    const tx = new Map();
    const r = (q) => (tx.has(q) ? tx.get(q) : read(q));
    const w = (q, t) => tx.set(q, t);
    const queueOf = () => (cfg.queue ? r(cfg.queue) : null);
    const said = [];
    const left = [];
    const gave = new Map();
    // A pending file's edits are written against main as it was, before its close: applied first, so a close that
    // rewrites a line (a later chunk's `needs`, the measure) never moves an edit's anchor out from under it.
    const numbered = applyPlanChanges(p, r, w);
    said.push(...[...numbered].map(([k, v]) => `${k} is ${v}`));
    // The numbers go into the file's own notes, decisions and footgun lines too (a decision naming the chunk it set up).
    const given = (t) => t.replace(PLACEHOLDER, (k) => numbered.get(k) ?? k);
    p.notes = p.notes.map(given);
    p.decisions = p.decisions.map(given);
    p.newFootguns = p.newFootguns.map(given);
    if (p.close) {
      const specFile = specOf(p.close);
      const archive = r('plan/ARCHIVE.md') ?? '';
      if (archive.includes(` · ${p.close} · `) && !(specFile && listedChunks(r(specFile)).includes(p.close))) {
        said.push(`${p.close}: already archived; its pending file goes`);
      } else {
        if (!specFile) throw unlisted(`${p.file}: no spec plan/${specNum(p.close)}-*.md lists ${p.close}`);
        const done = closeChunk(r(specFile), p.close);
        if (!done) throw unlisted(`${p.file}: ${specFile} doesn't list ${p.close}`);
        w(specFile, done.text);
        for (const f of specFiles().filter((x) => x !== specFile)) {
          const before = r(f);
          if (before === null) continue;
          const after = dropNeeds(before, p.close);
          if (after !== before) {
            w(f, after);
            said.push(`${p.close} left the needs in ${f}`);
          }
        }
        const listed = allListed().filter((x) => x !== p.close);
        if (r('plan/README.md') !== null) {
          w('plan/README.md', setLeft(r('plan/README.md'), path.basename(specFile), listedChunks(done.text).length));
          const t = tidyAhead(r('plan/README.md'), queueOf(), p.close, listed, cfg);
          w('plan/README.md', t.readme);
          if (cfg.queue && t.queue !== null) w(cfg.queue, t.queue);
          said.push(...t.changed.map((c) => `${p.close} tidied ${c}`));
          left.push(...stillNamed(t.readme, t.queue, p.close, cfg).map((where) => `${where} still names ${p.close}: take it out by hand`));
        }
        if (listedChunks(done.text).length) {
          // Chunks left: nothing more.
        } else if (specFile === ladderFile) {
          // The ladder's home holds nothing of its own to absorb: settle takes it and its rows out, and opens it
          // again when the next trap is seen twice.
          w(ladderFile, null);
          const rows = closeLadderRows({ readme: r('plan/README.md'), queue: queueOf(), root: r('README.md') }, cfg);
          for (const [file, text] of [['plan/README.md', rows.readme], [cfg.queue, rows.queue], ['README.md', rows.root]]) {
            if (file && text !== null && text !== r(file)) w(file, text);
          }
          said.push(`spec ${cfg.ladder.spec} lists no chunk now: settle removed it and its rows (the next trap seen twice opens it again)`);
        } else if (/^## Acceptance\b/m.test(done.text)) {
          // Chunks closed out, but acceptance bullets remain uncovered: plan-check's own "no chunks" rule
          // carries it from here (needs more chunks, not an absorb) — nothing for settle to do.
          said.push(`spec ${specNum(p.close)} has no chunks left but open acceptance: chunk it next`);
        } else {
          // Nothing left at all: plan-check refuses to commit an empty spec by design (its own "nothing left"
          // rule), so settle stops here instead of attempting the commit and dying on that refusal.
          left.push(`${specFile} lists no chunk now: absorb its lasting rules into identity/ (or bearings.md), delete the file, drop its plan/README.md row, and archive "· ${specNum(p.close)} · spec complete: …" by hand, then re-run settle`);
        }
        const range = p.commits ?? commitRange(root, p.file, { branch: cfg.branch }) ?? 'plan only';
        w('plan/ARCHIVE.md', `${archive.replace(/\n*$/, '\n')}- ${p.date} · ${p.close} · ${p.says} · ${range}\n`);
      }
    }
    if (p.notes.length) w(cfg.notes, addNotes(r(cfg.notes) ?? '', p.notes));
    if (p.decisions.length) {
      const year = `${cfg.decisions}/${p.date.slice(0, 4)}.md`;
      const before = r(year) ?? '';
      const maxNow = Math.max(decisionMax(), ...[...renumbers.values()].map((d) => Number(d.slice(1))));
      const out = numberDecisions(before, p.decisions, maxNow);
      w(year, out.text);
      for (const [k, v] of out.numbers) gave.set(k, v);
      said.push(...[...out.numbers].map(([k, v]) => `${k} is ${v}`));
    }
    const fgBefore = read(cfg.footguns);
    if (fgBefore === null) {
      if (p.footguns.length || p.newFootguns.length) throw new Error(`${p.file}: no ${cfg.footguns} to settle its footguns into (adopt the footgun list first)`);
    } else {
      let fg;
      try {
        fg = settleFootguns(r(cfg.footguns), { add: p.newFootguns, footguns: p.footguns, date: p.date, today }, cfg);
      } catch (e) {
        throw new Error(`${p.file}: ${e.message}`);
      }
      const footguns = fg.text;
      for (const { slug, seen } of fg.ladder) {
        const taken = [...(r('plan/ARCHIVE.md') ?? '').matchAll(new RegExp(`· (${esc(cfg.ladder.spec)}\\.\\w+) ·`, 'g'))].map((m) => m[1]);
        // Gone (absorbed, or emptied by its last close): settle opens it again, its ids carrying on past the archive's.
        const had = r(ladderFile);
        const add = ladderChunk(had ?? ladderSpec(nextLadderNumber(taken, cfg), cfg), slug, seen, taken, cfg);
        if (!add) continue;
        w(ladderFile, add.text);
        if (had === null) {
          const rows = openLadderRows({ readme: r('plan/README.md'), queue: queueOf(), root: r('README.md') }, cfg);
          if (rows.readme !== null && rows.readme !== r('plan/README.md')) w('plan/README.md', rows.readme);
          if (cfg.queue && rows.queue !== null && rows.queue !== queueOf()) w(cfg.queue, rows.queue);
          if (rows.root !== null && rows.root !== r('README.md')) w('README.md', rows.root);
          said.push(`spec ${cfg.ladder.spec} opened for the ladder, with its rows`);
        }
        if (r('plan/README.md') !== null) {
          w('plan/README.md', laneEntry(setLeft(r('plan/README.md'), cfg.ladder.file, listedChunks(add.text).length), add.id, slug, seen, cfg));
        }
        said.push(`footgun ${slug} seen ${seen}×: ${add.id} automates it (Asap lane)`);
      }
      // A safety net: settle keeps Open in budget (or over it only with lines seen twice), so the lint has nothing
      // new. Measured from the list before this pending file, so its own `## Edit` of a footgun line is held to it too.
      const refusal = footgunsRefusal(fgBefore, footguns, cfg);
      if (refusal) throw new Error(`${p.file}: ${refusal}`);
      said.push(...fg.notes);
      if (footguns !== fgBefore) w(cfg.footguns, footguns);
    }
    for (const [q, t] of tx) cache.set(q, t);
    notes.push(...said);
    leftovers.push(...left);
    for (const [k, v] of gave) renumbers.set(k, v);
    settled.push(p);
  };
  const skip = (e) => {
    if (process.env.NEXUS_DEBUG) console.error(e.stack);
    skipped.push(e.message);
  };
  // Date order, adds before closes within a date (settleOrder). A close whose chunk isn't listed waits while a file
  // that adds work is still to settle, and tries again after each one: a plot dated after the close numbers it first.
  let waiting = [];
  for (let i = 0; i < order.length; i++) {
    const more = order.slice(i + 1).some(addsWork);
    const attempt = (p, held) => {
      try {
        settleOne(p);
        return true;
      } catch (e) {
        if (e.unlisted && more) held.push(p);
        else skip(e);
        return false;
      }
    };
    if (!attempt(order[i], waiting) || !addsWork(order[i])) continue;
    const again = waiting;
    waiting = [];
    for (const p of again) attempt(p, waiting);
  }
  // Held for an adding file that then failed to settle: the close's own error says why.
  for (const p of waiting) {
    try {
      settleOne(p);
    } catch (e) {
      skip(e);
    }
  }

  // D?slug wherever the repo says it (a spec, a code comment), once every decision has its number.
  if (renumbers.size) {
    const hits = new Set();
    for (const key of renumbers.keys()) {
      try {
        git(['grep', '-l', '-F', key], root).split('\n').filter(Boolean).forEach((f) => hits.add(f.replace(/\\/g, '/')));
      } catch {
        // git grep exits 1 when nothing matches
      }
    }
    for (const f of hits) if (!f.startsWith('plan/pending/') && read(f) !== null) cache.set(f, renumber(read(f), renumbers));
    for (const [f, t] of cache) if (t !== null) cache.set(f, renumber(t, renumbers));
  }

  for (const s of skipped) console.log(`settle: skipped ${s}`);
  for (const n of notes) console.log(`settle: ${n}`);
  for (const l of leftovers) console.log(`settle: ${l}`);
  if (!settled.length) {
    console.log('settle: nothing settled');
    return skipped.length ? 1 : 0;
  }
  const ids = settled.map((p) => p.close ?? path.basename(p.file, '.md'));
  const message = `plan: settle ${ids.join(', ')}`;
  if (dry) {
    console.log(`settle: (dry run) would write ${[...cache.keys()].join(', ')} and delete ${settled.map((p) => p.file).join(', ')}`);
    return 0;
  }
  // A null text is a file the run removed (the ladder spec emptied); one it opened and removed again was never there.
  const atHead = (f) => git(['ls-tree', '--name-only', 'HEAD', '--', f], root) !== '';
  for (const [f, t] of cache) {
    if (t !== null) {
      fs.mkdirSync(path.dirname(abs(f)), { recursive: true });
      fs.writeFileSync(abs(f), t);
    } else if (fs.existsSync(abs(f))) fs.rmSync(abs(f));
  }
  const written = [...cache.keys()].filter((f) => cache.get(f) !== null || atHead(f));
  for (const p of settled) {
    fs.rmSync(abs(p.file));
    git(['rm', '-q', '--cached', '--ignore-unmatch', '--', p.file], root);
  }
  if (written.length) git(['add', '--', ...written], root);
  const paths = [...written, ...settled.map((p) => p.file).filter((f) => git(['ls-files', '--', f], root) === '' && git(['ls-tree', '--name-only', 'HEAD', '--', f], root) !== '')];
  const subject = message.length > 72 ? `plan: settle ${ids.length} pending files` : message;
  const commitArgs = message.length > 72 ? ['commit', '-q', '-m', subject, '-m', ids.join(', ')] : ['commit', '-q', '-m', subject];
  if (leftovers.length || noCommit) {
    const how = `git ${commitArgs.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')} -- ${paths.join(' ')}`;
    console.log(leftovers.length ? `settle: staged, not committed. Fix the lines above, then: ${how}` : `settle: staged, not committed (--no-commit). Run the gate, then: ${how}`);
    return leftovers.length ? 2 : skipped.length ? 1 : 0;
  }
  git([...commitArgs, '--', ...paths], root);
  console.log(`settle: committed ${git(['log', '-1', '--format=%h %s'], root)}`);
  return skipped.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
