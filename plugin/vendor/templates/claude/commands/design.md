---
description: The Claude Design round trip (opt-in) - write the paste prompt from the plan, an addendum with only what changed, or ingest the artifact and plot the port
argument-hint: "prompt [<specs or keyword>] | addendum | ingest <link or folder>"
---

You are invoked under the `design` skill. Read `skills/design.md`
end to end before touching anything else; it is the single
source of truth.

Argument handling:
- `prompt [<scope>]` → §4: draft with `node scripts/design/prompt.mjs
  prompt`, store it, polish the wording. Scope: spec numbers
  (`41,42`), a keyword, or nothing (every item naming UI work).
- `addendum` → §5: only what changed since the last stored
  file, its sections numbered on from that file's last.
- `ingest <link or folder>` → §6: a link is fetched through the
  Artifact tool into a scratch folder, a folder used as given;
  the handoff lands in `design/handoff/<date>/` and the port is
  plotted through `/plot`. The link is the go-ahead.
- Anything else → print the invocation block and stop.

Opt-in: only when the owner designs in Claude Design.

Argument: $ARGUMENTS
