# Reflexes

> The always-read core. ≤50 lines, total — this file is loaded
> in full by every skill's Step 0, so it stays small on
> purpose. A reflex is a lesson from `lessons.md` that changed
> behavior on ~weekly cadence; promoting it here means every
> skill sees it without a domain lookup. See
> `../../customization/lessons-layer.md` for the two-tier
> model and the promotion/drain paths.

1. Verify gate is foreground, always. Never
   `run_in_background` it, never `--no-verify`. A red gate
   blocks the commit; it does not get worked around.
2. Commit and push are one atomic act. No unpushed commits
   sit at the end of a turn — the next tick assumes
   `origin/<DEFAULT_BRANCH>` is the whole truth.
3. Blocked is loud. Before a skill stops on a failure-mode
   condition, it surfaces an issue or a mirror comment first
   — silence is the failure, not the blocker itself.

## Promotion log

- <ISO> — promoted from `lessons.md` `<!-- @domain:<NAME> -->`
  entry #<N>: "<one-line summary>".

## Drain log

- <ISO> — drained into `skills/<NAME>.md` §<N>: "<one-line
  summary>" (the reflex became a procedure step, not a
  reminder).
