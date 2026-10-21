#!/usr/bin/env node
// scripts/cloud/tick.mjs: the steps of a pull-request-mode cloud tick that hold a credential, so the agent's step
// holds none (.github/workflows/march.yml and night.yml when the repo variable NEXUS_LOOP_MODE is not `owner`).
//
// A PR-mode tick is a contributor: it claims one chunk as the session `cloud-<run id>`, builds it on the branch
// `nexus/<run id>` with no token at all (a prompt-injected agent has nothing to push with), writes plan changes only
// as pending files, and lands as a pull request. The owner reviews, merges, and settles; pr-flow.yml releases the
// claim when the PR closes. Learned from a mature adopter's credential split: the agent edits, a script fences what
// it edited, and only then is a token minted to push it.
//
//   node scripts/cloud/tick.mjs pick [--chunk <id>] [--limit <n>]
//       The first ready, unclaimed chunk in /next's pick order on origin (scripts/plan/order.mjs), claimed for this
//       session; `id=<chunk>` on $GITHUB_OUTPUT (empty: nothing to build, or `--limit` loop PRs already open).
//   node scripts/cloud/tick.mjs fence <base> <head> [--allow <path,…>] [--only <path,…>]
//       Exit 1 naming each change a loop PR may not make: a shared plan or identity file edited or deleted (pending
//       files and new spec files are fine; --allow adds exact paths), anything under .github/workflows/ or
//       .github/actions/, .owner, .nexus/ or plan/messy/. --only allows those exact paths and nothing else, code
//       included (the night shift writes its digest files, never a fix).
//   node scripts/cloud/tick.mjs land <branch> [--chunk <id>]
//       Push <branch> (never forced), open its PR onto the main branch, attach the PR to the chunk's claim.
//   node scripts/cloud/tick.mjs release <id>
//       Drop this session's claim on <id>: the tick shipped nothing.
//
// Environment: NEXUS_SESSION (the claims session, `cloud-<run id>`), NEXUS_MAIN_BRANCH (default main), GH_TOKEN for
// gh, RUN_URL (the run's page, for the PR body), GITHUB_OUTPUT. Every claims call runs as a contributor
// (NEXUS_CONTRIBUTOR=1) named `nexus-cloud`, so the pick job's claim and the land job's PR are the same claimant's.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BOT = { name: 'nexus-cloud', email: 'nexus-cloud@users.noreply.github.com' };
export const LOOP_BRANCH = /^nexus\/[\w.-]+$/;
const CHUNK = /^\d{2,}\.\d+[a-z0-9]*$/;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const mainOf = (env = process.env) => env.NEXUS_MAIN_BRANCH || 'main';

const git = (args, opts = {}) => execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });

/** The env every claims call runs under: a contributor named nexus-cloud, this run's session. */
export function claimsEnv(env = process.env) {
  return { ...env, NEXUS_CONTRIBUTOR: '1', NEXUS_GH_LOGIN: env.NEXUS_GH_LOGIN || BOT.name };
}

/** On a runner, set the checkout's git identity to the bot's, so claims commits and `who` agree across jobs. Never
 * on a person's machine: their own config stays theirs. */
function identity(cwd, env) {
  if (env.GITHUB_ACTIONS !== 'true') return;
  for (const [key, value] of [['user.name', BOT.name], ['user.email', BOT.email]]) {
    let have = '';
    try {
      have = git(['config', key], { cwd }).trim();
    } catch {}
    if (have !== value) git(['config', key, value], { cwd });
  }
}

function claims(cwd, args, env) {
  const r = spawnSync(process.execPath, [path.join(HERE, '..', 'claims.mjs'), ...args, '--json'], { cwd, env: claimsEnv(env), encoding: 'utf8' });
  let value = null;
  try {
    value = JSON.parse(r.stdout);
  } catch {}
  return { ok: r.status === 0, value, err: (r.stderr || r.stdout || '').trim() };
}

function output(key, value, env = process.env) {
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}${os.EOL}`);
  console.log(`${key}=${value}`);
}

/** How many open PRs come from loop branches (`nexus/…`). */
export function loopPrCount(prs) {
  return prs.filter((p) => LOOP_BRANCH.test(p.headRefName ?? '')).length;
}

/**
 * The ids a tick may try, in pick order: the simulated `next` list, keeping only chunks whose needs are all closed
 * now (the simulation counts an earlier pick, or a chunk in flight, as done; a tick builds on main as it is).
 * Unchunked specs are left to the owner: chunking one edits a shared spec file.
 */
export function candidates(sim, n = 3) {
  const open = new Set([...sim.next, ...(sim.inFlight ?? []), ...(sim.blocked ?? [])].map((c) => c.id));
  return sim.next.filter((c) => CHUNK.test(c.id) && (c.needs ?? []).every((x) => !open.has(x))).map((c) => c.id).slice(0, n);
}

/**
 * The changes a loop PR may not make. `changes` are `git diff --name-status --no-renames` rows: { status, path }.
 * Shared plan surfaces change only through settle, on main, by the owner: a branch adds pending files (and a new spec
 * file, which conflicts with nothing). Workflow and action files change from a person's session.
 */
export function fenceProblems(changes, { allow = [], only = null } = {}) {
  const problems = [];
  for (const { status, path: p } of changes) {
    if (only) {
      if (!only.includes(p)) problems.push(`${p}: outside the files this tick may write (${only.join(', ')})`);
      continue;
    }
    if (allow.includes(p)) continue;
    if (p.startsWith('.github/workflows/') || p.startsWith('.github/actions/')) problems.push(`${p}: workflow and action files change from a person's session, never a loop's PR`);
    else if (p === '.owner' || p.startsWith('.nexus/')) problems.push(`${p}: per-checkout state, never committed`);
    else if (p.startsWith('plan/messy/')) problems.push(`${p}: raw dumps stay on the machine that made them`);
    else if (p.startsWith('plan/pending/')) continue;
    else if (p.startsWith('plan/') && status === 'A' && !p.slice(5).includes('/')) continue;
    else if (p.startsWith('plan/') || p.startsWith('identity/')) problems.push(`${p}: a shared plan file (${status === 'D' ? 'deleted' : 'edited'}); write plan/pending/<id>.md instead`);
  }
  return problems;
}

/** The PR's title: the newest subject that isn't plan bookkeeping, tagged with the chunk. */
export function prTitle(subjects, chunk) {
  const work = subjects.find((s) => !/^plan(\(|:)/.test(s)) ?? subjects[0] ?? 'cloud tick';
  return chunk && !work.includes(`(${chunk})`) ? `${work} (${chunk})` : work;
}

/** The PR's body: what built it, the commits, how it closes. */
export function prBody({ chunk, subjects, runUrl, session }) {
  const lines = [`A cloud tick built this${runUrl ? ` (${runUrl})` : ''}, as a contributor: no token in the agent's step, plan changes only as pending files.`, ''];
  if (chunk) lines.push(`Chunk **${chunk}**, claimed as \`${session}\`. It closes through \`plan/pending/${chunk}.md\`; the owner's settle folds it in after the merge, and pr-flow releases the claim when this PR closes.`, '');
  lines.push('Commits:', ...subjects.map((s) => `- ${s}`));
  return lines.join('\n');
}

async function pick(cwd, argv, env) {
  const val = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  identity(cwd, env);
  // A limit that isn't a whole number (a typo in NEXUS_PR_LIMIT) falls back to 3, never to "no limit".
  const raw = Number(val('--limit') || env.NEXUS_PR_LIMIT || 3);
  const limit = Number.isInteger(raw) && raw >= 0 ? raw : 3;
  let open = 0;
  try {
    open = loopPrCount(JSON.parse(execFileSync('gh', ['pr', 'list', '--state', 'open', '--limit', '100', '--json', 'headRefName'], { cwd, encoding: 'utf8' })));
  } catch (e) {
    console.error(`tick: could not count open loop PRs (${e instanceof Error ? e.message.split('\n')[0] : e}); going on`);
  }
  if (open >= limit) {
    console.log(`tick: ${open} loop PRs open (limit ${limit}): nothing claimed until the owner merges or closes one`);
    output('id', '', env);
    return 0;
  }
  let ids;
  const asked = (val('--chunk') ?? '').trim();
  if (asked) {
    if (!CHUNK.test(asked)) throw new Error(`tick: "${asked}" is not a chunk id (e.g. 07.3)`);
    ids = [asked];
  } else {
    git(['fetch', '-q', 'origin', mainOf(env)], { cwd });
    const { load, simulate } = await import(pathToFileURL(path.join(HERE, '..', 'plan', 'order.mjs')).href);
    ids = candidates(simulate(await load(cwd, `origin/${mainOf(env)}`)));
  }
  for (const id of ids) {
    const r = claims(cwd, ['claim', id], env);
    if (r.ok) {
      console.log(`tick: claimed ${id} as ${env.NEXUS_SESSION ?? 'this session'}`);
      output('id', id, env);
      return 0;
    }
    console.log(`tick: ${id} refused (${r.err.split('\n')[0]}); trying the next`);
  }
  console.log(ids.length ? 'tick: every candidate was refused: nothing to build' : 'tick: no ready chunk: nothing to build');
  output('id', '', env);
  return 0;
}

function fence(cwd, argv) {
  const [base, head] = argv;
  const list = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? (argv[i + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean) : null;
  };
  const allow = list('--allow') ?? [];
  const only = list('--only');
  if (!base || !head || base.startsWith('--') || head.startsWith('--')) throw new Error('tick: fence needs <base> <head>');
  if (only && !only.length) throw new Error('tick: --only needs at least one path');
  const changes = git(['diff', '--name-status', '--no-renames', `${base}...${head}`], { cwd })
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [status, ...rest] = l.split('\t');
      return { status: status[0], path: rest.join('\t') };
    });
  const problems = fenceProblems(changes, { allow, only });
  for (const p of problems) console.error(`fence: ${p}`);
  console.log(`fence: ${changes.length} changed path(s), ${problems.length} outside the fence`);
  return problems.length ? 1 : 0;
}

function land(cwd, argv, env) {
  const [branch] = argv;
  const i = argv.indexOf('--chunk');
  const chunk = i >= 0 ? argv[i + 1] : '';
  if (!LOOP_BRANCH.test(branch ?? '')) throw new Error(`tick: "${branch}" is not a loop branch (nexus/<run id>)`);
  if (chunk && !CHUNK.test(chunk)) throw new Error(`tick: "${chunk}" is not a chunk id`);
  identity(cwd, env);
  const main = mainOf(env);
  const subjects = git(['log', '--format=%s', `origin/${main}..${branch}`], { cwd }).split('\n').filter(Boolean);
  if (!subjects.length) {
    console.log('tick: the branch holds no commit: nothing to land');
    return 0;
  }
  git(['push', 'origin', `${branch}:refs/heads/${branch}`], { cwd, stdio: 'inherit' });
  const bodyFile = path.join(os.tmpdir(), `tick-pr-${process.pid}.md`);
  fs.writeFileSync(bodyFile, prBody({ chunk, subjects, runUrl: env.RUN_URL, session: env.NEXUS_SESSION }));
  const url = execFileSync('gh', ['pr', 'create', '--base', main, '--head', branch, '--title', prTitle(subjects, chunk), '--body-file', bodyFile], { cwd, encoding: 'utf8' }).trim();
  const n = /\/pull\/(\d+)/.exec(url)?.[1];
  console.log(`tick: opened ${url}`);
  if (chunk && n) {
    const r = claims(cwd, ['pr', chunk, n], env);
    console.log(r.ok ? `tick: ${chunk} now carries PR #${n}` : `tick: could not attach PR #${n} to ${chunk} (${r.err.split('\n')[0]})`);
  }
  return 0;
}

function release(cwd, [id], env) {
  if (!CHUNK.test(id ?? '')) throw new Error(`tick: release needs a chunk id`);
  identity(cwd, env);
  const r = claims(cwd, ['release', id], env);
  console.log(r.ok ? `tick: released ${id}` : `tick: ${id} not released (${r.err.split('\n')[0]})`);
  return r.ok ? 0 : 1;
}

export async function main(argv, { cwd = process.cwd(), env = process.env } = {}) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'pick':
      return pick(cwd, rest, env);
    case 'fence':
      return fence(cwd, rest);
    case 'land':
      return land(cwd, rest, env);
    case 'release':
      return release(cwd, rest, env);
    default:
      console.error('usage: node scripts/cloud/tick.mjs pick [--chunk <id>] [--limit <n>] | fence <base> <head> [--allow <paths>] [--only <paths>] | land <branch> [--chunk <id>] | release <id>');
      return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (e) => {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    },
  );
}
