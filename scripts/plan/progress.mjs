#!/usr/bin/env node
// scripts/plan/progress.mjs: where a spec stands, for `/next status`, `/heads-down` and each loop iteration's report.
//
// One block per spec: a 24-character bar over its chunks (closed = an ARCHIVE.md line or a pending close; open = still
// listed in the spec), the last closed chunks struck through, the chunk under way marked `<--- [here]` with how long
// it has been under way (read from the claims branch's history), the chunks after it with when they would come up
// (from their sizes: S 1 h, M 2.5 h, L 5 h), and the notice board's newest lines when the repo has one. Nothing is
// written; nothing is marked seen.
//
//   node scripts/plan/progress.mjs [spec…] [--ref <ref>] [--all-closed]
//
// With no spec: the specs this session holds claims in, else every spec someone holds a live claim in. `--ref
// origin/main` reads the plan at that ref instead of the working tree (`/heads-down` reads main just fetched, never a
// primary checkout that may be behind). Needs git; works with no claims branch (nothing is under way then).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pendingArchiveLines, pendingAtRef, pendingFiles } from './pending.mjs';

/** Hours a chunk of each size takes (S about an hour, M a few, L one long session): an estimate, never a promise. */
export const HOURS = { S: 1, M: 2.5, L: 5 };
/** Closed chunks shown before the open ones; earlier ones are counted, not listed. */
export const SHOWN_CLOSED = 5;
export const BAR = 24;
const ID = String.raw`\d{2,}\.\d+[a-z0-9]*`;

/** A spec file's open chunks, in its order: [{ id, text, size }] (a wrapped chunk line joined). */
export function openChunks(spec) {
  const out = [];
  const lines = spec.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = new RegExp(`^- \\[ \\] \\*\\*(${ID})\\*\\*\\s*(.*)$`).exec(lines[i]);
    if (!m) continue;
    let body = m[2];
    for (let j = i + 1; j < lines.length && /^ {2}\S/.test(lines[j]) && !/^ {2}- /.test(lines[j]); j++) body += ` ${lines[j].trim()}`;
    const sized = /^(.*?) · ([SML])\b/.exec(body);
    out.push({ id: m[1], text: short(sized ? sized[1] : body), size: sized ? sized[2] : null });
  }
  return out;
}

/** A chunk's words as a short plain title: up to its first colon, semicolon or bracket, 64 characters at most. */
export function short(text) {
  const t = text.replace(/[`*]/g, '').trim();
  const cut = t.search(/[:;(]/);
  const head = cut > 8 ? t.slice(0, cut).trim() : t;
  return head.length > 64 ? `${head.slice(0, 63).trimEnd()}...` : head;
}

/** ARCHIVE.md's lines for one spec's chunks: [{ id, day, text }] in order. */
export function closedChunks(archive, spec) {
  const re = new RegExp(`^- (\\d{4}-\\d{2}-\\d{2}) · (${spec}\\.\\d+[a-z0-9]*) · (.*?)\\s*$`, 'gm');
  return [...archive.replace(/\r\n/g, '\n').matchAll(re)].map((m) => ({
    id: m[2],
    day: m[1],
    text: m[3].replace(/ · [0-9a-f]{7,}(\.\.[0-9a-f]{7,})?$/, '').replace(/ · \(this commit\)$/, ''),
  }));
}

/** The claims branch's log (`%cI<TAB>%s` lines) as [{ at: ms, verb, ids }], newest first. */
export function claimEvents(log) {
  return log
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [at, subject = ''] = line.split('\t');
      const m = /^(\w+) (.*?)(?: · .*)?$/.exec(subject);
      return { at: Date.parse(at), verb: m?.[1] ?? '', ids: [...(m?.[2] ?? '').matchAll(new RegExp(ID, 'g'))].map((x) => x[0]) };
    });
}

/**
 * When work on `id` began: its latest claim (or assignment), or, when a group claim took it beside its spec's earlier
 * chunks, the latest release of one of those after that claim (a loop moves on when it lands one). Null if unclaimed.
 */
export function startedAt(id, events) {
  const spec = id.split('.')[0];
  const claimed = events.find((e) => (e.verb === 'claim' || e.verb === 'assign') && e.ids.includes(id));
  if (!claimed) return null;
  const moved = events.filter((e) => e.at > claimed.at && e.verb === 'release' && e.ids.some((x) => x !== id && x.startsWith(`${spec}.`)));
  return Math.max(claimed.at, ...moved.map((e) => e.at));
}

export const hours = (h) => (h < 1 ? `${Math.max(5, Math.round((h * 60) / 5) * 5)} min` : `${Math.round(h * 2) / 2} h`);

/** `[####....] 2 of 5 chunks · 40%`, BAR characters wide. ASCII only: it prints the same in every terminal. */
export function bar(done, total, width = BAR) {
  const filled = total ? Math.round((done / total) * width) : 0;
  return `[${'#'.repeat(filled)}${'.'.repeat(width - filled)}] ${done} of ${total} chunks · ${total ? Math.round((done / total) * 100) : 0}%`;
}

/** live, stale, pr or held: the claims rules (scripts/claims-codec.mjs), inlined so this file reads without them. */
function claimState(c, now) {
  if (c.pr) return 'pr';
  if (c.held) return 'held';
  const t = Date.parse(c.at);
  return Number.isFinite(t) && now - t < 24 * 3_600_000 ? 'live' : 'stale';
}

function whose(claim) {
  if (claim.held) return `held for ${claim.who} (@${claim.held})`;
  return claim.who === 'privileged_agent_session' ? "the owner's loop" : `${claim.who}'s`;
}

/**
 * One spec's progress as lines. `claims`: { id: parsed claim }; `mine(claim)`: whether this session holds it;
 * `events`: claimEvents(); `now`: ms.
 */
export function render({ spec, title, closed, open, claims = {}, events = [], now = Date.now(), mine = () => false, allClosed = false }) {
  const total = closed.length + open.length;
  const lines = [`Spec ${spec}${title ? ` · ${title}` : ''}`, bar(closed.length, total), '-'.repeat(BAR)];
  const shown = allClosed ? closed : closed.slice(-SHOWN_CLOSED);
  if (shown.length < closed.length) lines.push(`- [${closed.length - shown.length} earlier closed, ${shown.length} shown]`);
  for (const c of shown) lines.push(`- ~~${c.id} ${c.text}~~ (closed ${c.day.slice(5)})`);
  // A long hold on the spec's number holds every chunk with no claim of its own (a spec and its chunks exclude each other).
  const specHold = claims[spec]?.held ? claims[spec] : null;
  const held = open.filter((c) => claims[c.id] && ['live', 'pr'].includes(claimState(claims[c.id], now)));
  const here = held.find((c) => mine(claims[c.id])) ?? held[0] ?? null;
  const hereClaim = here ? claims[here.id] : null;
  // Chunks the same claimant holds in the same session come after the one under way, in its loop: they get times.
  const sameLoop = (c) => Boolean(hereClaim && c && c.who === hereClaim.who && c.session && c.session === hereClaim.session);
  let clock = 0;
  let after = false;
  for (const c of open) {
    const claim = claims[c.id] ?? specHold;
    const size = c.size ? ` (${c.size})` : '';
    if (c === here) {
      const since = startedAt(c.id, events);
      const spent = since ? (now - since) / 3_600_000 : 0;
      clock = Math.max((HOURS[c.size] ?? HOURS.M) - spent, 0.25);
      const who = mine(claim) ? '' : `, ${whose(claim)}`;
      lines.push(`- ${c.id} ${c.text}${size} · under way${since ? ` for about ${hours(spent)}` : ''}${claim.pr ? `, PR #${claim.pr} waiting on review` : ''}${who} <--- [here]`);
      after = true;
      continue;
    }
    if (claim && !mine(claim) && !sameLoop(claim) && (claim.held || claimState(claim, now) !== 'stale')) {
      lines.push(`- ${c.id} ${c.text}${size} · ${claim.pr ? `PR #${claim.pr}, ` : ''}${whose(claim)}${claim === specHold ? ', the whole spec' : ''}`);
      continue;
    }
    if (after && claim && (mine(claim) || sameLoop(claim))) {
      lines.push(`- ${c.id} ${c.text}${size} · coming up in about ${hours(clock)}`);
      clock += HOURS[c.size] ?? HOURS.M;
    } else lines.push(`- ${c.id} ${c.text}${size} · not claimed yet`);
  }
  return lines;
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

/** Read plan files from the working tree, or from `ref` when one is given. */
export function planReader(cwd, ref) {
  if (!ref) {
    return {
      names: () => (fs.existsSync(path.join(cwd, 'plan')) ? fs.readdirSync(path.join(cwd, 'plan')) : []),
      read: (name) => fs.readFileSync(path.join(cwd, 'plan', name), 'utf8'),
      pending: () => pendingFiles(cwd),
    };
  }
  return {
    names: () => git(['ls-tree', '--name-only', `${ref}:plan`], cwd).split('\n').filter(Boolean),
    read: (name) => git(['show', `${ref}:plan/${name}`], cwd),
    pending: () => pendingAtRef(cwd, ref),
  };
}

async function main(argv) {
  const cwd = process.cwd();
  const at = argv.indexOf('--ref');
  const ref = at >= 0 ? argv[at + 1] : null;
  if (at >= 0 && !ref) {
    console.error('usage: node scripts/plan/progress.mjs [spec…] [--ref <ref>] [--all-closed]');
    return 64;
  }
  const allClosed = argv.includes('--all-closed');
  const asked = argv.filter((a, i) => /^\d{2,}$/.test(a) && argv[i - 1] !== '--ref');
  // The claims module is optional: without it (or its branch), nothing is under way and every chunk is unclaimed.
  let claims = {};
  let events = [];
  let session = '';
  try {
    // Resolved as a URL, never through .pathname: that stays percent-encoded, so a checkout under a path with a space
    // never found the module and every claim read as "not claimed yet".
    const mod = await import(new URL('../claims.mjs', import.meta.url).href);
    const { map } = mod.fetchClaims(cwd);
    claims = Object.fromEntries(Object.entries(map).map(([id, v]) => [id, mod.parse(v)]));
    session = mod.sessionId();
    if (Object.keys(map).length) events = claimEvents(git(['log', 'refs/remotes/origin/claims', '--format=%cI%x09%s', '--', 'claims.json'], cwd));
  } catch {
    // no claims module, no network, or no claims branch yet
  }
  const mine = (c) => Boolean(c && session && c.session === session);
  const now = Date.now();
  const live = Object.entries(claims).filter(([, c]) => ['live', 'pr', 'held'].includes(claimState(c, now)));
  const pool = live.some(([, c]) => mine(c)) ? live.filter(([, c]) => mine(c)) : live;
  const specs = asked.length ? asked : [...new Set(pool.map(([id]) => id.split('.')[0]))].sort();
  if (!specs.length) {
    console.log('progress: no spec named and no live claim: node scripts/plan/progress.mjs <spec number>');
    return 0;
  }
  const plan = planReader(cwd, ref);
  const names = plan.names();
  const archive = names.includes('ARCHIVE.md') ? plan.read('ARCHIVE.md') : '';
  // A close waiting in plan/pending/ is closed already; settle only writes it down.
  const withPending = `${archive.replace(/\n*$/, '\n')}${pendingArchiveLines(plan.pending()).join('\n')}\n`;
  const out = [];
  for (const spec of specs) {
    const file = names.find((n) => n.startsWith(`${spec}-`) && n.endsWith('.md'));
    const text = file ? plan.read(file) : '';
    const title = short((/^# \d{2,}\s*[—·-]\s*(.*)$/m.exec(text)?.[1] ?? '').trim());
    const closed = closedChunks(withPending, spec);
    const open = openChunks(text).filter((c) => !closed.some((x) => x.id === c.id));
    if (!closed.length && !open.length) {
      out.push(`Spec ${spec}${title ? ` · ${title}` : ''}: ${file ? 'not chunked yet (its first /next chunks it)' : 'no such spec in plan/ or ARCHIVE.md'}`, '');
      continue;
    }
    out.push(...render({ spec, title, closed, open, claims, events, now, mine, allClosed }), '');
  }
  // The notice board, when the repo has one (an untracked .announcements.md at the root): its newest lines, as is.
  const board = path.join(cwd, '.announcements.md');
  if (fs.existsSync(board)) {
    const rows = fs.readFileSync(board, 'utf8').split(/\r?\n/).filter((l) => /^- /.test(l)).slice(-5);
    if (rows.length) out.push('Notice board (newest last):', ...rows, '');
  }
  out.push(`Times are estimates from each chunk's size (S ${HOURS.S} h, M ${HOURS.M} h, L ${HOURS.L} h) and the claims branch's history.`);
  console.log(out.join('\n'));
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  // A bad --ref (a typo, a branch not fetched) is one line, not a stack.
  const code = await main(process.argv.slice(2)).catch((e) => {
    console.error(`progress: ${String(e?.stderr || e?.message || e).trim().split(/\r?\n/)[0]}`);
    return 1;
  });
  process.exit(code);
}
