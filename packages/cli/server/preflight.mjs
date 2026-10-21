// Onboarding preflight: is this machine ready to drive Claude Code here?
import { run, json } from './sh.mjs';
import { repoInfo } from './repo.mjs';

export async function preflight(repo) {
  const [ver, auth, gh, info] = await Promise.all([
    run('claude', ['--version']),
    run('claude', ['auth', 'status', '--json'], { timeout: 15000 }),
    run('gh', ['auth', 'status']),
    repoInfo(repo),
  ]);
  const a = json(auth.stdout) || {};
  const checks = [
    {
      id: 'claude',
      label: 'Claude Code installed',
      ok: ver.ok,
      detail: ver.ok ? ver.stdout.trim() : 'Not found on PATH.',
      fix: ver.ok ? null : 'Install Claude Code (https://claude.com/claude-code), then reopen this page.',
    },
    {
      id: 'login',
      label: 'Logged in',
      ok: !!a.loggedIn,
      detail: a.loggedIn ? [a.authMethod, a.subscriptionType].filter(Boolean).join(' · ') : 'Not logged in.',
      fix: a.loggedIn ? null : 'Run `claude` in a terminal, then /login.',
    },
    {
      id: 'gh',
      label: 'GitHub CLI signed in',
      ok: gh.ok,
      optional: true,
      detail: gh.ok ? firstLine(gh.stdout + gh.stderr, /Logged in to .*/) : gh.missing ? 'gh not installed.' : 'Not signed in.',
      fix: gh.ok ? null : 'Optional, for the cloud loop and PRs: install gh, then `gh auth login`.',
    },
    {
      id: 'remote',
      label: 'Git remote',
      ok: !!info.remote,
      optional: true,
      detail: info.remote || (info.isGit ? 'No origin remote.' : 'This folder is not a git repo.'),
      fix: info.remote ? null : info.isGit ? 'Add one: `git remote add origin <url>`.' : 'Run the GUI from inside your project, or `git init` first.',
    },
    {
      id: 'adopted',
      label: 'nexus adopted',
      ok: info.adopted,
      optional: true,
      detail: info.adopted ? 'agents.md, plan/ and .claude/commands present.' : 'Not yet.',
      fix: info.adopted ? null : 'Use "Adopt nexus" below, or give the prompt to your agent.',
    },
  ];
  return { checks, info, ready: checks.filter((c) => !c.optional).every((c) => c.ok) };
}

function firstLine(text, re) {
  const m = re.exec(text);
  return m ? m[0].trim() : text.trim().split(/\r?\n/)[0] || '';
}
