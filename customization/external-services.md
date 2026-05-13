# Customization: external services

> The single highest-leverage addition for genuine
> unattended-loop autonomy. **Every external service the
> project depends on gets a runbook in `setup/` *before*
> phase 1 ships** — not just the minimum to run locally,
> but every dashboard click for every phase that will ever
> touch it. The loop reads the runbook index every
> `/oversight` tick and surfaces drift before it becomes
> a stall.

> **Pair with [`bootstrap-automation.md`](./bootstrap-automation.md).**
> Where this customization defines the *runbooks* (the
> intent + audit trail), the bootstrap layer defines the
> *executor* (the script that drives provider CLIs and
> propagates secrets). Adopt both for the full path:
> runbooks document what should be true; `/bootstrap`
> makes it true.
>
> The framing: at Level 0–1 you click around dashboards as
> you build. At Level 3–4 you can't — the loop has no
> dashboard access. Anything the loop will eventually need,
> it needs configured *now*, while the human is at the
> keyboard.

This is the difference between a clean 80-hour weekend run
and a Monday-morning stall on "phase 11 needs RBAC enabled
on the Auth0 API."

---

## When to adopt this customization

Adopt when **any** of these apply:

- The project will use an external auth provider (Auth0,
  Clerk, Supabase Auth, next-auth).
- The project will use a managed database (Supabase, Neon,
  Turso, PlanetScale, Firebase).
- The project will use a payment processor (Stripe, Lemon
  Squeezy, Paddle).
- The project will use an email service (Resend, Postmark,
  SendGrid).
- The project will use an AI API (OpenAI, Anthropic) with
  spend limits / quota considerations.
- The project will use any third-party service the loop
  cannot dashboard-click on its own.

Skip this customization only when the project is genuinely
hermetic (no external services beyond hosting itself).

---

## The convention — a `setup/` directory

Every external service gets its own numbered runbook in
`setup/`. A `00_files.md` index lists every service, its
runbook path, the env vars it owns, and a status.

```
<repo>/
├── setup/
│   ├── 00_files.md             # the index (manifest)
│   ├── 01_github.md            # service runbooks, numbered
│   ├── 02_<hosting-provider>.md
│   ├── 03_<db-provider>.md
│   ├── 04_<auth-provider>.md
│   ├── 05_<email-provider>.md
│   └── ...
```

Numbers reflect **setup dependency order** — on a fresh
machine, you walk top to bottom. GitHub before hosting
(hosting needs a repo), hosting before DB (the DB env vars
land in hosting), DB before auth (auth often uses the DB),
auth before email (auth's magic-link needs email DNS).

### Status legend

Every row in `00_files.md` carries a status glyph:

- **`OK`** — runbook complete, all dashboard config done,
  all env vars wired
- **`PARTIAL`** — runbook complete, some dashboard config
  pending
- **`STUB`** — runbook stubbed, not yet written
- **`—`** — not yet planned

(Use `OK` / `PARTIAL` / `STUB` as text glyphs; some
projects substitute Unicode marks. Stay consistent within
the repo.)

---

## What each service runbook covers

A runbook isn't "the minimum to run locally." It's "every
dashboard click for every phase that will ever touch this
service." The shape:

1. **What the project needs from the service.** Bullet list
   of capabilities the project requires (magic-link auth,
   JWT-with-custom-claims, RBAC with one role, etc.).
2. **What the service is NOT doing.** Capabilities you
   deliberately deferred (social login, MFA, custom domain,
   etc.). Future-you needs to know what's punted vs.
   broken.
3. **Sections A–H** of dashboard configuration:
   - **A — Tenant / Account.** Org settings, defaults,
     friendly name, contact email.
   - **B — Application / Project config.** Per-app callback
     URLs, allowed origins, grant types.
   - **C — API / Auth config** (if applicable). Audience,
     token lifetimes, signing algorithm, RBAC settings.
   - **D — Branding / UI customization.** Logo, palette,
     email templates.
   - **E — Security / attack protection.** Bot detection,
     IP throttling, brute-force protection.
   - **F — Roles / RBAC / permissions.** Every role and
     permission the project will ever check.
   - **G — Webhooks / Actions / Triggers.** Server-side
     hooks the service fires.
   - **H — Environment variable propagation.** A table of
     which env vars land in which deploy environments
     (Production, Preview, Development).
4. **Anonymous / unauthenticated handling.** If the service
   doesn't natively support unauthenticated access (Auth0
   doesn't; some services do), document the workaround.
5. **What requires manual post-launch action.** Granting
   roles to specific users, custom domain setup, billing
   threshold confirmations.
6. **Verification checklist.** Terminal-runnable curls or
   dashboard URLs to spot-check the configuration.

The generic template lives at
[`../templates/setup/NN_service.md`](../templates/setup/NN_service.md).
Copy it once per service.

Not every service uses every section. Drop the ones that
don't apply (a hosting provider doesn't have RBAC; a CDN
doesn't have webhooks). Don't pad.

---

## How the loop reads this

### `/oversight` reads the index

Every `/oversight` tick should:

1. Read `setup/00_files.md`.
2. For each row, confirm the env vars listed actually exist
   in `.env` (or the deploy platform's env table, for cloud
   environments).
3. For `PARTIAL` rows, surface a flag: "service N is
   partially configured; verify Section X is done before
   phase Y ships."
4. For `STUB` rows whose phase is in the next 3 pending
   phases, surface as `[needs-user-call]` in
   `plan/AUDIT.md`.

This makes external-service drift visible to the loop
without dashboard access.

### `/march` references it indirectly

`/march` doesn't read the index directly. But the next
`/oversight` does, and `/oversight` writes
`[needs-user-call]` rows that `/march` respects — when a
needs-user-call points at the next pending phase,
`/march` should not dispatch into that phase. It dispatches
elsewhere (audit, critique, data) until the user resolves.

### `/expand` respects it

When `/expand` proposes a new phase candidate that touches
a new external service, the candidate's brief should
include a "Runbook to write before this phase ships:
`setup/NN_<service>.md`" line. The candidate stays in
`PHASE_CANDIDATES.md` until that runbook exists.

---

## Per-service runbook authoring — workflow

When the project decides to adopt a new service:

1. **Add the row** to `setup/00_files.md` with status
   `STUB`. Commit.
2. **Copy** `templates/setup/NN_service.md` to
   `setup/NN_<service>.md`. Renumber as needed (keep
   dependency order).
3. **Walk the dashboard yourself.** Click through every
   section the project will need across the *whole* build
   plan — not just today's phase. Check off each item as
   you go. The runbook is the audit trail.
4. **Wire env vars to `.env.example`.** Every env var the
   runbook produces lands in `.env.example` with a comment
   pointing back to the runbook section that emits it.
5. **Propagate to deploy environments.** Section H of the
   runbook covers Production, Preview, Development. Walk
   each.
6. **Update status** in `setup/00_files.md` to `OK` (or
   `PARTIAL` if you deliberately deferred parts).
7. **Add to bearings.** The `External services` table in
   `plan/bearings.md` gets one row per service with the
   runbook path and a "last verified" date.

When you come back to the runbook six months later to add
a new feature, you walk the same checklist and add the new
section. The runbook is the project's institutional memory
for that service.

---

## Hard rules

1. **No env var enters production without entering the
   runbook first.** A service's `.env` keys must be traceable
   back to a runbook section. Otherwise the next person on
   the project has no idea where it came from.
2. **`STUB` runbooks must exist before phase 1.** Even if
   you haven't walked the service yet, the file should be in
   the repo so the loop knows the dependency exists.
3. **Runbooks live in the project repo, not in a wiki.** The
   loop reads them. A wiki link doesn't survive `/oversight`.
4. **Status is honest.** If you deferred half the dashboard
   work, the row says `PARTIAL`, not `OK`. The loop trusts
   the status; lying breaks the contract.
5. **Update status in the same commit as the dashboard
   change.** The runbook lives next to the work; status
   drift in the index breaks the loop's introspection.

---

## Failure modes

- **Service requires interactive verification (Stripe, Auth0
  email DNS verification).** The runbook flags this clearly
  ("step requires the human's email inbox + DNS access").
  The loop sees the `[needs-user-call]` and skips the
  dependent phase.
- **Service rate-limits config changes.** Some providers
  (Auth0 in particular) rate-limit API config calls. Keep
  the runbook dashboard-clicks-only unless the service has
  a stable Terraform / config-as-code path.
- **The runbook drifts from the dashboard.** Every
  `/oversight` should run a spot-check on at least one
  `OK` runbook's verification checklist. If the spot-check
  fails, the row drops to `PARTIAL` and a `[needs-user-call]`
  fires.
- **A service is unused after a pivot.** Mark the runbook
  `DEPRECATED` (separate status) and move to
  `setup/archive/`. Don't delete — the audit trail is
  valuable for the next adopter.

---

## Pre-flighting before unattended runs

Before invoking `/loop /march` and walking away for an
80-hour window:

1. Read `setup/00_files.md`. Every row covering a service
   in the next 5 pending phases must be `OK`.
2. For each `OK` row, run its verification checklist (the
   terminal curls / dashboard URLs at the bottom of the
   runbook). Spot-check that the live state matches what the
   runbook claims.
3. Confirm every env var in every runbook's Section H is
   present in the deploy platform's env table for
   Production, Preview, Development.
4. Confirm the runbook's "manual post-launch action" list
   is empty (or has every action done, with a date).

This is item 8 of the Level 4 pre-flight checklist in
[`../intervention-spectrum.md`](../intervention-spectrum.md).
Without it, Levels 3–4 are aspirational; with it, they're
actually reachable.

---

## See also

- [`./bootstrap-automation.md`](./bootstrap-automation.md)
  — the executor layer that drives provider CLIs to make
  the runbooks come true.
- [`../templates/setup/00_files.md`](../templates/setup/00_files.md)
  — the manifest template.
- [`../templates/setup/NN_service.md`](../templates/setup/NN_service.md)
  — the per-service runbook template.
- [`../intervention-spectrum.md`](../intervention-spectrum.md)
  — Level 3 prerequisite and Level 4 pre-flight item 8
  reference this customization.
- [`../templates/plan/bearings.md`](../templates/plan/bearings.md)
  — `External services` table template (one row per service,
  with runbook path and last-verified date).
- [`../playbooks/new-project.md`](../playbooks/new-project.md)
  — Day-1 checklist references this customization.
