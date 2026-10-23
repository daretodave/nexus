// Onboarding's own calls, all served: explode and plot (server/explode.mjs),
// the cloud workflow and schedule (server/cloud.mjs). Each goes through the data layer's api(), so
// a 404 comes back as ApiError with status 404 and a step whose call is not
// served shows its designed state for "not yet" instead of pretending.
import { api } from '../../data/index.js';

export const notServed = (e) => e?.status === 404;

export const onboardingCalls = {
  /** POST /api/explode { text, team } -> { ideas: [{ id, t, q, size, auto? }], spec: { file, n }, by: 'ai' | 'split', note? } (served; writes nothing) */
  explode: (text, team) => api('/api/explode', { text, team }),
  /** POST /api/plot { spec, thoughts, chunks: [{ id, title, size, place, from }] } -> { file, chunks, session, star, owner } (served: a /plot run in a new session lands it per owner mode; 409 { error, adopt: true } on a repo nexus is not in yet) */
  plot: (body) => api('/api/plot', body),
  /** POST /api/local { ownerMode } -> { owner, ownerMode, effective, runMode, phase } (.nexus/local.json; served) */
  setLocal: (patch) => api('/api/local', patch),
  /** POST /api/cloud/workflow {} -> { path, sha, written, branch, pr?, setup?, mode? } (served: the kit's march.yml, landed per owner mode; already there writes nothing; 409 { error, fix } when the gh token lacks the workflow scope) */
  addWorkflow: () => api('/api/cloud/workflow', {}),
  /** POST /api/cloud/schedule { schedule: 'night'|'two'|'demand', cron } -> { cron, next, path, written, sha, pr? } (served: changes only the cron line, demand takes the schedule out; next is ISO UTC or null) */
  setSchedule: (schedule, cron) => api('/api/cloud/schedule', { schedule, cron }),
};

/**
 * A folder that is not a repo yet (server/repo-start.mjs). Each write needs confirm: true, which only a button
 * sets; each answers what it did plus `start`, the next GET /api/repo/start.
 */
export const repoCalls = {
  /** GET /api/repo/start[?fresh=1][&owner&name&visibility] -> { place, next, why?, platform, folder, git, gh, repo, gitignore, preview?, nameFree?, plan, guide, manual } */
  start: ({ fresh, owner, name, visibility } = {}) => {
    const q = new URLSearchParams();
    if (fresh) q.set('fresh', '1');
    if (owner) q.set('owner', owner);
    if (name) q.set('name', name);
    if (visibility) q.set('visibility', visibility);
    const s = q.toString();
    return api(`/api/repo/start${s ? `?${s}` : ''}`);
  },
  /** POST /api/repo/init { confirm, identity?: 'gh' } -> { branch, gitignore: { wrote|appended|kept, lines }, identity?, start } */
  init: (identity) => api('/api/repo/init', { confirm: true, ...(identity ? { identity } : {}) }),
  /** POST /api/repo/identity { confirm } -> { identity: { name, email, scope: 'repo' }, start } (repo-level config only) */
  identity: () => api('/api/repo/identity', { confirm: true }),
  /** POST /api/repo/commit { confirm, leaveOut } -> { head, files, start } */
  commit: (leaveOut) => api('/api/repo/commit', { confirm: true, leaveOut }),
  /** POST /api/repo/remote { confirm, owner, name, visibility } -> { web, remote, start }; 409 { exists, web, guide } when taken */
  remote: (owner, name, visibility) => api('/api/repo/remote', { confirm: true, owner, name, visibility }),
  /** POST /api/repo/push { confirm } -> { web, start }; 409 { why: 'push-auth'|'push-ssh'|'push-rejected', guide } */
  push: () => api('/api/repo/push', { confirm: true }),
};

/** POST /api/cloud/secret { value, force? } -> { name, repo, verified: true|false|null, updatedAt? }; 422 { warn: 'prefix' }. The value goes to gh on stdin; nothing keeps it. */
export const setLoopSecret = (value, force = false) => api('/api/cloud/secret', { value, ...(force ? { force: true } : {}) });
