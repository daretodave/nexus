// The agent guide: what every session in the app's repo reads about the stack it runs on. Set up a stack writes it to
// docs/stack.md (server/stack-guide.mjs) inside a marked block, and points agents.md at it, so a session that reads
// the rule book first finds, for each picked service, its env names, how code reads them, how to run its CLI through
// the vault runner, test against live, limits, and the do and don't. Names only: nothing here ever takes a value.
//
// Pure functions, shared by the server (which writes the file) and the panel (which shows a preview).
import { SERVICES, ORDER, GROUPS } from './recipes.mjs';
import { frameworkById, envNamesFor, isPublicName } from './frameworks.mjs';

export const GUIDE_FILE = 'docs/stack.md';
export const BEGIN = '<!-- nexus:stack:begin. Written by Set up a stack in the nexus GUI: this block is replaced when the stack changes; notes outside it stay. -->';
export const END = '<!-- nexus:stack:end -->';
export const POINTER_BEGIN = '<!-- nexus:stack-pointer:begin -->';
export const POINTER_END = '<!-- nexus:stack-pointer:end -->';
const BLOCK = /<!-- nexus:stack:begin[^\n]*?-->[\s\S]*?<!-- nexus:stack:end -->/;
const POINTER = /<!-- nexus:stack-pointer:begin -->[\s\S]*?<!-- nexus:stack-pointer:end -->/;

/** Replace each whole env name in a command with the name this repo uses (an alias it already reads). */
function rename(text, map) {
  let out = String(text);
  for (const [from, to] of Object.entries(map)) if (from !== to) out = out.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
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
    '- A secret never gets a browser prefix. Missing a value? Ask the owner to paste it in Set up a stack, or to run `node scripts/secrets.mjs set NAME`.',
    '',
  );
  for (const id of ids) {
    const s = SERVICES[id];
    const g = s.guide || {};
    const group = GROUPS.find((x) => x.id === s.group)?.label;
    lines.push(`### ${s.name}${group ? ` (${group})` : ''}`, '', s.role, '', '| Name | What it is | Where it may go |', '| --- | --- | --- |');
    const map = {};
    for (const v of s.values) {
      const ns = Array.isArray(names[`${id}.${v.key}`]) && names[`${id}.${v.key}`].length ? names[`${id}.${v.key}`] : envNamesFor(v, fw);
      const server = ns.find((n) => !isPublicName(n));
      if (v.env?.server && server) map[v.env.server] = server;
      for (const n of ns) {
        const kind = isPublicName(n) ? 'ships to the browser' : v.secret ? 'secret, server only' : 'server, not secret';
        lines.push(`| \`${n}\` | ${v.label}${v.required ? '' : ' (optional)'} | ${kind} |`);
      }
    }
    lines.push('');
    if (g.reads) lines.push(`**How code reads them.** ${rename(g.reads, map)}`, '');
    if (g.run?.length) lines.push('**Run with vault values:**', '', '```bash', ...g.run.map((c) => rename(c, map)), '```', '');
    if (g.runNote) lines.push(rename(g.runNote, map), '');
    if (g.test) lines.push(`**Test and live.** ${g.test}`, '');
    if (g.limits) lines.push(`**Limits.** ${g.limits}`, '');
    if (g.do?.length) lines.push('Do:', '', ...g.do.map((x) => `- ${rename(x, map)}`), '');
    if (g.dont?.length) lines.push('Don\'t:', '', ...g.dont.map((x) => `- ${rename(x, map)}`), '');
  }
  lines.push(END);
  return lines.join('\n');
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
