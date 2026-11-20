// scripts/plan/footguns.mjs: the footgun list's shape, which settle keeps and checks before it writes.
//
// One line per trap, each under its status's section:
//   - **slug** · trap → rule · seen N× · last YYYY-MM-DD · open | watch | guarded by <the test, hook or lint>
// `## Open` is read before building (budget `limits.openFootguns`; more only while every open line is seen twice or
// more, each awaiting its automate chunk), `## Watch` holds single sightings settle moved out of Open (searched
// before a new line is added, capped at `limits.watchFootguns`), `## Guarded` holds the automated ones. Each line is
// at most `limits.footgunBytes` bytes: the trap once and its rule, never an incident list (git keeps those). The file
// merges with git's `union` driver, so concurrent bumps can leave duplicate lines: the lint names them.
import { DEFAULTS } from './config.mjs';

export const FOOTGUN_LINE = /^- \*\*([a-z0-9]+(?:-[a-z0-9]+)*)\*\* · \S.* → \S.* · seen \d+× · last \d{4}-\d{2}-\d{2} · (open|watch|guarded by \S.*)$/;

/** What's wrong with a footgun list ([] for nothing), under `limits` (the config's). */
export function lintFootguns(text, file = DEFAULTS.footguns, limits = DEFAULTS.limits) {
  const problems = [];
  const slugs = new Map();
  let open = 0;
  let openOnce = 0;
  let watch = 0;
  let section = null;
  const seenAt = (slug, n) => (slugs.get(slug) ?? slugs.set(slug, []).get(slug)).push(n);
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.startsWith('## ')) section = /^## (Open|Watch|Guarded)\b/.exec(line)?.[1] ?? null;
    if (!/^\s*[-*] /.test(line) && !/^\s{2,}\S/.test(line)) return;
    const at = `${file}:${i + 1}`;
    if (/^\s/.test(line)) {
      problems.push(`${at}: footgun entries are one line each (no wrapped or indented lines)`);
      return;
    }
    // An edit that eats a newline joins two entries: a second entry's start inside the line means two.
    const starts = [...line.matchAll(/(?<!`)- \*\*([a-z0-9]+(?:-[a-z0-9]+)*)\*\* · /g)].map((s) => s[1]);
    if (starts.length > 1) {
      problems.push(`${at}: two footgun entries on one line (${starts.map((s) => `"${s}"`).join(', ')}): put the second on its own line`);
      for (const slug of starts) seenAt(slug, i + 1);
      return;
    }
    const m = FOOTGUN_LINE.exec(line);
    if (!m) {
      problems.push(`${at}: not in the footgun format "- **slug** · trap → rule · seen N× · last YYYY-MM-DD · open | watch | guarded by …"`);
      const slug = /^- \*\*([^*]+)\*\*/.exec(line)?.[1];
      if (slug) seenAt(slug, i + 1);
      return;
    }
    seenAt(m[1], i + 1);
    if (m[2] === 'open') {
      open++;
      if (Number(/· seen (\d+)× ·/.exec(line)[1]) < 2) openOnce++;
    }
    if (m[2] === 'watch') watch++;
    const state = m[2] === 'open' ? 'Open' : m[2] === 'watch' ? 'Watch' : 'Guarded';
    if (section && section !== state) problems.push(`${at}: footgun ${m[1]} is ${state.toLowerCase()} but sits under ## ${section}: move it to ## ${state}`);
    const bytes = Buffer.byteLength(line, 'utf8');
    if (bytes > limits.footgunBytes) problems.push(`${at}: footgun ${m[1]} is ${bytes} bytes (cap ${limits.footgunBytes}): say the trap once, drop the incident list`);
  });
  for (const [slug, lines] of slugs) {
    if (lines.length > 1) problems.push(`${file}: duplicate footgun slug "${slug}" on lines ${lines.join(', ')} (merge them: bump seen/last)`);
  }
  // Past the budget only while every open line is seen twice or more: each awaits its automate chunk.
  if (open > limits.openFootguns && openOnce > 0) problems.push(`${file}: ${open} open footguns (budget ${limits.openFootguns}); settle moves the oldest single sightings to ## Watch; guard one seen twice`);
  if (watch > limits.watchFootguns) problems.push(`${file}: ${watch} watch footguns (cap ${limits.watchFootguns}); settle drops the oldest`);
  return problems;
}
