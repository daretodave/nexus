#!/usr/bin/env node
// scripts/release-reply.mjs: a cli release closes the issues it fixed (spec 54, A11). nexus only: publish.yml runs it
// after a `cli-v*` tag publishes @usenexus/cli.
//
// A support fix under packages/cli lands with `Refs #N` and stays open (`support.mjs tell` holds it): main has the fix,
// npm does not. This reads every `Refs #N` in `git log <previous cli-v tag>..<tag>` and, for each issue still open AND
// labeled `triage:loop-queued` or `bug`, comments "Fixed in @usenexus/cli X.Y.Z: npx @usenexus/cli@X.Y.Z" and closes
// it. Any other referenced issue (closed already, unlabeled, unreadable) is left alone and listed in the step summary.
//
// The previous tag is the newest stable `cli-v*` tag before <tag>, so a stable release covers every commit since the
// last stable one. A prerelease tag (cli-vX.Y.Z-pre) publishes to npm's `next` dist-tag, which `npx @usenexus/cli`
// does not serve: it closes nothing and lists what it would have closed.
//
//   node scripts/release-reply.mjs <cli-vX.Y.Z> [--dry-run] [--summary <file>]
//
// --summary defaults to $GITHUB_STEP_SUMMARY (appended to); without either the summary prints. gh runs with the
// caller's GH_TOKEN and GH_REPO. Exit 0 whatever gh answers (a failed reply is listed, never a red release); 64 on bad
// usage or a tag that is not cli-vX.Y.Z; 1 when git cannot read the range.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PACKAGE = '@usenexus/cli';
export const LABELS = ['triage:loop-queued', 'bug'];
const TAG = /^cli-v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
const REFS = /\bRefs[ \t]*:?[ \t]+#(\d+)(?!\d)/gi;

/** The version a `cli-v*` tag names, or null. */
export function versionOf(tag = '') {
  return TAG.exec(String(tag).trim())?.[1] ?? null;
}

export const isPrerelease = (version) => String(version).includes('-');

/** Every issue number a `Refs #N` names in `text`, ascending, once each. */
export function refsIn(text = '') {
  return [...new Set([...String(text).matchAll(REFS)].map((m) => Number(m[1])))].sort((a, b) => a - b);
}

/** The comment a fixed issue gets. */
export const replyText = (version) => `Fixed in ${PACKAGE} ${version}: npx ${PACKAGE}@${version}`;

/**
 * What the release does for one referenced issue: { action: 'close' | 'leave', why }. `issue` is { state, labels } from
 * gh, or null when gh could not read it.
 */
export function decide(issue, { version }) {
  if (!issue) return { action: 'leave', why: 'unreadable (no gh, or not an issue)' };
  if (String(issue.state).toUpperCase() !== 'OPEN') return { action: 'leave', why: 'already closed' };
  const labels = (issue.labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean);
  if (!labels.some((l) => LABELS.includes(l))) return { action: 'leave', why: `open, but not labeled ${LABELS.join(' or ')}` };
  if (isPrerelease(version)) return { action: 'leave', why: `prerelease ${version} (npm's next tag): the stable release closes it` };
  return { action: 'close', why: `open and labeled ${labels.filter((l) => LABELS.includes(l)).join(', ')}` };
}

/** The step summary: markdown lines naming what closed, what was left and why. */
export function summary({ tag, previous, rows, dry = false }) {
  const range = previous ? `${previous}..${tag}` : `${tag} (no earlier stable cli-v tag)`;
  const out = [`## Release reply: ${tag}`, '', `Range: \`${range}\`${dry ? ' (dry run: nothing written)' : ''}`, ''];
  if (!rows.length) return [...out, 'No `Refs #N` in the range: nothing to close.'];
  const closed = rows.filter((r) => r.action === 'close');
  const left = rows.filter((r) => r.action !== 'close');
  out.push(`Closed (${closed.length}):`);
  out.push(...(closed.length ? closed.map((r) => `- #${r.number}${r.ok === false ? ': the gh close failed, close it by hand' : ''}`) : ['- none']));
  out.push('', `Left alone (${left.length}):`);
  out.push(...(left.length ? left.map((r) => `- #${r.number}: ${r.why}`) : ['- none']));
  return out;
}

/** git read only: { previous, text } for the release range, or null when git cannot read it. */
export function gitRange(tag, { cwd = process.cwd(), run = spawnSync } = {}) {
  const git = (...args) => run('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  const head = git('rev-parse', '--verify', '--quiet', `${tag}^{commit}`);
  if (!head || head.status !== 0) return null;
  const desc = git('describe', '--tags', '--abbrev=0', '--match', 'cli-v*', '--exclude', 'cli-v*-*', `${tag}^`);
  const previous = desc && desc.status === 0 && desc.stdout.trim() ? desc.stdout.trim() : null;
  const log = git('log', '--format=%B%x00', previous ? `${previous}..${tag}` : tag);
  if (!log || log.status !== 0) return null;
  return { previous, text: log.stdout };
}

/** gh read only: an issue's { state, labels }, or null. */
export function ghIssue(num, { run = spawnSync } = {}) {
  const res = run('gh', ['issue', 'view', String(num), '--json', 'state,labels'], { encoding: 'utf8', windowsHide: true });
  if (!res || res.status !== 0) return null;
  try {
    const j = JSON.parse(res.stdout);
    return { state: j.state ?? '', labels: (j.labels ?? []).map((l) => l.name ?? l) };
  } catch {
    return null;
  }
}

/** gh write: comment on and close one issue in one call; true when it ran clean. */
export function ghClose(num, body, { run = spawnSync } = {}) {
  const res = run('gh', ['issue', 'close', String(num), '--comment', body], { encoding: 'utf8', windowsHide: true });
  return Boolean(res) && res.status === 0;
}

const USAGE = 'usage: node scripts/release-reply.mjs <cli-vX.Y.Z> [--dry-run] [--summary <file>]';

export function main(argv = process.argv.slice(2), { cwd = process.cwd(), run = spawnSync, out = console.log, env = process.env } = {}) {
  let tag = null;
  let dry = false;
  let file = env.GITHUB_STEP_SUMMARY || null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') dry = true;
    else if (argv[i] === '--summary' && argv[i + 1]) file = argv[++i];
    else if (!tag && !argv[i].startsWith('-')) tag = argv[i];
    else return (out(USAGE), 64);
  }
  const version = versionOf(tag ?? '');
  if (!version) return (out(tag ? `not a cli release tag: ${tag} (want cli-vX.Y.Z)` : USAGE), 64);
  const range = gitRange(tag, { cwd, run });
  if (!range) return (out(`release-reply: git cannot read ${tag} (fetch the history and tags: fetch-depth 0)`), 1);
  const rows = refsIn(range.text).map((number) => ({ number, ...decide(ghIssue(number, { run }), { version }) }));
  for (const r of rows) {
    if (r.action === 'close' && !dry) r.ok = ghClose(r.number, replyText(version), { run });
    out(`#${r.number}: ${r.action === 'close' ? (dry ? 'would close' : r.ok ? 'closed' : 'close failed') : 'left'} · ${r.why}`);
  }
  const lines = summary({ tag, previous: range.previous, rows, dry });
  if (file) {
    try {
      fs.appendFileSync(file, lines.join('\n') + '\n');
    } catch {
      for (const l of lines) out(l);
    }
  } else for (const l of lines) out(l);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  process.exit(main(process.argv.slice(2), { cwd: root }));
}
