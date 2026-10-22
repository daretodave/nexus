// Onboarding's own calls. Explode and plot are served (server/explode.mjs);
// the cloud calls are not yet. Each goes through the data layer's api(), so
// a 404 comes back as ApiError with status 404 and a step whose call is not
// served shows its designed state for "not yet" instead of pretending.
import { api } from '../../data/index.js';

export const notServed = (e) => e?.status === 404;

export const onboardingCalls = {
  /** POST /api/explode { text, team } -> { ideas: [{ id, t, q, size, auto? }], spec: { file, n }, by: 'ai' | 'split', note? } (served; writes nothing) */
  explode: (text, team) => api('/api/explode', { text, team }),
  /** POST /api/plot { spec, thoughts, chunks: [{ id, title, size, place, from }] } -> { file, chunks, session, star, owner } (served: a /plot run in a new session lands it per owner mode) */
  plot: (body) => api('/api/plot', body),
  /** POST /api/local { ownerMode } -> { owner, ownerMode, effective, runMode, phase } (.nexus/local.json; served) */
  setLocal: (patch) => api('/api/local', patch),
  /** POST /api/cloud/workflow {} -> { path, sha }: write the loop workflow and commit it */
  addWorkflow: () => api('/api/cloud/workflow', {}),
  /** POST /api/cloud/schedule { schedule, cron } -> { cron, next } */
  setSchedule: (schedule, cron) => api('/api/cloud/schedule', { schedule, cron }),
};
