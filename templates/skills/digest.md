# Skill: digest

> **The night shift.** One tick a day: take the loop's pulse,
> write the morning briefing to `plan/DIGEST.md`, run the
> breadth checks too slow for the per-commit path, propose
> gate tunings as candidates — never apply them. The
> instrument panel, delivered instead of fetched. See
> `nexus/concepts/loop-shapes.md` §2.

**Knobs.** Every expansion knob this skill reads (Support,
Promote, Generators, stall_action, loop, UI, Research,
Cadence) comes through the improvement dial's resolver,
`node scripts/plan/improve.mjs` (`--knob <name>` prints one
value): the `Improve:` line in `plan/bearings.md`, absent read
as `gentle`, and any line of its own that overrides it. Never
grep bearings for a knob by hand.

## 1. Purpose

The dispatcher's ticks are visible one at a time; nobody
reads twenty run logs. This verb compresses a day of loop
activity — shipped ticks, no-ops, crashes — into one
committed, phone-readable file, and owns the O(everything)
work that must never run per-commit.

## 2. Invocation

```
/digest                      # the full nightly pass
```

Runs from `.github/workflows/night.yml` (daily) or by hand.
Never dispatched by `/march` — it is its own loop shape with
its own cadence.

## 3. The procedure

1. **Sync:** `git pull --ff-only`.
2. **Gather the pulse:**

   ```bash
   git log --since="26 hours ago" --oneline
   gh run list --workflow march -L 20 \
     --json displayTitle,conclusion,createdAt,updatedAt
   node scripts/pulse.mjs
   node scripts/pulse.mjs --motion
   node scripts/cloud/quota.mjs show
   node scripts/plan/support.mjs digest --notify
   node scripts/plan/improve.mjs --line
   ```

   `improve.mjs --line` is the dial line: `Improve: <position>`
   and every knob a line of its own overrides; `Queues now`
   carries it as is.

   `quota.mjs show` is the last cached `seven_day` reading
   (night's gate restored it; locally, unknown); `While you
   were out` opens with that line as is.

   `support.mjs digest` is the Support line (spec 54): open
   user issues, the mean time to first response and the mean
   time to close over 7 days, one `escalate #N` line per open
   `triage:needs-user` issue older than `escalate_days`
   (bearings), and with `--notify` one notification naming
   them through `scripts/notify.mjs` (numbers only, never issue
   text). gh read only; `skip` without gh.

   `pulse.mjs --motion` is the motion pulse: shipped units
   in the last full week against the 4-week baseline, and
   `ok` or `stalled` under `Motion floor`.

   `pulse.mjs` gives the local numbers in one shot: specs and
   chunks left, held chunks, AUDIT pending, CRITIQUE pending +
   last pass age, candidates pending + oldest-pending age.
   Plus (still hand-fetched — pulse.mjs never touches the
   network or the data layer): `data/BACKLOG.md` pending (if a
   data layer exists), open `triage:needs-user` / `loop:do`
   issues, deploy state (`pnpm deploy:check`), and how many
   `## Pending` rows in `plan/CANDIDATES.md` carry a
   `- proposed:` date more than 21 days old (hand-count from
   the same rows pulse.mjs already reads for the
   oldest-pending age — no script change).
3. **Breadth checks** (the night-only legs — adapt per
   project; see `nexus/customization/hermetic-e2e.md`):

   ```bash
   SMOKE_SAMPLE=full pnpm e2e     # every URL, not the sample
   ```

   Failures become HIGH `plan/AUDIT.md` rows — the digest
   files them; the next dispatcher tick fixes them.
4. **Write `plan/DIGEST.md`** — overwrite entirely; it is a
   snapshot, not a ledger. Sections, in order: `Headline`,
   `While you were out` (pulse table: tick, verb, outcome —
   no-ops included), `Shipped`, `Queues now` (the candidates
   line grows the >21-day count alongside the existing
   pending-count and oldest-age numbers, e.g. "9 pending (3
   >21d), oldest 30d", then the Support line as is), `Needs
   you` (each `escalate #N` line first, then blocked rows,
   needs-user issues, `[needs-user-call]`s, plus — when either ≥5
   candidates are pending >21 days or the oldest pending
   candidate exceeds 45 days — a line reading "oversight
   needed: candidate queue silting (N pending >21d, oldest
   Xd)"; under `Promote: aged` the valve is draining it, so the
   line reads "auto-promoted <NN> <title> (veto until <date>),
   Y awaiting" from `node scripts/plan/promote.mjs sweep`, or
   "auto-promoted none, Y awaiting" — one `cut <date> [score X]
   <title>` line per candidate the Pending cap cut since the
   last digest (`node scripts/plan/promote.mjs cuts --since
   <its date>`), a `motion stalled: <the
   pulse's shipped line>` line whenever `--motion` reads
   `stalled` (the alert `stall_action: alert` promises), and
   each `rotate <NAME>` line of `node scripts/secrets.mjs
   audit`, a secret last set over 90
   days ago; the log is local, so a cloud run skips it),
   `Today's intent` (next ready chunk + top finding),
   `Tuning proposals` (step 5, or "none").
5. **Meta-loop, within rails:** if the pulse shows a mistuned
   gate (critique never firing, the ceiling hibernating
   productive days, a starved queue), file the tuning as a
   `plan/CANDIDATES.md` candidate citing the pulse
   numbers. **Never edit gates, cadences, ceilings, or rules
   directly** — proposals only; `/oversight` promotes. The
   loop does not vote on its own constraints.
6. **Gate + commit + land:** `pnpm verify`, then one commit
   `digest: <YYYY-MM-DD>` and land. Cloud ticks confirm the
   deploy per the standing rules if the digest commit
   triggers one.

## 4. Hard rules

1. Overwrite `plan/DIGEST.md` whole; history lives in git.
2. Ship nothing else — breadth failures become findings, not
   fixes. The night shift briefs; the dispatcher ships.
3. Proposals, never actions (the meta-loop rail).
4. A quiet day still gets a digest — "quiet" is information.
5. One commit; cloud ticks carry the `Cloud-Run:` trailer.
6. No `Co-Authored-By`, no emojis, no `--no-verify` — the
   standing rules apply at 3am too.

## 5. Failure modes

1. **`gh` unavailable** — degrade to a git-only pulse; note
   the degradation in the digest itself.
2. **Breadth check red** — that's a finding (HIGH AUDIT row),
   not a stop; the digest ships with the finding filed.
3. **Verify gate red on the digest commit itself** — fix only
   what the digest broke; ≤3 iterations, then stop loud per
   the standing rules.
4. **`git pull` divergence** — stop.

## 6. Quick reference

```bash
plan/DIGEST.md                       # the deliverable (overwrite)
plan/AUDIT.md                        # breadth failures land here
plan/CANDIDATES.md             # tuning proposals land here
node scripts/pulse.mjs               # local queue/plan numbers
gh run list --workflow march -L 20   # the invisible no-ops
node scripts/plan/support.mjs digest # the Support line + needs-user escalations
SMOKE_SAMPLE=full pnpm e2e           # the nightly breadth leg
pnpm verify
git commit -m "digest: <YYYY-MM-DD>"   # then land per owner mode (next/land.md §6)
```
