// The pure side of RepoStart (a folder that is not a repo yet): the steps from GET /api/repo/start's answer, the
// identity line, the owner choices and the words. No React, no fetch: test/repo-start-ui.test.mjs reads it.
export { cloudGate } from './cloudFlow.js';

/** Reasons that stop every step: guidance only. */
export const BLOCKING = new Set(['git-missing', 'nested', 'refused', 'dubious', 'other-remote']);

const ORDER = ['init', 'commit', 'remote', 'push', 'done'];

/**
 * The steps as the panel draws them: [{ id, n, label, state: 'done' | 'now' | 'wait' }]. "Put it on GitHub" covers
 * creating the repo and the push (the push is its own call, so a failed push never creates again).
 */
export function repoSteps(start) {
  const next = start?.next || 'init';
  const at = next === 'blocked' ? -1 : ORDER.indexOf(next === 'push' ? 'remote' : next);
  const state = (i) => (at < 0 ? 'wait' : i < at ? 'done' : i === at ? 'now' : 'wait');
  return [
    { id: 'init', n: 1, label: 'Start the repo', state: state(0) },
    { id: 'commit', n: 2, label: 'First commit', state: state(1) },
    { id: 'remote', n: 3, label: 'Put it on GitHub', state: state(2), optional: true },
    { id: 'done', n: 4, label: 'Done', state: next === 'done' ? 'done' : 'wait' },
  ];
}

/** Who the work is done as: { name, email, login, missing: [words] }. */
export function identityLine(start) {
  const user = start?.git?.user || null;
  const gh = start?.gh || null;
  const missing = [];
  if (start?.git && !start.git.installed) missing.push('git is not installed');
  else if (!user) missing.push('git does not know who you are yet');
  if (gh && !gh.installed) missing.push('GitHub: gh is not installed (the local steps still work)');
  else if (gh && !gh.signedIn) missing.push('GitHub: gh is not signed in (the local steps still work)');
  return { name: user?.name || null, email: user?.email || null, login: gh?.signedIn ? gh.login : null, missing };
}

/** The owners a repo can go under: the gh login first, then its orgs. */
export function ownerChoices(start) {
  const gh = start?.gh;
  if (!gh?.signedIn || !gh.login) return [];
  return [gh.login, ...(gh.orgs || []).filter((o) => o !== gh.login)];
}

/** The live line under the name: "github.com/O/N · free" | "...already exists" | "...checking" | ''. */
export function nameLine(owner, name, free) {
  if (!owner || !name) return '';
  const where = `github.com/${owner}/${name}`;
  if (free === true) return `${where} · free`;
  if (free === false) return `${where} already exists`;
  if (free === 'checking') return `${where} · checking`;
  return where;
}

/** A plan's args as the one command line the card shows. */
export const cmdOf = (args) => (Array.isArray(args) ? args.join(' ') : '');

/** The first-commit summary: "37 files go in. Left out by .gitignore: node_modules/, .env, .nexus/." */
export function commitSummary(status) {
  if (!status) return '';
  const n = status.capped ? `${status.files.toLocaleString('en-US')}+ files` : `${status.files} file${status.files === 1 ? '' : 's'}`;
  const out = status.ignoredTop?.length ? ` Left out by .gitignore: ${status.ignoredTop.join(', ')}.` : '';
  return `${n} go${status.files === 1 && !status.capped ? 'es' : ''} in.${out}`;
}

/** The init step's done line from its answer's gitignore. */
export function gitignoreLine(g) {
  if (!g) return 'A repo on main.';
  if (g.wrote) return `A repo on main. .gitignore written (${g.lines} lines).`;
  if (g.appended) return `A repo on main. Kept your .gitignore, added ${(g.added || []).join(', ') || `${g.lines} lines`}.`;
  return 'A repo on main. Your .gitignore already keeps .env and .nexus/ out.';
}

/** Detect's git row from the place (warn: not a repo; neutral: a repo, not on GitHub yet; lit: on GitHub). */
export function gitStar(place) {
  if (place === 'github') return 'lit';
  if (place === 'local' || place === 'other' || place === 'unpushed') return 'neutral';
  return 'warn';
}

/** Whether Detect shows the RepoStart panel under the git row. */
export function wantsRepoStart(info) {
  if (!info) return false;
  if (info.place) return info.place !== 'github';
  return !info.isGit || !info.remote;
}

/** The headline for the folder: { kicker, title }. */
export function heading(start) {
  const name = start?.folder?.name || 'this folder';
  if (start?.next === 'blocked') return { kicker: 'not here', title: `${name} cannot be a repo here` };
  if (start?.next === 'commit') return { kicker: 'a repo, nothing committed yet', title: `Make ${name} a repo` };
  if (start?.place === 'local' || start?.place === 'unpushed') return { kicker: 'a repo, not on GitHub yet', title: `Put ${name} on GitHub` };
  if (start?.next === 'done') return { kicker: 'on GitHub', title: `${name} is on GitHub` };
  return { kicker: 'not a repo yet', title: `Make ${name} a repo` };
}

/** The one-line reason for a guidance panel. */
export function guideCopy(why, start) {
  const top = start?.folder?.top;
  const host = start?.repo?.remote?.host;
  const name = start?.folder?.name || 'this folder';
  switch (why) {
    case 'git-missing': return 'git is not installed, and nexus needs it.';
    case 'no-identity': return start?.gh?.signedIn ? 'git does not know who you are yet. Use your GitHub name for this repo, or set it for every repo.' : 'git does not know who you are yet.';
    case 'gh-missing': return 'Putting it on GitHub needs gh, the GitHub CLI. The local steps work without it.';
    case 'gh-signed-out': return 'gh is not signed in.';
    case 'nested': return `This folder is inside the repo at ${top || 'a parent folder'}. nexus works at a repo's root.`;
    case 'refused': return start?.folder?.refusedAs === 'home' ? 'This is your home folder. Make a folder for the project and start nexus there.' : start?.folder?.refusedAs === 'root' ? 'This is the root of a drive. Make a folder for the project and start nexus there.' : 'This is a system folder. Make a folder for the project and start nexus there.';
    case 'other-remote': return `origin is on ${host || 'another host'}. The cloud loop runs on GitHub Actions, so it needs a GitHub repo.`;
    case 'dubious': return 'git refuses this folder: it belongs to another user.';
    case 'exists': return `That name already exists on GitHub. Pick another name, or connect ${name} to it if it is empty:`;
    case 'push-auth': return 'GitHub did not take the push: git has no GitHub sign-in on this machine.';
    case 'push-ssh': return 'gh set origin to an ssh address and git could not use a key.';
    case 'push-rejected': return 'origin already has commits this folder does not; pull first.';
    case 'workflow-scope': return 'Adding a workflow file needs gh\'s workflow scope:';
    default: return '';
  }
}
