// The agent guide: what every session in the app's repo reads about the stack it runs on. Set up a stack writes it to
// docs/stack.md (server/stack-guide.mjs) inside a marked block, and points agents.md at it, so a session that reads
// the rule book first finds, for each picked service, its env names, how code reads them, how to run its CLI through
// the vault runner, test against live, limits, the do and don't, and how values move: where each one goes, the push
// line, the names-only check that it landed, and the request to file when one is missing. Names only: nothing here
// ever takes a value.
//
// Pure functions, shared by the server (which writes the file) and the panel (which shows a preview).
import { SERVICES, ORDER, GROUPS } from './recipes.mjs';
import { frameworkById, envNamesFor, isPublicName } from './frameworks.mjs';
import { DESTINATIONS, DEST_FLAG, destLabel, placesFor } from './moves.mjs';

export const GUIDE_FILE = 'docs/stack.md';
export const BEGIN = '<!-- nexus:stack:begin. Written by Set up a stack in the nexus GUI: this block is replaced when the stack changes; notes outside it stay. -->';
export const END = '<!-- nexus:stack:end -->';
export const POINTER_BEGIN = '<!-- nexus:stack-pointer:begin -->';
export const POINTER_END = '<!-- nexus:stack-pointer:end -->';
const BLOCK = /<!-- nexus:stack:begin[^\n]*?-->[\s\S]*?<!-- nexus:stack:end -->/;
const POINTER = /<!-- nexus:stack-pointer:begin -->[\s\S]*?<!-- nexus:stack-pointer:end -->/;

/** Replace each whole env name in a command with the name this repo uses (an alias it already reads). */
function rename(text, map, fixed = {}) {
  let out = String(text);
  for (const [from, to] of Object.entries(map)) {
    if (from === to || fixed[from] || fixed[to]) continue; // in prose, a name a tool reads by itself means that tool's name
    out = out.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
  }
  return out;
}

/**
 * The guide block for the picked services. names: { 'svc.key': [env names as this repo has them] } (the server's
 * resolved names; missing ones fall back to the framework's). app: { dir, framework }. Deterministic: the same picks
 * and names give the same text, so a rewrite that changes nothing is skipped.
 */
export function renderGuide({ picked = [], app = {}, names = {} } = {}) {
  const fw = frameworkById(app.framework);
  const ids = ORDER.filter((id) => picked.includes(id));
  const lines = [BEGIN, '', '## The stack this app runs on', ''];
  if (!ids.length) {
    lines.push('No services are picked yet. Pick them in the nexus GUI: Vault, Set up a stack.', '', END);
    return lines.join('\n');
  }
  const where = app.dir && app.dir !== '.' ? app.dir : 'the repo root';
  lines.push(
    `${ids.map((id) => SERVICES[id].name).join(', ')}. The app is ${fw.label} in ${where}${fw.prefix ? `; names that ship to the browser start ${fw.prefix}` : '; it has no browser prefix'}.`,
    '',
    'Values live in the vault, never in this file or in code. A session reads names only:',
    '',
    '- `node scripts/secrets.mjs status` shows where each name is set.',
    '- A command that needs values runs under `node scripts/secrets.mjs run --only NAME,NAME -- <command>`. The runner puts the values in the child\'s environment only and masks them in its output.',
    '- Write `$NAME` only inside the child (`sh -c \'...\'`), never on the outer command line: the outer shell expands it before the runner adds anything.',
    '- A secret never gets a browser prefix.',
    '',
    'Values move two ways, and a session handles names in both:',
    '',
    '- **In.** Missing a value? File the ask: `node scripts/secrets.mjs request <chunk> --to <destination> --service <service>`, then leave that chunk. The owner pastes it in Set up a stack (the ask opens the right card) or runs `node scripts/secrets.mjs set NAME`. Never ask for a value in chat, never read one, never guess or make one up.',
    '- **Out.** To send a value where it runs, declare the place in its `destinations` in `nexus.secrets.json`, run `node scripts/secrets.mjs push NAME --to <destination>` (the vault hands it to the tool\'s stdin), then confirm with the place\'s names-only list. Each service below has the exact lines.',
    '',
  );
  for (const id of ids) {
    const s = SERVICES[id];
    const g = s.guide || {};
    const group = GROUPS.find((x) => x.id === s.group)?.label;
    lines.push(`### ${s.name}${group ? ` (${group})` : ''}`, '', s.role, '', '| Name | What it is | Where it may go |', '| --- | --- | --- |');
    const map = {};
    const labels = {};
    for (const v of s.values) {
      if (v.env?.server) labels[v.env.server] = v.label;
      const ns = Array.isArray(names[`${id}.${v.key}`]) && names[`${id}.${v.key}`].length ? names[`${id}.${v.key}`] : envNamesFor(v, fw);
      const server = ns.find((n) => !isPublicName(n));
      if (v.env?.server && server) map[v.env.server] = server;
      for (const n of ns) {
        const kind = isPublicName(n) ? 'ships to the browser' : v.secret ? 'secret, server only' : 'server, not secret';
        lines.push(`| \`${n}\` | ${v.label}${v.required ? '' : ' (optional)'} | ${kind} |`);
      }
    }
    lines.push('');
    // fixed: names a tool reads by itself ({ NAME: 'the Stripe CLI' }). Prose keeps them as they are; when this repo
    // keeps a value under another name, or under a fixed name that is not that value's own, the guide says so plainly.
    const fixed = g.fixed || {};
    const clashes = [];
    for (const [from, to] of Object.entries(map)) {
      if (from === to) continue;
      if (fixed[from]) clashes.push(`This repo keeps \`${from}\` (${labels[from]}) as \`${to}\`, and ${fixed[from]} reads only \`${from}\`, so it will not find the value by itself: pass it in code, or set it inside the child (\`sh -c '${from}="$${to}" ...'\`).`);
      if (fixed[to]) clashes.push(`This repo keeps the ${String(labels[from]).toLowerCase()} as \`${to}\`, the name ${fixed[to]} reads by itself: a command run with \`--only ${to}\` hands it this key. Do that only when the key is a sandbox key.`);
    }
    const repoNames = new Set(Object.values(map));
    const note = Object.entries(g.runNoteIf || {}).find(([n]) => repoNames.has(n) && !map[n])?.[1] || g.runNote;
    if (g.reads) lines.push(`**How code reads them.** ${rename(g.reads, map, fixed)}`, '');
    if (g.run?.length) lines.push('**Run with vault values:**', '', '```bash', ...g.run.map((c) => rename(c, map)), '```', '');
    if (note) lines.push(rename(note, map, fixed), '');
    for (const c of clashes) lines.push(c, '');
    if (g.test) lines.push(`**Test and live.** ${g.test}`, '');
    if (g.limits) lines.push(`**Limits.** ${g.limits}`, '');
    if (g.do?.length) lines.push('Do:', '', ...g.do.map((x) => `- ${rename(x, map, fixed)}`), '');
    if (g.dont?.length) lines.push('Don\'t:', '', ...g.dont.map((x) => `- ${rename(x, map, fixed)}`), '');
    lines.push(...movingValues(id, s, ids, (v) => (Array.isArray(names[`${id}.${v.key}`]) && names[`${id}.${v.key}`].length ? names[`${id}.${v.key}`] : envNamesFor(v, fw))));
  }
  lines.push(END);
  return lines.join('\n');
}

/**
 * A service's "Moving values": each place its values go (from the picks: an app value to each host, a CI name to
 * GitHub Actions), the push lines, the names-only check, and the request to file when one is missing.
 */
export function movingValues(id, s, picked, namesOf) {
  const byDest = new Map();
  for (const v of s.values) {
    const ns = namesOf(v);
    for (const n of ns) {
      for (const d of placesFor(id, v.key, n, picked)) {
        if (!byDest.has(d)) byDest.set(d, []);
        if (!byDest.get(d).includes(n)) byDest.get(d).push(n);
      }
    }
  }
  const out = ['**Moving values.**', ''];
  if (!byDest.size) {
    out.push(`These stay in the vault: nothing picked runs code that reads them${s.group === 'hosting' ? ' (a host\'s own token is for its CLI and CI)' : ''}.`, '');
  } else {
    for (const [d, ns] of byDest) {
      const flag = DEST_FLAG[d] ? ` ${DEST_FLAG[d]}` : '';
      out.push(`To ${destLabel(d)} (${DESTINATIONS[d]?.what || 'its secrets'}): ${ns.map((n) => `\`${n}\``).join(', ')}. Declare \`"${d}"\` in each one's \`destinations\` in \`nexus.secrets.json\`, then:`, '', '```bash', ...ns.map((n) => `node scripts/secrets.mjs push ${n} --to ${d}${flag}`), '```', '');
      const check = DESTINATIONS[d]?.verify(ns[0]) || '';
      out.push(/\s/.test(check) && !/^the /.test(check) ? `Confirm it landed: \`${check}\` (names only).` : `Confirm it landed: ${check}.`, '');
    }
  }
  const to = [...byDest.keys()];
  out.push(`Missing one: \`node scripts/secrets.mjs request <chunk>${to.length ? ` --to ${to.join(',')}` : ''} --service ${id}\` (the chunk's \`secrets\` field names what it waits on), then leave that chunk. Never ask for a value in chat or guess one.`, '');
  return out;
}

/** A file's text with the guide block put in place: replaced between the markers, or added. Other text stays as is. */
export function applyBlock(text, block) {
  const t = String(text ?? '');
  if (BLOCK.test(t)) return t.replace(BLOCK, () => block);
  if (!t.trim()) return `# Stack\n\nWhat this app runs on, for every session. Notes you add outside the marked block stay as they are.\n\n${block}\n`;
  return `${t.replace(/\s*$/, '')}\n\n${block}\n`;
}

/** The pointer agents.md carries to the guide: a short marked block, added once at the end and replaced in place. */
export function pointerBlock(file = GUIDE_FILE) {
  return [
    POINTER_BEGIN,
    '## The stack',
    '',
    `The services this app runs on, their env names, and how to use each one from a session with values from the vault: [${file}](${file}). Names only; values stay in the vault. Set up a stack in the nexus GUI keeps it current.`,
    POINTER_END,
  ].join('\n');
}

/** agents.md's text with the pointer in place (replaced, or added at the end). */
export function applyPointer(text, file = GUIDE_FILE) {
  const t = String(text ?? '');
  const p = pointerBlock(file);
  if (POINTER.test(t)) return t.replace(POINTER, () => p);
  return `${t.replace(/\s*$/, '')}\n\n${p}\n`;
}

/** Whether a text holds the guide block (or the pointer). */
export const hasBlock = (text) => BLOCK.test(String(text ?? ''));
export const hasPointer = (text) => POINTER.test(String(text ?? ''));
