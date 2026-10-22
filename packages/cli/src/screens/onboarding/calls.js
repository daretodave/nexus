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
