# `<SERVICE>` setup — `<PROJECT>`

> Complete dashboard configuration to support every phase
> that will ever touch `<SERVICE>` — not just today's phase.
> Pre-flighted upfront so `/march` can run unattended without
> hitting a "configure this in the dashboard" wall.
>
> **Account / Tenant:** `<account-identifier>`
> **Region:** `<region if applicable>`
> **Dashboard:** `<dashboard URL>`

See `nexus/customization/external-services.md` (sibling
layout) or `.nexus/customization/external-services.md`
(submoduled) for why this runbook exists and how the loop
reads it.

---

## What `<PROJECT>` needs from `<SERVICE>`

- <capability 1, with the phase that depends on it noted>
- <capability 2>
- <capability 3>
- <...>

## What `<SERVICE>` is NOT doing (deferred or punted)

- <thing 1 you deliberately punted; spec section if relevant>
- <thing 2>
- <...>

Future-you needs to distinguish "punted" from "broken." If
something's missing later, this list is the audit trail of
what was an intentional choice.

---

## Section A — Tenant / Account settings

Path: `<dashboard path>`

- [ ] **Field name:** `<value>`
- [ ] **Field name:** `<value>`
- [ ] **Critical:** `<value with the "← critical" annotation
      explaining why>`
- [ ] **Field name:** `<value>`

Path: `<another dashboard path>`

- [ ] **Field name:** `<value>`
- [ ] **Field name:** `<value>`

---

## Section B — Application / Project config

Path: `<dashboard path>`

- [ ] **Field name:** `<value>`
- [ ] **Callback URLs:**
      ```
      http://localhost:<PORT>/<callback-path>,
      <HOSTING_URL>/<callback-path>,
      https://<HOSTING_PROVIDER_PREVIEW_PATTERN>/<callback-path>,
      <CUSTOM_DOMAIN>/<callback-path>
      ```
- [ ] **Allowed origins:** <same shape>
- [ ] **Grant types / scopes / methods:** <check / uncheck>

Path: `<advanced settings path>`

- [ ] **Field name:** `<value>`
- [ ] **Token / session lifetime:** `<value>` (`<unit>`)

---

## Section C — API / Auth config (if applicable)

Path: `<API dashboard path>`

- [ ] **Identifier / audience:** `<value>`
- [ ] **Token expiration:** `<value>`
- [ ] **Algorithm:** `<RS256 / HS256 / etc.>`

Path: `Permissions tab`

| Permission | Description |
|---|---|
| `<perm:1>` | <what it gates> |
| `<perm:2>` | <what it gates> |
| `<perm:3>` | <what it gates> |

Path: `RBAC settings`

- [ ] **Enable RBAC:** ON
- [ ] **Add permissions in token:** ON ← critical for the
      RBAC gate to work without a DB round-trip

> Skip this section entirely if `<SERVICE>` doesn't provide
> an API / token surface.

---

## Section D — Branding / UI customization

Path: `<branding dashboard path>`

- [ ] **Logo:** upload <PROJECT> sigil (~<size> PNG)
- [ ] **Primary color:** `<#hex>` (matches
      `design/tokens.css` → `--color-accent`)
- [ ] **Background color:** `<#hex>` (matches
      `design/tokens.css` → `--color-ink`)
- [ ] **Email template subject:** `<value>`
- [ ] **Email template body:** <see `design/decisions.md`
      for the voice; default works if not yet branded>

> Skip if `<SERVICE>` doesn't render any user-visible UI
> (a CDN, a webhook target, an internal service).

---

## Section E — Security / attack protection

Path: `<security dashboard path>`

- [ ] **Bot detection / CAPTCHA:** ON
- [ ] **IP throttling:** `<requests per window>`
- [ ] **Brute-force protection:** ON
- [ ] **Suspicious IP blocking:** ON (mode: `<mode>`)
- [ ] **Breached password detection:** <if available>

---

## Section F — Roles / RBAC / permissions

Path: `<roles dashboard path>`

| Role | Permissions | Granted to |
|---|---|---|
| `admin` | every permission | <user-id-1>, post-launch only |
| `mod` | `mod:read`, `mod:approve`, `mod:remove` | granted manually |
| `<role>` | `<perms>` | <how it's assigned> |

- [ ] Roles created.
- [ ] Permissions assigned to roles.
- [ ] Admin role granted to <user identifiers>.

> Skip if `<SERVICE>` doesn't have roles.

---

## Section G — Webhooks / Actions / Triggers

Path: `<hooks dashboard path>`

- [ ] **Hook name:** `<hook-name>`
  - **Trigger:** `<event>`
  - **URL:** `<HOSTING_URL>/api/<endpoint>`
  - **Secret:** generate and store in `.env` as
    `<SERVICE>_WEBHOOK_SECRET`
  - **Active:** ON

- [ ] **Custom action / function:** `<name>` (if service
      supports inline functions, e.g. Auth0 Actions)
  - Source: `<path in repo>` or "inline; pasted below"
  - Triggers on: `<event>`

> Skip if `<SERVICE>` is purely API-consumed (no hooks
> fire back into the project).

---

## Section H — Environment variable propagation

For each deploy environment (Production, Preview,
Development), set the following:

| Env var | Production | Preview | Development | Notes |
|---|---|---|---|---|
| `<SERVICE>_API_KEY` | OK | OK | OK | Same value across envs unless service supports per-env keys |
| `<SERVICE>_URL` | OK | OK | OK | Per-env if service provides preview endpoints |
| `<SERVICE>_SECRET` | OK | OK | OK | **Server-only** — never `NEXT_PUBLIC_*` |
| `NEXT_PUBLIC_<SERVICE>_KEY` | OK | OK | OK | Public; safe to expose |

- [ ] Production env vars set in <HOSTING_PROVIDER>
      dashboard.
- [ ] Preview env vars set.
- [ ] Development env vars set.
- [ ] Local `.env.example` updated with every key (no
      values).
- [ ] Local `.env` populated.

---

## Anonymous / unauthenticated handling

> If `<SERVICE>` doesn't natively support unauthenticated
> access (Auth0 doesn't; some services do), document the
> workaround here.

<workaround description — e.g. "use a server-set HttpOnly
cookie + a row in the DB's `sessions` table for anon
sessions; the auth provider sees nothing for anon users.">

---

## What requires manual post-launch action

- [ ] <action 1 — e.g. "grant admin role to specific email">
- [ ] <action 2 — e.g. "set custom domain DNS records">
- [ ] <action 3 — e.g. "confirm billing threshold email">

These are the things the loop *cannot* do for you. Walk this
list before walking away for a Level 3–4 window.

---

## Verification checklist

> Terminal-runnable curls / dashboard URLs the loop or a
> human can spot-check.

```bash
# 1. Verify the auth endpoint responds correctly
curl -sf <SERVICE_URL>/health | jq .

# 2. Verify a token can be minted with the right audience
curl -sf -X POST <TOKEN_ENDPOINT> \
  -d "grant_type=client_credentials" \
  -d "client_id=$<SERVICE>_CLIENT_ID" \
  -d "client_secret=$<SERVICE>_CLIENT_SECRET" \
  -d "audience=$<SERVICE>_AUDIENCE" \
  | jq -r .access_token | head -c 40 ; echo

# 3. Verify the deploy environment has the env vars
<HOSTING_PROVIDER_CLI> env ls | grep <SERVICE>
```

- [ ] Health check returns 200.
- [ ] Token mints with expected audience.
- [ ] Env vars present in every deploy environment.
- [ ] Dashboard "Activity log" / "Audit" page shows no
      misconfiguration warnings for the last 24h.

---

## See also

- `setup/00_files.md` — the index this runbook is listed in.
- `nexus/customization/external-services.md` — the
  convention.
- `plan/bearings.md` — External services table row pointing
  here.
