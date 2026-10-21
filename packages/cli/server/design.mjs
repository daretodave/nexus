// GET /api/design: the design handoffs and each board's port status (spec 43, A7), read only through the repo's own
// `scripts/design/port-map.mjs` (43.5): `check --json` names every handoff it finds (design/handoff/,
// packages/*/design/handoff/), then `status <handoff> --json` gives each board as ported (its files), skipped (its
// reason), pending (its chunk) or unmapped. Nothing here decides a board's status. The page names come from the
// handoff's own manifest.json (or, for a folder from before ingest, its canvas.json): data, not rules.
//
// The answer, as src/screens/design/model.js reads it:
//   { available, script, note, handoffs: [{ id, ok, problems, pages: [{ id, name }], boards: [status row] }] }
// A repo without the script answers available: false and a note, so the screen shows its empty state.
//
// POST /api/design/handoff's link check is shared/design-link.mjs; the send itself is server.mjs's (a hosted session).
import fs from 'node:fs';
import path from 'node:path';
import { run, SAFE_ARG } from './sh.mjs';
import { findScript } from './repo.mjs';

export const PORT_MAP_SCRIPTS = ['scripts/design/port-map.mjs'];

function parse(stdout) {
  try { return JSON.parse(stdout); } catch { return null; }
}

/** A handoff's pages, in canvas order: { id, name }. */
export function pagesOf(dir) {
  for (const f of ['manifest.json', 'canvas.json']) {
    const abs = path.join(dir, f);
    if (!fs.existsSync(abs)) continue;
    try {
      const pages = JSON.parse(fs.readFileSync(abs, 'utf8')).pages;
      if (Array.isArray(pages)) return pages.filter((p) => p && p.id != null).map((p) => ({ id: String(p.id), name: String(p.name ?? p.id) }));
    } catch { /* the port map's check names a broken file */ }
  }
  return [];
}

/** Every handoff with its boards' port status, or { available: false, note }. */
export async function readDesign(repo, { runNode = (args) => run('node', args, { cwd: repo, timeout: 30000 }) } = {}) {
  const script = findScript(repo, PORT_MAP_SCRIPTS);
  if (!script) {
    return { available: false, script: null, handoffs: [], note: `This repo has no ${PORT_MAP_SCRIPTS[0]} (the design port map, from nexus templates/scripts/design/): the gallery needs it to read each board's port status.` };
  }
  const all = await runNode([script, 'check', '--json']);
  const found = parse(all.stdout);
  if (!found || !Array.isArray(found.handoffs)) {
    return { available: false, script, handoffs: [], note: `${script} check --json gave no answer: ${(all.stderr || all.stdout || '').trim().slice(0, 400) || 'nothing printed'}` };
  }
  const handoffs = [];
  for (const id of found.handoffs) {
    if (typeof id !== 'string' || !SAFE_ARG.test(id)) {
      handoffs.push({ id: String(id), ok: false, problems: ['a handoff folder whose name this server will not pass to a script'], pages: [], boards: [] });
      continue;
    }
    const r = await runNode([script, 'status', id, '--json']);
    const st = parse(r.stdout);
    handoffs.push(st && Array.isArray(st.boards)
      ? { id, ok: !!st.ok, problems: Array.isArray(st.problems) ? st.problems : [], pages: pagesOf(path.join(repo, id)), boards: st.boards }
      : { id, ok: false, problems: [`${script} status gave no answer: ${(r.stderr || '').trim().slice(0, 400)}`], pages: pagesOf(path.join(repo, id)), boards: [] });
  }
  return { available: true, script, handoffs, note: found.note || '' };
}
