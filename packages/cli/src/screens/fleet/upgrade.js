// The Upgrade banner's words (fleet/UpgradeBanner.jsx; spec 58, A9), kept out of the component so they test without
// a browser. bannerFor reads GET /api/state's info.shape (server/repo.mjs kitShape); reportView turns the dry run's
// { code, report } (server/upgrade.mjs, through POST /api/upgrade/dry) into the lines the banner shows.

/** The banner for a repo's shape, or null when it has none to show (v2, none, unknown). */
export function bannerFor(info) {
  const shape = info?.shape;
  if (shape === 'v1') {
    return {
      shape,
      title: 'This repo is on nexus v1',
      action: 'Upgrade',
      sub: 'Phases become specs and chunks, and the loop\'s own steps move to its lanes files. The dry run fetches origin into a scratch worktree and writes nothing.',
    };
  }
  if (shape === 'half') {
    return {
      shape,
      title: 'This repo is part way to nexus v2',
      action: 'Finish the upgrade',
      sub: 'The lock says chunks, but v1 files are still here. The dry run shows what retiring them does, and writes nothing.',
    };
  }
  return null;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * What the banner shows for a finished dry run: { tone, headline, chips, warnings, dispatch, loop, worktree, text }.
 * tone: 'ok' (green gate), 'red' (the gate failed; the worktree is kept), 'stop' (not upgradable, or no report),
 * 'v2' (already on v2). chips: [{ k, v, tone? }].
 */
export function reportView(last) {
  if (!last) return null;
  const r = last.report || {};
  const text = String(last.text || '');
  if (r.message) return { tone: 'v2', headline: `Already on v2: ${r.why || 'nothing to upgrade'}`, chips: [], warnings: [], dispatch: null, loop: null, worktree: null, text };
  if (last.code === 2 || (r.error && !r.files)) return { tone: 'stop', headline: r.error || 'The dry run stopped without a report', chips: [], warnings: [], dispatch: null, loop: null, worktree: null, text };
  const red = last.code === 1;
  const files = Array.isArray(r.files) ? r.files : [];
  const warnings = Array.isArray(r.warnings) ? r.warnings : [];
  const gate = Array.isArray(r.gate) ? r.gate : [];
  const chips = [{ k: 'files', v: String(files.length) }];
  if (r.shape === 'v1') chips.push({ k: 'archive', v: `+${(r.archive || []).length}` });
  chips.push({ k: 'warnings', v: String(warnings.length), tone: warnings.length ? 'warn' : undefined });
  chips.push({ k: 'gate', v: red ? 'red' : gate.length ? 'green' : 'not run', tone: red ? 'bad' : gate.length ? 'ok' : undefined });
  const d = r.dispatch;
  let dispatch = null;
  if (d) {
    if (d.pr) dispatch = { text: d.pr.idle ? 'idle until NEXUS_LOOP_MODE=owner is set: the v1 loop was live' : `until NEXUS_LOOP_MODE=owner (pr mode): ${d.pr.text}`, also: `owner mode: ${d.text}`, bad: !!d.pr.idle };
    else dispatch = { text: d.text, bad: !!(d.idle && d.live) };
  }
  const l = r.loop;
  const loop = l ? (l.mode === 'owner'
    ? { text: `owner: the v1 loop pushed ${l.branch} (${plural(l.pushes, 'Cloud-Run commit')})`, command: 'gh variable set NEXUS_LOOP_MODE --body owner' }
    : { text: `pr: no Cloud-Run commit on ${l.branch}; each chunk lands as a pull request`, command: null }) : null;
  const shape = r.shape === 'half' ? 'half-done: finishing the retirement of v1 files only' : 'v1 (phases) to v2 (specs + chunks)';
  const headline = red
    ? `The gate went red in the scratch worktree (${shape}). Nothing was written; the worktree is kept.`
    : `Ready: ${shape}. ${plural(files.length, 'file')} would change. Nothing was written.`;
  return { tone: red ? 'red' : 'ok', headline, chips, warnings, dispatch, loop, worktree: r.worktree || null, text };
}

/** "2m ago" style age of a result, from its `at` and now. */
export function ranAgo(at, now = Date.now()) {
  if (!at) return '';
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}
