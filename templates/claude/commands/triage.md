---
description: Review unlabeled open GitHub issues, classify, label, comment, route to the right backlog
---

You are invoked under the `triage` skill. Read `skills/triage.md`
end to end before touching anything else.

This skill reads issues from `<REPO_SLUG>` (or `$GH_REPO`),
classifies, applies a `triage:*` label, posts a short comment,
routes actionable issues into the right backlog (`plan/AUDIT.md`,
`data/BACKLOG.md`, or build-plan row). Already-labeled issues
skipped — labels are the state.

Argument handling:
- No argument → process all unlabeled open issues.
- `<issue-number>` → focused pass on one issue.
- `all` → re-evaluate all open issues, even labeled.
- `dry-run` → classify and report, no labels / comments.

Procedure: §5 of `skills/triage.md`. Hard rules: §7. Failure
modes: §8. **If `gh auth status` fails, set `GH_TOKEN` from
`.env` first** — see §3 of the skill.

Cheap-by-design: when zero unlabeled issues, exits in <1s with
no commit. The loop hums on.

Argument: $ARGUMENTS
