#!/usr/bin/env node
// .claude/hooks/guard.mjs — mechanical enforcement of the
// standing rules in agents.md. Wired via .claude/settings.json:
//
//   PreToolUse (matcher: Bash)  → node .claude/hooks/guard.mjs pre-bash
//   Stop                        → node .claude/hooks/guard.mjs stop
//
// Exit-code contract (Claude Code hooks):
//   0  allow / no opinion
//   2  BLOCK — stderr is fed back to the agent as feedback
//   other non-zero = hook error (logged, non-fatal)
//
// The guard is a backstop, not the primary enforcement — the
// skills' prose rules are. A block firing mid-run is itself a
// finding: record it in the commit body or plan/AUDIT.md.
//
// Modes:
//   pre-bash    mark this session as hooked (.nexus/hooks/<session id>
//               at the primary checkout, which scripts/claims.mjs
//               requires inside Claude Code), then check a Bash tool
//               call against the forbidden list
//   stop        warn (or block, with NEXUS_STRICT_STOP=1) when a
//               turn ends with a dirty tree / unpushed commits
//   self-test   run canned commands through the matcher; exit 1
//               on any mismatch (use in CI / after editing rules)
//
// Zero dependencies. Never throws: an unexpected error prints to
// stderr and exits 0 (fail-open) so a guard bug can't wedge the
// loop — the provider-level backstops still hold.

import { execSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DEFAULT_BRANCH = 'main'

// The commit-verb vocabulary — see plan/bearings.md "Commit
// verb vocabulary (locked)". New verb → add it there and here
// in the same commit (the gate-teaching rule, agents.md rule 3).
const VERBS = [
  'critique', 'digest', 'expand', 'jot', 'oversight', 'triage',
  'feat', 'fix', 'docs', 'templates', 'playbook', 'plan',
  'ci', 'cloud',
]

// Pulls the first `-m`/`--message` string out of a `git commit`
// invocation. Two shapes: a plain quoted string, or the
// heredoc-body pattern this repo's skills use for multi-line
// messages (`-m "$(cat <<'EOF' ... EOF)"`) — for that shape the
// heredoc's own first line is the subject. Returns null when
// neither matches (fails open — backstop, not primary enforcement).
function extractCommitMessage(cmd) {
  if (!/\bgit\b[^|;&\n]*\bcommit\b/.test(cmd)) return null
  const heredoc = cmd.match(
    /(?:-m|--message)\s+"\$\(cat\s*<<-?\s*['"]?(\w+)['"]?\s*\n([^\n]*)/,
  )
  if (heredoc) return heredoc[2]
  const m =
    cmd.match(/(?:-m|--message)[ \t]*=?[ \t]*"((?:[^"\\]|\\.)*)"/) ||
    cmd.match(/(?:-m|--message)[ \t]*=?[ \t]*'((?:[^'\\]|\\.)*)'/)
  return m ? m[1] : null
}

// Verb is the text before the first `:` on the message's first
// line, with a trailing `(scope)` stripped (`fix(cloud):` → `fix`).
function commitVerb(message) {
  const firstLine = message.split('\n')[0].trim()
  const idx = firstLine.indexOf(':')
  if (idx === -1) return null
  return firstLine.slice(0, idx).trim().replace(/\([^)]*\)$/, '')
}

// A bare `git worktree remove`, behind any of git's own options (`-C
// <dir>`, `-c <k=v>`, `--git-dir <x>`, `--work-tree=<y>`, `-p`: a value
// after `=` or as the next word, quoted or not). git for Windows
// deletes through a junction in the worktree (npm's workspace links)
// and stops at its first failure after unregistering it, leaving the
// rest on disk. A mention inside quotes (a commit message, a grep
// pattern) passes, unless a shell runs that quoted text
// (`bash -c '...'`).
const GIT_VALUE = String.raw`("[^"]*"|'[^']*'|[^\s"';&|-][^\s;&|]*)`
const WORKTREE_REMOVE = new RegExp(
  String.raw`(^|[\s;&|(${'`'}'"])git(\.exe)?(\s+(-[A-Za-z]|--[\w-]+)(=${GIT_VALUE}|\s+${GIT_VALUE})?)*\s+worktree\s+remove\b`,
)
const RUNS_QUOTED = /\s-(c|Command|e)\s+["']/
function maskQuoted(cmd) {
  return cmd.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, (q) => q[0] + '_'.repeat(q.length - 2) + q[q.length - 1])
}

// --- forbidden-command rules ------------------------------------------

// Each rule: name, test(command) → true = block, message for the
// agent. Messages say WHY and what to do instead, so a blocked
// call self-corrects instead of retrying.
const RULES = [
  {
    name: 'no-verify',
    test: (cmd) => /\bgit\b[^|;&\n]*\bcommit\b[^|;&\n]*(\s--no-verify\b|\s-n\b)/.test(cmd),
    message:
      'guard: --no-verify is forbidden (agents.md standing rule 3). ' +
      'The verify gate is non-negotiable — fix the root cause of the ' +
      'failing check, then commit normally.',
  },
  {
    name: 'force-push',
    test: (cmd) =>
      /\bgit\b[^|;&\n]*\bpush\b[^|;&\n]*(\s--force(-with-lease)?\b|\s-f\b)/.test(cmd) ||
      /\bgit\b[^|;&\n]*\bpush\b[^|;&\n]*\s\+\S/.test(cmd),
    message:
      'guard: force-push is forbidden (agents.md standing rule 5). ' +
      'If the push was rejected, git pull --rebase (your own unpushed ' +
      'commits only), rerun the gate, and push again. ' +
      'If history is genuinely wrong, stop and file [needs-user-call] ' +
      'per your skill\'s failure modes.',
  },
  {
    name: 'destructive-reset',
    test: (cmd) =>
      /\bgit\b[^|;&\n]*\breset\b[^|;&\n]*\s--hard\b/.test(cmd) ||
      /\bgit\b[^|;&\n]*\bclean\b[^|;&\n]*\s-[a-zA-Z]*f/.test(cmd) ||
      /\bgit\b[^|;&\n]*\bcheckout\b\s+(--\s+)?\.(\s|$)/.test(cmd) ||
      new RegExp(`\\bgit\\b[^|;&\\n]*\\bbranch\\b[^|;&\\n]*\\s-D\\s+${DEFAULT_BRANCH}\\b`).test(cmd),
    message:
      'guard: destructive resets are forbidden (agents.md standing ' +
      'rule 5). Uncommitted work is either shipped (commit it) or a ' +
      'finding (write it to plan/AUDIT.md) — never discarded.',
  },
  {
    name: 'bare-worktree-remove',
    test: (cmd) => WORKTREE_REMOVE.test(RUNS_QUOTED.test(cmd) ? cmd : maskQuoted(cmd)),
    message:
      'guard: a bare `git worktree remove` deletes through any link in ' +
      "the worktree (npm's workspace junctions) and can stop half done. " +
      'Close it from outside it with `node scripts/worktree.mjs close ' +
      '<path>`: it unlinks every link first, refuses a dirty or locked ' +
      'worktree, and deletes the branch only once main holds it.',
  },
  {
    name: 'trailer-or-emoji-in-commit',
    test: (cmd) =>
      /\bgit\b[^|;&\n]*\bcommit\b/.test(cmd) &&
      (/Co-Authored-By/i.test(cmd) ||
        /[\u{1F000}-\u{1FAFF}\u{2705}\u{2728}\u{FE0F}]/u.test(cmd)),
    message:
      'guard: commit bodies are plain (agents.md standing rule 2) — ' +
      'no Co-Authored-By trailers, no emojis. The only sanctioned ' +
      'trailer is Cloud-Run: (cloud ticks only). Rewrite the message.',
  },
  {
    name: 'commit-verb',
    test: (cmd) => {
      const msg = extractCommitMessage(cmd)
      if (msg === null) return false
      const verb = commitVerb(msg)
      return verb === null || !VERBS.includes(verb)
    },
    message:
      'guard: commit message verb isn\'t in the documented ' +
      'vocabulary (plan/bearings.md "Commit verb vocabulary"). ' +
      `Use "<verb>: <subject>" with verb in: ${VERBS.join(', ')}. ` +
      'New verb → add it to bearings.md and VERBS in this file, ' +
      'same commit.',
  },
]

// Backgrounding the gate is its own rule because it needs the
// run_in_background flag, not just the command string. This is
// the "post-result exit hang" — see playbooks/cloud-loop.md.
function backgroundedGate(input) {
  const cmd = String(input?.tool_input?.command ?? '')
  const bg = input?.tool_input?.run_in_background === true
  return bg && /\b(verify|deploy:check|e2e|test:run)\b/.test(cmd)
}

const BACKGROUND_MESSAGE =
  'guard: never run the verify/deploy gate in the background ' +
  '(agents.md standing rule 3 — the post-result exit hang). Run it ' +
  'as a foreground, blocking call and wait for it. If the gate is ' +
  'too slow, run its legs as sequential foreground calls.'

// --- modes --------------------------------------------------------------

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, 'utf-8')
    return raw.trim() ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

// --- the hooked-session marker --------------------------------------

// The primary checkout's root (a worktree's too): the folder holding
// the common .git. Read from the files, not by spawning git: this
// runs on every Bash call. null outside a checkout.
function primaryRootOf(start) {
  let dir = path.resolve(start)
  for (;;) {
    const dotGit = path.join(dir, '.git')
    let st = null
    try {
      st = fs.statSync(dotGit)
    } catch {
      /* not here: look up */
    }
    if (st?.isDirectory()) return dir
    if (st) {
      const m = fs.readFileSync(dotGit, 'utf-8').match(/^gitdir:\s*(.+?)\s*$/m)
      if (!m) return null
      const gitdir = path.resolve(dir, m[1])
      let common = gitdir
      try {
        common = path.resolve(gitdir, fs.readFileSync(path.join(gitdir, 'commondir'), 'utf-8').trim())
      } catch {
        /* no commondir: the gitdir is the common dir */
      }
      return path.dirname(common)
    }
    const up = path.dirname(dir)
    if (up === dir) return null
    dir = up
  }
}

// Touch .nexus/hooks/<session id> at the primary checkout of every
// folder this call could run in: scripts/claims.mjs refuses a Claude
// Code session without a fresh one (customization/claims.md), so a
// session that loaded no hooks can't claim and build unguarded.
// Best-effort and silent: a marker that can't be written only means
// a claim refuses, never that this call is blocked.
function markHooked(input, env = process.env) {
  const ids = new Set([input?.session_id, env.CLAUDE_CODE_SESSION_ID].filter((x) => typeof x === 'string' && x))
  if (!ids.size) return []
  const roots = new Set()
  for (const start of [input?.cwd, env.CLAUDE_PROJECT_DIR, process.cwd()]) {
    if (typeof start !== 'string' || !start) continue
    try {
      const root = primaryRootOf(start)
      if (root) roots.add(root)
    } catch {
      /* unreadable .git: skip */
    }
  }
  const written = []
  const stamp = new Date().toISOString() + '\n'
  for (const root of roots) {
    const dir = path.join(root, '.nexus', 'hooks')
    try {
      fs.mkdirSync(dir, { recursive: true })
      for (const id of ids) {
        const file = path.join(dir, id.replace(/[^\w.-]/g, '_'))
        fs.writeFileSync(file, stamp)
        written.push(file)
      }
    } catch {
      /* best-effort */
    }
  }
  return written
}

function preBash() {
  const input = readStdinJson()
  markHooked(input)
  const cmd = String(input?.tool_input?.command ?? '')
  if (!cmd) return 0
  if (backgroundedGate(input)) {
    process.stderr.write(BACKGROUND_MESSAGE + '\n')
    return 2
  }
  for (const rule of RULES) {
    if (rule.test(cmd)) {
      process.stderr.write(rule.message + '\n')
      return 2
    }
  }
  return 0
}

function git(args) {
  return execSync(`git ${args}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

function notifyBestEffort(title, body) {
  try {
    if (!fs.existsSync('scripts/notify.mjs')) return
    const child = spawn(
      process.execPath,
      ['scripts/notify.mjs', '--title', title, '--body', body, '--priority', 'high'],
      { detached: true, stdio: 'ignore' },
    )
    child.unref()
  } catch {
    /* best-effort */
  }
}

function stopCheck() {
  const input = readStdinJson()
  let dirty = ''
  let unpushed = 0
  try {
    dirty = git('status --porcelain')
  } catch {
    return 0 // not a git repo / git unavailable — nothing to enforce
  }
  try {
    unpushed = Number(git(`rev-list --count @{u}..HEAD`)) || 0
  } catch {
    unpushed = 0 // no upstream yet — push discipline can't apply
  }
  if (!dirty && unpushed === 0) {
    resetBlockCounter()
    return 0
  }

  const reason =
    (dirty ? `dirty tree (${dirty.split('\n').length} paths)` : '') +
    (dirty && unpushed ? ' + ' : '') +
    (unpushed ? `${unpushed} unpushed commit(s)` : '')
  const message =
    `guard: turn is ending with ${reason}. Standing rule 1: commit ` +
    'and push as a single atomic act — the next tick pulls from ' +
    'origin and will not see this work. Finish the commit+push, or ' +
    'file the leftover as a finding.'

  const strict = process.env.NEXUS_STRICT_STOP === '1'
  const alreadyContinuing = input?.stop_hook_active === true
  if (strict && !alreadyContinuing && bumpBlockCounter() < 3) {
    process.stderr.write(message + '\n')
    return 2
  }
  process.stderr.write(message + ' (warning only)\n')
  notifyBestEffort('loop: unclean stop', reason)
  return 0
}

// Strict mode breaks its own cycle: 3 consecutive blocked stops in
// one repo → warn-and-allow (the underlying failure mode is the
// real bug; blocking forever would wedge the session).
const COUNTER = path.join('.git', 'nexus-stop-blocks')

function bumpBlockCounter() {
  let n = 0
  try {
    n = Number(fs.readFileSync(COUNTER, 'utf-8')) || 0
  } catch {
    /* first block */
  }
  try {
    fs.writeFileSync(COUNTER, String(n + 1))
  } catch {
    /* non-fatal */
  }
  return n
}

function resetBlockCounter() {
  try {
    fs.rmSync(COUNTER, { force: true })
  } catch {
    /* non-fatal */
  }
}

function selfTest() {
  const cases = [
    ['git commit -m "x" --no-verify', 'no-verify'],
    ['git commit --no-verify -m "x"', 'no-verify'],
    ['git commit -n -m "x"', 'no-verify'],
    ['git push --force origin main', 'force-push'],
    ['git push -f', 'force-push'],
    ['git push --force-with-lease origin main', 'force-push'],
    ['git push origin +main', 'force-push'],
    ['git reset --hard HEAD~3', 'destructive-reset'],
    ['git clean -fd', 'destructive-reset'],
    ['git checkout -- .', 'destructive-reset'],
    ['git commit -m "feat: x\n\nCo-Authored-By: bot"', 'trailer-or-emoji-in-commit'],
    // multi-line commands where an unrelated later line only
    // coincidentally contains a trigger token — regex classes must
    // not span logical command boundaries via a bare newline
    ['git log --oneline -5\necho "we will commit this later"\nls -n', null],
    // commit-verb: bad/missing verb blocked, scoped + documented
    // verbs allowed, the phases/phase-N drift that motivated the
    // rule is exactly what it now catches (the retired phases verb included)
    ['git commit -m "nonsense: not a real verb"', 'commit-verb'],
    ['git commit -m "Update README.md"', 'commit-verb'],
    ['git commit -m "phase 28: brief for phase 28"', 'commit-verb'],
    ['git commit -m "fix(cloud): user-author mode"', null],
    ['git commit -m "phases: brief for phase 28"', 'commit-verb'],
    // heredoc-body commit messages (this skill set's convention
    // for multi-line bodies) — the verb rule reads the heredoc's
    // own first line, not the "$(cat <<'EOF'" wrapper
    ['git commit -m "$(cat <<\'EOF\'\nfeat: ship phase 28\n\nbody line\nEOF\n)"', null],
    ['git commit -m "$(cat <<\'EOF\'\nnonsense: bad verb\n\nbody line\nEOF\n)"', 'commit-verb'],
    // bare-worktree-remove: the command blocked, a quoted mention passes
    ['git worktree remove ../wt/07.1', 'bare-worktree-remove'],
    ['git -C /r worktree remove --force ../wt/x', 'bare-worktree-remove'],
    // any git global option, its value after = or as the next word
    ['git --git-dir /r/.git worktree remove ../wt/x', 'bare-worktree-remove'],
    ['git --git-dir=/r/.git worktree remove x', 'bare-worktree-remove'],
    ['git --work-tree /r --git-dir /r/.git worktree remove x', 'bare-worktree-remove'],
    ['git -c core.longpaths=true worktree remove x', 'bare-worktree-remove'],
    ['git --namespace ns --no-pager worktree remove x', 'bare-worktree-remove'],
    ['git --exec-path=/usr/lib/git-core -p worktree remove x', 'bare-worktree-remove'],
    ['git --git-dir "C:/my repo/.git" worktree remove x', 'bare-worktree-remove'],
    ['git --git-dir /r/.git worktree list', null],
    ['git --git-dir /r/.git log --grep "worktree remove"', null],
    ["bash -c 'git worktree remove ../wt/x'", 'bare-worktree-remove'],
    ['cd /r && git worktree remove x', 'bare-worktree-remove'],
    ['git commit -m "docs: never a bare git worktree remove"', null],
    ['node scripts/worktree.mjs close ../wt/07.1', null],
    ['git worktree add --detach ../wt/07.1 abc123', null],
    ['git worktree prune', null],
    // an escaped quote inside a double-quoted string does not end it
    ['echo "a \\" b" && git worktree remove x "y"', 'bare-worktree-remove'],
    // allowed commands — must NOT match any rule
    ['git push origin main', null],
    ['git commit -m "feat: ship phase 8"', null],
    ['git commit -m "cloud: tick\n\nCloud-Run: https://x"', null],
    ['git reset HEAD~1', null],
    ['gh issue list -n 5', null],
    ['git log -n 5', null],
    ['pnpm verify', null],
  ]
  let failed = markerSelfTest()
  for (const [cmd, expected] of cases) {
    const hit = RULES.find((r) => r.test(cmd))?.name ?? null
    const ok = hit === expected
    if (!ok) failed++
    process.stdout.write(
      `  ${ok ? 'ok  ' : 'FAIL'}  ${JSON.stringify(cmd).slice(0, 58).padEnd(60)} → ${hit ?? 'allowed'}\n`,
    )
  }
  process.stdout.write(failed ? `\nself-test: ${failed} FAILED\n` : '\nself-test: green.\n')
  return failed ? 1 : 0
}

// The marker lands at the primary checkout whether the call runs
// there or in a worktree of it (a .git file naming a gitdir whose
// commondir leads back), and nothing is written without a session id.
function markerSelfTest() {
  let ok = false
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-marker-'))
  try {
    const primary = path.join(tmp, 'repo')
    const wt = path.join(tmp, 'wt', 'one')
    const gitdir = path.join(primary, '.git', 'worktrees', 'one')
    fs.mkdirSync(gitdir, { recursive: true })
    fs.mkdirSync(path.join(wt, 'sub'), { recursive: true })
    fs.writeFileSync(path.join(gitdir, 'commondir'), '../..\n')
    fs.writeFileSync(path.join(wt, '.git'), `gitdir: ${gitdir}\n`)
    const written = markHooked({ session_id: 'self/test', cwd: path.join(wt, 'sub') }, {})
    const want = path.join(primary, '.nexus', 'hooks', 'self_test')
    ok = written.includes(want) && fs.existsSync(want) && markHooked({ cwd: wt }, {}).length === 0
  } catch {
    ok = false
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  const label = 'marker: worktree call marks the primary checkout'
  process.stdout.write(`  ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(60)} → .nexus/hooks/<id>\n`)
  return ok ? 0 : 1
}

// --- entry ---------------------------------------------------------------

try {
  const mode = process.argv[2]
  const code =
    mode === 'pre-bash' ? preBash()
    : mode === 'stop' ? stopCheck()
    : mode === 'self-test' ? selfTest()
    : (process.stderr.write(`guard: unknown mode "${mode}"\n`), 0)
  process.exit(code)
} catch (err) {
  // Fail-open: a guard bug must not wedge the loop.
  process.stderr.write(`guard: internal error (fail-open): ${err?.message}\n`)
  process.exit(0)
}
