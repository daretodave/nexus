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
      if (alive.current) setSt({ status: 'ready', data, error: null });
    } catch (e) {
      if (!alive.current) return;
      if (e.status === 404) { gone.current = true; setSt({ status: 'missing', data: null, error: null }); }
      else setSt((s) => ({ status: s.data ? 'ready' : 'error', data: s.data, error: e.message }));
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

// ---- served today ---------------------------------------------------------

/** GET /api/state: { info: { repo, name, branch, remote, lastCommit, owner, adopted }, prefs, commands, provider, permissionModes }. */
export const useAppState = () => useResource('/api/state');

/** GET /api/preflight: the Detect step's checks. */
export const usePreflight = () => useResource('/api/preflight');

/** GET /api/prompts: { paste, adopt, pitch } for "give this to another agent". */
export const usePrompts = () => useResource('/api/prompts');

/** GET /api/oversight: { live: asks, durable: [{ file, line, text }] }. */
export const useOversight = (poll) => useResource('/api/oversight', { poll });

/** GET /api/claims: { available, rows, error? }. */
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
  { endpoint: 'POST /api/sessions/:id/resume (a fallen one)', hook: 'Fleet resume', for: 'Resume / relight a fallen session from its tile (a session this server runs already pauses, resumes and closes)' },
  { endpoint: 'POST /api/train', hook: 'trainAction', for: 'Pause all, the reboot train, and Resume all' },
  { endpoint: 'GET /api/inbox', hook: 'useInbox', for: 'Oversight inbox: open and parked questions across every session and the cloud loop, tagged by session' },
  { endpoint: 'POST /api/claims/(claim|hold|unhold|reassign|request)', hook: 'claimAction', for: 'row actions on chunks and specs (only release exists today)' },
  { endpoint: 'GET /api/summaries', hook: 'useSummaries', for: 'AI one-line chunk summaries cached in .nexus/cache/' },
  { endpoint: 'GET /api/git', hook: 'useGitRepo', for: 'Git panel: worktrees (idle/orphaned), recent main commits, open PRs with CI, the primary checkout, a /tidy dry run' },
  { endpoint: 'GET /api/cloud', hook: 'useCloudLoop', for: 'Cloud loop: schedule, next tick, paused state, runs as a timeline (today: /api/actions + /api/runs)' },
  { endpoint: 'GET /api/recover?dir=', hook: 'useRecover', for: 'Recover: a workflow folder read as a timeline (journal.jsonl), and recent runs' },
  { endpoint: 'POST /api/recover/resume', hook: 'recoverAction', for: 'resume a workflow from a chosen step (resumeFromRunId + scriptPath)' },
  { endpoint: 'GET|POST /api/local', hook: 'useLocalSettings', for: 'effective owner mode (.owner and .nexus/local.json ownerMode), run mode, phase length' },
  { endpoint: 'POST /api/pin', hook: 'pinNote', for: 'a pinned note every agent reads on its next step ({ session, text })' },
  { endpoint: 'POST /api/sessions/:id/questions', hook: 'cockpit', for: 'answer a start question ({ index, answer, how }) or take every default ({ defaults: true })' },
  { endpoint: 'POST /api/sessions/:id/start', hook: 'cockpit', for: 'leave the start questions and begin working' },
  { endpoint: 'POST /api/sessions/:id/package', hook: 'cockpit', for: 'open the package PR ({ action: "open" }) or save its description' },
  { endpoint: 'POST /api/inbox/:id', hook: 'Inbox', for: 'settle an inbox item from any session or the cloud loop ({ answer, how })' },
  { endpoint: 'POST /api/plan/chunk', hook: 'Board', for: 'Chunk it: { spec } returns questions, { spec, answers } writes the chunks' },
  { endpoint: 'POST /api/git/fetch', hook: 'GitPanel', for: 'git fetch --prune for the panel' },
  { endpoint: 'GET|POST /api/git/tidy', hook: 'GitPanel', for: 'the /tidy dry run (GET) and the tidy itself (POST)' },
  { endpoint: 'POST /api/explode', hook: 'Onboarding Plot', for: 'split messy text into idea cards ({ text, team } -> { ideas, spec })' },
  { endpoint: 'POST /api/plot', hook: 'Onboarding Plot', for: 'write the kept ideas into the plan as chunks' },
  { endpoint: 'POST /api/cloud/(workflow|schedule)', hook: 'CloudSetup', for: 'add the loop workflow, save the schedule (POST /api/cloud/run, one pass now, is served)' },
  { endpoint: 'POST /api/pick-folder', hook: 'Recover', for: 'optional: an OS folder picker, since a browser cannot hand back an absolute path' },
];

/** GET /api/sessions (served): the live local sessions -> [{ id, claude, name, kind: 'local'|'terminal', state, chunk, git, parked, beat, linked, steer: 'sdk'|'hook', hosted? }]. POST /api/sessions starts one (server.startSession); POST /api/sessions/:id/(link|steer|parked|pause|resume|close) act on one. Full shape: screens/fleet/model.js. */
export const useSessions = (poll = 4000) => useResource('/api/sessions', { poll });

/** GET /api/sessions/:id -> the session ledger. Shape: screens/cockpit/model.js (cockpit), screens/headsdown-inbox/headsModel.js (heads-down). */
export const useSession = (id) => useResource(id ? `/api/sessions/${encodeURIComponent(id)}` : null, { skip: !id });

/** GET /api/inbox -> [{ id, session, kind: 'now'|'parked'|'cloud', question, options, default, chunk, at, settled }]. Shape: screens/headsdown-inbox/inboxModel.js. */
export const useInbox = (poll = 5000) => useResource('/api/inbox', { poll });

/** GET /api/plan (served): order.mjs --json and progress.mjs --json joined -> { available, specs: [{ id, title, file, unchunked, percent, counts, chunks }], order, next, asap, held, unchunked, mark }. Shape: server/plan.mjs. */
export const usePlan = () => useResource('/api/plan');

/** GET /api/summaries -> { [chunkId]: { text, ai: true } }. */
export const useSummaries = () => useResource('/api/summaries');

/** GET /api/git -> { worktrees, main, prs, primary }. */
export const useGitRepo = () => useResource('/api/git');

/** GET /api/cloud -> { live, paused, schedule, next, runs }. */
export const useCloudLoop = () => useResource('/api/cloud');

/** GET /api/recover?dir= -> { run, agents, recent }. */
export const useRecover = (dir) => useResource(`/api/recover${dir ? `?dir=${encodeURIComponent(dir)}` : ''}`);

/** GET /api/local -> { owner, ownerMode, runMode, phase }. */
export const useLocalSettings = () => useResource('/api/local');
