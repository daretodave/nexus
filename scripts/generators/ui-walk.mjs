// scripts/generators/ui-walk.mjs: what the GUI walk found becomes /iterate dimension H rows (nexus only, spec 57.9).
//
// A generator under the refill lane's contract (scripts/plan/refill.mjs, concepts/generators.md) that wraps spec 56's
// walk (packages/cli/scripts/walk.mjs). It reads the walk's walk.json: --walk <file>, else the newest
// .scratch/walk/<iso>/walk.json under 24 hours old (reused, as /iterate reuses one), else it runs the walk over the
// `UI audit: demo <scenarios>` line of plan/bearings.md. Each kind of finding on a screen (a page error, a 5xx, a 4xx,
// a console error, horizontal overflow, an unnamed control, an image without alt) becomes at most one H row in the
// shape skills/iterate.md §3a and scripts/plan/ui-rows.mjs hold:
//
//   ### [H, <score>] <route> @ <viewport> (<scenario>) — <kind>: "<the finding>"
//   - category: ui · evidence (the finding, the PNG, the walk.json path) · next (a file:line under packages/cli/)
//   - gate: npm test
//
// The same finding on many screens is one row (the first screen; the evidence counts the rest). Dedup is against the
// Pending H rows: one for the same route, viewport and kind, or quoting the same finding, means it is filed. Never
// more than 3 H rows Pending (ui-rows' MAX_PENDING): --limit shrinks to the room left. Page text from the walk is data:
// one quoted line, at most 120 characters. Every row's next passes the magic guard (ui-rows' cutsMagic): the fix
// makes the GUI's particles, colour and motion cheaper, never less.
//
// It runs the walk only with a built UI (packages/cli/dist), playwright-core installed, and outside CI unless
// NEXUS_CLI_GATE=1 (march.yml's rule 10); otherwise, or with no Chrome (the walk's exit 2 saying `could not start
// Chrome`), it says why and is `clean`. A walk that stops on anything else (exit 1: the demo failed; exit 2 for a bad
// flag, such as an unknown scenario on the UI audit line) is a broken generator. The walk gets 240 s (WALK_TIMEOUT),
// under refill's 300 s per generator, so a slow walk is killed and reported here as broken, never orphaned by refill.
//
//   node scripts/generators/ui-walk.mjs [--write] [--limit <n>] [--today YYYY-MM-DD] [--walk <walk.json>]
//
// Without --write it writes nothing (a walk it runs still writes its own .scratch/walk/, which is gitignored).
// Last line `filed N` or `clean`, exit 0; exit 1 when the walk breaks or walk.json is unreadable.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { appendRows, queueText, stampLine, today } from '../plan/refill.mjs';
import { MAX_PENDING, cutsMagic, parseRows } from '../plan/ui-rows.mjs';
import { quote } from './issue-age.mjs';

export const NAME = 'ui-walk';
export const DEFAULT_SCENARIOS = Object.freeze(['fleet-to-tug', 'stack', 'grill-me']);
const DAY = 86400000;

/** The scenarios of the `UI audit: demo a,b,c` line in plan/bearings.md, else the walk's defaults. */
export function scenarios(bearings = '') {
  const m = /UI audit:[*`\s]*demo\s+([\w-]+(?:,[\w-]+)*)/.exec(bearings);
  return m ? m[1].split(',') : [...DEFAULT_SCENARIOS];
}

const short = (text, n) => {
  const t = String(text ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[`"]/g, "'").replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 3)}...` : t;
};

/**
 * One screen's findings, most severe first: [{ kind, line, impact, ease }]. At most one per kind: the first line of
 * that kind (the evidence counts the others).
 */
export function screenFindings(s) {
  const out = [];
  const add = (kind, list, impact, ease) => {
    if (list.length) out.push({ kind, line: String(list[0]), more: list.length - 1, impact, ease });
  };
  const failed = s.failed ?? [];
  add('page error', s.pageErrors ?? [], 8, 8);
  add('server error', failed.filter((l) => /\b5\d\d\b/.test(l)), 8, 8);
  add('request failed', failed.filter((l) => !/\b5\d\d\b/.test(l)), 7, 8);
  add('console error', s.console ?? [], 7, 8);
  if (s.overflowPx > 0) out.push({ kind: 'overflow', line: `the page scrolls sideways by ${s.overflowPx}px`, more: 0, impact: 6, ease: 8 });
  add('unnamed control', s.unnamed ?? [], 5, 9);
  add('image without alt', s.noAlt ?? [], 4, 9);
  return out;
}

const score = (f) => Math.round(f.impact * f.ease) / 10;

/** Every finding of a walk, one per distinct (kind, line), highest score first, walk order on ties. */
export function findings(walkJson) {
  const seen = new Map();
  let order = 0;
  for (const s of walkJson.screens ?? []) {
    if (!/^\/\S*$/.test(s.route ?? '') || !/^\w+$/.test(s.viewport ?? '') || !/^[\w-]+$/.test(s.scenario ?? '')) continue;
    for (const f of screenFindings(s)) {
      const key = `${f.kind}\n${f.line}`;
      const had = seen.get(key);
      if (had) had.screens += 1;
      else seen.set(key, { ...f, score: score(f), route: s.route, viewport: s.viewport, scenario: s.scenario, png: s.png ?? '', screens: 1, order: order++ });
    }
  }
  return [...seen.values()].sort((a, b) => b.score - a.score || a.order - b.order);
}

/** Where a route is drawn: the screen's file under packages/cli/src, else the route's line in App.jsx. */
export function nextFor(root, route) {
  const rel = 'packages/cli/src/App.jsx';
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return `${rel}:1`;
  const lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const pathname = route.split('?')[0];
  for (let i = 0; i < lines.length; i++) {
    const m = /<Route\s+path="([^"]+)"\s+element=\{<(\w+)/.exec(lines[i]);
    if (!m || m[1] === '*') continue;
    const re = new RegExp(`^${m[1].replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:\w+/g, '[^/]+')}$`);
    if (!re.test(pathname)) continue;
    const imp = new RegExp(`^\\s*${m[2]}:\\s*\\(\\)\\s*=>\\s*import\\('\\./([\\w/.-]+\\.jsx?)'\\)`);
    const screen = lines.map((l) => imp.exec(l)).find(Boolean);
    const screenRel = screen ? `packages/cli/src/${screen[1]}` : null;
    if (screenRel && fs.existsSync(path.join(root, screenRel))) return `${screenRel}:1 (routed at ${rel}:${i + 1})`;
    return `${rel}:${i + 1}`;
  }
  const at = lines.findIndex((l) => /<Routes\b/.test(l));
  return `${rel}:${at + 1 || 1}`;
}

/** The Pending H rows of the queue, and whether one already covers finding `f`. */
export function covered(f, pendingH) {
  const q = short(f.line, 60);
  return pendingH.some((r) => (r.title.startsWith(`${f.route} @ ${f.viewport} (`) && r.title.includes(`— ${f.kind}:`))
    || (q && r.title.includes(q)) || (r.fields.evidence ?? '').includes(quote(f.line)));
}

/** One H row for a finding. `artifact` is the walk.json path the evidence cites. */
export function row(f, { root, artifact, date }) {
  const others = f.screens > 1 ? `, and on ${f.screens - 1} more screen${f.screens === 2 ? '' : 's'}` : '';
  const more = f.more > 0 ? ` (+${f.more} more of this kind on the screen)` : '';
  return [
    `### [H, ${f.score}] ${f.route} @ ${f.viewport} (${f.scenario}) — ${f.kind}: "${short(f.line, 60)}"`,
    '- category: ui',
    `- impact: ${f.impact}`,
    `- ease: ${f.ease}`,
    `- evidence: ${f.kind} ${quote(f.line)}${more}${others}; ${f.png || 'no png'}; ${artifact}`,
    `- next: ${nextFor(root, f.route)}: find the cause of the ${f.kind} there and fix it; any fx cost is made cheaper, never less visible.`,
    '- gate: npm test',
    stampLine(NAME, date),
  ];
}

const readSafe = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : '');
const slash = (p) => p.split(path.sep).join('/');

/** The newest .scratch/walk/<iso>/walk.json whose walk started under 24 hours before `now`, or null. */
export function recentWalk(root, now = Date.now()) {
  const dir = path.join(root, '.scratch', 'walk');
  if (!fs.existsSync(dir)) return null;
  const found = fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'walk.json')))
    .map((e) => {
      const file = path.join(dir, e.name, 'walk.json');
      let started = NaN;
      try { started = Date.parse(JSON.parse(fs.readFileSync(file, 'utf8')).started); } catch { /* unreadable: not reused */ }
      return { file, started };
    })
    .filter((w) => Number.isFinite(w.started) && now - w.started >= 0 && now - w.started < DAY)
    .sort((a, b) => b.started - a.started);
  return found[0]?.file ?? null;
}

/** Why the walk cannot run here, or null when it can. */
export function cannotWalk(root, env = process.env) {
  const cli = path.join(root, 'packages', 'cli');
  if (!fs.existsSync(path.join(cli, 'dist', 'index.html'))) return 'no built UI (npm --prefix packages/cli run build)';
  if (!fs.existsSync(path.join(cli, 'node_modules', 'playwright-core'))) return 'no packages/cli/node_modules (npm --prefix packages/cli ci)';
  if ((env.CI || env.GITHUB_ACTIONS) && env.NEXUS_CLI_GATE !== '1') return 'a cloud tick without NEXUS_CLI_GATE=1';
  return null;
}

/** The walk's budget: under refill's 300 s per generator (spawnGenerator), so ui-walk reports a timeout itself. */
export const WALK_TIMEOUT = 240000;

/** Run the walk into .scratch/walk/<stamp>: { code, file, err }. A timeout is a broken run (exit 1). */
export function spawnWalk(root, list) {
  const out = path.join(root, '.scratch', 'walk', new Date().toISOString().replace(/[:.]/g, '-'));
  const r = spawnSync(process.execPath, [path.join(root, 'packages', 'cli', 'scripts', 'walk.mjs'), '--scenarios', list.join(','), '--out', out], { cwd: root, encoding: 'utf8', timeout: WALK_TIMEOUT, killSignal: 'SIGKILL', shell: false });
  if (r.error?.code === 'ETIMEDOUT' || r.signal) return { code: 1, file: path.join(out, 'walk.json'), err: `the walk ran past ${WALK_TIMEOUT / 1000} s and was killed${r.signal ? ` (${r.signal})` : ''}` };
  return { code: typeof r.status === 'number' ? r.status : 1, file: path.join(out, 'walk.json'), err: r.stderr || (r.error ? String(r.error.message) : '') };
}

export const USAGE = 'usage: ui-walk.mjs [--write] [--limit <n>] [--today YYYY-MM-DD] [--walk <walk.json>]';

export function main(argv, { root = process.cwd(), log = console.log, runWalk = spawnWalk, env = process.env, now = Date.now() } = {}) {
  const at = (flag) => {
    const i = argv.indexOf(flag);
    return i < 0 ? undefined : argv[i + 1];
  };
  const date = at('--today') ?? today();
  const limitText = at('--limit');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (limitText !== undefined && !/^\d+$/.test(limitText))) {
    console.error(USAGE);
    return 64;
  }
  const limit = limitText === undefined ? Infinity : Number(limitText);
  let file = at('--walk') ? path.resolve(root, at('--walk')) : recentWalk(root, now);
  if (file) log(`reading ${slash(path.relative(root, file))}`);
  else {
    const why = cannotWalk(root, env);
    if (why) {
      log(`skip the walk: ${why}`);
      log('clean');
      return 0;
    }
    const list = scenarios(readSafe(path.join(root, 'plan', 'bearings.md')));
    log(`walking ${list.join(', ')}`);
    const r = runWalk(root, list);
    const noChrome = String(r.err).split('\n').find((l) => /could not start Chrome/.test(l));
    if (r.code === 2 && noChrome) {
      log(`skip the walk: ${noChrome.trim()}`);
      log('clean');
      return 0;
    }
    if (r.code !== 0) {
      console.error(`ui-walk: the walk stopped (exit ${r.code}): ${String(r.err).trim().split('\n').pop()}`);
      return 1;
    }
    file = r.file;
  }
  let walkJson;
  try {
    walkJson = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`ui-walk: cannot read ${file} (${e instanceof Error ? e.message.split('\n')[0] : e})`);
    return 1;
  }
  const pendingH = parseRows(queueText(root)).filter((r) => r.pending);
  const room = Math.max(0, Math.min(limit, MAX_PENDING - pendingH.length));
  const artifact = slash(path.relative(root, file));
  const due = [];
  for (const f of findings(walkJson)) {
    if (due.length >= room) break;
    if (covered(f, pendingH)) continue;
    const r = row(f, { root, artifact, date });
    if (cutsMagic(r.find((l) => l.startsWith('- next:')))) continue; // never file a row the magic guard refuses
    due.push({ f, r });
    pendingH.push({ title: r[0].replace(/^### \[H, [\d.]+\]\s*/, ''), fields: { evidence: r[4] } });
  }
  const write = argv.includes('--write');
  for (const { f } of due) log(`${write ? 'file' : 'would file'} ${f.route} @ ${f.viewport} (${f.scenario}) ${f.kind}`);
  if (write && due.length) {
    const audit = path.join(root, 'plan', 'AUDIT.md');
    fs.mkdirSync(path.dirname(audit), { recursive: true });
    fs.writeFileSync(audit, appendRows(readSafe(audit), due.map((d) => d.r)));
  }
  log(due.length ? `filed ${due.length}${write ? '' : ' (dry run)'}` : 'clean');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}
