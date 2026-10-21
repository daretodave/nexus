// scripts/plan/triage-match.mjs: which open spec an issue belongs to, and whether an open pull request already covers
// it. /triage runs it before routing: a match is filed as an `## Add` to that spec (plan/pending/README.md), a covered
// issue gets "Already in PR #N", and anything else routes as before. The script ranks; the skill judges.
//
// Matching is keywords, scored. Each spec in plan/ (an absorbed spec is gone from it, so every file there is open)
// gives terms from its title (weight 3), its open chunk lines' titles (2) and its `## Design` (1). An issue term found
// in a spec scores that weight times how rare the term is across the specs (1 + ln(specs / specs holding it)). An
// issue naming the spec outright (`plan/NN-…`, `spec NN`, a chunk id `NN.x`) adds 10. A spec matches at the threshold
// (6) with at least two terms hit, or when named. The verdict: `spec` (one match, or the best leads the next by half
// again), `ambiguous` (the skill decides), `none`.
//
// Coverage: an open pull request's pending files (the `+` lines of `gh pr diff` under plan/pending/) cover the issue
// when they name it (`#N` or its URL), or when they add to the matched spec (`pendingSpecs`) with text that scores at
// the threshold against the issue. gh is only read here (pr list, pr diff, issue view); tests inject the lister.
//
//   node scripts/plan/triage-match.mjs <issue-number> [--text "<title and body>"] [--threshold 6] [--no-prs] [--json]
//
// Without a number, --text is the issue. Exit 0 with a verdict, 64 on bad usage, 3 when gh can't be read.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { SPEC_FILE } from '../plan-check.mjs';
import { pendingSpecs } from './pending.mjs';
import { planReader } from './progress.mjs';

export const THRESHOLD = 6;
const NAMED = 10;
const WEIGHT = { title: 3, chunk: 2, design: 1 };

// Words every spec and issue share: they say nothing about which spec an issue is about.
const STOP = new Set(
  ('a about above after again all also an and any are as at be been before being both but by can could did do does ' +
    'doesn each else every for from had has have here how if in into is it its just like make makes may more most ' +
    'must no not now of on once one only or other our out over same should so some still such than that the their ' +
    'them then there these they this those through to too under up very was we were what when where which while who ' +
    'why will with within without would you your get gets got new now use used uses using way ways want wants ' +
    'spec specs chunk chunks plan plans issue issues file files line lines open close closes closed needs need test ' +
    'tests work works thing things says said read reads write writes run runs nexus kit repo time first next last')
    .split(/\s+/),
);

/** The words of a text that can carry meaning: lower case, four letters or more, no stop word, a plural's s dropped. */
export function terms(text) {
  const out = new Set();
  for (const w of String(text).toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length < 4 || STOP.has(w) || /^\d+$/.test(w)) continue;
    const t = w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
    if (!STOP.has(t)) out.add(t);
  }
  return out;
}

/** One spec's terms by weight: { file, num, title, weights: Map<term, weight>, chunkIds: string[] }. */
export function specTerms(file, text) {
  const src = text.replace(/\r\n/g, '\n');
  const num = SPEC_FILE.exec(file)?.[1] ?? '';
  const title = (/^# (.+)$/m.exec(src)?.[1] ?? '').trim();
  const design = (/^## Design\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(src)?.[1] ?? '');
  const chunks = [...src.matchAll(/^- \[ \] \*\*(\d{2,}\.\w+)\*\* (.+?)(?: · |$)/gm)];
  const weights = new Map();
  const put = (t, w) => weights.set(t, Math.max(weights.get(t) ?? 0, w));
  for (const t of terms(title)) put(t, WEIGHT.title);
  for (const [, , line] of chunks) for (const t of terms(line)) put(t, WEIGHT.chunk);
  for (const t of terms(design)) put(t, WEIGHT.design);
  return { file: `plan/${file}`, num, title, weights, chunkIds: chunks.map((c) => c[1]) };
}

/** Every spec file in plan/, read through planReader (the working tree, or a ref). */
export function openSpecs(reader) {
  return reader
    .names()
    .filter((n) => SPEC_FILE.test(n))
    .sort()
    .map((n) => specTerms(n, reader.read(n)));
}

/** Does the issue name this spec outright: its file, `spec NN`, or one of its chunk ids? */
function named(text, spec) {
  if (!spec.num) return false;
  const n = String(Number(spec.num));
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`\\bplan/${esc(spec.num)}-`).test(text)) return true;
  if (new RegExp(`\\bspec (?:${esc(spec.num)}|${n})\\b`, 'i').test(text)) return true;
  return spec.chunkIds.some((id) => new RegExp(`(^|[^\\w.])${esc(id)}(?![\\w])`).test(text));
}

/** Score an issue against the specs: [{ file, title, score, hits, named }], best first, every spec listed. */
export function scoreIssue(text, specs) {
  const words = terms(text);
  const df = new Map();
  for (const s of specs) for (const t of s.weights.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const n = specs.length || 1;
  return specs
    .map((s) => {
      let score = 0;
      const hits = [];
      for (const t of words) {
        const w = s.weights.get(t);
        if (!w) continue;
        score += w * (1 + Math.log(n / df.get(t)));
        hits.push(t);
      }
      const isNamed = named(text, s);
      if (isNamed) score += NAMED;
      return { file: s.file, title: s.title, score: Math.round(score * 10) / 10, hits, named: isNamed };
    })
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
}

/** Matches at the threshold: two terms hit, or the spec named. */
export function matches(scored, threshold = THRESHOLD) {
  return scored.filter((m) => m.named || (m.score >= threshold && m.hits.length >= 2));
}

/** The text a diff adds under plan/pending/ (what an open pull request plans without touching a spec). */
export function pendingDiffText(diff) {
  const out = [];
  let inPending = false;
  for (const line of diff.replace(/\r\n/g, '\n').split('\n')) {
    const head = /^diff --git a\/\S+ b\/(\S+)/.exec(line);
    if (head) inPending = head[1].startsWith('plan/pending/') && head[1] !== 'plan/pending/README.md';
    else if (inPending && line.startsWith('+') && !line.startsWith('+++')) out.push(line.slice(1));
  }
  return out.join('\n');
}

/** Open pull requests with pending files, read through gh (read only): [{ number, text }]. */
export function ghPendingPrs(gh = ghRead) {
  const prs = JSON.parse(gh(['pr', 'list', '--state', 'open', '--json', 'number,files', '--limit', '100']) || '[]');
  return prs
    .filter((p) => (p.files ?? []).some((f) => String(f.path).startsWith('plan/pending/')))
    .map((p) => ({ number: p.number, text: pendingDiffText(gh(['pr', 'diff', String(p.number)])) }));
}

/** The pull request whose pending files cover the issue, or null. */
export function coveringPr(issue, best, prs, threshold = THRESHOLD) {
  const ref = issue.number ? new RegExp(`(^|[^\\w&])#${issue.number}(?!\\d)`) : null;
  for (const pr of prs) {
    if (ref?.test(pr.text) || (issue.url && pr.text.includes(issue.url))) return { number: pr.number, why: `names #${issue.number}` };
  }
  if (!best) return null;
  for (const pr of prs) {
    if (!pendingSpecs(pr.text).includes(best.file)) continue;
    const added = { file: best.file, num: '', title: '', weights: new Map([...terms(pr.text)].map((t) => [t, WEIGHT.chunk])), chunkIds: [] };
    const [m] = scoreIssue(`${issue.title ?? ''}\n${issue.body ?? ''}`, [added]);
    if (m.score >= threshold && m.hits.length >= 2) return { number: pr.number, why: `adds to ${best.file}: ${m.hits.join(', ')}` };
  }
  return null;
}

/**
 * The whole call: { verdict: 'covered' | 'spec' | 'ambiguous' | 'none', spec, pr, matches }.
 * `listPrs` returns the open pull requests' pending text ([{ number, text }]); pass () => [] to skip them.
 */
export function triageMatch(issue, specs, { listPrs = ghPendingPrs, threshold = THRESHOLD } = {}) {
  const text = `${issue.title ?? ''}\n${issue.body ?? ''}`;
  const found = matches(scoreIssue(text, specs), threshold);
  const [best, second] = found;
  const clear = Boolean(best) && (!second || (best.named && !second.named) || best.score >= second.score * 1.5);
  const pr = coveringPr(issue, clear ? best : null, listPrs(), threshold);
  if (pr) return { verdict: 'covered', spec: clear ? best : null, pr, matches: found };
  if (!best) return { verdict: 'none', spec: null, pr: null, matches: found };
  return { verdict: clear ? 'spec' : 'ambiguous', spec: clear ? best : null, pr: null, matches: found };
}

/** One verdict, as /triage reads it. */
export function render(issue, r) {
  const who = issue.number ? `#${issue.number}` : 'the issue';
  const lines = [];
  if (r.verdict === 'covered') lines.push(`${who}: Already in PR #${r.pr.number} (${r.pr.why})`);
  else if (r.verdict === 'spec') lines.push(`${who}: inside ${r.spec.file} (${r.spec.title}), score ${r.spec.score}${r.spec.named ? ', named' : ''}: add to it`);
  else if (r.verdict === 'ambiguous') lines.push(`${who}: more than one open spec fits; pick one or route as before`);
  else lines.push(`${who}: no open spec fits; route as before`);
  for (const m of r.matches) lines.push(`  ${m.file}  ${m.score}${m.named ? ' named' : ''}  ${m.hits.join(', ')}`);
  return lines.join('\n');
}

function ghRead(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

const USAGE = 'usage: node scripts/plan/triage-match.mjs <issue-number> [--text "<title and body>"] [--threshold N] [--no-prs] [--json]';

async function main(argv) {
  const at = (flag) => {
    const i = argv.indexOf(flag);
    return i < 0 ? undefined : argv[i + 1];
  };
  const textArg = at('--text');
  const thrArg = at('--threshold');
  const threshold = thrArg === undefined ? THRESHOLD : Number(thrArg);
  const number = argv.find((a, i) => /^\d+$/.test(a) && !['--text', '--threshold'].includes(argv[i - 1]));
  if ((argv.includes('--text') && textArg === undefined) || !(threshold > 0) || (!number && textArg === undefined)) {
    console.error(USAGE);
    return 64;
  }
  let issue = { number: number ? Number(number) : null, title: '', body: textArg ?? '', url: '' };
  const noPrs = argv.includes('--no-prs');
  try {
    if (number && textArg === undefined) issue = { ...issue, ...JSON.parse(ghRead(['issue', 'view', number, '--json', 'number,title,body,url'])) };
    const specs = openSpecs(planReader(process.cwd()));
    const r = triageMatch(issue, specs, { threshold, listPrs: noPrs ? () => [] : ghPendingPrs });
    if (argv.includes('--json')) console.log(JSON.stringify({ issue: issue.number, ...r }, null, 2));
    else console.log(render(issue, r));
    return 0;
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.status !== undefined)) {
      console.error(`triage-match: gh could not be read (${String(e.stderr || e.message).trim().split('\n')[0]})`);
      return 3;
    }
    throw e;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (e) => {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    },
  );
}
