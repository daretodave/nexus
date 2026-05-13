# `<PROJECT>` — external service setup index

> One runbook per external service. Pre-flighted upfront so
> `/march` can run unattended for long windows without
> hitting a "configure this in the dashboard" wall.
>
> Convention: `00_files.md` is this index. Each service gets
> a numbered runbook (`NN_<service>.md`). Numbers reflect
> setup dependency order — do them top to bottom on a fresh
> machine.

See `nexus/customization/external-services.md` (sibling
layout) or `.nexus/customization/external-services.md`
(submoduled) for the convention this template implements.

---

## Status legend

- **`OK`** — runbook complete, all dashboard config done,
  all env vars wired
- **`PARTIAL`** — runbook complete, some dashboard config
  still pending
- **`STUB`** — runbook stubbed, not yet written
- **`—`** — not yet planned

---

## Bootstrap automation

Most rows in this index are scriptable end-to-end by
`/bootstrap` (see
[`nexus/customization/bootstrap-automation.md`](../../customization/bootstrap-automation.md)).
Each `NN_<service>.md` runbook lists which sections are
`Automated by /bootstrap` near the top. Sections that
require a human (DNS, OAuth approvals, billing) appear as
handoffs during the bootstrap run and as `[needs-user-call]`
rows in `plan/AUDIT.md` if deferred.

`/bootstrap status` is the read-only diagnostic — safe to
run any time, including inside `/oversight`.

---

## Index

| # | Service | Runbook | Status | Phases that touch it |
|---|---|---|---|---|
| 01 | GitHub | `01_github.md` | `STUB` | substrate, all (push), `/triage` (issues), cloud loop |
| 02 | <HOSTING_PROVIDER> | `02_<hosting>.md` | `STUB` | phase 1 (deploy gate), all (deploys), Preview env |
| 03 | <DB_PROVIDER> | `03_<db>.md` | `STUB` | phase 1 (client), <PHASE_N> (writes), <PHASE_M> (RLS) |
| 04 | <AUTH_PROVIDER> | `04_<auth>.md` | `STUB` | phase <N> (auth), <N+1> (tiers), <N+2> (RBAC) |
| 05 | <EMAIL_PROVIDER> | `05_<email>.md` | `STUB` | phase <N> (magic link delivery) |
| 06 | <AI_PROVIDER> | `06_<ai>.md` | `STUB` | phase <N> (moderation pre-filter) |
|  | <add more rows as the build plan grows> |  |  |  |

> Drop any row that doesn't apply to this project. Renumber
> to keep dependency order. The minimum is GitHub + hosting;
> everything else is project-specific.

---

## Per-service quick reference

A short block per row in the index. The runbook itself
(`NN_<service>.md`) is the source of truth; this is the
glanceable summary `/oversight` reads.

### 01 — GitHub `<STATUS>`
**Runbook:** `01_github.md` or "not written yet"
**Will cover:** repo creation, branch protection rules,
GitHub App for `/triage` (or PAT scopes), Actions secrets
for the cloud loop, default labels for triage routing.
**`.env`:** `GH_TOKEN`
**Status:** <one-line summary, e.g. "PAT in `.env` OK — repo
+ branch protection + labels TODO.">

### 02 — <HOSTING_PROVIDER> `<STATUS>`
**Runbook:** `02_<hosting>.md` or "not written yet"
**Will cover:** project creation, team membership, custom
domain, env-var propagation across Production + Preview +
Development, deploy hooks, deploy notifications, build cache.
**`.env`:** <list provider env vars>
**Status:** <one-line summary>

### 03 — <DB_PROVIDER> `<STATUS>`
**Runbook:** `03_<db>.md` or "not written yet"
**Will cover:** project creation, schema migrations
(versioned `.sql` files), RLS policies per table, storage
buckets if any, scheduled jobs, backup cadence, PITR
posture.
**`.env`:** <list DB env vars>
**Status:** <one-line summary>

### 04 — <AUTH_PROVIDER> `<STATUS>`
**Runbook:** `04_<auth>.md` or "not written yet"
**Will cover:** tenant settings, app config, API + audience
+ permissions, RBAC + roles, magic-link / passwordless,
universal login branding, email templates, attack
protection, custom claims, env-var propagation.
**`.env`:** <list auth env vars>
**Status:** <one-line summary>

### 05 — <EMAIL_PROVIDER> `<STATUS>`
**Runbook:** `05_<email>.md` or "not written yet"
**Will cover:** account, domain verification (SPF + DKIM +
DMARC DNS records), API key, auth provider SMTP wiring,
deliverability monitoring, bounce/complaint webhook,
transactional vs marketing separation.
**`.env`:** <list email env vars>
**Status:** <one-line summary>

### 06 — <AI_PROVIDER> `<STATUS>`
**Runbook:** `06_<ai>.md` or "not written yet"
**Will cover:** API key, org settings, spend limit + usage
alerts, model selection rationale, rate-limit headroom,
structured-output schemas if used.
**`.env`:** <list AI env vars>
**Status:** <one-line summary>

---

## Loop interaction

When `/oversight` runs, it should:

1. Read this index.
2. For each row, confirm the env vars listed actually exist
   in `.env` (and in the deploy platform's env table for
   cloud environments).
3. For `PARTIAL` rows, surface a flag: "service N is
   partially configured; verify Section X is done before
   phase Y ships."
4. For `STUB` rows whose phase is in the next 3 pending
   phases, surface as `[needs-user-call]` in
   `plan/AUDIT.md`.

This makes external-service drift visible to the loop
without dashboard access.

---

## Pre-flight before unattended runs

Before walking away for a Level 3–4 window (see
[`../intervention-spectrum.md`](../../intervention-spectrum.md)):

- [ ] Every service touching the next 5 pending phases is
      `OK`.
- [ ] Each `OK` service's verification checklist (bottom of
      its runbook) passes a spot-check.
- [ ] Every env var in every Section H is present in every
      deploy environment.
- [ ] Every runbook's "manual post-launch action" list is
      empty.

---

## See also

- `templates/setup/NN_service.md` — the per-service runbook
  template.
- `nexus/customization/external-services.md` — the
  convention.
- `intervention-spectrum.md` — Level 3 prerequisite + Level
  4 pre-flight item 8.
- `plan/bearings.md` — External services table (the
  per-runbook with last-verified date).
