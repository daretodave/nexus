// The onboarding draft: what the person answered across the eight steps,
// kept for this tab (sessionStorage) so a reload or a Back keeps it.
// Durable choices are written to the server as they are made (owner mode,
// run mode) or at Launch (onboarded); the rest only shapes the first work.
import { createContext, useCallback, useContext, useState } from 'react';

const KEY = 'nexus-onboarding';

/** runMode: 'size' | 'sub' | 'wf' | 'both' (Shape, question 4). */
export const DEFAULT_DRAFT = {
  building: '', // Shape 1: seeds the first spec and Plot's thoughts
  team: 'team', // Shape 2: 'solo' | 'team' | 'oss'
  runMode: null, // null until picked: Shape reads the server's prefs then
  ownerMode: true, // Shape 3: the owner-mode switch (effective owner mode)
  thoughts: null, // Plot: null until seeded from `building`
  ideas: null, // Plot: [{ id, t, q, size, auto, st, into, mt }] from the explode call
  spec: null, // Plot: { file, n } the explode call proposes
  place: {}, // Plot: idea id -> 'asap' | 'anytime' | 'auto'
  messy: false, // Plot: the thoughts went to /messy instead
  plotted: false, // Plot: the planned chunks went to /plot (POST /api/plot)
  plotSession: null, // Plot: { id, name } the session /plot runs in
  vault: 'imp', // Secrets: 'imp' | 'empty' | 'skip' (an owner's start; a contributor has nothing to pick)
  sched: null, // Cloud: null (not picked: the step selects the workflow's own schedule, else 'night') | 'current' | 'night' | 'two' | 'demand'
  schedLabel: null, // Cloud: the kept schedule in words, when 'current' was turned on
  cloud: null, // Cloud: null (not decided) | 'on' | 'skipped'
  cloudSaved: null, // Cloud: the schedule call answered (true) or did not (false)
};

function read() {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    return v && typeof v === 'object' ? { ...DEFAULT_DRAFT, ...v } : DEFAULT_DRAFT;
  } catch { return DEFAULT_DRAFT; }
}

function write(d) {
  try { sessionStorage.setItem(KEY, JSON.stringify(d)); } catch { /* the draft lasts for this page only */ }
}

export const DraftContext = createContext([DEFAULT_DRAFT, () => {}]);

/** [draft, patch]: patch takes an object or a function of the draft. */
export function useDraftStore() {
  const [d, setD] = useState(read);
  const patch = useCallback((p) => {
    setD((cur) => {
      const next = { ...cur, ...(typeof p === 'function' ? p(cur) : p) };
      write(next);
      return next;
    });
  }, []);
  return [d, patch];
}

export const useDraft = () => useContext(DraftContext);

/** The run mode as /api/local holds it (.nexus/local.json runMode), read and saved through ui/run-mode.js. */
export { localRunMode, saveRunMode } from '../../ui/run-mode.js';

export const RUN_MODE_LABEL = {
  size: 'By size',
  sub: 'Sub-agents on every chunk',
  wf: 'Workflows on every chunk',
  both: 'Sub-agents and workflows on every chunk',
};

export const SCHED_SUMMARY = {
  night: 'Overnight, 01:30 to 06:30',
  two: 'Every 2 hours, on the hour',
  demand: 'Only on demand',
};
