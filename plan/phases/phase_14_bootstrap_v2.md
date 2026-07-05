# Phase 14 — Bootstrap v2: the Ember lessons list

> `customization/bootstrap-automation.md`'s "Script gaps
> observed during Ember bootstrap" section lists five TODOs
> for `scripts/bootstrap.mjs` v2, written after the first
> real greenfield run. They've sat as prose since. This phase
> closes the four that are script-shaped (the fifth, auto
> write-back to `setup/NN_<service>.md` checkboxes, folds in
> as a sub-part of two of them).

## Why

`templates/skills/bootstrap.md` §9 already *promises*
`setup/NN_<service>.md` checkbox writes and `setup/00_files.md`
row-status writes as files "this skill writes" — a doc
already committing to behavior `bootstrap.mjs` never
implemented. And the Supabase / Vercel gaps are the two
providers Ember hit in anger: manual key copy-paste and a
missing env-propagation verb entirely. Closing these turns
the documented "v2 TODO" list into shipped behavior instead
of aspirational prose the next critique pass would flag.

## Deliverables

1. **Supabase key auto-extraction.** `execSupabase`'s
   `create-or-link` verb (both the "existing project" and
   "new project" branches) shells to
   `supabase projects api-keys --project-ref <ref> --output
   json`, parses the legacy JWT `anon`/`service_role` pair,
   and writes `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` +
   `SUPABASE_SERVICE_ROLE_KEY` via `appendEnv`. Falls back to
   the existing manual handoff only if the CLI call or parse
   fails.
2. **Loose JSON parsing for Supabase CLI output.**
   `discoverSupabase` (and the new key-extraction call) parse
   from the first `[`/`{` in stdout instead of the raw string,
   so CLI warning text mixed into stdout no longer silently
   empties the result.
3. **Vercel env propagation with `--sensitive`.** A new
   `push-env` verb: reads `.env`, lists existing Vercel
   Production env vars once (`vercel env ls production`), and
   adds only the missing keys via `vercel env add <key>
   production [--sensitive]`. `--sensitive` fires for any key
   matching `_SECRET`/`_PASSWORD`/`_TOKEN`/`_SERVICE_ROLE_KEY`
   that isn't `NEXT_PUBLIC_*`. Composed into the plan
   automatically once a project is linked.
4. **De-stub the cloud-loop identity edit.** `install-workflow`
   applies "the decorated march" (already spec'd in
   `bootstrap-automation.md`) when
   `manifest.cloud_loop.identity === 'user'`: activates the
   commented `token: ${{ secrets.ACTIONS_PAT }}` checkout
   line and rewrites the action step's `GH_TOKEN` to
   `ACTIONS_PAT` plus adds the four `GIT_AUTHOR_*`/
   `GIT_COMMITTER_*` lines, prompting for name/email if the
   manifest's `git_author_name`/`git_author_email` are empty.
5. **Runbook write-back.** A small helper resolves a
   service's `setup/NN_<service>.md` path from the
   `setup/00_files.md` index table by service name, flips
   `- [ ]` → `- [x]` under the sections the doc already
   claims are automated (github/vercel/supabase → Section A;
   vercel `push-env` + supabase key extraction → Section H),
   and bumps a `STUB`/`—` index row to `PARTIAL` (never
   downgrades an existing `OK`/`PARTIAL`). Best-effort: a
   missing index or runbook is a no-op, never a thrown error.

## Non-goals

- No new adapter (Netlify/Stripe/etc.) — out of scope for
  this brief.
- No `/bootstrap rotate` verb — `bootstrap-automation.md`
  already defers identity-mode switching to v2-plus.
- Runbook write-back never marks a row `OK` — Sections D/E/G
  stay human handoffs per `NN_service.md`'s own contract, so
  a script-only pass can only ever earn `PARTIAL`.
- No unit-test file — matches the `check-secrets-liveness.mjs`
  / `stack-lifecycle.mjs` precedent (phases 12–13): only
  `loop-issue.mjs` carries tests today.

## Decisions made upfront

- Vercel/Supabase writes are additive-only (`appendEnv`
  already refuses to overwrite; `push-env` skips keys Vercel
  already has) — matches hard rule 3 in
  `bootstrap-automation.md` ("no silent overwrites").
  Rotation stays a human/manual act.
- The runbook checkbox flip is a blunt "all boxes in this
  section" pass, not field-by-field diffing — the same
  approximation the doc's own promise implies ("the
  bootstrap pauses as handoffs" only for D/E/G; A/B/H are
  "auto via CLI" wholesale).

## Definition of done

Gate green; `customization/bootstrap-automation.md`'s gaps
section gets a status note (not a rewrite — the lessons stay
as history); build plan row `[x]` with commit hash.
