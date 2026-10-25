// Onboarding's Cloud step served (spec 47, A16): POST /api/cloud/workflow and POST /api/cloud/schedule.
//
// The workflow is the kit's own templates/.github/workflows/march.yml, filled by the kit installer's own
// substitution (templates/scripts/bootstrap.mjs fillPlaceholders: <PROJECT>, <DEFAULT_BRANCH>,
// <PROJECT_PKG_PREFIX>), with the shared toolchain action, the quota governor (scripts/cloud/quota.mjs), the
// lost-to-background mark (scripts/cloud/lost.mjs), the idle probe (scripts/cloud/idle.mjs), the chain step
// (scripts/cloud/chain.mjs) and the cadence presets (scripts/cloud/cadence.mjs) beside it when the repo has none (every march job uses them), and the event tick
// (.github/workflows/nudge.yml with scripts/cloud/nudge-check.mjs; inert until NEXUS_SUPPORT is set, or an `Improve:` dial above gentle sets Support). The CLI ships these files and the installer in kit/ (scripts/bundle-kit.mjs); inside the nexus repo it reads
// templates/ directly. Which way a tick lands is the repo variable NEXUS_LOOP_MODE, not a line in the file: in owner
// mode an unset variable is set to owner (best effort), as bootstrap's set-loop-mode does.
//
// The schedule is one of the five cadence presets (spec 55: calm, steady, eager, sprint, off; the kit's
// scripts/cloud/cadence.mjs owns the table and writes them), or overnight, a custom cron outside them. A preset writes
// its cron line (off takes the schedule out; workflow_dispatch stays), the ceiling step's `ceiling=` line and, when
// the repo has heartbeat.yml, its `march_hours=` line, then sets the repo variable NEXUS_CADENCE (owner mode).
// Overnight changes only the `- cron:` line. Everything else in the file is kept byte for byte.
//
// Nothing touches the person's checkout or working tree. Each write lands from a temporary worktree of
// origin/<default branch>, per owner mode: owner commits and pushes the default branch; contributor commits on
// nexus/cloud-loop (one branch for the workflow and its schedule), pushes it and opens (or reuses) its pull request.
// A workflow already there, or a schedule equal to the current one, writes nothing. A push GitHub refuses for want
// of the token's `workflow` scope answers 409 with the fix, never a stack.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { run as shRun, json, track } from './sh.mjs';
import { LOOP_FILE } from './gh.mjs';
import { MAIN } from './git.mjs';
import { primaryRoot } from './local.mjs';
import { NO_ORIGIN, placeNote, repoPlace } from './place.mjs';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WORKFLOW_PATH = '.github/workflows/march.yml';
/** The heartbeat a repo may have beside the loop: a preset writes its `march_hours=` line when it is there. */
export const HEARTBEAT_PATH = '.github/workflows/heartbeat.yml';
export const SETUP_ACTION_PATH = '.github/actions/setup/action.yml';
export const CLOUD_BRANCH = 'nexus/cloud-loop';
export const SCOPE_FIX = 'gh auth refresh -s workflow';

/** The kit files the CLI needs: published path under kit/, and the same file in the nexus repo's templates/. */
export const KIT_FILES = {
  march: ['workflows/march.yml', '.github/workflows/march.yml'],
  setup: ['actions/setup/action.yml', '.github/actions/setup/action.yml'],
  bootstrap: ['scripts/bootstrap.mjs', 'scripts/bootstrap.mjs'],
  quota: ['scripts/cloud/quota.mjs', 'scripts/cloud/quota.mjs'],
  lost: ['scripts/cloud/lost.mjs', 'scripts/cloud/lost.mjs'],
  idle: ['scripts/cloud/idle.mjs', 'scripts/cloud/idle.mjs'],
  chain: ['scripts/cloud/chain.mjs', 'scripts/cloud/chain.mjs'],
  cadence: ['scripts/cloud/cadence.mjs', 'scripts/cloud/cadence.mjs'],
  nudge: ['workflows/nudge.yml', '.github/workflows/nudge.yml'],
  nudgeCheck: ['scripts/cloud/nudge-check.mjs', 'scripts/cloud/nudge-check.mjs'],
};
/** The event tick (spec 54): off until the repo variable NEXUS_SUPPORT is set, so it lands beside march.yml inert. */
export const NUDGE_PATH = '.github/workflows/nudge.yml';
/** The nudge's check, which nudge.yml runs: written beside it when missing. */
export const NUDGE_CHECK_PATH = 'scripts/cloud/nudge-check.mjs';
/** The quota governor every march job runs (its gate and read steps): written beside the workflow when missing. */
export const QUOTA_PATH = 'scripts/cloud/quota.mjs';
/** The lost-to-background mark every march job runs after the model: written beside the workflow when missing. */
export const LOST_PATH = 'scripts/cloud/lost.mjs';
/** The idle probe and the no-op reason every march job runs: written beside the workflow when missing. */
export const IDLE_PATH = 'scripts/cloud/idle.mjs';
/** The chain step every march job runs last (it dispatches the next tick): written beside the workflow when missing. */
export const CHAIN_PATH = 'scripts/cloud/chain.mjs';
/** The Cadence step every march job runs first (NEXUS_CADENCE into the ceiling, chain max, idle backoff): written beside the workflow when missing. */
export const CADENCE_PATH = 'scripts/cloud/cadence.mjs';

/** A kit file's path: the CLI's bundled copy first, then the nexus repo's templates (development). Null when neither. */
export function kitFile(name, { pkg = PKG } = {}) {
  const [bundled, templ] = KIT_FILES[name];
  for (const f of [path.join(pkg, 'kit', bundled), path.resolve(pkg, '..', '..', 'templates', templ)]) {
    if (fs.existsSync(f)) return f;
  }
  return null;
}

/** The installer's own substitution (bootstrap.mjs fillPlaceholders), loaded from the kit, never a second copy. */
export async function installerFill() {
  const f = kitFile('bootstrap');
  if (!f) throw Object.assign(new Error('this nexus CLI has no copy of the kit installer (scripts/bootstrap.mjs)'), { status: 500 });
  return (await import(pathToFileURL(f).href)).fillPlaceholders;
}

/** The kit's cadence presets (scripts/cloud/cadence.mjs: PRESETS, applyPreset), loaded from the kit, never a second copy. */
export async function kitCadence() {
  const f = kitFile('cadence');
  if (!f) throw Object.assign(new Error('this nexus CLI has no copy of the kit\'s cadence presets (scripts/cloud/cadence.mjs)'), { status: 500 });
  return import(pathToFileURL(f).href);
}

/**
 * A cadence preset written into the loop workflow (and heartbeat.yml when given) by the kit's own applyPreset: the
 * cron line (off: the schedule out, behind the marker a later preset turns back into a cron), the `ceiling=` line and
 * heartbeat's `march_hours=` line, as bootstrap and `cadence.mjs apply` write them. A cron line not in the template's
 * shape is set by setCron instead, so the cron always lands. Line ends kept. -> { march, heartbeat }
 */
export async function presetTexts(name, { march, heartbeat = null }) {
  const { applyPreset, PRESETS } = await kitCadence();
  const lf = (t) => (t == null ? null : String(t).replace(/\r\n/g, '\n'));
  const back = (t, orig) => (t != null && /\r\n/.test(orig) ? t.replace(/\n/g, '\r\n') : t);
  const r = applyPreset(name, { march: lf(march), heartbeat: lf(heartbeat) });
  const want = PRESETS[name].cron;
  const got = readCrons(r.march);
  const m = (want == null ? got.length === 0 : got.length === 1 && got[0] === want) ? r.march : setCron(r.march, want);
  return { march: back(m, march), heartbeat: heartbeat == null ? null : back(r.heartbeat, heartbeat) };
}

/** A kit template filled for this repo, LF line ends. */
export async function fillTemplate(text, { name, branch }) {
  const fill = await installerFill();
  return fill(String(text).replace(/\r\n/g, '\n'), { project: { name, default_branch: branch } });
}

// ---- cron ----------------------------------------------------------------------

const FIELDS = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
const CRON_CHARS = /^[\d*,/-]+$/;

function field(text, [lo, hi], dow) {
  if (!CRON_CHARS.test(text)) return null;
  const out = new Set();
  for (const part of text.split(',')) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!m) return null;
    const step = m[2] == null ? 1 : Number(m[2]);
    if (!(step >= 1)) return null;
    let a; let b;
    if (m[1] === '*') { a = lo; b = hi; } else {
      const [x, y] = m[1].split('-').map(Number);
      a = x;
      // `a/n` runs from a to the field's end.
      b = y == null ? (m[2] == null ? x : (dow ? 6 : hi)) : y;
    }
    // Day of week takes 7 for Sunday too.
    if (m[1] === '*' && dow) b = 6;
    if (a < lo || b > (dow ? 7 : hi) || a > b) return null;
    for (let v = a; v <= b; v += step) out.add(dow && v === 7 ? 0 : v);
  }
  return [...out].sort((x, y) => x - y);
}

/** A 5-field cron parsed: { min, hour, dom, mon, dow, domAny, dowAny }, or null when it is not one this reads. */
export function parseCron(cron) {
  const parts = String(cron ?? '').trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const v = parts.map((p, i) => field(p, FIELDS[i], i === 4));
  if (v.some((x) => !x || !x.length)) return null;
  return { min: v[0], hour: v[1], dom: v[2], mon: v[3], dow: v[4], domAny: parts[2] === '*', dowAny: parts[4] === '*' };
}

/**
 * The next time a cron fires after `from` (UTC, as GitHub runs it), or null when it never does (or is not a cron).
 * Day of month and day of week both restricted means either one, as cron has it.
 */
export function cronNext(cron, from = new Date()) {
  const c = parseCron(cron);
  if (!c) return null;
  const start = Math.floor(new Date(from).getTime() / 60000) * 60000 + 60000;
  const s = new Date(start);
  for (let d = 0; d < 366 * 5; d++) {
    const day = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() + d));
    if (!c.mon.includes(day.getUTCMonth() + 1)) continue;
    const domOk = c.dom.includes(day.getUTCDate());
    const dowOk = c.dow.includes(day.getUTCDay());
    if (!(c.domAny && c.dowAny ? true : c.domAny ? dowOk : c.dowAny ? domOk : domOk || dowOk)) continue;
    for (const h of c.hour) {
      for (const m of c.min) {
        const t = day.getTime() + (h * 60 + m) * 60000;
        if (t >= start) return new Date(t);
      }
    }
  }
  return null;
}

// ---- the schedule in a workflow ------------------------------------------------

const CRON_LINE = /^(\s*-\s*cron:\s*)(['"]?)([^'"#]*?)\2(\s*(?:#.*)?)$/;
const indentOf = (l) => /^\s*/.exec(l)[0].length;
const blank = (l) => !l.trim();

function lines(text) {
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  return { eol, ls: String(text).split(eol) };
}

/** The `on:` block and the schedule block inside it: { ls, eol, on, child, sched: [start, end) | null }; null when no block `on:`. */
function scheduleBlock(text) {
  const { eol, ls } = lines(text);
  const on = ls.findIndex((l) => /^(?:on|"on"|'on'):\s*(?:#.*)?$/.test(l));
  if (on < 0) return null;
  let end = on + 1;
  while (end < ls.length && (blank(ls[end]) || /^\s/.test(ls[end]) || /^#/.test(ls[end]))) end++;
  const firstChild = ls.slice(on + 1, end).find((l) => !blank(l) && !/^\s*#/.test(l));
  const child = firstChild ? indentOf(firstChild) : 2;
  let sched = null;
  for (let i = on + 1; i < end; i++) {
    if (indentOf(ls[i]) === child && /^\s*schedule:\s*(?:#.*)?$/.test(ls[i])) {
      let j = i + 1;
      while (j < end && (blank(ls[j]) || indentOf(ls[j]) > child)) j++;
      while (j > i + 1 && blank(ls[j - 1])) j--;
      sched = [i, j];
      break;
    }
  }
  return { ls, eol, on, child, sched };
}

/** The crons a workflow's `on.schedule` lists, in order (empty when it has none). */
export function readCrons(text) {
  const b = scheduleBlock(text);
  if (!b?.sched) return [];
  return b.ls.slice(b.sched[0] + 1, b.sched[1]).map((l) => CRON_LINE.exec(l)).filter(Boolean).map((m) => m[3].trim());
}

/**
 * The workflow with its schedule set to one cron (or taken out, cron null). Only the schedule's cron lines change:
 * the first keeps its indent, quotes and comment, the others go; a workflow with no schedule gets one under `on:`.
 * Throws a 409-shaped error when the file has no block `on:` to put it in.
 */
export function setCron(text, cron) {
  const b = scheduleBlock(text);
  if (!b) throw Object.assign(new Error('the loop workflow has no `on:` block this can edit; change its schedule by hand'), { status: 409 });
  const { ls, eol, on, child, sched } = b;
  if (cron == null) {
    if (!sched) return text;
    return [...ls.slice(0, sched[0]), ...ls.slice(sched[1])].join(eol);
  }
  if (!sched) {
    const pad = ' '.repeat(child);
    return [...ls.slice(0, on + 1), `${pad}schedule:`, `${pad}${pad}- cron: '${cron}'`, ...ls.slice(on + 1)].join(eol);
  }
  const out = [];
  let done = false;
  ls.forEach((l, i) => {
    const m = i > sched[0] && i < sched[1] ? CRON_LINE.exec(l) : null;
    if (!m) { out.push(l); return; }
    if (done) return;
    done = true;
    out.push(`${m[1]}${m[2] || '\''}${cron}${m[2] || '\''}${m[4]}`);
  });
  if (!done) out.splice(sched[0] + 1, 0, `${' '.repeat(child * 2)}- cron: '${cron}'`);
  return out.join(eol);
}

/**
 * The cadence presets the Cloud step offers (spec 55, A9): each word's cron. scripts/cloud/cadence.mjs PRESETS owns
 * the table (a test holds these equal to it); saving one writes the rest of the preset from that file (applyPreset).
 * off: no schedule (dispatch and nudge only).
 */
export const CADENCE_CRONS = Object.freeze({ calm: '17 */6 * * *', steady: '17 */3 * * *', eager: '17 */3 * * *', sprint: '17 */3 * * *', off: null });

/** What POST /api/cloud/schedule takes: the five presets, and overnight, a custom cron outside them (the body's cron). */
export const SCHEDULES = {
  calm: 'the calm cadence',
  steady: 'the steady cadence',
  eager: 'the eager cadence',
  sprint: 'the sprint cadence',
  off: 'the off cadence',
  night: 'overnight',
};

/**
 * POST /api/cloud/schedule's body checked: { schedule, cadence?, cron (null: no schedule), human } or { error }.
 * A preset's cron is the preset's own (a cron in the body is ignored); overnight and no word at all need one.
 */
export function scheduleRequest(b = {}) {
  const schedule = b.schedule == null ? null : String(b.schedule);
  if (schedule != null && !Object.hasOwn(SCHEDULES, schedule)) return { error: `schedule is one of ${Object.keys(SCHEDULES).join(', ')}` };
  if (schedule != null && Object.hasOwn(CADENCE_CRONS, schedule)) {
    const cron = CADENCE_CRONS[schedule];
    return { schedule, cadence: schedule, cron, human: `${SCHEDULES[schedule]} (${cron ? `cron ${cron}` : 'no schedule'})` };
  }
  const cron = String(b.cron ?? '').trim().replace(/\s+/g, ' ');
  if (!cron) return { error: 'cron is required (or a preset: calm, steady, eager, sprint, off)' };
  if (!parseCron(cron)) return { error: `"${cron.slice(0, 60)}" is not a five-field cron this reads` };
  return { schedule, cron, human: schedule ? `${SCHEDULES[schedule]} (cron ${cron})` : `on cron ${cron}` };
}

// ---- a schedule in words ---------------------------------------------------------

const hm = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

/**
 * A cron in words, in UTC as GitHub runs it, or null when it is not a shape this describes (the caller then shows the
 * cron itself). Every day only: one minute, and hours that are one, a run (`1-6`), every hour, or evenly spaced
 * around the day (`2,8,14,20`, `*\/6`).
 */
export function describeCron(cron) {
  const parts = String(cron ?? '').trim().split(/\s+/);
  const c = parseCron(cron);
  if (!c || parts[2] !== '*' || parts[3] !== '*' || parts[4] !== '*' || c.min.length !== 1) return null;
  const m = c.min[0];
  const hs = c.hour;
  const mm = `:${String(m).padStart(2, '0')}`;
  if (hs.length === 24) return `every hour at ${mm} UTC`;
  if (hs.length === 1) return `daily at ${hm(hs[0], m)} UTC`;
  const gaps = hs.map((h, i) => (i ? h - hs[i - 1] : hs[0] + 24 - hs[hs.length - 1]));
  if (gaps.every((g) => g === gaps[0])) {
    const n = gaps[0];
    return hs.length <= 6 ? `every ${n} hours (${hs.map((h) => hm(h, m)).join(', ')} UTC)` : `every ${n} hours at ${mm} UTC, from ${hm(hs[0], m)}`;
  }
  if (gaps.slice(1).every((g) => g === 1)) return `every hour at ${mm}, ${hm(hs[0], m)} to ${hm(hs[hs.length - 1], m)} UTC`;
  return null;
}

/** The crons in words: each described, or every one shown raw ("`<cron>` UTC") when any is a shape this can't say. */
export function describeCrons(crons = []) {
  if (!crons.length) return 'on demand';
  const said = crons.map(describeCron);
  return said.every(Boolean) ? said.join('; ') : `${crons.join(', ')} UTC`;
}

// ---- landing -------------------------------------------------------------------

/** How long a commit or push may take: they run the repo's own hooks (its gate before commit), which can take minutes. */
export const HOOK_TIMEOUT_MS = 10 * 60 * 1000;
const GIT_TIMEOUT_MS = 60000;
/** Variables a parent git (a hook this server runs under) would hand down; with them git works on another repo. */
export const GIT_LEAKS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT'];
export const gitEnv = (env = process.env) => Object.fromEntries(Object.entries(env).filter(([k]) => !GIT_LEAKS.includes(k)));

/** Kill a process and everything it started (a hook's shell and the gate under it). */
function killTree(child) {
  if (child.exitCode != null || child.signalCode != null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
}

/**
 * A program (git, node, gh) with no shell, no trimming (file contents keep their bytes) and none of a parent's GIT_*
 * variables: { ok, code, out, err, timedOut }. It answers only once the program and everything it started (git's
 * hooks, a gate under them) have exited: on timeout the whole tree is killed first, so a caller may then remove the
 * folder it ran in. `env` is the environment to start from; GIT_LEAKS never pass. `onErr` sees stderr as it comes
 * (a worktree being made streams its lines to the cockpit).
 */
export function runClean(cmd, args, { cwd, timeout = GIT_TIMEOUT_MS, env = process.env, onErr = null } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = track(spawn(cmd, args, { cwd, env: gitEnv(env), windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] }));
    } catch (e) {
      resolve({ ok: false, code: -1, out: '', err: String(e.message || e), timedOut: false });
      return;
    }
    let out = '';
    let err = '';
    let timedOut = false;
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; if (onErr) { try { onErr(String(d)); } catch { /* a listener's throw never stops the program */ } } });
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeout);
    child.on('error', (e) => { err += String(e.message || e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0 && !timedOut, code: code ?? -1, out, err: err.trim(), timedOut });
    });
  });
}
/** git through runClean. */
const gitRaw = (cwd, args, o = {}) => runClean('git', args, { cwd, ...o });
const gitT = async (cwd, args, o) => { const r = await gitRaw(cwd, args, o); return { ...r, out: r.out.trim() }; };
const slash = (p) => String(p).split(path.sep).join('/');
const shQuote = (p) => `"${String(p).replace(/(["\\$`])/g, '\\$1')}"`;

/**
 * The repo's hooks, made safe to run from a linked worktree. git hands a hook run there an absolute GIT_DIR (the
 * worktree's own git dir), and a hook installed before the kit's `unset` line passes it on: a gate whose tests make
 * scratch repos then writes into the real one (core.bare set true). Each wrapper drops the variables and execs the
 * real hook, so the repo's own checks still run, for old hooks and new. The real hooks dir honours core.hooksPath.
 * -> { dir, args: ['-c', 'core.hooksPath=<dir>'] to put before a git command, cleanup() }. Reused by every landing
 * from a temporary worktree.
 */
export async function safeHooks(repo) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-hooks-'));
  const r = await gitT(repo, ['rev-parse', '--path-format=absolute', '--git-path', 'hooks']);
  const real = r.ok && r.out ? path.resolve(repo, r.out) : null;
  let names = [];
  try { names = real ? fs.readdirSync(real, { withFileTypes: true }).filter((e) => e.isFile() && !e.name.endsWith('.sample')).map((e) => e.name) : []; } catch { /* no hooks dir: nothing to wrap */ }
  for (const n of names) {
    const f = path.join(dir, n);
    fs.writeFileSync(f, `#!/bin/sh\nunset ${GIT_LEAKS.join(' ')}\nexec ${shQuote(slash(path.join(real, n)))} "$@"\n`, { mode: 0o755 });
    fs.chmodSync(f, 0o755);
  }
  return {
    dir,
    args: ['-c', `core.hooksPath=${slash(dir)}`],
    cleanup: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* the OS still holds it */ } },
  };
}

const tail = (s, n = 400) => String(s || '').trim().split(/\r?\n/).slice(-6).join('\n').slice(-n);
const fail = (status, error, extra = {}) => ({ status, error, ...extra });

/** Whether a push was refused for want of the token's `workflow` scope (GitHub's words for it). */
export const scopeRefused = (stderr) => /workflow.{0,40}scope|scope.{0,40}workflow|refusing to allow an? (?:OAuth|GitHub) App to (?:create or update|update|create) workflow/i.test(String(stderr || ''));

/** The default branch: origin/HEAD, else what origin says HEAD is, else NEXUS_MAIN_BRANCH (main). */
export async function defaultBranch(repo) {
  const sym = await gitT(repo, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  if (sym.ok && sym.out.startsWith('origin/')) return sym.out.slice('origin/'.length);
  const ls = await gitT(repo, ['ls-remote', '--symref', 'origin', 'HEAD']);
  const m = ls.ok ? /^ref:\s+refs\/heads\/(\S+)\s+HEAD/m.exec(ls.out) : null;
  return m ? m[1] : MAIN;
}

/**
 * Where a write starts and where it lands: { branch, base, head } (head: the branch pushed; the default branch in
 * owner mode). Contributor work builds on nexus/cloud-loop while its pull request is open (not yet in the default
 * branch), so the workflow and its schedule ride one PR; a merged one starts a fresh branch from the default.
 */
export async function landingPlace(repo, owner, { now = new Date() } = {}) {
  const branch = await defaultBranch(repo);
  const f = await gitT(repo, ['fetch', '-q', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`]);
  if (!f.ok) return fail(502, `could not fetch origin/${branch}: ${tail(f.err, 200)}`);
  const base = `origin/${branch}`;
  if (owner) return { branch, base, head: branch };
  const c = await gitT(repo, ['fetch', '-q', 'origin', `+refs/heads/${CLOUD_BRANCH}:refs/remotes/origin/${CLOUD_BRANCH}`]);
  if (!c.ok) return { branch, base, head: CLOUD_BRANCH };
  const merged = (await gitT(repo, ['merge-base', '--is-ancestor', `origin/${CLOUD_BRANCH}`, base])).ok;
  if (!merged) return { branch, base: `origin/${CLOUD_BRANCH}`, head: CLOUD_BRANCH };
  const stamp = now.toISOString().replace(/\D/g, '').slice(0, 12);
  return { branch, base, head: `${CLOUD_BRANCH}-${stamp}` };
}

/** A file at a ref, bytes kept, or null. */
async function showFile(repo, ref, rel) {
  const r = await gitRaw(repo, ['show', `${ref}:${rel}`]);
  return r.ok ? r.out : null;
}

/** The loop workflow at a ref: its path, or null. */
async function loopAt(repo, ref) {
  const r = await gitT(repo, ['ls-tree', '--name-only', `${ref}`, '.github/workflows/']);
  if (!r.ok) return null;
  const files = r.out.split(/\r?\n/).filter((f) => LOOP_FILE.test(f));
  return files.find((f) => /march\.ya?ml$/.test(f)) || files[0] || null;
}

/**
 * The loop workflow's schedule as it is at origin/<default branch> (no fetch: the last one known), for GET /api/cloud
 * and GET /api/actions: { path, ref, crons, cron (the first, or null), human, raw (a cron shown as itself), label,
 * next (ISO, the soonest; null on demand) }, or null when origin has no loop workflow (or no origin).
 */
export async function loopSchedule(repo, { now = new Date() } = {}) {
  try {
    const ref = `origin/${await defaultBranch(repo)}`;
    const rel = await loopAt(repo, ref);
    if (!rel) return null;
    const text = await showFile(repo, ref, rel);
    if (text == null) return null;
    const crons = readCrons(text);
    const human = describeCrons(crons);
    const next = crons.map((c) => cronNext(c, now)).filter(Boolean).sort((a, b) => a - b)[0] || null;
    const raw = crons.length > 0 && !crons.every(describeCron);
    return { path: rel, ref, crons, cron: crons[0] || null, human, raw, label: raw ? human : human[0].toUpperCase() + human.slice(1), next: next ? next.toISOString() : null };
  } catch {
    return null;
  }
}

const lastSha = async (repo, ref, rel) => (await gitT(repo, ['log', '-1', '--format=%H', ref, '--', rel])).out || null;

/** The open pull request from `head`, or one opened now: { pr, note? }. */
async function pullRequest(cwd, { head, branch }, run) {
  const l = await run('gh', ['pr', 'list', '--head', head, '--state', 'open', '--json', 'url,number'], { cwd });
  const open = l.ok ? (json(l.stdout) || [])[0] : null;
  if (open?.url) return { pr: open.url };
  const c = await run('gh', ['pr', 'create', '--head', head, '--base', branch, '--fill'], { cwd, timeout: 60000 });
  const url = /https?:\/\/\S+/.exec(c.stdout || '')?.[0];
  if (c.ok && url) return { pr: url };
  return { pr: null, note: `pushed ${head}; gh could not open its pull request (${tail(c.stderr || c.stdout, 200) || 'no reason given'}). Open it with: gh pr create --head ${head} --base ${branch} --fill` };
}

/**
 * Commit `files` ({ rel: text }) on `place.base` in a temporary worktree and land it per owner mode. The person's
 * checkout and working tree are never touched. Answers { status: 200, sha, branch, pr? } or { status, error, fix? }.
 */
export async function landFiles(repo, place, files, message, { owner, run = shRun, commitTimeoutMs = HOOK_TIMEOUT_MS } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-cloud-'));
  const wt = path.join(tmp, 'wt');
  const add = await gitT(repo, ['worktree', 'add', '-q', '--detach', wt, place.base]);
  if (!add.ok) { fs.rmSync(tmp, { recursive: true, force: true }); return fail(502, `could not make a worktree of ${place.base}: ${tail(add.err, 200)}`); }
  const hooks = await safeHooks(repo);
  try {
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(wt, rel)), { recursive: true });
      fs.writeFileSync(path.join(wt, rel), text);
    }
    const st = await gitT(wt, ['add', '--', ...Object.keys(files)]);
    if (!st.ok) return fail(502, `git add failed: ${tail(st.err, 200)}`);
    // The repo's own pre-commit hook runs here (its gate before commit): awaited to the end, never cut short silently.
    const c = await gitT(wt, [...hooks.args, 'commit', '-q', '-m', message], { timeout: commitTimeoutMs });
    if (c.timedOut) return fail(504, `your repo's checks took longer than ${Math.round(commitTimeoutMs / 1000)} s on the commit, so nothing landed. Run them, then try again.`);
    if (!c.ok) return fail(409, `your repo's checks refused the commit, so nothing landed:
${tail(c.err || c.out)}`);
    const sha = (await gitT(wt, ['rev-parse', 'HEAD'])).out;
    const p = await gitT(wt, [...hooks.args, 'push', '-q', 'origin', `HEAD:refs/heads/${place.head}`], { timeout: commitTimeoutMs });
    if (p.timedOut) return fail(504, `the push to origin/${place.head} took longer than ${Math.round(commitTimeoutMs / 1000)} s, so nothing landed.`);
    if (!p.ok) {
      if (scopeRefused(p.err)) {
        return fail(409, `GitHub refused the push: your gh token cannot change workflow files. Run \`${SCOPE_FIX}\`, then try again.`, { fix: SCOPE_FIX });
      }
      if (/\[rejected\]|non-fast-forward|fetch first/i.test(p.err)) return fail(409, `origin/${place.head} moved while this was writing: try again.`);
      return fail(502, `the push to origin/${place.head} failed: ${tail(p.err)}`);
    }
    await gitT(repo, ['fetch', '-q', 'origin', `+refs/heads/${place.head}:refs/remotes/origin/${place.head}`]);
    if (owner) return { status: 200, sha, branch: place.head };
    return { status: 200, sha, branch: place.head, ...(await pullRequest(wt, place, run)) };
  } finally {
    hooks.cleanup();
    // Every git this started has exited (gitRaw answers on close, after killing a tree that ran over).
    const rm = await gitT(repo, ['worktree', 'remove', '--force', wt]);
    try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* a temp dir the OS still holds */ }
    if (!rm.ok) await gitT(repo, ['worktree', 'prune']);
  }
}

/** The project's name for <PROJECT>: package.json's (its scope dropped), else the checkout's folder. */
async function projectName(repo, ref) {
  const pkg = json(await showFile(repo, ref, 'package.json') || '');
  const n = typeof pkg?.name === 'string' ? pkg.name.replace(/^@[^/]+\//, '').trim() : '';
  return n || path.basename(primaryRoot(repo));
}

/** Owner mode wants owner ticks: set NEXUS_LOOP_MODE=owner when it is unset. Best effort; says what it found. */
async function ownerLoopMode(repo, run) {
  const l = await run('gh', ['variable', 'list', '--json', 'name,value'], { cwd: repo });
  const vars = l.ok ? json(l.stdout) : null;
  if (!Array.isArray(vars)) return { mode: null, note: 'could not read the repo variable NEXUS_LOOP_MODE; set it to owner for owner ticks: gh variable set NEXUS_LOOP_MODE --body owner' };
  const v = vars.find((x) => x.name === 'NEXUS_LOOP_MODE');
  if (v) return { mode: v.value };
  const s = await run('gh', ['variable', 'set', 'NEXUS_LOOP_MODE', '--body', 'owner'], { cwd: repo });
  return s.ok ? { mode: 'owner', set: true } : { mode: null, note: 'could not set NEXUS_LOOP_MODE (that needs admin on the repo): gh variable set NEXUS_LOOP_MODE --body owner' };
}

/**
 * The workflow (and the toolchain action when missing) filled for this repo: { rel: text }, with the schedule asked
 * for when given (scheduleRequest's answer: a preset through presetTexts, else the cron).
 */
async function workflowFiles(repo, place, q) {
  const tpl = kitFile('march');
  if (!tpl) throw Object.assign(new Error('this nexus CLI has no copy of the kit\'s march.yml'), { status: 500 });
  const name = await projectName(repo, place.base);
  const v = { name, branch: place.branch };
  let yml = await fillTemplate(fs.readFileSync(tpl, 'utf8'), v);
  if (q?.cadence) yml = (await presetTexts(q.cadence, { march: yml })).march;
  else if (q) yml = setCron(yml, q.cron);
  const files = { [WORKFLOW_PATH]: yml };
  const setup = kitFile('setup');
  if (setup && await showFile(repo, place.base, SETUP_ACTION_PATH) == null) files[SETUP_ACTION_PATH] = await fillTemplate(fs.readFileSync(setup, 'utf8'), v);
  for (const [name, rel] of [['quota', QUOTA_PATH], ['lost', LOST_PATH], ['idle', IDLE_PATH], ['chain', CHAIN_PATH], ['cadence', CADENCE_PATH], ['nudge', NUDGE_PATH], ['nudgeCheck', NUDGE_CHECK_PATH]]) {
    const src = kitFile(name);
    if (src && await showFile(repo, place.base, rel) == null) files[rel] = fs.readFileSync(src, 'utf8').replace(/\r\n/g, '\n');
  }
  return files;
}

/**
 * POST /api/cloud/workflow: write the loop workflow from the kit template and land it per owner mode.
 * -> { status, path, sha, written, branch, pr?, setup?, mode?, note? }. Already there: its path and last sha, nothing written.
 */
/** A folder with no repo or no origin has nowhere for the loop's files to land: 409 with the place, before any git. */
async function notOnGitHub(repo) {
  const where = await repoPlace(repo);
  return NO_ORIGIN.has(where.place) ? fail(409, placeNote(where), { place: where.place }) : null;
}

export async function addWorkflow(repo, { owner = false, run = shRun, now, commitTimeoutMs } = {}) {
  try {
    const off = await notOnGitHub(repo);
    if (off) return off;
    const place = await landingPlace(repo, owner, { now });
    if (place.error) return place;
    const have = await loopAt(repo, place.base);
    if (have) return { status: 200, path: have, sha: await lastSha(repo, place.base, have), written: false, branch: place.head };
    const files = await workflowFiles(repo, place);
    const r = await landFiles(repo, place, files, 'ci: add the nexus cloud loop', { owner, run, commitTimeoutMs });
    if (r.status !== 200) return r;
    const out = { ...r, path: WORKFLOW_PATH, written: true, ...(files[SETUP_ACTION_PATH] ? { setup: SETUP_ACTION_PATH } : {}) };
    if (owner) Object.assign(out, await ownerLoopMode(repo, run));
    return out;
  } catch (e) {
    return fail(e.status || 500, String(e.message || e));
  }
}

/**
 * A preset chosen sets the repo variable NEXUS_CADENCE to it, which every march job's Cadence step reads (the ceiling,
 * chain max, idle backoff and heartbeat hours). Owner mode only, best effort: a variable already at it is kept. A
 * contributor sets no repo variable (as with NEXUS_LOOP_MODE): the answer carries the command for the owner.
 * -> { name, variable: 'set' | 'kept' | null, note? }
 */
async function cadenceVariable(repo, run, name, owner) {
  const fix = `gh variable set NEXUS_CADENCE --body ${name}`;
  if (!owner) return { name, variable: null, note: `the cadence needs the repo variable too, which the owner sets once the cron is merged: ${fix}` };
  const l = await run('gh', ['variable', 'list', '--json', 'name,value'], { cwd: repo });
  const vars = l.ok ? json(l.stdout) : null;
  if (Array.isArray(vars) && vars.find((x) => x.name === 'NEXUS_CADENCE')?.value === name) return { name, variable: 'kept' };
  const s = await run('gh', ['variable', 'set', 'NEXUS_CADENCE', '--body', name], { cwd: repo });
  return s.ok ? { name, variable: 'set' } : { name, variable: null, note: `could not set NEXUS_CADENCE (that needs admin on the repo): ${fix}` };
}

/**
 * POST /api/cloud/schedule { schedule, cron }: set the loop workflow's schedule and land it per owner mode. A preset
 * (calm, steady, eager, sprint, off) writes its cron (off: none), ceiling and heartbeat hours (presetTexts), then sets
 * NEXUS_CADENCE (cadenceVariable), even when the files already match (steady, eager and sprint share a cron).
 * Overnight or a bare cron changes the cron line only. A repo with no loop workflow gets it, with this schedule, in
 * the same commit.
 * -> { status, cron, next (ISO, UTC; null with no schedule), path, written, sha?, pr?, cadence?: { name, variable, note? } }.
 */
export async function saveSchedule(repo, body, { owner = false, run = shRun, now = new Date(), commitTimeoutMs } = {}) {
  const q = scheduleRequest(body);
  if (q.error) return fail(400, q.error);
  const next = q.cron ? cronNext(q.cron, now)?.toISOString() ?? null : null;
  try {
    const off = await notOnGitHub(repo);
    if (off) return off;
    const place = await landingPlace(repo, owner, { now });
    if (place.error) return place;
    const have = await loopAt(repo, place.base);
    let files = {};
    let message;
    if (have) {
      const text = await showFile(repo, place.base, have);
      if (q.cadence) {
        const hb = await showFile(repo, place.base, HEARTBEAT_PATH);
        const t = await presetTexts(q.cadence, { march: text, heartbeat: hb });
        if (t.march !== text) files[have] = t.march;
        if (hb != null && t.heartbeat !== hb) files[HEARTBEAT_PATH] = t.heartbeat;
      } else {
        const crons = readCrons(text);
        const same = q.cron == null ? crons.length === 0 : crons.length === 1 && crons[0] === q.cron;
        if (!same) files[have] = setCron(text, q.cron);
      }
      message = `ci: the cloud loop runs ${q.human}`;
    } else {
      files = await workflowFiles(repo, place, q);
      message = `ci: add the nexus cloud loop, run ${q.human}`;
    }
    let out;
    if (Object.keys(files).length) {
      const r = await landFiles(repo, place, files, message, { owner, run, commitTimeoutMs });
      if (r.status !== 200) return r;
      out = { ...r, cron: q.cron, next, path: have || WORKFLOW_PATH, written: true };
      if (!have && owner) Object.assign(out, await ownerLoopMode(repo, run));
    } else {
      out = { status: 200, cron: q.cron, next, path: have, written: false, sha: await lastSha(repo, place.base, have), branch: place.head };
    }
    if (q.cadence) out.cadence = await cadenceVariable(repo, run, q.cadence, owner);
    return out;
  } catch (e) {
    return fail(e.status || 500, String(e.message || e));
  }
}
