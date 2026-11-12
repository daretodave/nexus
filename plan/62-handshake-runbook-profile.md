# 62 — Handshake runbook profile for setup/

> `setup/` offers a second, lighter runbook profile for
> services that reduce to a few credential drops, alongside
> today's full A-H dashboard walkthrough.

## Why

`customization/external-services.md` and
`templates/setup/NN_service.md` (confirmed in the repo today,
2026-11-07) define exactly one runbook shape: eight dashboard
sections (A-H covering tenant settings through env-var
propagation), built for services with real dashboard surface
— auth providers, DBs, anything with RBAC or webhooks.

Not every service needs that. A sibling adopter's runbooks
follow a proven, lighter handshake for services that are
really just "create an account, hand over N keys": human
walks a short dashboard sequence, drops exact keys into an
exact file, tells the agent the handoff is done, and the
agent takes it from there. Forcing that case through eight
A-H sections pads the runbook with sections the service
doesn't have (`00_files.md`'s own template already says
"not every service uses every section. Drop the ones that
don't apply... Don't pad.") — the handshake profile is a
second template shaped for the case that's mostly padding
today, not a replacement for the full one.

## Design

- **A second template**, `templates/setup/NN_service.handshake.md`,
  with exactly four fixed sections (the full profile's A-H
  stays as-is; this is an alternative, not a replacement):
  1. **What `<PROJECT>` needs from `<SERVICE>`** — same
     framing as the full profile's opening list, kept to the
     handful of capabilities a key-handoff service provides.
  2. **Dashboard handoff** — a numbered list of human steps,
     each tagged `(~N min)`, ending in one fenced env block
     that names the exact keys and the exact target file
     (`.env`, `.env.example`, or a named secret store) they
     land in. A step that cannot be undone from the dashboard
     (revoking a key that's live elsewhere, deleting a
     project) is marked **`DESTRUCTIVE:`** in bold, plain text
     — no emoji; the verify gate's `emoji` leg already refuses
     those.
  3. **Resume signal** — the exact phrase the human types once
     the env block is dropped (`"<SERVICE> is in"`), matching
     the handshake's own framing: say it, don't just drop the
     file silently, so the agent knows the handoff finished.
  4. **What the agent wires after the drop** — what happens
     once the resume signal arrives: parse the dropped keys,
     propagate them to deploy environments the way the full
     profile's Section H does, run the verification checklist.
- **A "choosing a profile" rule**, added to
  `customization/external-services.md`: the handshake profile
  fits a service whose dashboard work is only account + key
  generation (no RBAC, no webhooks, no branding, no roles to
  configure); anything with real dashboard surface beyond
  generating keys uses the full A-H profile. The rule is a
  question, not a feeling: "does this service need any of
  sections C through G?" — no, handshake; yes, full.
- **A `Profile` column** in `templates/setup/00_files.md`'s
  Index table (`full | handshake`), between `Runbook` and
  `Status`. Every existing example row defaults to `full`
  (today's only shape); the handshake profile is net-new, so
  nothing already written needs to migrate.
- **Template file paths are public API**
  (`agents.md` rule 7): the chunk that adds
  `templates/setup/NN_service.handshake.md` updates
  `templates/README.md`, the root `README.md` tree, and
  `scripts/verify.mjs`'s placeholder/tree legs in the same
  commit.

## Contracts

- `templates/setup/NN_service.handshake.md`'s four section
  headers are fixed text, in order: "What `<PROJECT>` needs
  from `<SERVICE>`", "Dashboard handoff", "Resume signal",
  "What the agent wires after the drop". A future chunk that
  renames one is a template-API rename under agents.md rule 7.
- The destructive-step marker is the literal bold text
  `**DESTRUCTIVE:**` followed by what it breaks — never an
  emoji or a geometric-shape glyph (the `emoji` verify leg
  already refuses those; this just names the sanctioned
  plain-text substitute for this one template).
- `templates/setup/00_files.md`'s Index table's `Profile`
  column holds exactly `full` or `handshake`.

## Acceptance

- **A5** `customization/external-services.md` states the
  full-vs-handshake choosing rule from Design.
- **A6** `templates/setup/00_files.md`'s Index table carries a
  `Profile` column; its one worked example row (or rows) read
  `full`.

## Open questions

(None.)

## Chunks
Measure: 2 open · 5 closed · next A8

- [ ] **62.2** Full-vs-handshake choosing rule in
  `customization/external-services.md` · S · closes A5 ·
  needs —
- [ ] **62.3** `Profile` column in `templates/setup/00_files.md`'s
  Index table · S · closes A6 · needs —
