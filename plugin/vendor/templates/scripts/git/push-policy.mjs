// scripts/git/push-policy.mjs: the pre-push hook's first step. It decides how a push lands per owner mode
// (scripts/owner.mjs), and which pushed refs any later hook step checks.
//
//   - A push that updates the main branch (NEXUS_MAIN_BRANCH, default `main`) on `origin` or `upstream` from a
//     checkout that is not in effective owner mode is refused: a contributor lands through a pull request from
//     `next/<id>` (or a package's `pkg/<slug>`). Any other remote (a contributor's own fork) is theirs, main included.
//     The verdict goes by the remote's name, which git hands the hook as its first argument (the second is the URL):
//     a push straight to a URL has no remote name and is not guarded; a hook that passes no arguments is guarded.
//     The `.owner` file is untracked, so a contributor could make one: this is a leg trip for a loop on autopilot,
//     never a lock. The lock is the host's branch ruleset (a pull request required, the owner's bypass); see
//     nexus/playbooks/owner-mode.md.
//   - The `claims` ref (scripts/claims.mjs) is dropped from the lines it passes on: anyone writes it at any time, by
//     compare-and-swap, so a later step (a secret scan, a plan check) has nothing to say about it.
//
//   argv: <remote name> <remote url>, as git passes them to a pre-push hook
//   stdin: git's pre-push lines, "<local ref> <local sha> <remote ref> <remote sha>"
//   stdout: the lines left for later steps; exit 1 (and a reason on stderr) when the push is refused.
//
// The hook (written by scripts/install-hooks.mjs) runs this only when the file exists: a checkout without it skips
// the step.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BRANCH } from '../claims-codec.mjs';
import { isOwner } from '../owner.mjs';

export const mainOf = (env = process.env) => env.NEXUS_MAIN_BRANCH || 'main';

/** The remotes whose main is the owner's: the shared repository, and the one a fork was cut from. */
export const GUARDED_REMOTES = ['origin', 'upstream'];

/** Whether a push to this remote name is guarded. No name (an older hook passing no arguments) guards: fail safe. */
export const guards = (remote) => !remote || GUARDED_REMOTES.includes(remote);

/** Split pre-push lines into those later steps check (`keep`) and whether one updates (or deletes) main. */
export function sortRefs(stdin, { main = 'main', claims = BRANCH } = {}) {
  const keep = [];
  let toMain = false;
  for (const line of stdin.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const remoteRef = line.trim().split(/\s+/)[2] ?? '';
    if (remoteRef === `refs/heads/${claims}`) continue;
    if (remoteRef === `refs/heads/${main}`) toMain = true;
    keep.push(line.trim());
  }
  return { keep, toMain };
}

/** The verdict for one push: { ok, keep, reason }. Pure: `owner` is passed in. */
export function decide(stdin, { owner, main = 'main', remote }) {
  const { keep, toMain } = sortRefs(stdin, { main });
  if (toMain && !owner && guards(remote)) {
    return {
      ok: false,
      keep,
      reason:
        `push-policy: only the owner's checkout pushes ${main}${remote ? ` to ${remote}` : ''} (owner mode: an untracked .owner, see scripts/owner.mjs).\n` +
        `  Land through a pull request instead: git push -u origin HEAD, then gh pr create (/next does both).`,
    };
  }
  return { ok: true, keep, reason: '' };
}

export function main({ argv = process.argv.slice(2), stdin = fs.readFileSync(0, 'utf8'), env = process.env, owner = isOwner(process.cwd(), env), out = process.stdout, err = process.stderr } = {}) {
  const v = decide(stdin, { owner, main: mainOf(env), remote: argv[0] });
  if (!v.ok) {
    err.write(`${v.reason}\n`);
    return 1;
  }
  if (v.keep.length) out.write(`${v.keep.join('\n')}\n`);
  return 0;
}

// Run as a script: compare real paths, so a repo reached through a symlink (macOS /tmp, a junction) still runs the
// policy instead of skipping it silently (an import-only no-op would let every push through).
const realOrNull = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
};
if (process.argv[1] && realOrNull(process.argv[1]) === realOrNull(fileURLToPath(import.meta.url))) process.exit(main());
