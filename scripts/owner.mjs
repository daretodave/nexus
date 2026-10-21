// scripts/owner.mjs: is this checkout the owner's? (effective owner mode)
//
// Owner mode is a switch on the checkout, never a property of the repo:
//   - an untracked `.owner` file at the primary checkout's root (gitignored) makes it the owner's; a worktree of that
//     checkout is the owner's too;
//   - the owner can switch it off for a session in the untracked local settings, `.nexus/local.json`
//     (`{ "ownerMode": false }`), and get contributor behavior (PRs, packages);
//   - `NEXUS_CONTRIBUTOR=1` does the same for one command (to rehearse the PR path).
// With no `.owner`, owner mode is not an option at all: the setting is ignored. A `.owner` committed to the repo
// counts for no one (it would make every clone the owner's): gitignore it.
//
// The owner's sessions claim as `privileged_agent_session`, may claim many chunks at once, land on main and settle
// plan/pending/. A contributor could make the file too: the pre-push refusal of main is a leg trip, and the host's
// branch ruleset (a PR required, the owner's bypass) is the lock.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const OWNER_FILE = '.owner';
export const LOCAL_SETTINGS = '.nexus/local.json';

/** The primary checkout's root (a worktree's too): the folder holding the common .git. */
export function primaryRoot(cwd = process.cwd()) {
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  return path.dirname(common);
}

/** The local settings at the primary root, or {} when there are none or they don't parse. */
export function localSettings(root) {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(root, LOCAL_SETTINGS), 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Effective owner mode: `.owner` present, not switched off in the local settings, no NEXUS_CONTRIBUTOR=1. */
export function isOwner(cwd = process.cwd(), env = process.env) {
  if (env.NEXUS_CONTRIBUTOR === '1') return false;
  try {
    const root = primaryRoot(cwd);
    if (!fs.existsSync(path.join(root, OWNER_FILE))) return false;
    if (localSettings(root).ownerMode === false) return false;
    // A committed `.owner` would make every clone the owner's: only an untracked one counts.
    return execFileSync('git', ['ls-files', '--', OWNER_FILE], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() === '';
  } catch {
    return false;
  }
}
