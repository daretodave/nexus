# identity/key-custody.md — the kit's own keys

> Which file holds nexus's own credentials, who minted
> them, what they can do, and when they expire — so a
> cloud tick never discovers a dead token mid-run.

---

See [`customization/secrets.md`](../customization/secrets.md)
for the manifest and the "names, never values" rule this
table follows: a value never appears below, only names,
dates and file paths. `templates/setup/00_keys.md` is the
adopter-facing twin of this file.

## Index

| Key | Holder file | Minted by | Scopes | Mirrored to | Expires | Rotate via |
|---|---|---|---|---|---|---|
| `GH_TOKEN` | `.env` (local ring), optional | `gh auth login` locally; the cloud loop sets it from `ACTIONS_PAT` | local: `gh auth login`'s defaults; cloud: `ACTIONS_PAT`'s scopes | local only; the cloud loop exports it as a job env var (no separate stored copy) | n/a | `node scripts/secrets.mjs set GH_TOKEN`, or re-mint `ACTIONS_PAT` (below) |
| `ACTIONS_PAT` | GitHub Actions secret (no local file) | https://github.com/settings/personal-access-tokens | Contents, Issues, Workflows read/write, this repo only (Contents added 2026-11-21; the token also carries Actions, Pull requests and Webhooks, which the loop does not need) | `github-actions` | none (no expiration date; read 2026-11-21) | Re-mint at the link above, then `node scripts/secrets.mjs set ACTIONS_PAT` and `push ACTIONS_PAT --to github-actions` |
| `CLAUDE_CODE_OAUTH_TOKEN` | GitHub Actions secret (repo secret, cloud loop only) | `claude setup-token` | n/a (loop sign-in, not a scoped grant) | `github-actions` only | n/a | Re-mint with `claude setup-token`, then `gh secret set CLAUDE_CODE_OAUTH_TOKEN` (not in the manifest; set directly) |

`ACTIONS_PAT`'s expiry and scopes are owner-only facts
(GitHub's token settings UI, not reachable from an automated
session); the owner read both on 2026-11-21. A token with no
expiration never trips `keys-audit --until`, so rotating it
is a decision, not a deadline. `GH_TOKEN` and `CLAUDE_CODE_OAUTH_TOKEN` carry no
fixed expiry to confirm.
