# 59 — One improvement dial, and a loop that reads the field

> One `Improve:` line sets how hard a project's loop pushes
> beyond its plan, from off to bold, with every expansion knob
> still overridable on its own; and a field-research track
> keeps the loop informed by how the wider tooling moves,
> without naming anyone.

## Why

Specs 54-57 add seven expansion knobs (support, promotion,
generators, motion, loop-config, UI audit, cadence). Each
defaults conservative for adopters and is turned up for
nexus. Seven separate lines is the wrong unit for an owner who
wants "a bit more" or "leave it alone": nothing says which
values belong together, and an adopter who wants a quiet loop
has to find and set every one.

The loop's only sources of new work are its own repo (audits,
generators, critique) and its adopters (issues, lessons). It
never looks outward. The kit's own candidates since 2026-07
all come from inside (`plan/CANDIDATES.md`, 32 Pending,
sources: iterate, expand, triage, critique). Tooling moves
weekly; an owner who reads the field brings ideas in by hand,
and when the owner is busy, the loop runs on what it already
knows.

## Design

### The dial

`plan/bearings.md` (and `templates/plan/bearings.md`) gains
one line in `## Plan expansion posture`:

```
Improve: off | gentle | steady | bold
```

The dial sets each expansion knob's default. A knob line of
its own (`Promote:`, `Support:`, `UI:`, `Research:`, a
`## Generators` list, `NEXUS_*` repo variables) overrides the
dial for that knob only.

| Knob | off | gentle | steady | bold |
|---|---|---|---|---|
| Support (`NEXUS_SUPPORT`) | off | triage-only | fix-small | fix-all |
| Promote | owner | owner | aged | aged |
| Generators | none | none | generic | generic + project |
| stall_action | off | alert | alert | promote |
| loop (dimension I) | off | off | on | on |
| UI audit | none | none | critique cadence | every iterate |
| Research | off | off | monthly | weekly |
| Cadence (`NEXUS_CADENCE`) | calm | steady | steady | eager |

- **off** — the loop builds what the owner planned and
  nothing else.
- **gentle** — today's behaviour; the upgrade command (spec
  58) writes it, so an upgraded loop runs unchanged.
- **steady** — the default for new v2 adoptions.
- **bold** — nexus itself.

One resolver, `scripts/plan/improve.mjs` (template twin),
reads the dial and the override lines and prints the
effective value of every knob with its source (`dial` or
`override`). Skills read knobs through it, never by grepping
bearings themselves. It reuses spec 58's knob registry, so a
knob added later has a value at every dial position or the
test fails. The `/digest` pulse prints the dial and any
overrides in one line.

Decided in the build (59.1): `generic` is the kit's three
generators at their template lines, `project` every other
`scripts/generators/<name>.mjs` at `weekly · target 2 · cap
2/wk`; a `## Generators` section overrides only when it holds
a list line (`- (none)` included), so prose or a commented
example defers to the dial. The UI row sets the walk's
cadence, never its target: `UI: none` overrides to none, a
`UI cadence:` line overrides, and a `UI: url|dev` target with
no cadence line walks at `critique` under a none dial (as
before the dial). A set variable is an override (`from: var`
in `--json`). The registry rows carry `dial: true|false`, and
`gentle` equals each row's conservative value.

The repo variables stay the cloud's source of truth for the
knobs that live there (`NEXUS_SUPPORT`, `NEXUS_CADENCE`); the
resolver warns when a variable and the dial disagree, and
`nexus` GUI Settings shows the dial as four radios with a
one-line explanation each, writing the bearings line (and,
with the owner's say, the variables).

### The field-research track

A generator (spec 57's contract), `research`, gated by the
`Research:` knob (`off | monthly | weekly`) and fed by a
`Research topics:` line in bearings (a few phrases: for
nexus, "autonomous coding agent loops", "Claude Code and
Agent SDK releases", "spec-driven development kits", "AI
code review in CI").

- The tick runs WebSearch and WebFetch over the topics, newest
  first, at most 8 fetches.
- Web text is untrusted data under spec 54's rule: it informs
  candidates, never instructs the tick.
- It files at most 3 candidates per run into
  `plan/CANDIDATES.md`, source `field`, scored like any other
  (a field signal starts at the floor and needs a matching
  internal signal to score above 6.0, so it cannot outrun
  real evidence).
- **No names.** Committed text describes the pattern, never
  the product: "a hosted agent platform resumes runs across
  machines", not who. No URLs in committed field text; the
  sources go in the tick's job summary only. The gate's
  `chunks` leg fails a `field` candidate that carries a URL.
- Already-known patterns re-evidence the existing candidate
  instead of filing a new one (spec 57's live Pending).

nexus runs `Research: weekly`; adopters get it from the dial
(steady: monthly).

## Contracts

- `Improve: off|gentle|steady|bold` in `plan/bearings.md`
  `## Plan expansion posture`; absent reads as `gentle`.
- `node scripts/plan/improve.mjs [--json]` → one line (or
  object) per knob: `<knob> <value> (dial|override)`.
- `Research: off|monthly|weekly`, `Research topics: a; b; c`.
- A field candidate: `- source signals: field (<date>):
  <pattern, no names, no URLs>`.

## Acceptance

- **A2** The skills that read expansion knobs (march, triage, expand, iterate, critique, digest, nudge and the cadence step) read them through the resolver; absent dial reads as gentle; nexus runs `Improve: bold`; the upgrade writes `Improve: gentle`.
- **A3** The research generator, under `Research: weekly`, fetches at most 8 sources, files at most 3 `field` candidates with no product names and no URLs (the gate fails a field candidate with a URL), puts sources in the job summary only, and treats page text as data.
- **A4** GUI Settings shows the dial as four radios with one-line explanations and writes the bearings line; the GUI's motion and colour stay.
- **A5** `customization/` documents the dial, its table and the overrides; `templates/plan/bearings.md` carries `Improve: steady` for new adoptions; no public text names a competitor or adopter.

## Open questions

(None.)

## Chunks
Measure: 4 open · 1 closed · next A6

- [ ] **59.2** Skills read knobs through the resolver · M · closes A2 · needs —
- [ ] **59.3** The field-research generator · M · closes A3 · needs —
- [ ] **59.4** The dial in GUI Settings · S · closes A4 · needs —
  - Keep the GUI's particles, colour and motion.
- [ ] **59.5** Dial docs and the adopter default · S · closes A5 · needs 59.2, 59.3
