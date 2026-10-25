// `npx @usenexus/cli upgrade`: a v1 repo (a phase plan) to nexus v2 (specs + chunks), dry run first (spec 58).
//
// The flow never reads or writes the local checkout: it fetches the origin's default branch and works in a
// temporary worktree cut from it (a local tree can be months stale and dirty). There it detects the shape, reads the
// repo's own march and iterate steps (kit-text.mjs: anything no kit version ever held), copies the v2 kit file set
// (the CLI's bundled kit/upgrade/, else the nexus repo's templates/ in a dev checkout), carries those steps into the
// lanes files verbatim, keeps custom skills and commands (a command with no skill becomes one), merges the roadmap,
// converts the build plan with the kit's converter, retires the v1 files (playbooks/upgrade.md Step 5), rewrites v1
// references outside history files, flips the lock, runs plan-check and its test, plays march's pick order forward
// for the first dispatch, and reports. A dry run removes the worktree; a red gate keeps it and prints its path.
//
//   npx @usenexus/cli upgrade [--repo <dir>] [--json]
//
// Exit 0: the report printed (a v2 repo: "already on v2"). Exit 1: the gate failed (worktree kept). Exit 2: not a
// v1 or half-done repo, no origin, or a flag this release does not carry yet.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TRAIN, customUnits, fromJson, laneBlocks, mergeText, textOf, toJson } from './kit-text.mjs';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** The CLI's bundled kit file set (scripts/bundle-kit.mjs writes it; templates/ layout plus files.json). */
export const UPGRADE_BUNDLED = path.join(PKG, 'kit', 'upgrade');
const NEXUS_ROOT = path.resolve(PKG, '..', '..');

export const COMMIT_SUBJECT = 'plan: upgrade to nexus v2 (specs + chunks)';
export const BRANCH = 'nexus/upgrade-v2';
export const BUILD_PLAN = 'plan/steps/01_build_plan.md';

/** The v1 files Step 5 retires: whole folders and single files. */
export const RETIRE = Object.freeze(['plan/steps', 'plan/phases', 'skills/ship-a-phase.md', 'skills/plan-a-phase.md',
  '.claude/commands/ship-a-phase.md', '.claude/commands/plan-a-phase.md']);

/**
 * v1 references and their v2 spelling, most specific first. The build plan and its folder become the roadmap; a
 * phase brief (or plan/phases itself) becomes the roadmap too, which lists every spec: a path that always exists, so
 * a rewritten link never breaks.
 */
export const REWRITES = Object.freeze([
  [/(?:\.\/)?(?:plan\/)?(?:steps\/)?01_build_plan(?:\.md)?/g, 'plan/README.md'],
  [/plan\/(?:steps|phases)(?:\/[\w*{}-]+(?:\.[\w*{}-]+)*)*\/?/g, 'plan/README.md'],
  [/ship-a-phase/g, 'ship-a-chunk'],
  [/plan-a-phase/g, 'plan-a-spec'],
  [/PHASE_CANDIDATES/g, 'CANDIDATES'],
]);
/** v1 references left after the rewrite (none should be): each one is a warning naming its file. */
export const V1_LEFT = /01_build_plan|plan\/phases|plan\/steps|ship-a-phase|plan-a-phase|PHASE_CANDIDATES/;

const TEXT = /\.(md|mjs|cjs|js|ts|json|ya?ml|txt|sh|ps1|toml)$/i;
/** History files keep their v1 words: they record what was. */
export const isHistory = (rel) => /(^|\/)(ARCHIVE|DIGEST)\.md$/.test(rel) || /(^|\/)CHANGELOG[^/]*$/i.test(rel) || /\d{4}-\d{2}-\d{2}/.test(path.posix.basename(rel));

const posix = (p) => p.split(path.sep).join('/');
const exists = (dir, rel) => fs.existsSync(path.join(dir, ...rel.split('/')));
const read = (dir, rel) => { try { return fs.readFileSync(path.join(dir, ...rel.split('/')), 'utf8'); } catch { return null; } };
function write(dir, rel, text) {
  const abs = path.join(dir, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text);
}

/** A field of plan/nexus.lock text (`shape: chunks`), or null. */
export function lockField(text, key) {
  const line = String(text || '').split(/\r?\n/).find((l) => l.startsWith(`${key}:`));
  const v = line ? line.slice(key.length + 1).replace(/#.*$/, '').trim() : '';
  return v || null;
}

/**
 * The repo's shape: { shape: 'v1' | 'half' | 'v2' | 'none', why }. v1 is a build plan with no lock (or a lock
 * still saying `phases`); half is a lock saying `chunks` beside a live plan/steps/ or plan/PHASE_CANDIDATES.md.
 */
export function detect(dir) {
  const lock = read(dir, 'plan/nexus.lock');
  const shape = lockField(lock, 'shape');
  const steps = exists(dir, 'plan/steps');
  const cands = exists(dir, 'plan/PHASE_CANDIDATES.md');
  if (shape === 'chunks') {
    if (steps || cands) return { shape: 'half', why: `plan/nexus.lock says chunks beside ${[steps && 'plan/steps/', cands && 'plan/PHASE_CANDIDATES.md'].filter(Boolean).join(' and ')}` };
    return { shape: 'v2', why: 'plan/nexus.lock says chunks' };
  }
  if (exists(dir, BUILD_PLAN)) return { shape: 'v1', why: lock ? `plan/nexus.lock says ${shape || 'no shape'}, and ${BUILD_PLAN} is there` : `no plan/nexus.lock, and ${BUILD_PLAN} is there` };
  return { shape: 'none', why: `no plan/nexus.lock saying chunks and no ${BUILD_PLAN}` };
}

/**
 * Where the v2 kit comes from: { root, files, text, from } in templates/ layout (scripts/, skills/, claude/commands/,
 * plan/ seeds). The bundled kit/upgrade/ first; else, in the nexus repo itself, its templates/ and the list
 * scripts/upgrade-files.mjs computes. Null when neither is there. `text` is the kit-text list (kit-text.json: every
 * header and paragraph the kit's march and iterate skills ever held), or null when the kit carries none.
 */
export async function kitSource({ bundled = UPGRADE_BUNDLED, nexus = NEXUS_ROOT } = {}) {
  const manifest = path.join(bundled, 'files.json');
  if (fs.existsSync(manifest)) {
    let text = null;
    try { text = JSON.parse(fs.readFileSync(path.join(bundled, 'kit-text.json'), 'utf8')); } catch { /* an older bundle: the current skills only */ }
    return { root: bundled, files: JSON.parse(fs.readFileSync(manifest, 'utf8')).files, text, from: 'bundled' };
  }
  const list = path.join(nexus, 'scripts', 'upgrade-files.mjs');
  if (!fs.existsSync(list)) return null;
  const { upgradeFiles } = await import(pathToFileURL(list).href);
  const kt = path.join(nexus, 'scripts', 'upgrade-kit-text.mjs');
  const text = fs.existsSync(kt) ? await (await import(pathToFileURL(kt).href)).build(nexus, { history: false }) : null;
  return { root: path.join(nexus, 'templates'), files: upgradeFiles(nexus).files, text, from: 'templates' };
}

const kitPath = (kit, f) => path.join(kit.root, ...f.kit.replace(/^templates\//, '').split('/'));
const kitModule = (kit, rel) => import(pathToFileURL(path.join(kit.root, ...rel.split('/'))).href);

/** git in `cwd`, synchronously, never through a shell: { ok, out, err }. */
export function gitIn(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || r.error?.message || '').trim() };
}

/** A remote URL with any userinfo (user:token@) taken out, safe to print or ship in --json. */
export function redactUrl(s) {
  return String(s ?? '').replace(/(\w+:\/\/)[^@/\s]+@/g, '$1');
}

/** The origin's default branch: what its HEAD points at, else origin/HEAD here, else main. */
export function defaultBranch(repo) {
  const sym = gitIn(repo, ['ls-remote', '--symref', 'origin', 'HEAD']);
  const m = sym.ok && /^ref:\s+refs\/heads\/(\S+)\s+HEAD/m.exec(sym.out);
  if (m) return m[1];
  const local = gitIn(repo, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  return local.ok ? local.out.replace(/^origin\//, '') : 'main';
}

/**
 * A temporary worktree of the origin's default branch, freshly fetched: { dir, url, branch, sha, remove() }. The
 * local checkout's files and index are never read or changed (the fetch moves only origin/<branch>). Hooks are off
 * for the checkout. Throws with a reason when there is no origin or the fetch fails.
 */
export function freshWorktree(repo) {
  const url = gitIn(repo, ['remote', 'get-url', 'origin']);
  if (!url.ok) throw Object.assign(new Error('no origin remote: the upgrade works from a fresh fetch of origin'), { code: 2 });
  const branch = defaultBranch(repo);
  const fetched = gitIn(repo, ['fetch', '--quiet', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`]);
  if (!fetched.ok) throw Object.assign(new Error(`git fetch origin ${branch} failed: ${redactUrl(fetched.err)}`), { code: 2 });
  const sha = gitIn(repo, ['rev-parse', `refs/remotes/origin/${branch}`]).out;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-upgrade-'));
  const hooks = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-upgrade-hooks-'));
  const added = gitIn(repo, ['-c', `core.hooksPath=${hooks}`, 'worktree', 'add', '--quiet', '--detach', dir, sha]);
  fs.rmSync(hooks, { recursive: true, force: true });
  if (!added.ok) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw Object.assign(new Error(`git worktree add failed: ${redactUrl(added.err)}`), { code: 2 });
  }
  const remove = () => {
    gitIn(repo, ['worktree', 'remove', '--force', dir]);
    fs.rmSync(dir, { recursive: true, force: true });
    gitIn(repo, ['worktree', 'prune']);
  };
  return { dir, url: redactUrl(url.out), branch, sha, remove };
}

/**
 * Copy the kit file set into `dir`: one row per file, { path, status }: `added`, `replaced`, `same` (identical
 * already) or, for a lanes file, `seeded` when missing and `kept-custom` when the repo has one (never overwritten).
 */
export function copyKit(dir, kit) {
  const rows = [];
  for (const f of kit.files) {
    const theirs = fs.readFileSync(kitPath(kit, f));
    const ours = exists(dir, f.repo) ? fs.readFileSync(path.join(dir, ...f.repo.split('/'))) : null;
    if (f.kind === 'lane') {
      if (ours) rows.push({ path: f.repo, status: 'kept-custom' });
      else { write(dir, f.repo, theirs); rows.push({ path: f.repo, status: 'seeded' }); }
      continue;
    }
    if (ours && ours.equals(theirs)) { rows.push({ path: f.repo, status: 'same' }); continue; }
    write(dir, f.repo, theirs);
    rows.push({ path: f.repo, status: ours ? 'replaced' : 'added' });
  }
  return rows;
}

/**
 * The repo's own march and iterate text, read before the kit's skills replace them: { [skill]: units } (kit-text.mjs
 * customUnits), judged against every version the kit ever shipped (`kit.text`) plus the kit's current skill (so a kit
 * with no list still knows its own text). A skill the repo lacks has no entry.
 */
export function customTrain(dir, kit) {
  const out = {};
  for (const skill of Object.keys(TRAIN)) {
    const ours = read(dir, `skills/${skill}`);
    if (ours == null) continue;
    const theirs = read(kit.root, `skills/${skill}`);
    const t = fromJson(toJson(mergeText(kit.text?.[skill], theirs == null ? null : textOf(theirs))));
    out[skill] = customUnits(ours, t);
  }
  return out;
}

/**
 * Carry the train: each skill's custom units go into its lanes file (spec 57's extension point) as lane blocks, the
 * text verbatim under its original header, v1 references rewritten. Appended after what the lanes file holds (the
 * kit's seed, or the repo's own), never over it. Returns { rows, warnings }.
 */
export function carryTrain(dir, train, { today } = {}) {
  const rows = [];
  const warnings = [];
  for (const [skill, units] of Object.entries(train)) {
    if (!units.length) continue;
    const { lanes: rel, kind } = TRAIN[skill];
    const have = read(dir, rel) || '';
    const taken = new Set([...have.matchAll(/^##\s+lane:\s*(\S+)/gm)].map((m) => m[1]));
    let refs = 0;
    const rewrite = (s) => { const r = rewriteText(s); refs += r.n; return r.text; };
    const { text, names } = laneBlocks(units, { kind, skill, taken, rewrite });
    const lead = `<!-- Moved from the v1 skills/${skill} by nexus upgrade${today ? ` (${today})` : ''}: the text the kit never shipped, verbatim. Check each lane's hook and when. -->`;
    write(dir, rel, `${have.replace(/\s*$/, '')}\n\n${lead}\n\n${text}\n`);
    const sections = units.filter((u) => u.kind === 'section').length;
    const paras = units.length - sections;
    const what = [sections && `${sections} custom section${sections === 1 ? '' : 's'}`, paras && `custom paragraphs in ${paras} kit step${paras === 1 ? '' : 's'}`].filter(Boolean).join(' and ');
    rows.push({ path: rel, status: `moved-to-lane (${names.length})`, note: `${names.join(', ')}${refs ? `; ${refs} v1 ref${refs === 1 ? '' : 's'} rewritten` : ''}` });
    rows.push({ path: `skills/${skill}`, status: 'replaced', note: `${what} moved to ${rel}` });
    warnings.push(`skills/${skill}: ${what} moved to ${rel} as lanes ${names.join(', ')}; check each lane's hook and when`);
  }
  return { rows, warnings };
}

/** A command's front matter and body: { front, body }. */
function splitFront(text) {
  const t = text.replace(/\r\n/g, '\n');
  const m = /^---\n[\s\S]*?\n---\n/.exec(t);
  return m ? { front: m[0], body: t.slice(m[0].length) } : { front: '', body: t };
}

/**
 * Custom skills and commands stay. One the kit never shipped is kept as it is (a `kept-custom` row); a
 * `.claude/commands/` entry with no skill (no skills/<name>.md, and no skills/ file its text names) becomes one:
 * skills/<name>.md takes its body verbatim, and the command keeps its front matter and points at the skill. Rows.
 */
export function keepCustom(dir, kitFiles) {
  const rows = [];
  const retired = new Set(RETIRE);
  const list = (rel) => {
    try {
      return fs.readdirSync(path.join(dir, ...rel.split('/')), { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => `${rel}/${e.name}`);
    } catch { return []; }
  };
  for (const rel of list('skills')) {
    if (!kitFiles.has(rel) && !retired.has(rel)) rows.push({ path: rel, status: 'kept-custom' });
  }
  for (const rel of list('.claude/commands')) {
    if (kitFiles.has(rel) || retired.has(rel)) continue;
    const name = path.posix.basename(rel, '.md');
    const text = read(dir, rel);
    const named = [...text.matchAll(/skills\/([\w./-]+?\.md)/g)].some((m) => exists(dir, `skills/${m[1]}`));
    if (exists(dir, `skills/${name}.md`) || named) { rows.push({ path: rel, status: 'kept-custom' }); continue; }
    const { front, body } = splitFront(text);
    write(dir, `skills/${name}.md`, `# Skill: ${name}\n\n> Moved from \`.claude/commands/${name}.md\` by the nexus v2 upgrade; the command points here.\n\n---\n\n${body.replace(/^\s+/, '')}`);
    const arg = /\$ARGUMENTS/.test(body) ? '\nArgument: $ARGUMENTS\n' : '';
    write(dir, rel, `${front}${front ? '\n' : ''}You are invoked under the \`${name}\` skill. Read \`skills/${name}.md\`\nend to end and follow its procedure; that file is the single\nsource of truth.\n${arg}`);
    rows.push({ path: `skills/${name}.md`, status: 'moved-to-skill', note: `from ${rel}` });
    rows.push({ path: rel, status: 'kept-custom', note: `points at skills/${name}.md` });
  }
  return rows;
}

/** The repo's name for `<PROJECT>`: package.json `name`, else the agents.md title, else the folder's name. */
export function projectName(dir) {
  try {
    const name = JSON.parse(read(dir, 'package.json') || 'null')?.name;
    if (typeof name === 'string' && name.trim()) return name.trim().replace(/^@[^/]+\//, '');
  } catch { /* not JSON: fall through */ }
  const title = /^#\s+(.+?)\s*$/m.exec(read(dir, 'agents.md') || '')?.[1];
  const cleaned = title?.replace(/`/g, '').replace(/\s*[—–:-]*\s*agents\.md\s*[—–:-]*\s*/i, ' ').trim();
  return cleaned && !/^agents$/i.test(cleaned) ? cleaned : path.basename(dir);
}

/**
 * The v2 roadmap from the repo's README and the kit's: a README with a `## Specs` table stays as it is; one without
 * gains the kit's `## Lanes` and an empty `## Specs` table ahead of its first section, its own sections kept in
 * place; no README at all takes the kit's whole. `<PROJECT>` is filled either way.
 */
export function mergeRoadmap(current, template, project) {
  const fill = (t) => t.replace(/<PROJECT>/g, project);
  if (current == null) return fill(template.replace(/\r\n/g, '\n'));
  const text = current.replace(/\r\n/g, '\n');
  if (/^## Specs\s*$/m.test(text) && /^\|\s*#\s*\|/m.test(text)) return fill(text);
  const t = template.replace(/\r\n/g, '\n').split('\n');
  const lanesAt = t.findIndex((l) => /^## Lanes\s*$/.test(l));
  const specsAt = t.findIndex((l) => /^## Specs\s*$/.test(l));
  const headAt = t.findIndex((l, i) => i > specsAt && /^\|\s*#\s*\|/.test(l));
  const block = [...t.slice(lanesAt, specsAt), ...t.slice(specsAt, headAt), t[headAt], t[headAt + 1], ''];
  const lines = text.split('\n');
  let at = lines.findIndex((l) => /^## /.test(l));
  if (at === -1) { at = lines.length; if (lines[at - 1] !== '') lines.push(''); at = lines.length; }
  lines.splice(at, 0, ...block);
  return fill(lines.join('\n'));
}

/** Text with REWRITES applied: { text, n } (n = references rewritten). */
export function rewriteText(text) {
  let n = 0;
  let out = text;
  for (const [from, to] of REWRITES) {
    out = out.replace(from, () => { n += 1; return to; });
  }
  return { text: out, n };
}

function walk(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(dir, r));
    else if (e.isFile()) out.push(r);
  }
  return out;
}

/**
 * Step 5: retire the v1 files, rename PHASE_CANDIDATES.md, rewrite v1 references outside history files and the
 * kit's own files (`skip`). Returns { rows, warnings }.
 */
export function retireV1(dir, { skip = new Set() } = {}) {
  const rows = [];
  const warnings = [];
  for (const rel of RETIRE) {
    const abs = path.join(dir, ...rel.split('/'));
    if (!fs.existsSync(abs)) continue;
    const files = fs.statSync(abs).isDirectory() ? walk(dir, rel) : [rel];
    fs.rmSync(abs, { recursive: true, force: true });
    for (const f of files) rows.push({ path: f, status: 'retired' });
  }
  if (exists(dir, 'plan/PHASE_CANDIDATES.md')) {
    if (exists(dir, 'plan/CANDIDATES.md')) warnings.push('plan/PHASE_CANDIDATES.md and plan/CANDIDATES.md both exist: merge the first into the second by hand');
    else {
      fs.renameSync(path.join(dir, 'plan', 'PHASE_CANDIDATES.md'), path.join(dir, 'plan', 'CANDIDATES.md'));
      rows.push({ path: 'plan/CANDIDATES.md', status: 'renamed', note: 'from plan/PHASE_CANDIDATES.md' });
    }
  }
  const left = [];
  for (const rel of walk(dir)) {
    if (!TEXT.test(rel) || isHistory(rel) || skip.has(rel)) continue;
    const text = read(dir, rel);
    if (text == null) continue;
    const { text: next, n } = rewriteText(text);
    if (n) { write(dir, rel, next); rows.push({ path: rel, status: `rewritten (${n} ref${n === 1 ? '' : 's'})` }); }
    if (V1_LEFT.test(next)) left.push(rel);
  }
  if (left.length) warnings.push(`v1 references remain in: ${left.join(', ')}`);
  return { rows, warnings };
}

/** The kit's lock with shape chunks and today's date. */
export function flippedLock(seed, today) {
  const text = seed || 'kit: nexus\nversion: 2.0.0\nref: v2.0.0\nshape: chunks\nadopted: YYYY-MM-DD\n';
  return text.replace(/^shape:.*$/m, 'shape: chunks').replace(/^adopted:.*$/m, `adopted: ${today}`);
}

/** Did the v1 loop push the default branch? Cloud ticks sign their commits `Cloud-Run: <url>`. */
export function loopModeOf(dir, ref = 'HEAD') {
  const r = gitIn(dir, ['log', ref, '-E', '--grep=^Cloud-Run:', '--format=%h']);
  const pushes = r.ok && r.out ? r.out.split(/\r?\n/).length : 0;
  return { mode: pushes ? 'owner' : 'pr', pushes };
}

/** plan-check and its test in `dir`: [{ name, ok, out }]. A repo without plan-check gets one failing row. */
export function gate(dir, { node = process.execPath } = {}) {
  const run = (name, args) => {
    const r = spawnSync(node, args, { cwd: dir, encoding: 'utf8', windowsHide: true, timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
    const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
    return { name, ok: r.status === 0, out: out.split(/\r?\n/).slice(-20).join('\n') };
  };
  if (!exists(dir, 'scripts/plan-check.mjs')) return [{ name: 'plan-check', ok: false, out: 'scripts/plan-check.mjs is not in this repo' }];
  const rows = [run('plan-check', ['scripts/plan-check.mjs'])];
  if (exists(dir, 'scripts/__tests__/plan-check.test.mjs')) rows.push(run('plan-check test', ['--test', 'scripts/__tests__/plan-check.test.mjs']));
  return rows;
}

/**
 * The first tick's dispatch, predicted: march's pick order played forward (scripts/plan/order.mjs, lanes included).
 * Owner mode runs the whole dispatch (a pre lane, a ready chunk, a queue lane, pending data, else /iterate); PR mode
 * picks only chunks, so a plan with none ready is an idle tick. { kind, text, idle }.
 */
export async function predict(dir, kit, { mode }) {
  const { simulate } = await kitModule(kit, 'scripts/plan/order.mjs');
  const { SPEC_FILE, parseSpec } = await kitModule(kit, 'scripts/plan-check.mjs');
  const { parseLanes, lanesOff, withStock } = await kitModule(kit, 'scripts/plan/lanes.mjs');
  const readme = read(dir, 'plan/README.md') || '';
  const specs = fs.readdirSync(path.join(dir, 'plan')).filter((n) => SPEC_FILE.test(n)).map((n) => parseSpec(n, read(dir, `plan/${n}`)));
  const sim = simulate({ readme, specs });
  const first = sim.next[0];
  const chunk = first ? { kind: 'chunk', text: `/next ${first.id} ${first.title} (${first.lane})`, idle: false }
    : sim.unchunked.length ? { kind: 'chunk', text: `/next chunks spec ${sim.unchunked[0]} first (Not chunked yet.)`, idle: false } : null;
  if (mode !== 'owner') return chunk || { kind: 'idle', text: 'idle: pull-request mode picks only chunks, and none is ready', idle: true };
  const bearings = read(dir, 'plan/bearings.md') || '';
  const off = lanesOff(bearings);
  const { lanes } = parseLanes(read(dir, 'skills/march.lanes.md') || '', 'march');
  const at = (hook) => withStock(lanes, { kind: 'march', hook, bearings }).find((l) => l.hook === hook && !off.has(l.name));
  const asap = first?.lane === 'asap';
  const pre = !asap && at('pre');
  if (pre) return { kind: 'lane', text: `lane ${pre.name} (pre: ${pre.run}${pre.when && pre.when !== 'always' ? `, when ${pre.when}` : ''})`, idle: false };
  if (chunk) return chunk;
  const queue = at('queue');
  if (queue) return { kind: 'lane', text: `lane ${queue.name} (queue: ${queue.run}${queue.when && queue.when !== 'always' ? `, when ${queue.when}` : ''})`, idle: false };
  if (/^- \[ \]/m.test(read(dir, 'data/BACKLOG.md') || '')) return { kind: 'data', text: '/ship-data (data/BACKLOG.md has a pending row)', idle: false };
  return { kind: 'iterate', text: '/iterate (no chunk, lane or data row is ready)', idle: false };
}

/**
 * The dry run, start to end, on the repo at `repo` (any folder inside it). Returns { code, report } and never
 * throws for an expected stop. `keep` keeps the worktree even when the gate is green.
 */
export async function upgrade({ repo, today = new Date().toISOString().slice(0, 10), kit = null, keep = false } = {}) {
  const top = gitIn(repo, ['rev-parse', '--show-toplevel']);
  if (!top.ok) return { code: 2, report: { error: `${repo} is not a git repository` } };
  const root = path.resolve(top.out);
  let wt;
  try {
    wt = freshWorktree(root);
  } catch (e) {
    return { code: e.code || 2, report: { error: e.message } };
  }
  const report = { repo: root, origin: { url: wt.url, branch: wt.branch, sha: wt.sha }, dry: true, files: [], archive: [], warnings: [], gate: [], dispatch: null, loop: null, worktree: null };
  let red = false;
  try {
    const shape = detect(wt.dir);
    report.shape = shape.shape;
    report.why = shape.why;
    if (shape.shape === 'v2') return { code: 0, report: { ...report, message: 'already on v2' } };
    if (shape.shape === 'none') return { code: 2, report: { ...report, error: `not a nexus v1 repo: ${shape.why}` } };
    kit = kit || await kitSource();
    if (!kit) return { code: 2, report: { ...report, error: 'no bundled kit (kit/upgrade/files.json) and no nexus templates/ beside the CLI' } };
    const kitFiles = new Set(kit.files.map((f) => f.repo));

    if (shape.shape === 'v1') {
      // The repo's own march and iterate steps are read before the kit's skills replace them.
      const train = customTrain(wt.dir, kit);
      report.files.push(...copyKit(wt.dir, kit).filter((r) => r.status !== 'same'));
      const carried = carryTrain(wt.dir, train, { today });
      report.files.push(...carried.rows);
      report.warnings.push(...carried.warnings);
      report.files.push(...keepCustom(wt.dir, kitFiles));
      const readme = read(wt.dir, 'plan/README.md');
      const merged = mergeRoadmap(readme, fs.readFileSync(path.join(kit.root, 'plan', 'README.md'), 'utf8'), projectName(wt.dir));
      if (merged !== readme?.replace(/\r\n/g, '\n')) { write(wt.dir, 'plan/README.md', merged); report.files.push({ path: 'plan/README.md', status: readme == null ? 'added' : 'merged', note: 'v2 lanes and spec table; its own sections kept' }); }
      const { run } = await kitModule(kit, 'scripts/upgrade-plan.mjs');
      const conv = run({ repoAbs: wt.dir, write: true, today });
      report.warnings.push(...conv.warnings);
      for (const f of conv.files) {
        if (f.kind === 'append') report.archive.push(...f.added);
        if (f.path === 'plan/README.md') continue;
        report.files.push({ path: f.path, status: f.kind === 'new' ? 'converted' : f.kind === 'append' ? `appended (${f.added.length} lines)` : 'updated' });
      }
      if (conv.failures.length) { red = true; report.gate.push({ name: 'converter', ok: false, out: conv.failures.join('\n') }); }
    }

    const retired = retireV1(wt.dir, { skip: kitFiles });
    report.files.push(...retired.rows);
    report.warnings.push(...retired.warnings);

    if (shape.shape === 'v1') {
      const lock = read(wt.dir, 'plan/nexus.lock');
      write(wt.dir, 'plan/nexus.lock', flippedLock(read(kit.root, 'plan/nexus.lock'), today));
      report.files.push({ path: 'plan/nexus.lock', status: lock == null ? 'added' : 'replaced', note: 'shape: chunks' });
    }

    if (!red) report.gate.push(...gate(wt.dir));
    red = red || report.gate.some((g) => !g.ok);
    report.loop = { ...loopModeOf(wt.dir), branch: wt.branch };
    const guess = (mode) => predict(wt.dir, kit, { mode }).catch((e) => ({ kind: 'unknown', text: `could not predict: ${e.message}`, idle: false }));
    report.dispatch = await guess(report.loop.mode);
    report.dispatch.live = report.loop.pushes > 0;
    // A live v1 loop: until NEXUS_LOOP_MODE=owner is set, the first v2 tick runs in PR mode, which may be idle.
    if (report.dispatch.live) report.dispatch.pr = await guess('pr');
  } finally {
    if (red || keep) report.worktree = wt.dir;
    else wt.remove();
  }
  report.files = mergeRows(report.files);
  return { code: red ? 1 : 0, report };
}

/** One row per path, sorted: a file two steps touched reads `merged, rewritten (3 refs)`. */
export function mergeRows(rows) {
  const by = new Map();
  for (const r of rows) {
    const had = by.get(r.path);
    if (!had) { by.set(r.path, { ...r }); continue; }
    if (!had.status.split(', ').includes(r.status)) had.status = `${had.status}, ${r.status}`;
    if (r.note) had.note = had.note ? `${had.note}; ${r.note}` : r.note;
  }
  return [...by.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

const RED = (on) => (s) => (on ? `\u001b[31m${s}\u001b[0m` : s);

/** The report as the terminal reads it. `color` turns the red warnings on. */
export function render(report, { color = false } = {}) {
  const red = RED(color);
  if (report.error && !report.shape) return `nexus upgrade: ${report.error}`;
  const out = [];
  const o = report.origin;
  out.push('nexus upgrade: dry run (nothing written; the local checkout is not touched)');
  out.push(`  repo     ${report.repo}`);
  if (o) out.push(`  origin   ${o.url} ${o.branch} @ ${o.sha.slice(0, 7)} (fetched now)`);
  if (report.error) { out.push('', `nexus upgrade: ${report.error}`); return out.join('\n'); }
  if (report.message) { out.push('', `${report.message}: ${report.why}. Nothing to upgrade.`); return out.join('\n'); }
  out.push(`  shape    ${report.shape === 'half' ? 'half-done (finishing Step 5 only)' : 'v1 (phases) -> v2 (specs + chunks)'}: ${report.why}`);
  out.push('', `files (${report.files.length})`);
  const w = Math.max(8, ...report.files.map((f) => f.status.length));
  for (const f of report.files) out.push(`  ${f.status.padEnd(w)}  ${f.path}${f.note ? `  (${f.note})` : ''}`);
  if (report.shape === 'v1') {
    out.push('', `archive (+${report.archive.length} line${report.archive.length === 1 ? '' : 's'})`);
    for (const l of report.archive) out.push(`  + ${l}`);
  }
  out.push('', `warnings (${report.warnings.length})`);
  for (const wn of report.warnings) out.push(`  - ${wn}`);
  out.push('', 'gate');
  for (const g of report.gate) {
    out.push(`  ${g.ok ? 'green' : red('RED  ')}  ${g.name}`);
    if (!g.ok && g.out) for (const l of g.out.split('\n')) out.push(`         ${l}`);
  }
  if (report.dispatch) {
    const d = report.dispatch;
    out.push('', 'first dispatch (predicted)');
    if (d.pr) {
      out.push(d.pr.idle
        ? `  ${red('idle until NEXUS_LOOP_MODE=owner is set: the v1 loop was live')}`
        : `  until NEXUS_LOOP_MODE=owner is set (pr mode): ${d.pr.text}`);
      out.push(`  owner mode: ${d.text}`);
    } else out.push(`  ${d.idle && d.live ? red(`${d.text}: the v1 loop was live, so this tick would do nothing`) : d.text}`);
  }
  if (report.loop) {
    const l = report.loop;
    out.push('', 'loop mode');
    out.push(l.mode === 'owner'
      ? `  owner: the v1 loop pushed ${l.branch} (${l.pushes} Cloud-Run commit${l.pushes === 1 ? '' : 's'}); set it before the first v2 tick:\n  gh variable set NEXUS_LOOP_MODE --body owner   (--land owner will run it)`
      : `  pr: no Cloud-Run commit on ${l.branch}; the v2 loop lands each chunk as a pull request (--land pr)`);
  }
  out.push('');
  out.push(report.worktree ? `worktree kept: ${report.worktree}` : 'The worktree is removed. --write (a later release) commits this as one commit on nexus/upgrade-v2.');
  return out.join('\n');
}

export const UPGRADE_HELP = `nexus upgrade: move a nexus v1 repo (a phase plan) to v2 (specs + chunks).

  npx @usenexus/cli upgrade                 dry run on the repo in this folder:
                                            a fresh fetch of origin in a
                                            temporary worktree, the local
                                            checkout untouched; prints the
                                            per-file report, the archive lines,
                                            warnings, the gate, the predicted
                                            first dispatch and the loop mode
  npx @usenexus/cli upgrade --repo <dir>    ...for another folder
  npx @usenexus/cli upgrade --json          the report as JSON

  Exit 0: the report printed (a v2 repo: already on v2). Exit 1: the
  gate failed (the worktree is kept and its path printed). Exit 2: not a
  v1 repo, no origin, or a flag this release does not carry yet.

  The runbook: https://github.com/daretodave/nexus/blob/main/playbooks/upgrade.md`;

/** Flags spec 58 names that a later release carries: refused here rather than ignored. */
export const LATER = Object.freeze(['--write', '--land', '--rollback', '--pr', '--no-pause', '--no-watch', '--keep-workflow']);

/** `nexus upgrade <args>`: the exit code. */
export async function runUpgrade(argv, { out = (s) => process.stdout.write(`${s}\n`), err = (s) => process.stderr.write(`${s}\n`), cwd = process.cwd(), color = process.stdout.isTTY && !process.env.NO_COLOR, today } = {}) {
  if (argv.includes('--help') || argv.includes('-h')) { out(UPGRADE_HELP); return 0; }
  const later = argv.filter((a) => LATER.includes(a));
  if (later.length) { err(`nexus upgrade: ${later.join(', ')} ${later.length === 1 ? 'is' : 'are'} not in this release yet; the dry run is (run it with no flags)`); return 2; }
  const known = new Set(['--repo', '--json']);
  const i = argv.indexOf('--repo');
  const bad = argv.filter((a, k) => !known.has(a) && !(i >= 0 && k === i + 1));
  if (bad.length || (i >= 0 && !argv[i + 1])) { err(`nexus upgrade: unknown argument ${bad[0] ?? '--repo (needs a folder)'}\n\n${UPGRADE_HELP}`); return 2; }
  const repo = path.resolve(cwd, i >= 0 ? argv[i + 1] : '.');
  if (!fs.existsSync(repo) || !fs.statSync(repo).isDirectory()) { err(`nexus upgrade: ${repo} is not a folder`); return 2; }
  const { code, report } = await upgrade({ repo, today });
  if (argv.includes('--json')) out(JSON.stringify({ code, ...report }, null, 2));
  else (code === 2 ? err : out)(render(report, { color }));
  return code;
}
