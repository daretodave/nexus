---
description: Quickfire a kit observation into plan/CRITIQUE.md and push. Under ten seconds, no questions.
---

You are invoked under the `jot` skill — capture, commit, push,
done. Read `skills/jot.md` end to end before touching anything
else.

Argument handling:
- `<free text>` → one Pending row, severity MED.
- `--severity high|med|low <free text>` → override severity.
- Empty → print usage, exit 0, no commit.

Procedure: §3. Hard rules: §4. Failure modes: §5. The user's
text lands verbatim; the next `/iterate` scores it with the
+0.5 user bump. No verify gate (state-file append only), no
questions back — ever.

Argument: $ARGUMENTS
