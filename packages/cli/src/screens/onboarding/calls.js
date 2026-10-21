// Calls onboarding needs that the server does not serve yet. Each goes
// through the data layer's api(), so a 404 comes back as ApiError with
// status 404 and the step shows its designed state for "not yet" instead
// of pretending. When an endpoint lands, move its call into
// data/client.js `server` and drop it from here.
import { api } from '../../data/index.js';

export const notServed = (e) => e?.status === 404;

export const onboardingCalls = {
  /** POST /api/explode { text, team } -> { ideas: [{ id, t, q, size, auto? }], spec: { file, n } } */
  explode: (text, team) => api('/api/explode', { text, team }),
  /** POST /api/plot { spec, thoughts, chunks: [{ id, title, size, place, from }] } -> { file, chunks } */
  plot: (body) => api('/api/plot', body),
  /** POST /api/local { ownerMode } -> { owner, ownerMode, runMode, phase } (.nexus/local.json) */
  setLocal: (patch) => api('/api/local', patch),
  /** POST /api/sessions { name } -> { id, name, branch, worktree } */
  startSession: (name) => api('/api/sessions', { name }),
  /** POST /api/cloud/workflow {} -> { path, sha }: write the loop workflow and commit it */
  addWorkflow: () => api('/api/cloud/workflow', {}),
  /** POST /api/cloud/schedule { schedule, cron } -> { cron, next } */
  setSchedule: (schedule, cron) => api('/api/cloud/schedule', { schedule, cron }),
};
