# Auth-aware critique

> **The problem.** `/critique`'s `reader` sub-agent visits the
> live site as a stranger. For a logged-in app, every URL
> renders the login page — so every finding becomes "the home
> page is a login form." The most important surfaces in the
> product become the ones critique can't see.
>
> **The fix.** A small `Auth:` field in `plan/bearings.md`
> tells `reader` how to establish a session before it walks
> the page set. Five patterns are documented; pick whichever
> matches your app. Findings carry an `auth_state` field so
> `/iterate` knows whether a finding came from the public or
> the logged-in surface.
>
> **Adopt-by-need.** If your app has no auth wall (or only a
> marketing-site critique pass), declare `Auth: none` and the
> field is a no-op. The wiring below only kicks in when you
> opt in.

## Why this is its own customization

The "five patterns" framing exists for the same reason
`customization/data-layer.md` has its A–E variants: the right
answer varies enormously by app shape, and the methodology
shouldn't pick for you.

- A SaaS with a real preview pipeline → likely **D**.
- A small app you control end-to-end → likely **C** (cleanest
  separation, no real credentials anywhere).
- A typical email/password app → likely **A** or **B**
  depending on whether you value E2E fidelity (A) or
  operational simplicity + cloud-loop compatibility (B).
- A passwordless app → **E** is the only honest answer.
- A B2B app with SSO → likely **B** (the IdP flow doesn't
  automate cleanly; pre-bake a session and rotate).

## The five patterns

| ID | How `reader` gets in | When it fits | Cloud-loop friendly? | Big risk |
|----|---|---|---|---|
| **A** | Test user + real login flow | Apps with simple email+password login; you want **true E2E fidelity** | Yes if Chrome tools are available; **no** for WebFetch fallback | Login flow flakes (CAPTCHAs, MFA, transient 5xx); test user pollutes prod data |
| **B** | Pre-baked session cookie / bearer token in `.env` | Most apps; you want **operational simplicity** that survives cloud loop runs | Yes — works through both Chrome tools *and* WebFetch | Tokens expire and need rotation; if leaked, full account access |
| **C** | Dev-mode impersonation header (`X-Critique-Bot: <secret>`) | Apps you control end-to-end; you want **the safest separation** | Yes | Requires app code change; the bypass itself must be locked down (only enabled outside prod, or only with a rotated secret) |
| **D** | Reader points at a preview/staging URL with relaxed auth | Apps with a real preview pipeline (Vercel previews, Netlify branch deploys, etc.) | Yes | Preview ≠ prod; you may miss bugs that only manifest with real prod data |
| **E** | Magic-link with mailbox poll | Passwordless-only apps | Painful — needs a mailbox API integration | Lots of moving parts; adds an external dependency |

### Pattern A — test user + real login flow

**Best for:** "I want critique to walk the same login flow my
real users walk. I'd rather catch a broken sign-in than save
20 seconds per pass."

How it works:

1. Provision a real user account in your app dedicated to
   critique. Keep it scoped read-only at the data layer if
   your app supports per-user permissions; if not, hand-curate
   the bot user's data so destructive clicks have minimal
   blast radius.
2. Store the credentials in `.env`:

   ```
   CRITIQUE_AUTH_MODE=test-user
   CRITIQUE_AUTH_LOGIN_URL=https://yourapp.example/login
   CRITIQUE_AUTH_USERNAME=critique-bot@example.com
   CRITIQUE_AUTH_PASSWORD=<long-random>
   CRITIQUE_AUTH_USERNAME_SELECTOR=input[name="email"]
   CRITIQUE_AUTH_PASSWORD_SELECTOR=input[name="password"]
   CRITIQUE_AUTH_SUBMIT_SELECTOR=button[type="submit"]
   CRITIQUE_AUTH_SUCCESS_SELECTOR=[data-testid="user-menu"]
   ```

3. `reader`'s Step 0 (when `CRITIQUE_AUTH_MODE=test-user`):
   navigate to the login URL, fill the selectors, submit,
   wait for the success selector to appear (or fail loudly).
   Then proceed to the page set.

**Strengths:** True E2E. Catches "we shipped a regression in
the sign-in form" before users do.

**Weaknesses:** Requires Chrome tools — won't work via
WebFetch, so cloud loop runs without a browser will fall back
or fail. CAPTCHAs and MFA break it; the bot user must be
exempted at the IdP level. If your login flow is itself
flaky, every critique pass inherits that flake.

### Pattern B — pre-baked session cookie / bearer token (default)

**Best for:** "I want critique to *just work* across local
browser runs and cloud loop runs alike. I'll deal with
session refresh out-of-band."

How it works:

1. Same bot user as Pattern A. Log in once as that user, in a
   real browser.
2. Export the session cookie (or bearer token, if your app uses
   one) from devtools. Store it:

   ```
   CRITIQUE_AUTH_MODE=session-cookie
   CRITIQUE_SESSION_COOKIE=name=value; another=value     # full Cookie header value
   # OR for bearer-token apps:
   # CRITIQUE_AUTH_MODE=bearer-token
   # CRITIQUE_BEARER_TOKEN=eyJ...
   ```

3. `reader`'s Step 0: build a `Cookie:` header (or
   `Authorization: Bearer ...`) from the env. Inject it on
   every request — both Chrome tools (`document.cookie =` or
   the `Cookie` request header) and WebFetch (the header
   parameter). No login flow runs.
4. Run [`nexus/templates/scripts/refresh-critique-session.mjs`](../templates/scripts/refresh-critique-session.mjs)
   after logging in once by hand — it prompts for the new
   cookie/token and writes it back to `.env`. Run it when the
   gate fails with 401/redirect-to-login.
   [`check-secrets-liveness.mjs`](../templates/scripts/check-secrets-liveness.mjs)
   catches a stale `CRITIQUE_BEARER_TOKEN` (JWT `exp` decode)
   before that happens — wire it into pre-flight per
   `playbooks/hands-off.md` Step 5.

**Strengths:** Works in both browser and WebFetch paths. No
login-flow flake. Cloud loop friendly.

**Weaknesses:** You skip the login flow entirely — a broken
sign-in form is invisible to critique under this pattern (so
ideally your e2e suite still walks the real flow). Sessions
expire (rotate days to weeks depending on your app); the
refresh is out-of-band and on you.

### Pattern C — dev-mode impersonation header

**Best for:** "I control the app code; I'd rather add a
small, locked-down bypass than ship a real session token to
my agent's environment."

How it works:

1. Add a server-side check: if request has header
   `X-Critique-Bot: <CRITIQUE_BOT_SECRET>`, treat the request
   as authenticated as a synthetic user. The synthetic user
   is read-only, scoped to representative data, and exists
   only when this header is present.
2. **Lock down the bypass.** At minimum:
   - Only enabled in non-prod environments, OR
   - Only honored when the secret matches a rotated env var
     that's never copied to client code, AND
   - Logged on every request so any abuse is visible.
3. Store the secret:

   ```
   CRITIQUE_AUTH_MODE=shared-secret
   CRITIQUE_BOT_HEADER=X-Critique-Bot
   CRITIQUE_BOT_SECRET=<long-random>
   ```

4. `reader`'s Step 0: read the header name + value, inject on
   every request. No session, no login flow.

**Strengths:** Safest separation. No real credentials
anywhere; the bot user is synthetic and unreachable except via
the header. Trivial to audit (one server-side check; one env
var). Survives session-expiry.

**Weaknesses:** Requires app code. If the bypass leaks (the
secret is exfiltrated, or the check is added in a place that
also runs in prod), it's a backdoor. Treat the secret like a
production credential.

### Pattern D — preview/staging environment with relaxed auth

**Best for:** "We already ship preview deploys per branch.
Auth there is open or trivially configured. Just point
critique at the preview."

How it works:

1. In `bearings.md`'s `Live at:` line, document both the prod
   URL *and* the preview URL critique should use.
2. Override the URL critique walks:

   ```
   CRITIQUE_AUTH_MODE=preview-env
   CRITIQUE_PREVIEW_URL=https://your-branch--your-app.preview.dev
   ```

3. `reader` walks `CRITIQUE_PREVIEW_URL` instead of the prod
   URL. Auth on the preview is whatever your preview pipeline
   does (often: open, or a basic-auth wall whose creds also
   live in `.env`).

**Strengths:** Zero credential management beyond the preview's
own scheme. Prod is never touched by the bot.

**Weaknesses:** Preview ≠ prod. Different DB, different data,
sometimes different feature flags. Findings can miss prod-only
regressions. Mitigate by occasionally running an anonymous
prod pass for surface-level checks even when authenticated
critique uses the preview.

### Pattern E — magic-link with mailbox poll

**Best for:** "Our app is passwordless. We don't have any
other option."

How it works:

1. Bot user's email is a dedicated mailbox you control via API
   (Gmail API with a service account, or a transactional
   service like Mailgun/Mailtrap with inbox-read access).
2. Login script: navigate to `/login`, enter the bot's email,
   submit, then poll the mailbox API for the magic link
   (filter by sender + recency), follow the link to establish
   the session, then proceed.
3. Store:

   ```
   CRITIQUE_AUTH_MODE=magic-link
   CRITIQUE_AUTH_LOGIN_URL=https://yourapp.example/login
   CRITIQUE_AUTH_USERNAME=critique-bot@yourdomain.example
   CRITIQUE_MAILBOX_API_URL=...
   CRITIQUE_MAILBOX_API_TOKEN=...
   ```

4. `reader`'s Step 0 runs the login script, then proceeds.

**Strengths:** Honest E2E for passwordless apps. The only
pattern that works without rewriting your auth model.

**Weaknesses:** Most moving parts of any pattern. External
dependency (mailbox API) that can fail independently. Polling
adds latency. Worth the cost only if the alternatives don't
fit.

## What changes in the kit

When you adopt this customization:

1. **`plan/bearings.md`** declares an `Auth:` field next to
   `Surface:`:

   ```
   Auth: none | test-user | session-cookie | bearer-token | shared-secret | preview-env | magic-link
   ```

   (`bearer-token` is a sub-mode of pattern B.) Same
   unconditional-gate posture as `Surface:` — no `--force`,
   no silent default to `none`. If the field is missing, the
   reader exits with `[needs-user-call]`.

2. **`reader`'s Step 0** branches on `Auth:`. If the value is
   `none`, anonymous walk as today. Otherwise, the
   pattern-specific sequence above runs *before* the page set
   is walked. If the auth handshake fails (login form
   missing, cookie rejected, header ignored), the pass exits
   with a single high-severity finding and does **not** fall
   back to anonymous.

3. **Findings carry `auth_state`** alongside `viewport`,
   `category`, `severity`, etc.:

   ```json
   {
     "url": "/dashboard",
     "viewport": "desktop",
     "auth_state": "authenticated:critique-bot",
     "category": "comprehension",
     ...
   }
   ```

   Values: `anonymous`, `authenticated:<role-or-username>`.
   `/iterate`'s scoring reads this — a finding from the
   logged-in surface usually scores higher than a finding
   from a public surface (your real users live behind the
   wall), but the loop now has the data to make that call.

4. **`/critique` invocation modes** when `Auth:` is set to
   anything other than `none`:

   - `/critique` — runs **both** an anonymous pass and an
     authenticated pass. The anonymous pass covers the
     marketing surface; the authenticated pass covers the
     app surface.
   - `/critique authenticated` — auth pass only.
   - `/critique anonymous` — anonymous pass only (the bot
     never logs in).
   - The page set differs per pass: anonymous walks
     marketing-side URLs (`/`, `/pricing`, `/about`); auth
     walks the app surface (`/dashboard`, `/settings`, the
     project's signature in-app views).

5. **`templates/env/env.example`** carries placeholder rows
   for each pattern (commented out). Adopt the section
   matching your `Auth:` value; leave the rest as docs.

6. **Two scripts ship alongside the customization**:
   `scripts/refresh-critique-session.mjs` (Pattern B session
   refresh — interactive, writes `.env` in place) and
   `scripts/check-secrets-liveness.mjs` (the mechanical
   liveness check for `CRITIQUE_*` — decodes a
   `CRITIQUE_BEARER_TOKEN`'s `exp` claim, presence-checks the
   rest). Neither runs unless `Auth:` is something other than
   `none`.

## Hard rules carried by the capability

1. **`Auth:` gate is unconditional.** No `--force`, no
   silent default, no anonymous fallback when auth was
   declared. If the handshake fails, the pass fails loudly.
2. **Bot account must not be able to write.** Either
   data-layer-enforced (preferred) or skill-enforced
   (`reader` refuses to click destructive elements — the
   default tooling already discourages this; this customization
   makes it a hard rule).
3. **No bot credentials in `git log`.** Only `.env`. The
   refresh script (Pattern B) prompts interactively; it
   doesn't read or write to git.
4. **Every finding carries `auth_state`.** Reader emits it;
   `/iterate` reads it; the scoring rubric weights it.
5. **Session refresh is out-of-band.** When a Pattern-B
   session expires, the loop stops the auth pass with a
   `[needs-user-call]` and continues with the anonymous pass
   only. The user runs the refresh script and the next tick
   resumes both passes.

## Failure modes

- **`Auth:` field missing.** Same posture as missing
  `Surface:` — exit with `[needs-user-call]`. Don't guess.
- **Pattern A login flow times out / fails.** One retry, then
  high-severity finding "auth: login flow broken at
  `<selector>`" filed to `CRITIQUE.md`. The pass exits
  without walking the page set.
- **Pattern B session rejected (401 / redirected to login).**
  Mark the session expired; file
  `[needs-user-call] auth: session refresh required`; skip
  the auth pass; continue anonymous if the invocation asks
  for it.
- **Pattern C header ignored** (server didn't honor it). Exit
  with `[needs-user-call] auth: bypass header not honored —
  check server-side check`. Do not fall back to anonymous.
- **Pattern D preview URL 404.** Exit with
  `[needs-user-call] auth: preview URL unreachable`.
- **Pattern E mailbox API down or magic link not received in
  60s.** One retry, then `[needs-user-call]`.
- **Bot user appears to have written data** (the loop
  observes its own state changing across passes). High-
  severity finding; pause auth passes until the user
  confirms the bot account is read-only.

## Recommended starting point

If you're not sure which pattern fits, start with **B
(session cookie)**. Reasons:

- Works through both Chrome tools and WebFetch — important if
  your loop runs in the cloud where Chrome may not be
  available.
- No app code change; minimal moving parts.
- The session-refresh ritual is small and infrequent.
- Easy to migrate from B to A later (you already have the
  bot user; you just add the login flow).

If you specifically want to catch **login-flow** regressions
(every commit could in principle break sign-in), reach for
**A** instead. The cost is operational fragility; the benefit
is real E2E fidelity.

If you control the app and want the **safest separation**,
**C** is the right call.

If you have **previews already**, **D** is the laziest
correct answer.

**E** is for passwordless apps and projects with a real
mailbox infrastructure. Pick it only when forced.

## Adopting the capability — checklist

1. Decide on a pattern. Read the relevant section above.
2. Add `Auth: <pattern>` to `plan/bearings.md`'s standing
   context section (same neighborhood as `Surface:`).
3. Provision the bot user (or the app-side bypass for C, or
   the preview URL for D). **Verify the bot account is
   read-only at the data layer.**
4. Populate the relevant `CRITIQUE_*` env vars in `.env`.
   `.env` is gitignored; never commit it.
5. The `reader` sub-agent template (shipped with this
   customization) reads `Auth:` and branches automatically.
   No code change in your skills; this all flows through
   `templates/claude/agents/reader.md`.
6. Run `/critique` once locally. Confirm findings carry
   `auth_state`. Confirm the auth pass walked your app
   surface (not the login page).
7. For Pattern B: write down somewhere ("session refreshed:
   <date>") so you know when to re-run the refresh script.
   Or wire a calendar reminder. The loop will tell you when
   it expires; better to refresh before that.

That's the full adoption.
