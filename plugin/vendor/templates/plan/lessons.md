# Lessons

> The domain-keyed corpus. Unlike `reflexes.md` (always read
> in full), this file is read **by offset** — a skill greps
> for its own `<!-- @domain:x -->` anchor and reads from
> there, not the whole file. Caps are hard: ≤500 bytes per
> bullet. See `../../customization/lessons-layer.md` for the
> promotion path (lesson → reflex) and the drain path (reflex
> → skill procedure edit).

<!-- @domain:deploy -->

## Deploy

1. <ISO> — <one-line lesson, ≤500 bytes>. Source:
   <commit or issue reference>.

<!-- @domain:data -->

## Data

1. <ISO> — <one-line lesson, ≤500 bytes>. Source:
   <commit or issue reference>.

<!-- @domain:review -->

## Review

1. <ISO> — <one-line lesson, ≤500 bytes>. Source:
   <commit or issue reference>.

## Adding a domain

Append a new `<!-- @domain:<name> -->` anchor + `##` heading
at the bottom. Keep domain names short and stable — skills
reference them by name (`grep '@domain:deploy'`), so a rename
is a breaking change to every skill that reads this file.
