# Phase 21 — prompts/ as canonical files + a five-line paste

> Source: `plan/PHASE_CANDIDATES.md` → Promoted, score 8.6.
> One screen: deliverables, non-goals, decisions.

## Problem

README.md's two TL;DR sections each embed a ~60-line agent
prompt inline. A prompt fix today means re-pasting the new
blob into every doorway that quotes it — and every future
doorway (npx installer, Claude Code plugin, a raw-fetch URL)
would need its own copy.

## Deliverables

- `prompts/adopt.md` — the full "Adopt nexus." agent prompt,
  moved verbatim from README's TL;DR 1 step 2, framed like
  `templates/design-prompt.md` (blockquote usage note, "The
  prompt" section, "See also").
- `prompts/pitch.md` — the full "Run nexus's pitch-to-adopted
  flow" agent prompt, moved verbatim from README's TL;DR 2,
  same framing. Its embedded Phase B now points straight at
  `prompts/adopt.md` instead of "read README's TL;DR
  downward".
- `prompts/README.md` — what these files are, why they're
  split out, and the public-API note.
- README.md: both TL;DR sections shrink to a short paste
  (clone nexus, then read-and-follow the prompts/ file) plus
  a link to the full text for pre-reading. The "Review what
  landed" / "When this TL;DR is the wrong path" prose stays in
  README — it's human-facing, not part of the agent prompt.
  Kit tree gains an expanded `prompts/` entry.
- `agents.md`: repo-shape tree gains `prompts/`; rule 7 gains
  a sentence extending the public-API contract to `prompts/`
  paths (narrower surface: pasted text, not copied files).
- `scripts/verify.mjs`: `discover` leg's regex grows to cover
  `prompts/` so a future prompt file can't go unlinked.
- `skills/critique.md`: step 3 gains a clause naming that the
  walk reads whichever `prompts/*.md` file the paste points to
  (the walk was already generic; this makes it explicit).

## Non-goals

- No new verify leg. The candidate's rationale floated a
  "byte-synced excerpt" check, but the new paste doesn't quote
  prompt content — it only points at the file — so there's no
  excerpt to drift. `discover`'s existing orphan-check covers
  the real risk (an unlinked prompt file).
- No `npx`/plugin doorway. The candidate names those as future
  consumers of the canonical text; this phase only creates the
  text and repoints README, per "sequence prompts/ first."
- `templates/README.md` untouched — `prompts/` is nexus's own
  doorway, never copied into an adopter repo (unlike
  `templates/design-prompt.md`, which IS copied).
- The README conversion pass the candidate flags as a pairing
  partner is out of scope; nothing here blocks it.

## Decisions

1. Prompt files keep the design-prompt.md shape (H1 + usage
   blockquote + fenced prompt + See also) for voice
   consistency with the one existing prompt-file precedent in
   the kit.
2. The pitch paste keeps the one-paragraph-pitch placeholder
   inline (it's per-adopter data, can't live in a static
   file); everything else in that paste is the clone+read
   instruction.
3. `<your-fork-or-mirror>` and `<ONE-PARAGRAPH PITCH …>` stay
   lowercase/prose-shaped placeholders exactly as today —
   already outside `PLACEHOLDER_VOCABULARY`'s uppercase-token
   scope, no gate change needed.
