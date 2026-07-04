# Phase 12 — Critique-session refresher + secret liveness probe

> `customization/auth-aware-critique.md` Pattern B step 4
> promises "a `scripts/refresh-critique-session.mjs` that
> prompts you to log in once and captures the new cookie" —
> the kit ships neither that script nor a mechanical check for
> `playbooks/hands-off.md` Step 5.2's "probe liveness in
> pre-flight" ritual. Bearings decision 2: a doc that promises
> a file the kit doesn't ship is a HIGH finding. Ship both.

## Why

Pattern B is the recommended starting point for auth-aware
critique (session cookie / bearer token). Its whole pitch is
"operational simplicity" — but today the refresh step is
"open devtools, copy the cookie, edit `.env` by hand," which
undercuts that pitch, and the promised helper script doesn't
exist. Separately, `hands-off.md` Step 5.2 tells the operator
to manually run `gh auth status` before a long walk-away
window but has no automated check for the credential class
this repo's own customization just added (`CRITIQUE_*`
secrets) — the exact kind of silent-expiry failure the
hands-off playbook exists to prevent.

## Deliverables

1. `templates/scripts/refresh-critique-session.mjs` —
   interactive refresher, mirrors the `.env` load/parse
   pattern from `deploy-check.mjs`/`notify.mjs` but adds a
   writer:
   - Reads `CRITIQUE_AUTH_MODE` from `.env` (or the file's
     current declared mode) and asks (via `node:readline`)
     for the new cookie/token value for `session-cookie` or
     `bearer-token` sub-modes only (the two Pattern-B modes;
     other patterns don't have a "session" to refresh).
   - Writes the value back to `.env` in place — replaces the
     matching `CRITIQUE_SESSION_COOKIE` /
     `CRITIQUE_BEARER_TOKEN` line if present, appends it
     under the existing `# Pattern B` block otherwise. Never
     touches any other line.
   - No mode declared / mode not session-based → prints which
     pattern doc section applies and exits 2 (nothing to
     refresh).
   - Zero dependencies, ESM, ships a usage comment header
     matching `lint-migration.mjs`'s style.
2. `templates/scripts/check-secrets-liveness.mjs` — the
   automated half of `hands-off.md` Step 5.2's pre-flight
   ritual, scoped to the two credential classes not already
   covered by an existing script (`deploy-check.mjs` already
   owns the deploy-provider token, live, per-push):
   - `GH_TOKEN` — `GET api.github.com/rate_limit`; 401/403 →
     dead.
   - `CRITIQUE_*` (only if `CRITIQUE_AUTH_MODE` is set and not
     `none`): `bearer-token` → base64-decode the JWT payload
     (no verification, just the `exp` claim) and compare to
     now; `session-cookie` → presence check only (opaque
     cookies can't be liveness-checked without a full page
     fetch, which is `reader`'s job, not this script's);
     `shared-secret` / `preview-env` / `magic-link` →
     presence check only (static secret / URL, not a
     session).
   - Prints one line per checked secret (`live` / `dead` /
     `present (unverifiable)` / `missing`). Exit 0 if nothing
     is confirmed dead; exit 1 if anything is confirmed dead
     or missing while declared required.
   - Zero dependencies, ESM, CLI shape `node
     scripts/check-secrets-liveness.mjs` (mirrors
     `deploy-check.mjs`'s exit-code discipline: 0 clean, 1
     dead/missing, 2 n/a — no network at all if neither
     `GH_TOKEN` nor `CRITIQUE_AUTH_MODE` is set).
3. Wire:
   - `customization/auth-aware-critique.md` Pattern B step 4 —
     the promise prose becomes a real link to the shipped
     script; add `check-secrets-liveness.mjs` to the "What
     changes in the kit" section as the mechanical liveness
     check for `CRITIQUE_*`.
   - `playbooks/hands-off.md` Step 5.2 — add the two scripts
     alongside the existing `gh auth status` /
     `pnpm deploy:check` line as the automatable half of the
     ritual.
   - `templates/README.md` — layout tree `scripts/` entries +
     an adopt-by-need row (adopt when `Auth:` is not `none`).
   - Root `README.md` — templates tree `scripts/` list.

## Non-goals

- No change to `deploy-check.mjs` — deploy-provider liveness
  is already that script's job; duplicating it here would be
  two sources of truth for the same check.
- No live-fetch liveness check for `session-cookie` mode — an
  opaque cookie's validity can only be confirmed by actually
  hitting the app (a `reader` pass), which is out of scope for
  a zero-dependency, no-Chrome-tools script. Presence-only is
  an honest, documented limitation.
- No new `CRITIQUE_*` env vars — both scripts read the
  vocabulary `auth-aware-critique.md` already defines.
- No test file — matches `lint-migration.mjs` precedent (only
  `loop-issue.mjs`, the most stateful script, carries unit
  tests today).

## Decisions made upfront

- `check-secrets-liveness.mjs` treats "not configured" as
  informational, not a failure, when the credential class was
  never declared (mirrors `notify.mjs`'s "never a new failure
  mode for the undeclared case" posture) — it only fails loud
  when something *is* declared and confirmed dead/missing.
- JWT `exp` decode is base64-only, no signature verification —
  this script never authenticates as the user; it only reads
  a claim to estimate staleness. Documented inline so nobody
  mistakes it for a security check.
- `refresh-critique-session.mjs`'s `.env` writer is
  line-replace-or-append, never a full rewrite — keeps every
  other line (including comments) byte-identical, so a diff of
  `.env` after running it shows exactly one changed line.

## Definition of done

Gate green; both scripts shipped with inline usage docs;
linked from `customization/auth-aware-critique.md`,
`playbooks/hands-off.md`, `templates/README.md` (tree +
adopt-by-need table), and the root `README.md` tree; build
plan row `[x]` with commit hash.
