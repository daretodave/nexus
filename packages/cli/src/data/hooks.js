// Typed hooks over the server. Each returns a Resource:
//
//   { status: 'loading' | 'ready' | 'missing' | 'error', data, error, endpoint, reload }
//
// 'missing' means the server does not provide this yet (it answered 404):
// screens render their designed empty state for it, never invented data.
// A hook for a missing endpoint still asks the server, so the screen lights
// up on its own the day the endpoint lands. MISSING lists them.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './client.js';

/**
 * @typedef {object} Resource
 * @property {'loading'|'ready'|'missing'|'error'} status
 * @property {any} data
 * @property {string} [error]
 * @property {string} endpoint
 * @property {() => void} reload
 */

/** Fetch `path` once (and on reload, or every `poll` ms). @returns {Resource} */
export function useResource(path, { poll, skip } = {}) {
  const [st, setSt] = useState({ status: skip ? 'missing' : 'loading', data: null, error: null });
  const alive = useRef(true);
  const gone = useRef(false);
  const load = useCallback(async () => {
    if (skip || !path) return;
    try {
      const data = await api(path);
      if (alive.current) setSt({ status: 'ready', data, error: null, path });
    } catch (e) {
      if (!alive.current) return;
      if (e.status === 404) { gone.current = true; setSt({ status: 'missing', data: null, error: null }); }
      // A failed poll keeps the last good data, but only this path's: a new path (Recover's ?dir=) that fails
      // reads as an error, not as the previous path's data.
      else setSt((s) => (s.data && s.path === path ? { ...s, error: e.message } : { status: 'error', data: null, error: e.message, path }));
    }
  }, [path, skip]);
  useEffect(() => {
    alive.current = true;
    gone.current = false;
    load();
    // A missing endpoint is asked once per mount, not on every poll.
    const t = poll ? setInterval(() => { if (!gone.current) load(); }, poll) : null;
    return () => { alive.current = false; if (t) clearInterval(t); };
  }, [load, poll]);
  return { ...st, endpoint: `GET ${path}`, reload: load };
}

/** Reload resources when `key` changes after the first render (a live channel moved), not on mount. */
export function useReloadOn(key, ...resources) {
  const seen = useRef(key);
  const reloads = resources.map((r) => r.reload);
  useEffect(() => {
    if (seen.current === key) return;
    seen.current = key;
    for (const reload of reloads) reload();
  }, [key, ...reloads]);
}

/** The key that moves when a live store's chunks change stage (claim, build, gate, archive). */
export const chunkStagesOf = (live) => Object.values(live?.stage?.chunks || {}).map((c) => `${c.id}:${c.stage}`).join(' ');

// ---- served today ---------------------------------------------------------

/** GET /api/state: { info: { repo, name, branch, remote, lastCommit, owner, adopted }, prefs, commands, provider, permissionModes }. */
export const useAppState = () => useResource('/api/state');

/** GET /api/preflight: the Detect step's checks. */
export const usePreflight = () => useResource('/api/preflight');

/** GET /api/prompts: { paste, adopt, pitch } for "give this to another agent". */
export const usePrompts = () => useResource('/api/prompts');

/** GET /api/oversight: { live: asks, durable: [{ file, line, text }] }. */
export const useOversight = (poll) => useResource('/api/oversight', { poll });

/** GET /api/claims: { available, rows, me?, error? } (claims.mjs list and whoami --json, as the home session). Writes: server.claimAction. */
export const useClaims = (poll) => useResource('/api/claims', { poll });

/** GET /api/progress?spec: { available, text } (ASCII progress). */
export const useProgress = (spec) => useResource(`/api/progress${spec ? `?spec=${encodeURIComponent(spec)}` : ''}`);

/** GET /api/actions: the cloud loop's workflows, secret and repo state. */
export const useActions = () => useResource('/api/actions');

/** GET /api/runs: recent Actions runs. */
export const useRuns = (poll) => useResource('/api/runs', { poll });

// ---- not served yet: designed empty states until they land -------------------

/**
 * Endpoints the design needs and the server does not provide yet. Each hook
 * below asks for its endpoint and reports status 'missing' on a 404.
 */
export const MISSING = [
  { endpoint: 'POST /api/train', hook: 'trainAction', for: 'Pause all, the reboot train, and Resume all' },
  { endpoint: 'GET /api/cloud (in part)', hook: 'useCloudLoop', for: 'Cloud loop: schedule, next tick, runs as a timeline (served: the loop workflow, paused, running, the PRs opened tonight; runs today: /api/actions + /api/runs)' },
  { endpoint: 'POST /api/pin', hook: 'pinNote', for: 'a pinned note every agent reads on its next step ({ session, text })' },
  { endpoint: 'POST /api/sessions/:id/questions', hook: 'cockpit', for: 'answer a start question ({ index, answer, how }) or take every default ({ defaults: true })' },
  { endpoint: 'POST /api/sessions/:id/start', hook: 'cockpit', for: 'leave the start questions and begin working' },
  { endpoint: 'POST /api/sessions/:id/package', hook: 'cockpit', for: 'open the package PR ({ action: "open" }) or save its description' },
  { endpoint: 'POST /api/plan/chunk', hook: 'Board', for: 'Chunk it: { spec } returns questions, { spec, answers } writes the chunks' },
  { endpoint: 'POST /api/git/tidy', hook: 'GitPanel', for: 'the tidy itself (GET /api/git/tidy, the dry run, is served; /tidy closes worktrees in a terminal)' },
  { endpoint: 'POST /api/explode', hook: 'Onboarding Plot', for: 'split messy text into idea cards ({ text, team } -> { ideas, spec })' },
  { endpoint: 'POST /api/plot', hook: 'Onboarding Plot', for: 'write the kept ideas into the plan as chunks' },
  { endpoint: 'POST /api/cloud/(workflow|schedule)', hook: 'CloudSetup', for: 'add the loop workflow, save the schedule (POST /api/cloud/run, one pass now, is served)' },
  { endpoint: 'GET /api/secrets', hook: 'useSecrets', for: "the vault's names (Settings' Secrets section, the Vault rail item's view): secrets.mjs status --json, 42.7's" },
  { endpoint: 'POST /api/pick-folder', hook: 'Recover', for: 'optional: an OS folder picker, since a browser cannot hand back an absolute path' },
];

/** GET /api/sessions (served): the live local sessions -> [{ id, claude, name, kind: 'local'|'terminal', state, chunk, git, parked, beat, linked, steer: 'sdk'|'hook', hosted? }]. POST /api/sessions starts one (server.startSession); POST /api/sessions/:id/(link|steer|parked|pause|resume|close) act on one. Full shape: screens/fleet/model.js. */
export const useSessions = (poll = 4000) => useResource('/api/sessions', { poll });

/** GET /api/sessions/:id -> the session ledger. Shape: screens/cockpit/model.js (cockpit), screens/headsdown-inbox/headsModel.js (heads-down). */
export const useSession = (id) => useResource(id ? `/api/sessions/${encodeURIComponent(id)}` : null, { skip: !id });

/** GET /api/inbox (served): every session's questions, tagged by star -> [{ id, src: 'ask'|'perm'|'inbox'|'durable', session: { id, name, kind }, kind: 'now'|'parked'|'cloud', question, options, default, chunk, at }]; POST /api/inbox/:id { answer, how } settles a parked one (or a permission). Shapes: server/fleet-home.mjs, screens/headsdown-inbox/inboxModel.js. */
export const useInbox = (poll = 5000) => useResource('/api/inbox', { poll });

/** GET /api/plan (served): order.mjs --json and progress.mjs --json joined -> { available, specs: [{ id, title, file, unchunked, percent, counts, chunks }], order, next, asap, held, unchunked, mark }. Shape: server/plan.mjs. */
export const usePlan = () => useResource('/api/plan');

/** GET /api/summaries (served) -> { [chunkId]: { text, ai: true } }: Haiku one-liners for undescribed chunks, cached in .nexus/cache/, {} when Settings turns them off. Shape: server/summaries.mjs. */
export const useSummaries = () => useResource('/api/summaries');

/** GET /api/git (served) -> { repo, root, worktrees, main, prs, gh }: every worktree from worktree.mjs list --json with its session and flag, the primary checkout, main's recent commits, open PRs with CI. GET /api/git/tidy is the /tidy dry run; POST /api/git/fetch prunes remote refs. Shape: server/git.mjs. Each session's own git rides on GET /api/sessions. */
export const useGitRepo = () => useResource('/api/git');

/** GET /api/cloud (served in part: server/gh.mjs cloudLoop) -> { live, workflow, paused, running, tonight: { since, prs } }; still missing: schedule, next, runs. 404 when the repo has no loop workflow. */
export const useCloudLoop = () => useResource('/api/cloud');

/** GET /api/recover?dir= (served) -> { run, agents, resume, recent }: a Workflow run folder read as a timeline (journal.jsonl), and this repo's recent runs. POST /api/recover/resume { dir } resumes it in a hosted session. Shape: server/recover.mjs. */
export const useRecover = (dir) => useResource(`/api/recover${dir ? `?dir=${encodeURIComponent(dir)}` : ''}`);

/** GET /api/local (served) -> { owner, ownerMode, effective, runMode, phase }: .nexus/local.json at the primary checkout (POST /api/local writes it; server/local.mjs). */
export const useLocalSettings = () => useResource('/api/local');

/**
 * GET /api/secrets (not served yet: 42.7) -> the shape of `node scripts/secrets.mjs status --json`:
 * { mode: 'owner'|'contributor', projectSecretsNeeded, secrets: [{ name, rings, declared, destinations }],
 * localKeys: [{ name, rings }] }. Names only: a value never reaches the page.
 */
export const useSecrets = () => useResource('/api/secrets');
