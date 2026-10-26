// `nexus upgrade --repo owner/name [--pr]`: the upgrade (or the sync) of a repo on GitHub, with no local checkout, and
// `--pr`: its result pushed as `nexus/upgrade-<version>` and opened as a pull request whose body is the report (spec
// 58, A13).
//
// A GitHub repo (`owner/name`, or its URL) is cloned blobless into a temporary folder (`--filter=blob:none
// --no-checkout`: commits and trees now, a blob only when the upgrade reads it); the same path as a local run
// (detect, convert or sync, gate, report) runs on that clone, and the clone is removed after. A red gate opens
// nothing and keeps the clone, its path printed.
//
// `--pr` (on a GitHub repo or a local `--repo`) commits the result (the `--write` path), then:
//   - push access (the viewer's permission is write, maintain or admin): the branch goes to the repo itself;
//   - none: `gh repo fork`, and the branch goes to the fork; the pull request is opened from it;
//   - an open upgrade pull request from an earlier run (a `nexus/upgrade-*` head from the same owner) is updated in
//     place: its branch force-updated (with a lease on the sha just read) to the new result, its title and body
//     rewritten, and a comment saying what changed; a result whose tree equals the branch's is left as it is.
// Every gh call goes through one seam (`gh`), so tests stub it; git talks to whatever `urlOf(slug)` returns (a local
// bare remote in tests).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitIn, redactUrl, upgrade } from './upgrade.mjs';

/** A GitHub URL (https, ssh, scp-like, or bare host/owner/name) -> [owner, name]. */
const GITHUB_URL = /^(?:(?:https?|ssh|git):\/\/(?:[^@/\s]+@)?|git@)?(?:www\.)?github\.com[/:]([A-Za-z0-9-]+)\/([\w.-]+?)(?:\.git)?\/?$/i;
/** `owner/name`: GitHub's owner and repo name alphabets. */
const SLUG = /^([A-Za-z0-9-]+)\/([\w.-]+)$/;
/** The repo roles that may push a branch. */
export const PUSH_ROLES = Object.freeze(['ADMIN', 'MAINTAIN', 'WRITE']);
/** The head branches an upgrade pull request comes from (`nexus/upgrade-v2`, `nexus/upgrade-<version>`). */
export const UPGRADE_HEAD = /^nexus\/upgrade-/;
/** GitHub refuses a pull request body past 65536 characters; the report stays under this. */
export const BODY_MAX = 60000;

/** A GitHub repo named by `owner/name` or its URL: { owner, name, slug }, else null. */
export function parseRemote(arg) {
  const s = String(arg ?? '').trim();
  const m = GITHUB_URL.exec(s) || SLUG.exec(s);
  if (!m || m[2] === '.' || m[2] === '..') return null;
  const name = m[2].replace(/\.git$/i, '');
  return { owner: m[1], name, slug: `${m[1]}/${name}` };
}

/** The clone and push URL of a GitHub repo (git's credential helper, `gh auth setup-git`, signs it). */
export const githubUrl = (slug) => `https://github.com/${slug}.git`;

/** gh, synchronously, never through a shell: { ok, out, err }. The seam every call here goes through. */
export function ghCli(args, { cwd } = {}) {
  const r = spawnSync('gh', args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || r.error?.message || '').trim() };
}

const removeDir = (dir) => { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* the OS's temp sweep */ } };

/**
 * A blobless clone of `url` into a new temporary folder, nothing checked out: the folder. Throws (code 2) when the
 * clone fails, the folder already gone.
 */
export function bloblessClone(url) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-upgrade-clone-'));
  const r = gitIn(os.tmpdir(), ['-c', 'core.autocrlf=false', 'clone', '--quiet', '--filter=blob:none', '--no-checkout', url, dir]);
  if (!r.ok) {
    removeDir(dir);
    throw Object.assign(new Error(`git clone ${redactUrl(url)} failed: ${redactUrl(r.err)} (a private repo needs git signed in to GitHub: gh auth setup-git)`), { code: 2 });
  }
  return dir;
}

const json = (r) => { try { return JSON.parse(r.out || 'null'); } catch { return null; } };
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const fenceFor = (text) => { let f = '```'; while (String(text).includes(f)) f += '`'; return f; };

/**
 * The report as a pull request body (markdown): the per-file table, each assisted merge's diff with the reasons it
 * kept the repo's lines, the new content (and what is available, not added), the knobs written, the warnings, the
 * gate, the archive lines (a v1 upgrade), the predicted first tick and the loop mode. Under BODY_MAX: the diffs go
 * first, then the tail.
 */
export function prBody(report, { command = 'npx @usenexus/cli upgrade --pr' } = {}) {
  const build = (diffs) => {
    const out = [];
    const o = report.origin;
    const s = report.sync;
    out.push(`Opened by \`${command}\`: ${s ? `the sync of this repo's nexus kit from \`${s.from.ref}\` to ${s.to.version}` : 'the upgrade of this repo from nexus v1 (phases) to v2 (specs + chunks)'}, from ${o ? `\`${o.branch}\` at \`${o.sha.slice(0, 7)}\`` : 'the default branch'}. Merging it is the cut-over; closing it changes nothing.`);
    out.push('', `## Files (${report.files.length})`, '', '| Status | File | Note |', '|---|---|---|');
    for (const f of report.files) out.push(`| ${cell(f.status)} | \`${cell(f.path)}\` | ${cell(f.note)} |`);
    for (const a of s?.assisted || []) {
      out.push('', `## Assisted merge: \`${a.path}\`${a.applied ? '' : a.held ? ` (not applied: held back with \`${a.held}\`)` : ' (not applied: the gate was red with it)'}`, '');
      if (a.reasons.length) { out.push('Kept from the repo:', ''); for (const r of a.reasons) out.push(`- ${r}`); out.push(''); }
      if (diffs) { const f = fenceFor(a.diff); out.push(`${f}diff`, a.diff, f); } else out.push('(diff left out: the body would pass GitHub\'s limit; the dry run prints it)');
    }
    const fresh = report.files.filter((f) => f.status === 'new');
    const avail = report.available || [];
    if (fresh.length || avail.length) {
      out.push('', `## New content (${fresh.length} added, ${avail.length} available)`, '');
      for (const f of fresh) out.push(`- added \`${f.path}\`${f.note ? ` (${f.note})` : ''}`);
      for (const f of avail) out.push(`- available, not added: \`${f.path}\` (${f.note})`);
    }
    if (report.archive?.length) {
      out.push('', `## Archive (+${report.archive.length} line${report.archive.length === 1 ? '' : 's'})`, '');
      const f = fenceFor(report.archive.join('\n'));
      out.push(f, ...report.archive, f);
    }
    if (report.knobs?.length) {
      out.push('', '## Knobs written (conservative: behaviour does not change until you turn one up)', '');
      for (const k of report.knobs) {
        const name = k.at === 'section' ? `## ${k.knob}` : k.knob;
        if (k.at === 'var') out.push(k.status === 'set' ? `- \`${k.line}\`` : `- leave \`${k.knob}\` unset`);
        else out.push(`- ${k.status} \`${name}\` ${k.value}`);
      }
    }
    out.push('', `## Warnings (${report.warnings.length})`, '');
    if (!report.warnings.length) out.push('(none)');
    for (const w of report.warnings) out.push(`- ${w}`);
    out.push('', '## Gate', '');
    if (!report.gate.length) out.push('(none: the repo has no verify command and ran no kit gate)');
    for (const g of report.gate) out.push(`- ${g.skipped ? 'skipped' : g.ok ? 'green' : 'RED'}: ${g.name}${g.note ? ` (${g.note})` : ''}`);
    const d = report.dispatch;
    if (d) {
      out.push('', '## First tick (predicted)', '');
      if (d.pr) out.push(`- until \`NEXUS_LOOP_MODE=owner\` is set: ${d.pr.idle ? 'idle (pull-request mode picks only chunks)' : d.pr.text}`, `- owner mode: ${d.text}`);
      else out.push(`- ${d.text}`);
    }
    if (report.loop) out.push('', '## Loop mode', '', report.loop.mode === 'owner'
      ? `owner: the v1 loop pushed \`${report.loop.branch}\` (${report.loop.pushes} Cloud-Run commits). Before the first v2 tick: \`gh variable set NEXUS_LOOP_MODE --body owner\`.`
      : 'pr: the v2 loop lands each chunk as a pull request.');
    return out.join('\n');
  };
  let body = build(true);
  if (body.length > BODY_MAX) body = build(false);
  if (body.length > BODY_MAX) body = `${body.slice(0, BODY_MAX - 80)}\n\n(the report is cut here: the dry run prints all of it)`;
  return body;
}

/** The comment on an updated pull request: what changed since the last run's result. */
export function updateComment({ branch, was, now, subject, changed }) {
  const rows = changed.map((c) => `- ${c.status} \`${c.path}\``);
  return [
    `nexus upgrade ran again (${subject}) and force-updated \`${branch}\`: \`${was.slice(0, 7)}\` -> \`${now.slice(0, 7)}\`.`,
    '',
    rows.length ? `Files that differ from the last run's result (${rows.length}):` : 'No file differs from the last run\'s result; the branch moved onto the default branch\'s new tip.',
    ...(rows.length ? ['', ...rows] : []),
    '',
    'The description is this run\'s report.',
  ].join('\n');
}

/** A temporary file holding `text` (gh's --body-file): its path and a remove(). */
function tempText(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-upgrade-pr-'));
  const file = path.join(dir, 'body.md');
  fs.writeFileSync(file, text);
  return { file, remove: () => removeDir(dir) };
}

/** The GitHub repo of a local checkout: its origin URL parsed, else gh's answer in the folder. */
export function slugOf(dir, { gh = ghCli } = {}) {
  const url = gitIn(dir, ['remote', 'get-url', 'origin']);
  const parsed = url.ok ? parseRemote(url.out) : null;
  if (parsed) return parsed;
  const r = json(gh(['repo', 'view', '--json', 'nameWithOwner'], { cwd: dir }));
  return r?.nameWithOwner ? parseRemote(r.nameWithOwner) : null;
}

/**
 * Push `commit` ({ sha, branch, subject }) from the repo at `dir` and open (or update) its pull request on `slug`
 * against `base`. `pushUrl` is where a branch on the repo itself goes (the checkout's origin); a fork's comes from
 * `urlOf`. Returns { ok, status: 'opened' | 'updated' | 'unchanged', number, url, branch, head, fork, changed } or
 * { ok: false, error }.
 */
export function openPr({ dir, slug, commit, base, body, gh = ghCli, urlOf = githubUrl, pushUrl = null }) {
  const fail = (error) => ({ ok: false, error });
  const view = gh(['repo', 'view', slug, '--json', 'nameWithOwner,viewerPermission']);
  if (!view.ok) return fail(`gh repo view ${slug} failed: ${view.err}`);
  const perm = String(json(view)?.viewerPermission || '').toUpperCase();
  const [owner, name] = slug.split('/');
  let target = slug;
  let fork = false;
  if (!PUSH_ROLES.includes(perm)) {
    const f = gh(['repo', 'fork', slug, '--clone=false', '--remote=false']);
    if (!f.ok && !/already exists/i.test(`${f.err}\n${f.out}`)) return fail(`no push access to ${slug} (${perm.toLowerCase() || 'unknown'}), and gh repo fork failed: ${f.err}`);
    const me = gh(['api', 'user', '--jq', '.login']);
    if (!me.ok || !me.out) return fail(`could not read the signed-in GitHub login: ${me.err}`);
    target = `${me.out.trim()}/${name}`;
    fork = true;
  }
  const headOwner = target.split('/')[0].toLowerCase();
  const list = gh(['pr', 'list', '--repo', slug, '--state', 'open', '--json', 'number,url,headRefName,headRepositoryOwner,title', '--limit', '100']);
  if (!list.ok) return fail(`gh pr list on ${slug} failed: ${list.err}`);
  const open = (json(list) || []).find((p) => UPGRADE_HEAD.test(p.headRefName || '') && String(p.headRepositoryOwner?.login || (fork ? '' : owner)).toLowerCase() === headOwner);
  const branch = open ? open.headRefName : commit.branch;
  const url = fork || !pushUrl ? urlOf(target) : pushUrl;
  const remoteSha = gitIn(dir, ['ls-remote', url, `refs/heads/${branch}`]);
  if (!remoteSha.ok) return fail(`git ls-remote ${redactUrl(url)} failed: ${redactUrl(remoteSha.err)}`);
  const was = remoteSha.out.split(/\s+/)[0] || null;
  let changed = [];
  if (was) {
    const got = gitIn(dir, ['fetch', '--quiet', '--filter=blob:none', url, `refs/heads/${branch}`]);
    if (!got.ok) return fail(`git fetch ${branch} failed: ${redactUrl(got.err)}`);
    if (open && gitIn(dir, ['rev-parse', `${was}^{tree}`]).out === gitIn(dir, ['rev-parse', `${commit.sha}^{tree}`]).out) {
      return { ok: true, status: 'unchanged', number: open.number, url: open.url, branch, head: was, fork, changed: [] };
    }
    const diff = gitIn(dir, ['diff', '--no-renames', '--name-status', was, commit.sha]);
    changed = diff.ok && diff.out ? diff.out.split(/\r?\n/).map((l) => { const [status, ...p] = l.split('\t'); return { status, path: p.join('\t') }; }) : [];
  }
  // A branch already there is replaced only with a lease on the sha just read: a push someone made since is not lost.
  const push = gitIn(dir, ['push', '--quiet', ...(was ? [`--force-with-lease=refs/heads/${branch}:${was}`] : []), url, `${commit.sha}:refs/heads/${branch}`]);
  // A 403 with push access granted is git signing with another stored credential than gh's.
  if (!push.ok) return fail(`git push ${branch} to ${redactUrl(url)} failed: ${redactUrl(push.err)}${/\b403\b|denied/i.test(push.err) ? ' (gh can push here: let git sign with it, gh auth setup-git)' : ''}`);
  const b = tempText(body);
  try {
    if (open) {
      const edit = gh(['pr', 'edit', String(open.number), '--repo', slug, '--title', commit.subject, '--body-file', b.file]);
      if (!edit.ok) return fail(`gh pr edit #${open.number} failed: ${edit.err}`);
      const c = tempText(updateComment({ branch, was, now: commit.sha, subject: commit.subject, changed }));
      try {
        const said = gh(['pr', 'comment', String(open.number), '--repo', slug, '--body-file', c.file]);
        if (!said.ok) return fail(`gh pr comment #${open.number} failed: ${said.err}`);
      } finally { c.remove(); }
      return { ok: true, status: 'updated', number: open.number, url: open.url, branch, head: commit.sha, fork, changed };
    }
    const head = fork ? `${headOwner}:${branch}` : branch;
    const made = gh(['pr', 'create', '--repo', slug, '--base', base, '--head', head, '--title', commit.subject, '--body-file', b.file]);
    if (!made.ok) return fail(`gh pr create on ${slug} failed: ${made.err}`);
    const prUrl = made.out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop() || '';
    const number = Number(/\/pull\/(\d+)/.exec(prUrl)?.[1]) || null;
    return { ok: true, status: 'opened', number, url: prUrl, branch, head: commit.sha, fork, changed };
  } finally { b.remove(); }
}

/**
 * The upgrade of a GitHub repo (`remote`, from parseRemote) or a local one (`repo`), with `pr`: committed, pushed
 * and opened as a pull request. `opts` go to upgrade(). Returns { code, report }; report.remote is { slug, clone }
 * (clone: the kept clone's path, else null) and report.pr the pull request, or why none was opened.
 */
export async function upgradeAt({ repo = null, remote = null, pr = false, gh = ghCli, urlOf = githubUrl, ...opts }) {
  let clone = null;
  let root = repo;
  if (remote) {
    try { clone = bloblessClone(urlOf(remote.slug)); } catch (e) { return { code: e.code || 2, report: { error: e.message } }; }
    root = clone;
  }
  let keep = false;
  try {
    let target = remote;
    if (pr && !target) {
      target = slugOf(repo, { gh });
      if (!target) return { code: 2, report: { error: `--pr needs a GitHub repo: ${repo}'s origin is not one, and gh could not name it` } };
    }
    const r = await upgrade({ ...opts, repo: root, write: Boolean(pr || opts.write) });
    const report = r.report;
    if (remote) { report.repo = remote.slug; report.remote = { slug: remote.slug, clone: null }; }
    const kept = () => { keep = Boolean(clone); if (report.remote) report.remote.clone = clone; };
    if (r.code === 1) kept();
    if (!pr) return r;
    if (r.code !== 0) { report.pr = { ok: false, status: 'none', why: r.code === 1 ? 'the gate is red: nothing pushed, nothing opened' : 'nothing to push' }; return r; }
    if (!report.commit) { report.pr = { ok: false, status: 'none', why: report.message ? `${report.message}: nothing to push` : 'no commit to push' }; return r; }
    const origin = gitIn(root, ['remote', 'get-url', 'origin']);
    const command = `npx @usenexus/cli upgrade --repo ${target.slug} --pr`;
    const res = openPr({ dir: root, slug: target.slug, commit: report.commit, base: report.origin.branch, body: prBody(report, { command }), gh, urlOf, pushUrl: origin.ok ? origin.out : null });
    report.pr = res;
    if (!res.ok) { kept(); return { code: 1, report: { ...report, error: res.error } }; }
    return r;
  } finally {
    if (clone && !keep) removeDir(clone);
  }
}

/** The pull request lines the terminal prints after the report. */
export function renderPr(report) {
  const out = [];
  const p = report.pr;
  if (p) {
    out.push('', 'pull request');
    if (p.status === 'opened') out.push(`  opened #${p.number ?? '?'}  ${p.url}`, `  ${p.branch} pushed to ${p.fork ? 'your fork (no push access to the repo)' : 'the repo'}`);
    else if (p.status === 'updated') out.push(`  updated #${p.number}  ${p.url}`, `  ${p.branch} force-updated to ${p.head.slice(0, 7)} (${p.changed.length} file${p.changed.length === 1 ? '' : 's'} differ from the last run's); a comment says what changed`);
    else if (p.status === 'unchanged') out.push(`  #${p.number} already holds this result  ${p.url}`, `  ${p.branch} left at ${p.head.slice(0, 7)}`);
    else out.push(`  none opened: ${p.why || p.error}`);
  }
  if (report.remote?.clone) out.push('', `clone kept: ${report.remote.clone}`);
  else if (report.remote && !p && !report.error) out.push('', `The temporary clone is removed. --pr commits this, pushes it as a branch and opens a pull request whose body is this report.`);
  return out;
}
