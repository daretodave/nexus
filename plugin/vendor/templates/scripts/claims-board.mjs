#!/usr/bin/env node
// scripts/claims-board.mjs: the claims board, one issue that shows who is building which chunk right now.
//
// Reads the claims branch (scripts/claims.mjs fetchClaims) and draws one markdown table: chunk, state, who,
// session~star, since, PR, base. With --issue it keeps one open issue showing it: the open issue with exactly the
// board's title is edited in place (the lowest number, if two are open), else one is created. The board is a view:
// claims.json stays the truth, and an edit made in the issue is overwritten at the next redraw.
//
// .github/workflows/claims-board.yml runs it (hourly, and on the dispatch claims.mjs sends after any write when
// NEXUS_CLAIMS_BOARD names the workflow). Needs Node 20+, git, and gh for --issue (GH_TOKEN with issues: write).
//
//   node scripts/claims-board.mjs                              print the board's body (a dry run; no gh)
//   node scripts/claims-board.mjs --issue [--title <title>]    create or edit the board issue
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { byId, parse, state } from './claims-codec.mjs';
import { fetchClaims } from './claims.mjs';

export const TITLE = 'Claims board';

/** A table cell: pipes escaped, newlines flattened, empty as a dash. */
export const cell = (v) => (String(v ?? '').trim() === '' ? '-' : String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim());

/** "2026-10-20 14:02 UTC (3h)": when a claim was made or last renewed, and how long ago. */
export function since(at, now = Date.now()) {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return String(at ?? '');
  const when = `${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  const mins = Math.max(0, Math.floor((now - t) / 60_000));
  const ago = mins < 60 ? `${mins}m` : mins < 48 * 60 ? `${Math.floor(mins / 60)}h` : `${Math.floor(mins / 1440)}d`;
  return `${when} (${ago})`;
}

/** The board's markdown body for a claims map (chunk id → claim string), in plan order. Pure. */
export function renderBoard(map, { now = Date.now() } = {}) {
  const stamp = `${new Date(now).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  const ids = Object.keys(map).sort(byId);
  const foot = [
    '',
    `Redrawn ${stamp} from the \`claims\` branch by \`scripts/claims-board.mjs\`. This issue is a view: edits here are overwritten, and claims change only through \`node scripts/claims.mjs\`.`,
    '',
  ];
  if (!ids.length) return ['No claims. Every ready chunk is free to pick.', ...foot].join('\n');
  const rows = ids.map((id) => {
    const c = parse(map[id]);
    const s = state(c, now);
    const tag = c.session ? `${c.session}${c.star ? `~${c.star}` : ''}` : '';
    return `| ${[id, s === 'held' ? `held for @${c.held}` : s, c.who, tag, since(c.at, now), c.pr ? `#${c.pr}` : '', c.base && c.base !== 'main' ? c.base : ''].map(cell).join(' | ')} |`;
  });
  return [
    `${ids.length} claim${ids.length === 1 ? '' : 's'}. A live claim lasts 24 h unless renewed; a PR's lasts until the PR closes; a held one until it is released.`,
    '',
    '| Chunk | State | Who | Session | Since | PR | Base |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    ...foot,
  ].join('\n');
}

const ghRun = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });

function gh(run, args, input) {
  const res = run('gh', args, input === undefined ? {} : { input });
  if (res?.status !== 0) {
    const why = String(res?.stderr || res?.error || 'failed').trim().split('\n')[0];
    throw new Error(`gh ${args.slice(0, 2).join(' ')}: ${why}`);
  }
  return String(res.stdout ?? '');
}

/** Create or edit the one open issue titled `title`. Returns { action: 'created' | 'edited', number }. */
export function upsertIssue(body, { title = TITLE, run = ghRun } = {}) {
  const open = JSON.parse(gh(run, ['issue', 'list', '--state', 'open', '--search', `in:title "${title}"`, '--json', 'number,title', '--limit', '100']) || '[]');
  const hit = open.filter((i) => i.title === title).map((i) => i.number).sort((a, b) => a - b)[0];
  if (hit !== undefined) {
    gh(run, ['issue', 'edit', String(hit), '--body-file', '-'], body);
    return { action: 'edited', number: hit };
  }
  const url = gh(run, ['issue', 'create', '--title', title, '--body-file', '-'], body);
  const n = /\/issues\/(\d+)/.exec(url)?.[1];
  return { action: 'created', number: n ? Number(n) : null };
}

const USAGE = 'usage: claims-board.mjs [--issue] [--title <title>]';

export function main(argv, { cwd = process.cwd(), read = () => fetchClaims(cwd), run = ghRun, out = console.log, now = Date.now() } = {}) {
  let issue = false;
  let title = TITLE;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--issue') issue = true;
    else if (argv[i] === '--title' && argv[i + 1]) title = argv[++i];
    else {
      out(USAGE);
      return 2;
    }
  }
  const body = renderBoard(read().map, { now });
  if (!issue) {
    out(body);
    return 0;
  }
  const r = upsertIssue(body, { title, run });
  out(`claims board: ${r.action} ${r.number ? `#${r.number}` : `"${title}"`}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
