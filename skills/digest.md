# Skill: digest (nexus)

> **The night shift.** One tick a day: take the loop's pulse,
> write the morning briefing to `plan/DIGEST.md`, refresh the
> audit if stale, propose gate tunings as candidates — never
> apply them. The instrument panel, delivered.

## 1. Purpose

The dispatcher's ticks are visible one at a time; nobody
reads twenty run logs. This verb compresses a day of loop
activity — including the invisible no-op ticks — into one
committed, phone-readable file, and does the breadth work too
slow for the per-commit path.

## 2. Invocation

```
/digest                      # the full nightly pass
```

Runs from `.github/workflows/night.yml` (daily) or by hand.
Never dispatched by `/march` — it is its own loop shape (see
`concepts/loop-shapes.md` §2).

## 3. The procedure

1. **Sync:** `git pull --ff-only`.
2. **Gather the pulse:**

   ```bash
   git log --since="26 hours ago" --oneline
   gh run list --workflow march -L 20 \
     --json displayTitle,conclusion,createdAt,updatedAt
   gh run list --workflow heartbeat -L 5 --json conclusion
   node scripts/pulse.mjs
   node scripts/pulse.mjs --motion
   node templates/scripts/cloud/quota.mjs show
   ```

   `quota.mjs show` is the last cached `seven_day` reading
   (night's gate restored it); `While you were out` opens with
   that line as is.

   `pulse.mjs --motion` is the motion pulse: shipped units
   in the last full week against the 4-week baseline, and
   `ok` or `stalled` under `Motion floor`.

   `pulse.mjs` gives the local numbers in one shot: specs,
   chunks left and held, AUDIT pending, CRITIQUE pending +
   last pass age, candidates pending + oldest-pending age.
   Plus (still hand-fetched — pulse.mjs never touches the
   network): open `triage:needs-user` / `loop:do` issues,
   sibling lessons growth (`../<sibling>/plan/lessons.md`
   size, when present locally; skip silently in cloud), and
   how many `## Pending` candidates in
   `plan/CANDIDATES.md` carry a `- proposed:` date more
   than 21 days old (hand-count from the same rows pulse.mjs
   already reads for the oldest-pending age — no script
   change).
3. **Write `plan/DIGEST.md`** — overwrite entirely; it is a
   snapshot, not a ledger. Sections, in order: `Headline`
   (one sentence), `While you were out` (pulse table: tick,
   verb, outcome — no-ops included), `Shipped`, `Queues now`
   (the candidates line grows the >21-day count alongside the
   existing pending-count and oldest-age numbers, e.g. "17
   pending (6 >21d), oldest 58d"), `Needs you` (blocked rows,
   needs-user issues, `[needs-user-call]`s, plus the silt line
   "auto-promoted <NN> <title> (veto until <date>), Y awaiting"
   — each spec `node scripts/plan/promote.mjs sweep` shows in
   its veto window, or "auto-promoted none" — whenever any
   auto-promotion is in its window, ≥5 candidates are pending
   >21 days, or the oldest pending candidate exceeds 45 days
   (nexus runs `Promote: aged`; with `owner` the line reads
   "oversight needed: candidate queue silting (N pending >21d,
   oldest Xd)"), a `motion stalled: <the pulse's shipped
   line>` line whenever `--motion` reads `stalled`, and each
   `rotate <NAME>` line of `node scripts/secrets.mjs
   audit`, a secret last set over 90
   days ago; the log is local, so a cloud run skips it),
   `Today's intent` (next ready chunk + top audit
   finding), `Tuning proposals` (see step 4, or "none").
4. **Meta-loop, within rails:** if the pulse shows a mistuned
   gate (critique gate never opening, ceiling hibernating
   productive days, a starved queue), file the tuning as a
   `plan/CANDIDATES.md` candidate citing the pulse
   numbers. **Never edit gates, cadences, ceilings, or rules
   directly** — proposals only; `/oversight` promotes.
5. **Refresh the audit if stale:** `plan/AUDIT.md` header
   older than 48h → recompute the Top 5 per
   `skills/iterate.md` §3 (audit only — ship nothing,
   preserve durable rows).
6. **Gate + commit + land:** `node scripts/verify.mjs`, then
   one commit `digest: <YYYY-MM-DD>` and land.

## 4. Hard rules

1. Overwrite `plan/DIGEST.md` whole; history lives in git.
2. Ship nothing else — no doc fixes, no template edits; file
   findings instead. The night shift briefs; the dispatcher
   ships.
3. Proposals, never actions (the meta-loop rail).
4. A quiet day still gets a digest — "quiet" is information.
5. One commit; cloud ticks carry the `Cloud-Run:` trailer.

## 5. Failure modes

1. **`gh` unavailable** — degrade to git-only pulse; say so
   in the digest under the pulse table.
2. **Gate red** — fix only what the digest itself broke;
   anything else becomes a HIGH AUDIT row and the digest
   ships without the offending section.
3. **`git pull` divergence** — stop (the dispatcher's rule;
   same here).

## 6. Quick reference

```bash
plan/DIGEST.md                       # the deliverable (overwrite)
plan/AUDIT.md                        # staleness check + durable rows
plan/CANDIDATES.md             # tuning proposals land here
gh run list --workflow march -L 20   # the invisible no-ops
node scripts/pulse.mjs               # local queue/plan numbers
node scripts/verify.mjs
git commit -m "digest: <YYYY-MM-DD>"   # then land per owner mode (next/land.md §6)
```
