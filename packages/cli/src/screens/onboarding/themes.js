// Explode's theme cards (spec 40 A8): /messy's report, read from the
// session's stream. The report is the one place a theme's `/plot` line
// exists (the raw dump file carries spec numbers only, and the pending file
// carries plan rows, not actions), so it is the source, and /messy's Step 6
// pins its shape, one line per theme:
//
//   - **<theme>** · <spec NN | extends NN | built at <path>> · `/plot asap "…"`
//
// The parser is lenient past that: any list line carrying a backticked
// `/plot …` is a theme, its title the bold text (or the text before the
// first separator), and what it became the rest. Pure: no DOM, no React.

const ITEM = /^(?:[-*+]|\d+[.)])\s+/;
const PLOT = /`(\/plot\s+[^`]*\S[^`]*)`/; // a bare `/plot` is a mention, not an action
const SEP = /\s+[·|—–]\s+|:\s+/;

/** What a theme became: a new spec, an extension of one, or already built (null when the line does not say). */
export function kindOf(became) {
  if (/\bbuilt\b/i.test(became)) return 'built';
  if (/\bexten(?:ds|sion)\b/i.test(became)) return 'extends';
  if (/\bspec\b/i.test(became)) return 'new';
  return null;
}

/** /messy's report text -> [{ title, became, kind, spec, plot }], in its order, one per theme line. */
export function parseThemes(text) {
  const out = [];
  const seen = new Set();
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    const m = PLOT.exec(line);
    if (!m || !ITEM.test(line)) continue;
    const plot = m[1].trim();
    const body = line.replace(ITEM, '').replace(m[0], '').trim();
    let title;
    let rest;
    const bold = /^\*\*(.+?)\*\*/.exec(body);
    if (bold) {
      title = bold[1];
      rest = body.slice(bold[0].length);
    } else {
      const cut = SEP.exec(body);
      title = cut ? body.slice(0, cut.index) : body;
      rest = cut ? body.slice(cut.index) : '';
    }
    title = title.replace(/[`*]/g, '').replace(/[\s:·|—–-]+$/, '').trim();
    const became = rest.split(SEP).map((s) => s.replace(/[`*]/g, '').replace(/^[\s:·|—–,-]+|[\s:·|—–,(-]+$/g, '').trim()).filter(Boolean).join(' · ');
    if (!title) title = plot.replace(/^\/plot\s+(?:asap|anytime|worked out)?\s*/i, '').replace(/^"|"$/g, '');
    const key = `${title}\n${plot}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const spec = /\b(?:spec|extends|extension of)\s+(?:spec\s+)?(\d{1,4})\b/i.exec(became)?.[1] || null;
    out.push({ title, became, kind: kindOf(became), spec, plot });
  }
  return out;
}

const EXPLODE = /^\/(?:messy|explode)\b/;

/**
 * The themes of the last /messy (or /explode) this session ran: the main agent's text in that turn, parsed.
 * -> { sent, done, themes }: sent when a /messy is in the transcript, done once its turn has a result.
 */
export function messyReport(transcript = []) {
  let at = -1;
  for (let i = transcript.length - 1; i >= 0; i--) {
    const x = transcript[i];
    if (x && x.kind === 'user' && EXPLODE.test(String(x.text || '').trim())) { at = i; break; }
  }
  if (at === -1) return { sent: false, done: false, themes: [] };
  // Its turn only, up to its result: a tug mid-turn stays in it, a /plot sent from a card afterwards is its own turn.
  const rest = transcript.slice(at + 1);
  const end = rest.findIndex((x) => x && x.kind === 'result');
  const after = end === -1 ? rest : rest.slice(0, end + 1);
  const text = after.filter((x) => x && x.kind === 'text' && (!x.agent || x.agent === 'main')).map((x) => x.text).join('\n');
  return { sent: true, done: after.some((x) => x && x.kind === 'result'), themes: parseThemes(text) };
}
