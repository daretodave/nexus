// `npx @usenexus/cli upgrade`: a v1 repo (a phase plan) to nexus v2 (specs + chunks), dry run first (spec 58).
//
// The flow never reads or writes the local checkout: it fetches the origin's default branch and works in a
// temporary worktree cut from it (a local tree can be months stale and dirty). There it detects the shape, reads the
// repo's own march and iterate steps (kit-text.mjs: anything no kit version ever held), copies the v2 kit file set
// (the CLI's bundled kit/upgrade/, else the nexus repo's templates/ in a dev checkout), carries those steps into the
// lanes files verbatim, keeps custom skills and commands (a command with no skill becomes one), merges the roadmap,
// converts the build plan with the kit's converter, merges the v1 march.yml into the v2 owner-job shape (cron,
// ceiling, model pin, extra env and concurrency kept; the toolchain steps into .github/actions/setup:
// workflow-merge.mjs), writes the conservative knobs (KNOBS: the v1 train runs as it did), retires the v1 files
// (playbooks/upgrade.md Step 5), rewrites v1 references outside history files, flips the lock, runs
// plan-check, its test and workflow-lint (a problem the origin's own workflow already had is a warning) and, with
// --verify, the repo's own verify, plays march's pick order forward for the first dispatch, and reports. A dry run removes the worktree; a red gate keeps it and prints its path.
//
//   npx @usenexus/cli upgrade [--repo <dir> | --repo <owner/name>] [--json] [--keep-workflow] [--verify] [--write]
//                             [--land [owner|pr]] [--no-pause] [--no-watch] [--rollback] [--pr]
//
// --write commits the upgrade on nexus/upgrade-v2 (gate green only); --land carries it to the default branch between
// two ticks and watches the first v2 tick; --rollback reverts it in one commit (upgrade-land.mjs).
// `--repo owner/name` (or its GitHub URL) runs the same path on a blobless temporary clone, no local checkout; `--pr`
// pushes the result as a branch and opens (or updates) a pull request whose body is the report (upgrade-remote.mjs).
//
// On a v2 repo the same command is the sync to the current kit (sync.mjs: a three-way merge per kit file against the
// kit at the lock's ref, an assisted merge for a conflict, new content added, the lock's ref moved; --write commits it).
//
// Exit 0: the report printed (a v2 repo with no ref: "already on v2"). Exit 1: the gate failed (worktree kept). Exit 2: not a
// v1 or half-done repo, no origin, or a flag this release does not carry yet.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TRAIN, customUnits, fromJson, laneBlocks, mergeText, textOf, textOfPrompt, toJson } from './kit-text.mjs';
import { MARCH_YML, SETUP_ACTION, fill, keptLine, mergeWorkflow, packageManager, setupAction } from './workflow-merge.mjs';
import { kitBuild, renderSync, sync } from './sync.mjs';

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

/** plan/settle.json's `queue` (a build-queue file the repo's settle tidies), or null. */
export function settleQueue(dir) {
  try {
    const q = JSON.parse(read(dir, 'plan/settle.json') || 'null')?.queue;
    return typeof q === 'string' && q.trim() ? q.trim().replace(/^\.\//, '') : null;
  } catch { return null; }
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
    // A build queue the repo keeps on purpose (plan/settle.json `queue`, a key the kit's settle reads) is its own,
    // not a half-done upgrade: the repo is v2 and syncs.
    const queue = settleQueue(dir);
    if ((steps || cands) && queue && /^plan\/steps\//.test(queue)) return { shape: 'v2', why: `plan/nexus.lock says chunks; plan/settle.json keeps ${queue} as its build queue` };
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
    const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    return { root: bundled, files: m.files, sync: m.sync || [], build: m.build || null, text, from: 'bundled' };
  }
  const list = path.join(nexus, 'scripts', 'upgrade-files.mjs');
  if (!fs.existsSync(list)) return null;
  const { upgradeFiles, syncFiles } = await import(pathToFileURL(list).href);
  const kt = path.join(nexus, 'scripts', 'upgrade-kit-text.mjs');
  const text = fs.existsSync(kt) ? await (await import(pathToFileURL(kt).href)).build(nexus, { history: false }) : null;
  const files = upgradeFiles(nexus).files;
  const listed = new Set(files.map((f) => f.kit));
  const extra = syncFiles ? syncFiles(nexus).files.filter((f) => !listed.has(f.kit)) : [];
  return { root: path.join(nexus, 'templates'), files, sync: extra, build: kitBuild(nexus), nexus, text, from: 'templates' };
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
  // The origin's bytes, line endings included: a checkout that turns LF into CRLF (core.autocrlf on Windows) fails a
  // repo gate that compares generated files byte for byte, which is no fault of the upgrade.
  const added = gitIn(repo, ['-c', `core.hooksPath=${hooks}`, '-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'worktree', 'add', '--quiet', '--detach', dir, sha]);
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
 * A `twin` (the kit's test of a kit script) replaces the repo's copy and is never added where the repo has none.
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
    // A twin (the kit's test of a kit script) goes only over the repo's older copy, which the new script would fail.
    if (f.kind === 'twin' && !ours) continue;
    if (ours && ours.equals(theirs)) { rows.push({ path: f.repo, status: 'same' }); continue; }
    if (f.kind === 'twin') { write(dir, f.repo, theirs); rows.push({ path: f.repo, status: 'replaced', note: "the kit's test of the kit's script; the repo's was an older copy" }); continue; }
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
    out[skill] = customUnits(ours, t, { steps: TRAIN[skill].steps });
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
    const { text, names, notes } = laneBlocks(units, { kind, skill, taken, rewrite });
    const lead = `<!-- Moved from the v1 skills/${skill} by nexus upgrade${today ? ` (${today})` : ''}: the text the kit never shipped, verbatim. Check each lane's hook and when. -->`;
    write(dir, rel, `${have.replace(/\s*$/, '')}\n\n${lead}\n\n${text}\n`);
    const steps = units.filter((u) => !u.ref);
    const sections = steps.filter((u) => u.kind === 'section').length;
    const paras = steps.length - sections;
    const what = [sections && `${sections} custom section${sections === 1 ? '' : 's'}`, paras && `custom paragraphs in ${paras} kit step${paras === 1 ? '' : 's'}`].filter(Boolean).join(' and ');
    const noted = notes ? `${notes} reference note${notes === 1 ? '' : 's'} (outside the procedure)` : '';
    const moved = [what, noted].filter(Boolean).join(' and ');
    rows.push({ path: rel, status: `moved-to-lane (${names.length})`, note: `${names.join(', ') || 'no lanes'}${notes ? `; ${noted}` : ''}${refs ? `; ${refs} v1 ref${refs === 1 ? '' : 's'} rewritten` : ''}` });
    rows.push({ path: `skills/${skill}`, status: 'replaced', note: `${moved} moved to ${rel}` });
    warnings.push(`skills/${skill}: ${moved} moved to ${rel}${names.length ? ` as lanes ${names.join(', ')}; check each lane's hook and when` : ''}`);
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

/** The repo's package manager, as the workflow merge reads it (lockfiles, then the march.yml's own steps). */
export const packageManagerOf = (dir) => packageManager((f) => exists(dir, f), read(dir, MARCH_YML) || '');

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

/**
 * The knob registry: one row per knob a kit template names (a repo variable a template workflow reads, a `- key:`
 * line or a filled `**Key:**` line of templates/plan/bearings.md, the `## Generators` list), with the value the
 * upgrade leaves it at so the v1 train runs unchanged and the owner turns knobs up later, one at a time.
 *
 *   at       bearings (a plan/bearings.md line) | section (a `## <knob>` list) | var (a repo variable)
 *   value    the conservative value; for a var, null is unset
 *   write    true: the upgrade writes it (a bearings line or section added when missing, never over the repo's own;
 *            a var's `gh variable set` line, or "leave unset"). false: left out, and the kit's default stands
 *            (a knob that only matters once another is turned up, or a setting, not a behaviour)
 *   dial     true: the improvement dial (`Improve:`, spec 59) sets its default, and scripts/plan/improve.mjs DIAL holds
 *            its value at every position (gentle = `value`); false: the dial leaves it alone. A written row says one
 *            or the other: improve.mjs registryGaps() fails it otherwise, in a test and the verify gate's upgrade leg.
 *
 * knobsMissing() names a template knob with no row: a test and the verify gate's upgrade leg fail on it.
 */
export const KNOBS = Object.freeze([
  // Spec 59: the improvement dial itself, at gentle (the loop as it ran); dial: false, it is the dial, not a knob it sets.
  { knob: 'Improve', at: 'bearings', value: 'gentle', write: true, dial: false, accepts: ['off', 'gentle', 'steady', 'bold'] },
  // Spec 54-57: written at the value that keeps today's behaviour.
  { knob: 'Support', at: 'bearings', value: 'triage-only', write: true, dial: true, accepts: ['off', 'triage-only', 'fix-small', 'fix-all'] },
  { knob: 'NEXUS_SUPPORT', at: 'var', value: null, write: true, dial: true },
  { knob: 'Promote', at: 'bearings', value: 'owner', write: true, dial: true, accepts: ['owner', 'aged'] },
  { knob: 'Generators', at: 'section', value: '(none)', write: true, dial: true },
  { knob: 'stall_action', at: 'bearings', value: 'alert', write: true, dial: true, accepts: ['alert', 'promote', 'off'] },
  { knob: 'loop', at: 'bearings', value: 'off', write: true, dial: true, accepts: ['on', 'off'] },
  { knob: 'UI', at: 'bearings', value: 'none', write: true, dial: true, bold: true, accepts: ['none', 'url', 'dev'] },
  { knob: 'NEXUS_CADENCE', at: 'var', value: null, write: true, dial: true },
  // Cadence fields the NEXUS_CADENCE preset sets (the dial reaches them through it), and the quota governor's cap.
  { knob: 'NEXUS_CHAIN_MAX', at: 'var', value: '0', write: true, dial: false },
  { knob: 'NEXUS_IDLE_BACKOFF', at: 'var', value: '0', write: true, dial: false },
  { knob: 'NEXUS_QUOTA_MAX', at: 'var', value: null, write: true, dial: false },
  // Spec 59: the field-research generator's knob; off is the absent line, so nothing is written.
  { knob: 'Research', at: 'bearings', value: 'off', write: false, dial: true, accepts: ['off', 'monthly', 'weekly'] },
  // Inert while the knobs above stay down, or settings rather than behaviour: the kit default stands.
  ...['promote_after_days', 'promote_floor', 'promote_per_week', 'veto_days', 'pending_cap', 'Motion floor', 'Lanes off',
    'Lock max age', 'sla_hours', 'escalate_days', 'asap_cap', 'Research topics'].map((knob) => ({ knob, at: 'bearings', value: null, write: false })),
  ...['UI routes', 'UI cadence', 'UI magic'].map((knob) => ({ knob, at: 'bearings', value: null, write: false, bold: true })),
  ...['NEXUS_ALLOW_BACKGROUND', 'NEXUS_APP_ID', 'NEXUS_CLAIMS_BOARD', 'NEXUS_DAILY_CEILING', 'NEXUS_DISPATCH_MAX',
    'NEXUS_EVENT_MAX', 'NEXUS_HEARTBEAT_HOURS', 'NEXUS_HEARTBEAT_WATCH', 'NEXUS_IDLE_WAKE_EVERY', 'NEXUS_LOOP_ACTOR',
    'NEXUS_PR_LIMIT', 'NEXUS_SUPPORT_TRUST', 'NEXUS_UI_ARTIFACTS', 'NEXUS_URGENT_LABELS'].map((knob) => ({ knob, at: 'var', value: null, write: false })),
  // Set by the loop-mode line (owner when the v1 loop pushed the default branch), not here.
  { knob: 'NEXUS_LOOP_MODE', at: 'var', value: null, write: false },
].map(Object.freeze));

/**
 * The knobs kit templates name, from the nexus repo (or any folder in templates/ layout under `root/templates`):
 * every `vars.NEXUS_*` a template workflow reads, every `- key: value` line and filled `**Key:** \`value\`` line of
 * templates/plan/bearings.md, and its `## Generators` section. [{ knob, at, from }].
 */
export function templateKnobs(root) {
  const flows = path.join(root, 'templates', '.github', 'workflows');
  const names = fs.existsSync(flows) ? fs.readdirSync(flows).filter((n) => /\.ya?ml$/.test(n)).sort() : [];
  return knobsIn({ flows: names.map((n) => [n, fs.readFileSync(path.join(flows, n), 'utf8')]), bearings: read(root, 'templates/plan/bearings.md') });
}

/**
 * The knobs a kit's texts name: `flows` [[name, text]] (its workflows) and `bearings` (its plan/bearings.md template).
 * templateKnobs reads them from a folder; a sync reads them from the kit at the lock's ref too, to tell new knobs.
 */
export function knobsIn({ flows = [], bearings: text = null } = {}) {
  const out = new Map();
  const add = (knob, at, from) => { if (!out.has(knob)) out.set(knob, { knob, at, from }); };
  for (const [name, yml] of flows) {
    for (const m of String(yml).matchAll(/\bvars\.(NEXUS_[A-Z0-9_]+)/g)) add(m[1], 'var', `templates/.github/workflows/${name}`);
  }
  const bearings = text || '';
  const from = 'templates/plan/bearings.md';
  for (const m of bearings.matchAll(/^- ([A-Za-z][\w ]*?):[ \t]+\S/gm)) add(m[1], 'bearings', from);
  for (const m of bearings.matchAll(/^\*\*([A-Za-z][\w ]*?):\*\*[ \t]+`([^`<]+)`/gm)) add(m[1], 'bearings', from);
  if (/^##\s+Generators\s*$/m.test(bearings)) add('Generators', 'section', from);
  return [...out.values()];
}

/** Template knobs the registry lacks: [{ knob, at, from }]. */
export function knobsMissing(root, registry = KNOBS) {
  const have = new Set(registry.map((r) => r.knob));
  return templateKnobs(root).filter((k) => !have.has(k.knob));
}

const knobLine = (key) => new RegExp(`^[ \\t]*(?:[-*][ \\t]+)?[*\`]*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[*\`]*[ \\t]*:[*\`]*[ \\t]*[*\`]*([^\\s*\`]+)`, 'gm');

/**
 * Write the conservative knobs into plan/bearings.md text: each `write` bearings row whose line is missing goes into
 * one `## Loop knobs` block at the end, and a missing `## Generators` section is added empty. A line the repo already
 * has is kept as it is (it is the repo's own setting). Returns { text, knobs: [{ knob, at, value, status, line? }] }
 * where status is `written`, `kept` (with the repo's value), `unset` (a var left unset) or `set` (a var to set,
 * `line` the gh command).
 */
export function writeKnobs(bearings, { today, registry = KNOBS, keeps = "the v1 loop's" } = {}) {
  const text = String(bearings ?? '').replace(/\r\n/g, '\n');
  const plain = text.replace(/<!--[\s\S]*?-->/g, '');
  const knobs = [];
  const lines = [];
  let generators = false;
  for (const r of registry.filter((k) => k.write)) {
    if (r.at === 'var') {
      knobs.push(r.value == null ? { knob: r.knob, at: r.at, value: null, status: 'unset' }
        : { knob: r.knob, at: r.at, value: r.value, status: 'set', line: `gh variable set ${r.knob} --body ${r.value}` });
      continue;
    }
    if (r.at === 'section') {
      const have = new RegExp(`^##\\s+${r.knob}\\s*$`, 'm').test(plain);
      if (!have) generators = true;
      knobs.push({ knob: r.knob, at: r.at, value: r.value, status: have ? 'kept' : 'written' });
      continue;
    }
    // Only a line whose value the knob accepts is the repo's setting; prose (`Support: email us`) is not, and the
    // conservative line is written beside it (the report warns about the line it passed over).
    const found = [...plain.matchAll(knobLine(r.knob))].map((m) => m[1]);
    const own = found.find((v) => !r.accepts || r.accepts.includes(v));
    if (own) { knobs.push({ knob: r.knob, at: r.at, value: own, status: 'kept' }); continue; }
    lines.push(r.bold ? `\n**${r.knob}:** \`${r.value}\`` : `- ${r.knob}: ${r.value}`);
    knobs.push({ knob: r.knob, at: r.at, value: r.value, status: 'written', ...(found.length ? { ignored: found[0] } : {}) });
  }
  const blocks = [];
  if (lines.length) {
    blocks.push(`## Loop knobs\n\nWritten by \`nexus upgrade\`${today ? ` (${today})` : ''} at the values that keep ${keeps}\nbehaviour. Turn them up together with \`Improve:\` (off, gentle, steady, bold;\nthe lines below override it), or each on its own, later: \`Support:\`\n(\`nexus/customization/support.md\`), \`Promote:\` and \`stall_action\`\n(aged promotion, the motion heartbeat), \`loop:\` (\`/iterate\` dimension\nI), \`UI:\` (the browser walk).\n\n${lines.join('\n').replace(/^\n/, '')}`);
  }
  if (generators) blocks.push('## Generators\n\nWhen no chunk is ready, `/march`\'s stock `refill` lane runs each\ngenerator listed here (`nexus/concepts/generators.md`). None listed\nmeans refill is a no-op.\n\n- (none)');
  if (!blocks.length) return { text, knobs };
  const head = text.trim() ? `${text.replace(/\s*$/, '')}\n\n` : '# Bearings\n\n';
  return { text: `${head}${blocks.join('\n\n')}\n`, knobs };
}

/** Did the v1 loop push the default branch? Cloud ticks sign their commits `Cloud-Run: <url>`. */
export function loopModeOf(dir, ref = 'HEAD') {
  const r = gitIn(dir, ['log', ref, '-E', '--grep=^Cloud-Run:', '--format=%h']);
  const pushes = r.ok && r.out ? r.out.split(/\r?\n/).length : 0;
  return { mode: pushes ? 'owner' : 'pr', pushes };
}

/**
 * The workflow merge (workflow-merge.mjs) in `dir`: the v1 march.yml into the kit's v2 owner-job shape, its toolchain
 * steps into the setup action. `repoAction` is the repo's own .github/actions/setup/action.yml from before the kit
 * copy: it is put back (the repo wrote it). `keep` (--keep-workflow) leaves march.yml as it is and reports what the
 * merge would have kept. With no v1 march.yml the kit's setup action is still filled in (its placeholders, no browser
 * steps). Returns { rows, warnings, kept }.
 */
export function workflowMerge(dir, kit, { repoAction = null, branch = 'main', keep = false } = {}) {
  const rows = [];
  const warnings = [];
  const template = read(kit.root, MARCH_YML);
  const actionTemplate = read(kit.root, SETUP_ACTION);
  const v1Text = read(dir, MARCH_YML);
  const fills = { project: projectName(dir), pm: packageManager((f) => exists(dir, f), v1Text || ''), branch };
  if (repoAction != null) {
    write(dir, SETUP_ACTION, repoAction);
    rows.push({ path: SETUP_ACTION, status: 'kept-custom' });
  }
  if (template == null || actionTemplate == null) {
    if (v1Text != null) warnings.push(`the kit carries no ${MARCH_YML} to merge into: ${MARCH_YML} is left as it is`);
    return { rows, warnings, kept: null };
  }
  const kitPrompt = fromJson(toJson(mergeText(kit.text?.['march.yml'], textOfPrompt(template))));
  const r = mergeWorkflow({ v1Text, template, actionTemplate, repoAction, fills, kitPrompt });
  if (r.skip) {
    if (v1Text != null) warnings.push(r.skip);
    if (repoAction == null) {
      write(dir, SETUP_ACTION, setupAction({ toolchain: [] }, fill(actionTemplate, fills)).text);
      rows.push({ path: SETUP_ACTION, status: 'added', note: `the kit's, ${fills.pm}` });
    }
    return { rows, warnings, kept: null };
  }
  warnings.push(...r.warnings);
  if (r.action != null) {
    write(dir, SETUP_ACTION, r.action);
    rows.push({ path: SETUP_ACTION, status: r.kept.toolchain ? 'merged' : 'added', note: r.kept.toolchain ? `the v1 job's ${r.kept.toolchain} toolchain step${r.kept.toolchain === 1 ? '' : 's'}` : `the kit's, ${fills.pm}` });
  }
  if (keep) rows.push({ path: MARCH_YML, status: 'kept (--keep-workflow)', note: `the merge would keep ${keptLine(r.kept)}` });
  else {
    write(dir, MARCH_YML, r.march.endsWith('\n') ? r.march : `${r.march}\n`);
    rows.push({ path: MARCH_YML, status: 'merged', note: `v2 owner-job shape; kept ${keptLine(r.kept)}` });
  }
  return { rows, warnings, kept: r.kept };
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
  if (exists(dir, 'scripts/workflow-lint.mjs')) rows.push(run('workflow-lint', ['scripts/workflow-lint.mjs']));
  return rows;
}

/**
 * workflow-lint's problems split by who made them: { fresh, old }. `old` is a problem the origin's own file already
 * had (the repo's own workflow, untouched but for reference rewrites): the upgrade did not add it, so it is a
 * warning, not a red gate. `fresh` is one the upgrade's files have and the origin's did not. A file the upgrade
 * writes or merges (`owned`: march.yml, the setup action, any kit-copied workflow or action) ships as the upgrade's
 * own, so every problem in it is fresh whatever the origin had: a v1 prompt's injection carried into the v2 owner
 * job is the upgrade's to fix. An injection (outsider text interpolated) is never downgraded anywhere.
 */
export async function lintDelta(dir, kit, { owned = new Set() } = {}) {
  const { lintWorkflow, lintAction } = await kitModule(kit, 'scripts/workflow-lint.mjs');
  const files = [];
  const flows = path.join(dir, '.github', 'workflows');
  if (fs.existsSync(flows)) for (const n of fs.readdirSync(flows).sort()) if (/\.ya?ml$/.test(n)) files.push(`.github/workflows/${n}`);
  const actions = path.join(dir, '.github', 'actions');
  if (fs.existsSync(actions)) for (const f of walk(dir, '.github/actions')) if (/(^|\/)action\.ya?ml$/.test(f)) files.push(f);
  const fresh = [];
  const old = [];
  for (const rel of files) {
    const lint = /(^|\/)action\.ya?ml$/.test(rel) ? lintAction : lintWorkflow;
    const now = lint(rel, read(dir, rel) || '');
    if (!now.length) continue;
    if (owned.has(rel)) { fresh.push(...now); continue; }
    const was = gitIn(dir, ['show', `HEAD:${rel}`]);
    const before = new Set(was.ok ? lint(rel, was.out) : []);
    for (const p of now) (before.has(p) && !/interpolates/.test(p) ? old : fresh).push(p);
  }
  return { fresh, old };
}

/**
 * The repo's own verify command, from package.json's `verify` script run through its package manager (the lockfile
 * says which): { cmd, install } or null when it has none. `install` is the frozen install the worktree needs first
 * (null when package.json names no dependency and no workspace: nothing to install).
 */
export function repoVerify(dir) {
  let pkg = null;
  try { pkg = JSON.parse(read(dir, 'package.json') || 'null'); } catch { return null; }
  if (!pkg?.scripts?.verify) return null;
  const pm = packageManager((f) => exists(dir, f));
  const deps = ['dependencies', 'devDependencies', 'optionalDependencies'].some((k) => Object.keys(pkg[k] || {}).length) || Array.isArray(pkg.workspaces) || exists(dir, 'pnpm-workspace.yaml');
  const frozen = { pnpm: 'pnpm install --frozen-lockfile', yarn: 'yarn install --frozen-lockfile', bun: 'bun install --frozen-lockfile', npm: exists(dir, 'package-lock.json') ? 'npm ci' : 'npm install' }[pm];
  return { cmd: `${pm} run verify`, install: deps ? frozen : null };
}

/** Run the repo's verify in `dir` (its install first): a gate row. The repo's own command, through a shell. */
export function runRepoVerify(dir, v, { timeout = 3600000 } = {}) {
  for (const [name, cmd] of [['install', v.install], ['verify', v.cmd]].filter(([, c]) => c)) {
    const r = spawnSync(cmd, { cwd: dir, shell: true, encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 256 * 1024 * 1024 });
    const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split(/\r?\n/).slice(-20).join('\n');
    if (r.status !== 0) return { name: `repo verify (${v.cmd})`, ok: false, out: `${name} failed: ${cmd}\n${out}` };
  }
  return { name: `repo verify (${v.cmd})`, ok: true, out: '' };
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
  // Only a lane that may end the tick decides the dispatch; a `continue` lane (a v1 step's carried notes) runs and
  // the tick goes on. A lane with a `when`, or a `section` lane (its text may fall through), may not end it, so the
  // chain plays on to the first sure thing.
  const at = (hook) => withStock(lanes, { kind: 'march', hook, bearings, root: dir }).filter((l) => l.hook === hook && !off.has(l.name) && (l.return === 'end-tick' || l.return === 'section'));
  const lane = (l) => ({ kind: 'lane', text: `lane ${l.name} (${l.hook}: ${short(l.run)}${conditional(l) ? `, when ${short(l.when)}` : ''})`, sure: !conditional(l) && l.return === 'end-tick', name: l.name });
  const asap = first?.lane === 'asap';
  const chain = [...(asap ? [] : at('pre').map(lane)), ...(chunk ? [{ ...chunk, sure: true }] : []), ...at('queue').map(lane)];
  if (/^- \[ \]/m.test(read(dir, 'data/BACKLOG.md') || '')) chain.push({ kind: 'data', text: '/ship-data (data/BACKLOG.md has a pending row)', sure: true });
  chain.push({ kind: 'iterate', text: '/iterate (no chunk, lane or data row is ready)', sure: true });
  const end = chain.findIndex((c) => c.sure);
  const steps = chain.slice(0, end + 1);
  const head = steps[0];
  const lanes1 = steps.filter((c) => c.kind === 'lane').map((c) => c.name);
  return { kind: head.kind, text: steps.map((c) => c.text).join('; else '), idle: false, ...(lanes1.length ? { lanes: lanes1 } : {}) };
}

const conditional = (l) => Boolean(l.when && l.when !== 'always');
const short = (s) => { const t = String(s ?? '').replace(/\s*\(moved verbatim from the v1 [^)]*\)/, ''); return t.length > 80 ? `${t.slice(0, 77)}...` : t; };

/**
 * The dry run, start to end, on the repo at `repo` (any folder inside it). Returns { code, report } and never
 * throws for an expected stop. `keep` keeps the worktree even when the gate is green.
 */
export async function upgrade({ repo, today = new Date().toISOString().slice(0, 10), kit = null, keep = false, keepWorkflow = false, verify = false, write: commit = false, assist, base = null, baseOpts, gateFn = null, syncVerify = true } = {}) {
  const top = gitIn(repo, ['rev-parse', '--show-toplevel']);
  if (!top.ok) return { code: 2, report: { error: `${repo} is not a git repository` } };
  const root = path.resolve(top.out);
  let wt;
  try {
    wt = freshWorktree(root);
  } catch (e) {
    return { code: e.code || 2, report: { error: e.message } };
  }
  const report = { repo: root, origin: { url: wt.url, branch: wt.branch, sha: wt.sha }, dry: !commit, files: [], archive: [], warnings: [], gate: [], workflow: null, knobs: [], dispatch: null, loop: null, worktree: null };
  let red = false;
  try {
    const shape = detect(wt.dir);
    report.shape = shape.shape;
    report.why = shape.why;
    if (shape.shape === 'v2') {
      // v2 to latest (spec 58): the three-way sync against the kit at the lock's ref.
      const ref = lockField(read(wt.dir, 'plan/nexus.lock'), 'ref');
      if (!ref) return { code: 0, report: { ...report, message: 'already on v2', why: `${shape.why}, and it names no ref: to sync from` } };
      kit = kit || await kitSource();
      if (!kit) return { code: 2, report: { ...report, error: 'no bundled kit (kit/upgrade/files.json) and no nexus templates/ beside the CLI' } };
      const r = await sync({ dir: wt.dir, local: root, kit, ref, branch: wt.branch, today, write: commit, ...(assist !== undefined ? { assist } : {}), base, baseOpts: baseOpts || (kit.nexus ? { nexus: kit.nexus } : {}), gateFn, verify: syncVerify });
      Object.assign(report, r.report);
      red = r.code === 1;
      // The first tick after the sync, predicted as for a v1 upgrade (the pull request's body carries it too).
      if (r.code === 0 && !report.message) {
        const mode = loopModeOf(wt.dir).mode;
        report.dispatch = await predict(wt.dir, kit, { mode }).catch((e) => ({ kind: 'unknown', text: `could not predict: ${e.message}`, idle: false }));
      }
      return { code: r.code, report };
    }
    if (shape.shape === 'none') return { code: 2, report: { ...report, error: `not a nexus v1 repo: ${shape.why}` } };
    kit = kit || await kitSource();
    if (!kit) return { code: 2, report: { ...report, error: 'no bundled kit (kit/upgrade/files.json) and no nexus templates/ beside the CLI' } };
    const kitFiles = new Set(kit.files.map((f) => f.repo));

    if (shape.shape === 'v1') {
      // The repo's own march and iterate steps, and its own setup action, are read before the kit's replace them.
      const train = customTrain(wt.dir, kit);
      const repoAction = read(wt.dir, SETUP_ACTION);
      report.files.push(...copyKit(wt.dir, kit).filter((r) => r.status !== 'same' && r.path !== SETUP_ACTION));
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
      const wf = workflowMerge(wt.dir, kit, { repoAction, branch: wt.branch, keep: keepWorkflow });
      report.files.push(...wf.rows);
      report.warnings.push(...wf.warnings);
      report.workflow = wf.kept ? { kept: wf.kept, keep: keepWorkflow } : null;
      // The conservative knobs (the registry above): the train runs as it did; the owner turns each up later.
      const bearings = read(wt.dir, 'plan/bearings.md');
      const kn = writeKnobs(bearings, { today });
      report.knobs = kn.knobs;
      const wrote = kn.knobs.filter((k) => k.at !== 'var' && k.status === 'written');
      if (wrote.length) {
        write(wt.dir, 'plan/bearings.md', kn.text);
        report.files.push({ path: 'plan/bearings.md', status: bearings == null ? 'added' : 'knobs written', note: `${wrote.map((k) => k.at === 'section' ? `## ${k.knob} ${k.value}` : `${k.knob}: ${k.value}`).join(', ')}` });
      }
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
    // A workflow problem the origin's own file already had is the repo's, not the upgrade's: a warning.
    const wl = report.gate.find((g) => g.name === 'workflow-lint' && !g.ok);
    if (wl) {
      const owned = new Set([MARCH_YML, SETUP_ACTION, ...[...kitFiles].filter((f) => f.startsWith('.github/'))]);
      const { fresh, old } = await lintDelta(wt.dir, kit, { owned }).catch(() => ({ fresh: null, old: [] }));
      if (fresh && !fresh.length && old.length) {
        wl.ok = true;
        wl.note = `${old.length} problem${old.length === 1 ? '' : 's'} the repo's own workflow${old.length === 1 ? '' : 's'} already had (warnings)`;
        for (const p of old) report.warnings.push(`workflow-lint (already on origin, not the upgrade's): ${p}`);
      }
    }
    const v = repoVerify(wt.dir);
    if (!red && v) report.gate.push(verify && !report.gate.some((g) => !g.ok) ? runRepoVerify(wt.dir, v) : { name: `repo verify (${v.cmd})`, ok: true, skipped: true, out: '', note: 'not run: --verify runs it, its install first, in the worktree' });
    red = red || report.gate.some((g) => !g.ok);
    report.loop = { ...loopModeOf(wt.dir), branch: wt.branch };
    const guess = (mode) => predict(wt.dir, kit, { mode }).catch((e) => ({ kind: 'unknown', text: `could not predict: ${e.message}`, idle: false }));
    report.dispatch = await guess(report.loop.mode);
    report.dispatch.live = report.loop.pushes > 0;
    // A live v1 loop: until NEXUS_LOOP_MODE=owner is set, the first v2 tick runs in PR mode, which may be idle.
    if (report.dispatch.live) report.dispatch.pr = await guess('pr');
    // --write: the whole upgrade as one commit on nexus/upgrade-v2, only with the gate green. --land carries it on.
    if (commit && !red) {
      const c = commitUpgrade(wt.dir, report);
      if (c.error) { red = true; report.error = c.error; } else report.commit = c;
    }
  } finally {
    if (red || keep) report.worktree = wt.dir;
    else wt.remove();
  }
  report.files = mergeRows(report.files);
  return { code: red ? 1 : 0, report };
}

/**
 * The upgrade as one commit in the worktree `dir`, on BRANCH (cut there, so it lives in the local repo's refs and
 * outlasts the worktree): { sha, branch, subject } or { error }. The body says what moved and the predicted first tick.
 */
export function commitUpgrade(dir, report) {
  for (const s of [['checkout', '-q', '-B', BRANCH], ['add', '-A']]) {
    const r = gitIn(dir, s);
    if (!r.ok) return { error: `git ${s[0]} failed: ${r.err}` };
  }
  const rows = mergeRows(report.files);
  // Every file the upgrade wrote goes in, even one a broad .gitignore pattern matches (a bare setup/ catching
  // .github/actions/setup/): add -A skips it silently, and the first v2 tick then fails on the missing file.
  const wrote = rows.map((f) => f.path).filter((p) => fs.existsSync(path.join(dir, p)));
  if (wrote.length) {
    const r = gitIn(dir, ['add', '-f', '--', ...wrote]);
    if (!r.ok) return { error: `git add failed: ${r.err}` };
  }
  const by = new Map();
  for (const f of rows) { const k = f.status.replace(/ \(.*$/, '').split(', ')[0]; by.set(k, (by.get(k) || 0) + 1); }
  const o = report.origin;
  const body = [
    `From origin/${o.branch} at ${o.sha.slice(0, 12)}, ${report.shape === 'half' ? 'finishing a half-done upgrade (Step 5 only)' : 'v1 (phases) to v2 (specs + chunks)'}.`,
    '',
    `${rows.length} files: ${[...by].map(([k, n]) => `${n} ${k}`).join(', ')}.`,
    ...(report.archive.length ? [`${report.archive.length} archive line${report.archive.length === 1 ? '' : 's'} appended.`] : []),
    ...(report.warnings.length ? [`${report.warnings.length} warning${report.warnings.length === 1 ? '' : 's'} in the report.`] : []),
    ...(report.dispatch ? [`First tick (predicted): ${report.dispatch.text}`] : []),
    '',
    'npx @usenexus/cli upgrade --rollback reverts this commit.',
  ].join('\n');
  const c = gitIn(dir, ['commit', '-q', '-m', COMMIT_SUBJECT, '-m', body]);
  if (!c.ok) return { error: `git commit failed: ${c.err || c.out}` };
  return { sha: gitIn(dir, ['rev-parse', 'HEAD']).out, branch: BRANCH, subject: COMMIT_SUBJECT };
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
  const where = report.remote ? 'no local checkout: a blobless temporary clone of the GitHub repo' : 'the local checkout is not touched';
  out.push(report.dry === false ? `nexus upgrade: --write (one commit on a branch; ${report.remote ? where : 'the local checkout\'s files are not touched'})` : `nexus upgrade: dry run (nothing written; ${where})`);
  out.push(`  repo     ${report.repo}`);
  if (o) out.push(`  origin   ${o.url} ${o.branch} @ ${o.sha.slice(0, 7)} (fetched now)`);
  if (report.error) { out.push('', `nexus upgrade: ${report.error}`); return out.join('\n'); }
  if (report.shape === 'v2' && report.sync) {
    out.push(...renderSync(report, { red }));
    if (report.dispatch) out.push('', 'first dispatch (predicted)', `  ${report.dispatch.text}`);
    out.push('');
    if (report.commit) out.push(`committed ${report.commit.sha.slice(0, 7)} on ${report.commit.branch}: ${report.commit.subject}`);
    else if (report.worktree) out.push(`worktree kept: ${report.worktree}`);
    else if (!report.message) out.push('The worktree is removed. --write commits this as one commit, plan: sync to nexus <version>, on nexus/upgrade-<version>.');
    return out.join('\n');
  }
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
    out.push(`  ${g.skipped ? 'skip ' : g.ok ? 'green' : red('RED  ')}  ${g.name}${g.note ? `  (${g.note})` : ''}`);
    if (!g.ok && g.out) for (const l of g.out.split('\n')) out.push(`         ${l}`);
  }
  if (report.workflow) {
    const k = report.workflow.kept;
    out.push('', `workflow (${report.workflow.keep ? `${MARCH_YML} kept as it is (--keep-workflow); the merge would keep` : `${MARCH_YML} merged into the v2 owner job, keeping`})`);
    out.push(`  cron         ${k.cron.length ? k.cron.join(', ') : '(none: dispatch only)'}`);
    out.push(`  ceiling      ${k.ceiling ?? "the kit's (no number in the v1 step)"}`);
    out.push(`  model        ${k.model ?? "the kit's (no pin in the v1 step)"}`);
    out.push(`  env          ${k.env.length ? k.env.join(', ') : '(none extra)'}`);
    out.push(`  concurrency  ${k.concurrency ?? "the kit's"}`);
    out.push(`  toolchain    ${k.toolchain ? `${k.toolchain} step${k.toolchain === 1 ? '' : 's'} -> ${SETUP_ACTION}` : '(none moved)'}`);
    if (k.steps.length) out.push(`  custom steps ${k.steps.join(', ')}`);
    if (k.prompt) out.push(`  prompt       ${k.prompt} line${k.prompt === 1 ? '' : 's'} of the v1 prompt no kit version held`);
  }
  if (report.knobs?.length) {
    const ks = report.knobs;
    const name = (k) => (k.at === 'section' ? `## ${k.knob}` : k.knob);
    const file = ks.filter((k) => k.at !== 'var');
    out.push('', 'knobs (conservative: the v1 loop runs as it did; turn each up later)');
    const written = file.filter((k) => k.status === 'written');
    const kept = file.filter((k) => k.status === 'kept');
    if (written.length) out.push(`  plan/bearings.md  ${written.map((k) => `${name(k)} ${k.value}`).join(', ')}`);
    if (kept.length) out.push(`  kept (the repo's) ${kept.map((k) => `${name(k)} ${k.value}`).join(', ')}`);
    for (const k of written.filter((w) => w.ignored)) out.push(`  passed over      ${k.knob}: ${k.ignored}… (not a value ${k.knob} takes; ${k.knob}: ${k.value} written)`);
    const set = ks.filter((k) => k.status === 'set');
    const unset = ks.filter((k) => k.status === 'unset');
    if (unset.length) out.push(`  leave unset      ${unset.map((k) => k.knob).join(', ')}`);
    for (const k of set) out.push(`  ${k.line}`);
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
  if (report.commit) out.push(`committed ${report.commit.sha.slice(0, 7)} on ${report.commit.branch}: ${report.commit.subject} (nothing pushed; --land owner|pr carries it to ${report.origin.branch})`);
  else out.push(report.worktree ? `worktree kept: ${report.worktree}` : `The worktree is removed. --write commits this as one commit on ${BRANCH}; --land owner|pr carries it to ${report.origin?.branch || 'the default branch'}.`);
  return out.join('\n');
}


export const UPGRADE_HELP = `nexus upgrade: move a nexus v1 repo (a phase plan) to v2 (specs + chunks),
or bring a v2 repo up to the kit this CLI carries (the sync).

  npx @usenexus/cli upgrade                 dry run on the repo in this folder:
                                            a fresh fetch of origin in a
                                            temporary worktree, the local
                                            checkout untouched; prints the
                                            per-file report, the archive lines,
                                            warnings, the gate, the knobs
                                            (each at the value that keeps the
                                            v1 loop's behaviour), the predicted
                                            first dispatch and the loop mode
  npx @usenexus/cli upgrade --repo <dir>    ...for another folder
  npx @usenexus/cli upgrade --json          the report as JSON
  npx @usenexus/cli upgrade --keep-workflow leave .github/workflows/march.yml as
                                            it is; report what the merge into
                                            the v2 owner job would keep
  npx @usenexus/cli upgrade --verify        also run the repo's own verify
                                            (package.json "verify", its
                                            install first) in the worktree
  npx @usenexus/cli upgrade --write         ...and, with the gate green, commit
                                            it: one commit, plan: upgrade to
                                            nexus v2 (specs + chunks), on
                                            branch nexus/upgrade-v2; nothing
                                            is pushed
  npx @usenexus/cli upgrade --land owner    --write, then land it between two
                                            ticks: wait for an idle window (no
                                            march run queued or running, the
                                            next cron 10+ min away), pause
                                            march, set NEXUS_LOOP_MODE=owner
                                            (when the v1 loop pushed the
                                            default branch), push, resume
                                            march, dispatch the first v2 tick
                                            and watch it (its jobs and commit)
  npx @usenexus/cli upgrade --land pr       --write, then push the branch and
                                            open a pull request whose body is
                                            the report; its merge is the
                                            cut-over. --land alone: owner when
                                            the v1 loop pushed the default
                                            branch, else pr
  npx @usenexus/cli upgrade --no-pause      --land owner without pausing march
  npx @usenexus/cli upgrade --no-watch      --land owner: dispatch, don't watch
  npx @usenexus/cli upgrade --rollback      revert the upgrade commit on a fresh
                                            fetch of origin in one commit (the
                                            lock pinned back to v1.0.0) on
                                            nexus/rollback-v2; with --land it
                                            reaches the default branch the same
                                            way (no dispatch: the v1 cron runs)

  On a v2 repo (plan/nexus.lock says chunks and names its ref:):
  npx @usenexus/cli upgrade                 the sync, dry: every kit file
                                            three ways (the kit at the lock's
                                            ref, the kit now, the repo's copy):
                                            untouched ones replaced, customised
                                            ones merged, a conflict through the
                                            assisted merge (shown as a diff),
                                            new kit content listed, new knobs at
                                            their conservative values
  npx @usenexus/cli upgrade --write         ...and commit it, plan: sync to
                                            nexus <version>, on branch
                                            nexus/upgrade-<version> (an assisted
                                            merge only with the gate green);
                                            --land owner|pr carries it on
  npx @usenexus/cli upgrade --no-assist     leave a conflicting file as the
                                            repo's and list it (no helper model)

  A repo on GitHub, no checkout needed:
  npx @usenexus/cli upgrade --repo owner/name
                                            the same dry run and report on a
                                            blobless temporary clone (a GitHub
                                            URL works too), removed after
  npx @usenexus/cli upgrade --repo owner/name --pr
                                            ...and commit it, push the branch
                                            and open a pull request whose body
                                            is the report: from a fork without
                                            push access; an open upgrade pull
                                            request from an earlier run is
                                            updated in place (its branch
                                            force-updated, a comment saying
                                            what changed); a red gate opens
                                            nothing and keeps the clone
  npx @usenexus/cli upgrade --pr            the same from a local checkout

  Exit 0: the report printed (or committed, landed, or its pull request
  opened). Exit 1: the gate failed (the worktree is kept and its path
  printed), the landing stopped (march is always resumed once paused), or
  the push or pull request did. Exit 2: not a nexus repo, no origin, the
  kit at the lock's ref out of reach, nothing to roll back, or a flag this
  release does not carry yet.

  The runbook: https://github.com/daretodave/nexus/blob/main/playbooks/upgrade.md`;

/** Flags spec 58 names that a later release carries: refused here rather than ignored (none left). */
export const LATER = Object.freeze([]);
/** The flags this release reads (`--repo` and `--land` take a value; `--land`'s is optional). */
const KNOWN = new Set(['--repo', '--json', '--keep-workflow', '--verify', '--write', '--no-assist', '--land', '--rollback', '--no-pause', '--no-watch', '--pr']);
const LAND_HOW = new Set(['owner', 'pr']);

/** The live march.yml's cron lines at `sha` in `root`, read with the kit's cadence.mjs. */
async function liveCrons(root, sha, kit) {
  const { cronTools } = await import('./upgrade-land.mjs');
  const lib = kit ? await cronTools(kit.root) : null;
  const yml = gitIn(root, ['show', `${sha}:${MARCH_YML}`]);
  return { lib, crons: lib && yml.ok ? lib.cronsOf(yml.out) : [] };
}

/** `nexus upgrade <args>`: the exit code. `opts.land` reaches land() (tests pass a stubbed gh, now and sleep). */
export async function runUpgrade(argv, { out = (s) => process.stdout.write(`${s}\n`), err = (s) => process.stderr.write(`${s}\n`), cwd = process.cwd(), color = process.stdout.isTTY && !process.env.NO_COLOR, today, opts = {} } = {}) {
  if (argv.includes('--help') || argv.includes('-h')) { out(UPGRADE_HELP); return 0; }
  const later = argv.filter((a) => LATER.includes(a));
  if (later.length) { err(`nexus upgrade: ${later.join(', ')} ${later.length === 1 ? 'is' : 'are'} not in this release yet; the dry run is (run it with no flags)`); return 2; }
  const i = argv.indexOf('--repo');
  const l = argv.indexOf('--land');
  const landHow = l >= 0 && LAND_HOW.has(argv[l + 1]) ? argv[l + 1] : null;
  const bad = argv.filter((a, k) => !KNOWN.has(a) && !(i >= 0 && k === i + 1) && !(landHow && k === l + 1));
  if (bad.length || (i >= 0 && !argv[i + 1])) { err(`nexus upgrade: unknown argument ${bad[0] ?? '--repo (needs a folder or a GitHub owner/name)'}\n\n${UPGRADE_HELP}`); return 2; }
  const arg = i >= 0 ? argv[i + 1] : '.';
  const repo = path.resolve(cwd, arg);
  const pr = argv.includes('--pr');
  const local = fs.existsSync(repo) && fs.statSync(repo).isDirectory();
  // A folder that exists is the local repo; otherwise `owner/name` or a GitHub URL is a repo on GitHub, no checkout.
  const remote = local ? null : (await import('./upgrade-remote.mjs')).parseRemote(arg);
  if (!local && !remote) { err(`nexus upgrade: ${repo} is not a folder, and ${arg} is not a GitHub owner/name or URL`); return 2; }
  if (remote && argv.includes('--write') && !pr) { err('nexus upgrade: --write on a GitHub repo would commit into a temporary clone that is then removed; --pr commits, pushes the branch and opens a pull request'); return 2; }
  const landing = l >= 0;
  // --land and --rollback work on a local checkout's origin; a pull request is its own way to land.
  if ((remote || pr) && (landing || argv.includes('--rollback'))) { err(`nexus upgrade: ${landing ? '--land' : '--rollback'} needs a local checkout and goes without --pr (a pull request is its own landing)`); return 2; }
  const red = RED(color);
  const landOpts = { pause: !argv.includes('--no-pause'), watch: !argv.includes('--no-watch'), log: (s) => err(`  ${s}`), ...(opts.land || {}) };
  const { land, renderLand, rollbackCommit, renderRollback, ROLLBACK_SUBJECT } = await import('./upgrade-land.mjs');

  if (argv.includes('--rollback')) {
    const { code, report } = rollbackCommit({ repo });
    let res = null;
    if (code === 0 && report.commit && landing) {
      const kit = opts.kit || await kitSource();
      const { lib, crons } = await liveCrons(report.repo, report.origin.sha, kit);
      res = await land({ repo: report.repo, sha: report.commit.sha, branch: report.commit.branch, base: report.origin.branch, how: landHow || report.loop?.mode || 'owner', crons, lib, dispatch: false, title: ROLLBACK_SUBJECT, body: `${renderRollback(report)}\n`, ...landOpts });
    }
    if (argv.includes('--json')) out(JSON.stringify({ code: res && !res.ok ? 1 : code, ...report, ...(res ? { land: res } : {}) }, null, 2));
    else {
      (code === 0 ? out : err)(renderRollback(report));
      if (res) (res.ok ? out : err)(renderLand(res, { red }).join('\n'));
    }
    return res && !res.ok ? 1 : code;
  }

  const base = { today, keepWorkflow: argv.includes('--keep-workflow'), verify: argv.includes('--verify'), write: argv.includes('--write') || landing, ...(argv.includes('--no-assist') ? { assist: null } : {}) };
  const { land: _land, ...passed } = opts;
  if (remote || pr) {
    const { upgradeAt, renderPr } = await import('./upgrade-remote.mjs');
    const { code, report } = await upgradeAt({ ...base, ...passed, repo: local ? repo : null, remote, pr });
    if (argv.includes('--json')) out(JSON.stringify({ code, ...report }, null, 2));
    else (code === 2 ? err : out)([render(report, { color }), ...renderPr(report)].join('\n'));
    return code;
  }
  const { gh: _gh, urlOf: _urlOf, ...rest } = passed;
  const { code, report } = await upgrade({ ...base, repo, ...rest });
  let res = null;
  if (code === 0 && report.commit && landing) {
    const how = landHow || (report.loop?.mode === 'owner' ? 'owner' : 'pr');
    const kit = opts.kit || await kitSource();
    const { lib, crons } = await liveCrons(report.repo, report.origin.sha, kit);
    // The owner-mode prediction is the one to hold the tick to (NEXUS_LOOP_MODE is set before the push).
    res = await land({ repo: report.repo, sha: report.commit.sha, branch: report.commit.branch, base: report.origin.branch, how, loopMode: report.loop?.mode || null, predicted: report.dispatch, crons, lib, title: report.commit.subject, body: `\`\`\`\n${render(report)}\n\`\`\`\n`, ...landOpts });
    report.land = res;
  }
  if (argv.includes('--json')) out(JSON.stringify({ code: res && !res.ok ? 1 : code, ...report }, null, 2));
  else {
    (code === 2 ? err : out)(render(report, { color }));
    if (res) (res.ok ? out : err)(renderLand(res, { predicted: res.how === 'owner' ? report.dispatch : null, red }).join('\n'));
  }
  return res && !res.ok ? 1 : code;
}

