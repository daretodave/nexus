#!/usr/bin/env node
// scripts/install-hooks.mjs — opt-in git hooks for hand commits and pushes.
//
// nexus/customization/verify-gate.md's contract is "pnpm verify
// runs before every commit" — but that only binds the loop (skills
// run it foreground). A human editing outside the loop has to
// remember to run it. This writes two hooks:
//
//   pre-commit  pnpm verify — nothing else: no network, no
//               formatting, no auto-fix.
//   pre-push    scripts/git/push-policy.mjs — a push to main on origin
//               or upstream from a checkout not in owner mode is refused
//               (land through a pull request; a fork's main is its
//               contributor's); see nexus/playbooks/owner-mode.md. The
//               step is skipped when the script is missing, so the
//               hook never breaks a checkout that pruned it.
//
// Opt-in only: clone-and-read contributors are unaffected until they
// run this themselves.
//
//   node scripts/install-hooks.mjs                    # both hooks
//   node scripts/install-hooks.mjs --only pre-push    # just one
//   node scripts/install-hooks.mjs --uninstall        # remove what it wrote
//
// The hooks go where git looks for them (core.hooksPath if set, and a
// worktree shares its main checkout's). Refuses to touch a hook it
// didn't write (checks for its own marker line) — prints the path and
// exits 1 rather than clobbering something else's hook.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '# nexus:install-hooks'
// git hands a hook GIT_DIR (a linked worktree's own git dir), GIT_INDEX_FILE and the like. A gate whose tests make
// scratch repos (`git init --bare` for a fake origin) would inherit them and write into this repository (its
// core.bare set true, the checkout broken). Every hook drops them first: its cwd is already the worktree root, so
// git finds the same repository and index again.
const UNSET = 'unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX'
const HOOKS = {
  'pre-commit': `pnpm verify
`,
  'pre-push': `# Owner mode decides how work lands: a push to main on origin or upstream
# from a checkout without effective owner mode is refused (git passes the
# remote name and URL as "$@"; scripts/git/push-policy.mjs decides by name).
# The claims ref passes unchecked. A checkout without the script skips it.
refs=$(cat)
if [ -f scripts/git/push-policy.mjs ]; then
  refs=$(printf '%s\n' "$refs" | node scripts/git/push-policy.mjs "$@") || exit 1
fi
exit 0
`,
}

function usage(msg) {
  if (msg) console.error(`install-hooks: ${msg}`)
  console.error('usage: node scripts/install-hooks.mjs [--only pre-commit|pre-push] [--uninstall]')
  process.exit(1)
}

let hooksDir
try {
  hooksDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-path', 'hooks'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
} catch {
  usage('not inside a git checkout')
}

const args = process.argv.slice(2)
const uninstall = args.includes('--uninstall')
const onlyAt = args.indexOf('--only')
const only = onlyAt === -1 ? null : args[onlyAt + 1]
if (only !== null && !HOOKS[only]) usage(`--only takes ${Object.keys(HOOKS).join(' or ')}`)
const names = only ? [only] : Object.keys(HOOKS)

let failed = false
for (const name of names) {
  const hookPath = path.join(hooksDir, name)
  const existing = fs.existsSync(hookPath) ? fs.readFileSync(hookPath, 'utf8') : null
  const ours = existing !== null && existing.includes(MARKER)
  if (existing !== null && !ours) {
    console.error(`install-hooks: ${hookPath} exists and wasn't written by this script — remove it by hand first if you mean to replace it`)
    failed = true
    continue
  }
  if (uninstall) {
    if (existing === null) {
      console.log(`install-hooks: no ${name} hook installed — nothing to do`)
    } else {
      fs.rmSync(hookPath)
      console.log(`install-hooks: removed ${hookPath}`)
    }
    continue
  }
  fs.mkdirSync(hooksDir, { recursive: true })
  fs.writeFileSync(hookPath, `#!/bin/sh\n${MARKER} — do not edit by hand; regenerate with\n# node scripts/install-hooks.mjs (--uninstall to remove).\n${UNSET}\n${HOOKS[name]}`, { mode: 0o755 })
  fs.chmodSync(hookPath, 0o755)
  console.log(`install-hooks: wrote ${hookPath}`)
}

if (!uninstall && !failed) console.log('install-hooks: node scripts/install-hooks.mjs --uninstall to remove')
process.exit(failed ? 1 : 0)
