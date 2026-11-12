# `<SERVICE>` handshake — `<PROJECT>`

> A lighter runbook for a service that reduces to "create an
> account, hand over a few keys" — no RBAC, no webhooks, no
> branding. See `nexus/customization/external-services.md`
> for the rule that picks this profile over the full
> `NN_service.md` A-H walkthrough.
>
> **Account / Tenant:** `<account-identifier>`
> **Dashboard:** `<dashboard URL>`

---

## What `<PROJECT>` needs from `<SERVICE>`

- <capability 1, with the chunk that depends on it noted>
- <capability 2>
- <...>

---

## Dashboard handoff

1. Create an account at `<dashboard URL>`. (~2 min)
2. Create a new project named `<PROJECT>`. (~1 min)
3. Open **API keys** and generate a production key.
   (~1 min)
4. **DESTRUCTIVE:** revoke the sample key the signup flow
   auto-generates — it's unscoped, never expires on its
   own, and stays live anywhere it leaked until revoked.
   (~1 min)
5. Copy the production key and the project ID into the
   block below. (~1 min)

Drop these into `.env`:

```
<SERVICE>_API_KEY=<value from step 3>
<SERVICE>_PROJECT_ID=<value from step 2>
```

---

## Resume signal

Once the block above is in `.env`, tell the agent
`"<SERVICE> is in"`. Say it — don't just drop the file
silently. The agent is waiting on the phrase, not a file
watch, so it knows the handoff finished and it's safe to
resume.

---

## What the agent wires after the drop

Once `"<SERVICE> is in"` arrives, the agent:

1. Parses `<SERVICE>_API_KEY` and `<SERVICE>_PROJECT_ID`
   out of `.env`.
2. Propagates both to every deploy environment (Production,
   Preview, Development) — same propagation the full
   profile's Section H runs.
3. Runs the verification checklist below and reports the
   result before resuming the chunk that was blocked on
   this handoff.

```bash
# verify the key authenticates
curl -sf <SERVICE_URL>/health \
  -H "Authorization: Bearer $<SERVICE>_API_KEY" | jq .
```

- [ ] Health check returns 200.
- [ ] Env vars present in every deploy environment.
- [ ] Sample key confirmed revoked (dashboard "Activity
      log" shows no calls on it after step 4).

---

## See also

- `setup/00_files.md` — the index this runbook is listed
  in.
- `templates/setup/NN_service.md` — the full A-H profile,
  for services with real dashboard surface beyond
  generating keys.
- `nexus/customization/external-services.md` — the
  full-vs-handshake choosing rule.
