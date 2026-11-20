# 66 — Key custody map + hermetic keys lint

> One greppable, names-only answer to "which file holds this
> token, where is it mirrored, when does it expire" for every
> credential this repo (or an adopter's) depends on — so an
> unattended window never dies on a question the kit already
> had the answer to, just not written down in one place.

## Why

`agents.md`'s "Operational secrets" section already names
`GH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN` and `ACTIONS_PAT` in
prose — what each is for, where it's minted, which scopes it
carries — but nothing records *when* `ACTIONS_PAT` expires or
flags it before it does. `customization/secrets.md`'s
`nexus.secrets.json` manifest (adopter-facing, opt-in) comes
close: `name`, `for`, `where`, `destinations`, `provider`,
`chunk`, plus `secrets-audit.mjs`'s 90-day-since-last-set
rotation nudge. But a nudge keyed off "last set" is a proxy
for expiry, not the expiry date itself, and the manifest has
no field for "this value is mirrored in these N places, and a
rotation must reach all of them" beyond the push record
`secrets-sinks.mjs` already keeps per destination. A cloud
tick or a long unattended window that hits an expired
fine-grained PAT mid-run (the exact failure class
`ACTIONS_PAT` already lists three rediscoveries of in spec
65's sibling problem) has no single file to check first.

## Design

- A per-credential table — Key, Holder file (or vault ring),
  Minted by, Scopes, Mirrored to, Expires, Rotate via — read
  from, not parallel to, the existing
  `nexus.secrets.json` / `scripts/secrets-audit.mjs` system:
  the chunking session resolves whether `Expires` and `Rotate
  via` become new optional manifest fields (extending the
  shape in `customization/secrets.md`) or a separate
  `templates/setup/00_keys.md` index in the style of
  `templates/setup/00_files.md`, keyed by the manifest's
  existing `name`. Either way, a value never appears in the
  table — only names, dates and file paths, matching the
  manifest's existing "names, never values" rule.
- A pure-string lint (an opt-in leg, `templates/scripts/
  keys-audit.mjs` or folded into `scripts/secrets-audit.mjs`)
  that reads the table and flags, offline: an orphan row (a
  key no manifest entry or code reference names), a ghost
  entry (a manifest name with no custody row), and an
  ambiguous one (two rows claiming the same key). Gate failure
  on any of the three, wired into `node scripts/verify.mjs`'s
  `secrets` leg for the kit's own table and into the adopter
  template's own verify composition.
- `playbooks/hands-off.md`'s unattended-window pre-flight
  refuses to start a window whose custody table lists an
  `Expires` date before the window's own end time (an
  unattended run should never discover a dead credential
  mid-flight).
- `/bootstrap rotate` (if it exists yet when this chunks;
  else this scopes it) reads a row's `Mirrored to` as its
  propagation list, so rotating a value pushes it everywhere
  the table says it lives instead of leaving a stale copy in
  a sink `secrets-sinks.mjs` already pushed to once.
- The kit runs this on itself first: `agents.md`'s three
  operational secrets get custody rows (including
  `ACTIONS_PAT`'s actual expiry, confirmed from GitHub's token
  settings UI — the same open fact spec 65's A2 already
  needs), proving the shape before it ships to adopters.

**Resolved by this chunking session** (the Open questions
below): a separate index, not new manifest fields —
`nexus.secrets.json`'s shape, `plan-check.mjs`'s manifest gate
(`checkPlan`'s `secrets` check only matches a chunk's
`secrets:` name against the manifest's name set; it never
reads `Expires` or `Rotate via`) and every existing manifest
reader stay byte-for-byte unchanged. The index is two files,
one per audience: `templates/setup/00_keys.md` (adopters,
in `00_files.md`'s table style, keyed by the manifest's
`name`) and `identity/key-custody.md` (the kit's own —
`identity/` is kit-internal, never copied, so this carries no
template-API weight). `customization/secrets.md` gets a new
"Key custody" section naming the split and linking both. The
lint is `scripts/keys-audit.mjs` + `templates/scripts/
keys-audit.mjs` (not opt-in — folded into the existing
`secrets` leg of `node scripts/verify.mjs` for the kit's own
table, and a new checklist line in `customization/secrets.md`
for the adopter template's). `/bootstrap rotate` does not
exist yet, and no Acceptance bullet below names it, so
reading `Mirrored to` as a rotation's propagation list is
deferred — a candidate for `/expand`, not this spec's chunks.

## Acceptance

- **A5** The kit's own three operational secrets carry real
  custody rows, `ACTIONS_PAT`'s expiry confirmed from GitHub's
  UI rather than assumed.

## Open questions

(None — both resolved by this chunking session; see
Design's "Resolved by this chunking session" paragraph.)

## Chunks
Measure: 1 open · 4 closed · next A6

- [ ] **66.4** The kit's own three operational secrets carry
  real custody rows in `identity/key-custody.md` · S ·
  closes A5 · needs —
  - Owner-only fact: `ACTIONS_PAT`'s real expiry reads from
    GitHub's token settings UI, not reachable from an
    automated session — fill every other row and column, mark
    `Expires: unconfirmed` for it, and file the ask the way
    spec 65's A2 does (a `[needs-user-call]` row in
    `plan/AUDIT.md`, or `node scripts/secrets.mjs request`).
    `GH_TOKEN` (`gh auth login`'s own token) and
    `CLAUDE_CODE_OAUTH_TOKEN` (the loop's sign-in, not a
    project secret per `nexus.secrets.json`'s own `about`
    line) carry no fixed expiry to confirm.
