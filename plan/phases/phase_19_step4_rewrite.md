# Phase 19 — Step-4 structural rewrite

> One screen: deliverables, non-goals, decisions.

## Deliverables

1. **Step 4 reads as one explicit three-part sequence.**
   `playbooks/new-project.md`'s "4. Copy the rest of the
   templates" gets a lead-in sentence naming the order (copy →
   sweep placeholders → prune adopt-by-need files) and two new
   `###` sub-headings (`Copy`, `Replace placeholders`) so the
   section has the same explicit structure the third sub-step
   (`### Prune adopt-by-need files`) already had. The ordering
   matters — sweeping before prune can leave placeholder tokens
   in files that are about to be deleted anyway, and pruning
   before the sweep risks removing a file whose sibling copy
   still needs the sweep — so the lead-in states it plainly
   instead of leaving it implicit in section order.
2. **Verified against the candidate's proposed scope, gap by
   gap** (`plan/PHASE_CANDIDATES.md`'s promoted phase-19 row):
   sibling-clone copy paths, the `templates/plan/phases/` copy
   line, the widened grep scope (`./scripts ./.env.example
   ./data`), step 7's deploy-check.mjs redundancy, and step 6's
   pre-scaffold `package.json` framing were all already closed
   by prior `/iterate` and `/critique` ticks (see `plan/
   CRITIQUE.md` Done log: commits `70c8b6c`, `fe46a28`,
   `9d404ce`, `0f19039`, `ced0304` among others). Confirmed
   live in the current file rather than trusted from the log.
3. **Prune coverage double-checked against `templates/
   README.md`'s adopt-by-need table.** That table has 14 rows;
   only 9 name files step 4's copy array actually lands
   (`ship-data`, `ship-migration`, `ship-asset`, `moderate`,
   `digest`, `bootstrap`, `refresh-critique-session` +
   `check-secrets-liveness`, `stack-lifecycle`, the `.claude/`
   bundle) — the other 5 (`plan/CURRENT-STATE.md`, `setup/`,
   `nightly-smoke.yml`, `design-prompt.md`, `plan/reflexes.md`
   + `plan/lessons.md`) are never copied by step 4 in the first
   place, so pruning them there would be pruning nothing. All 9
   applicable rows already have a bullet + rm/Remove-Item entry.

## Non-goals

- **`scripts/adopt-dryrun.mjs`.** The mechanized dry-run that
  turns this block's manual walkthrough into a gate leg is a
  separate candidate (score 7.6, `plan/PHASE_CANDIDATES.md`),
  explicitly sequenced *after* this phase ("lands best after
  phase 19 settles the block it verifies"). Not this phase's
  scope.
- **`playbooks/existing-project.md`.** The candidate names only
  `new-project.md`'s step 4. The brownfield playbook's copy
  block shares some history (the CLAUDE.md fix touched both)
  but isn't part of this phase's title or proposed scope — a
  parallel pass there is a separate finding if one turns up.
- **The pnpm/settings.json worked-example row and the two
  single-instance LOW CRITIQUE rows.** The candidate explicitly
  carves these out to a sibling candidate and plain `/iterate`
  ticks respectively — they don't share this cluster's root
  cause (structure), so they don't ride along here.
- **Re-litigating already-correct content.** Six ticks' worth of
  incremental fixes already got the substance right; this phase
  is a verification pass plus a structural/legibility pass, not
  a rewrite of working commands.

## Decisions

- The candidate's rationale ("spread loosely across steps 4-7")
  no longer describes the file — steps 6 and 7 already carry no
  copy/placeholder logic (step 6 is explicitly a target-shape
  note, step 7 explicitly reads "already present"). Rather than
  force a rewrite the file no longer needs, this phase closes
  the gap that's actually still open: step 4's own three
  sub-steps existed as prose-plus-code with only the third
  (prune) explicitly headed. Making the sequencing explicit
  top-to-bottom is what "one verified sequence" still requires.
- No template API change, no new placeholder, no gate leg —
  this is playbook prose only, so `scripts/verify.mjs` needs no
  new invariant.
