// How infinite runs: march (it picks each pass; `ideas` sets how hard the passes that invent work push) or the next
// loop (heads down through the plan; `dry` says what happens once nothing is ready). The words a choice sends are
// the skills' own: skills/march.md §2 (`careful` | `bold`), skills/next.md §2 and skills/expand.md §2 (`then expand`
// | `then build`). No extra word is each skill's default, so an older kit reads the plain prompt it always did.
// Pure rules only.

export const IDEAS = ['careful', 'balanced', 'bold'];
export const DRY = ['stop', 'expand', 'build'];
export const MODES = ['march', 'next'];

/** The first-time choice: closest to the old '/loop /next', and its new ideas wait for the owner. */
export const FOLLOW_DEFAULT = Object.freeze({ mode: 'next', ideas: 'balanced', dry: 'expand' });

export const MODE_COPY = {
  march: { label: 'March', icon: 'flag', sub: 'Picks each pass itself: build, audit, critique, new ideas.' },
  next: { label: 'Next loop', icon: 'refresh', sub: 'Builds the plan chunk by chunk, heads down.' },
};

export const IDEAS_COPY = {
  careful: { label: 'Careful', meaning: 'Fixes what is there. It never invents new work.' },
  balanced: { label: 'Balanced', meaning: 'Now and then it proposes new work. Ideas wait in Oversight, unless your plan says otherwise.' },
  bold: { label: 'Bold', meaning: 'Proposes new work whenever building is done. Ideas wait in Oversight, unless your plan says otherwise.' },
};

export const DRY_COPY = {
  stop: { label: 'Stop', meaning: 'Ends the loop and tells you why nothing is left.' },
  expand: { label: 'Propose', meaning: 'Proposes new work once, then stops. Ideas wait in Oversight, unless your plan says otherwise.' },
  build: { label: 'Build it', meaning: 'Turns its own ideas into specs and builds them, up to three rounds or until it runs out of reasons. Your app builds itself.' },
};

const pickOf = (list, v, fallback) => (list.includes(v) ? v : fallback);

/** A whole, valid choice from a partial one. */
export function normFollow(f, { owner = true } = {}) {
  const mode = pickOf(MODES, f?.mode, FOLLOW_DEFAULT.mode);
  const ideas = pickOf(IDEAS, f?.ideas, FOLLOW_DEFAULT.ideas);
  let dry = pickOf(DRY, f?.dry, FOLLOW_DEFAULT.dry);
  if (dry === 'build' && owner === false) dry = 'expand';
  return { mode, ideas, dry };
}

/** The prompt a choice starts. */
export function followPrompt(f) {
  const { mode, ideas, dry } = normFollow(f);
  if (mode === 'march') return ideas === 'balanced' ? '/loop /march' : `/loop /march ${ideas}`;
  return dry === 'stop' ? '/loop /next' : `/loop /next then ${dry}`;
}

const LOOP = /^\/loop\s+(?:\d+[smhd]\s+)?/i;

/** { mode: 'march', ideas } | { mode: 'next', dry } | null: what an infinite prompt asked for. */
export function followOf(prompt) {
  const p = String(prompt || '').trim();
  const looped = LOOP.test(p);
  const m = /^\/(march|next)\b(.*)$/is.exec(p.replace(LOOP, ''));
  if (!m) return null;
  const rest = m[2];
  if (m[1].toLowerCase() === 'march') {
    return { mode: 'march', ideas: /\bcareful\b/i.test(rest) ? 'careful' : /\bbold\b/i.test(rest) ? 'bold' : 'balanced' };
  }
  if (!looped) return null; // a one-off /next is a chunk, not infinite
  return { mode: 'next', dry: /\bthen\s+build\b/i.test(rest) ? 'build' : /\bthen\s+expand\b/i.test(rest) ? 'expand' : 'stop' };
}

/** The saved pref ("march bold expand") read back; anything unknown falls back to the default. */
export function parseFollow(str, { owner = true } = {}) {
  const words = String(str || '').toLowerCase().split(/\s+/).filter(Boolean);
  return normFollow({
    mode: words.find((w) => MODES.includes(w)),
    ideas: words.find((w) => IDEAS.includes(w)),
    dry: words.find((w) => DRY.includes(w)),
  }, { owner });
}

/** "<mode> <ideas> <dry>": both modes' options kept, so switching modes keeps the other's choice. */
export function serializeFollow(f) {
  const { mode, ideas, dry } = normFollow(f);
  return `${mode} ${ideas} ${dry}`;
}

/** "march, bold", "march", "next loop", "next loop, then build". Takes a whole choice or followOf's answer. */
export function followLabel(f) {
  if (!f) return '';
  if (f.mode === 'march') return !f.ideas || f.ideas === 'balanced' ? 'march' : `march, ${f.ideas}`;
  if (!f.dry || f.dry === 'stop') return 'next loop';
  return `next loop, then ${f.dry === 'build' ? 'build' : 'propose'}`;
}

/** The start button's words. */
export function startLabel(f) {
  const { mode, ideas, dry } = normFollow(f);
  if (mode === 'march') return ideas === 'balanced' ? 'Start march' : `Start march, ${ideas}`;
  if (dry === 'stop') return 'Start the next loop';
  return dry === 'build' ? 'Start the loop, then build' : 'Start the loop, then propose';
}
