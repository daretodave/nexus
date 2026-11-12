# 65 — Workflow-push credential gap: test the fix, stop re-discovering it

> Three closed issues (`#35`, `#40`, `#49`) each rediscovered the
> same fact and worked around it instead of fixing it: a cloud
> tick's `git push` on `.github/workflows/*.yml` is rejected
> because the Claude Code Action's own GitHub App installation
> token overrides the configured `ACTIONS_PAT` credential for
> workflow-file pushes specifically, regardless of `ACTIONS_PAT`'s
> granted scope. Test the two live hypotheses from a local
> session; land the fix if one works, or record that neither
> does so the open question closes instead of waiting to be
> rediscovered a fourth time.

## Why

`agents.md` ("Operational secrets") and
`.github/CLOUD_LOOP.md` ("`git push` rejected on a
`.github/workflows/*.yml` edit") both already document the
symptom and the workaround — hold workflow-touching chunks for
a local session (`skills/ship-a-chunk.md` §6 item 5) — so the
kit no longer loses a built-and-verified chunk to this each
time. What's still missing is the diagnosis: `#35`'s own
`next` field named two live hypotheses (the Action overwrites
the checkout-configured git credential before the agent's turn
starts, or `ACTIONS_PAT` doesn't actually carry `workflows`
scope despite the 2026-08-23 re-mint) and no session has tested
either. Until one is tested, every future `.github/workflows/`
chunk keeps paying the hold-for-local-session tax even if a
one-line fix would remove it.

## Design

- A local/human session (normal repo-write creds, not the
  Action's own App token) tests hypothesis (a): whether
  `git remote set-url origin
  https://x-access-token:${ACTIONS_PAT}@github.com/<org>/<repo>.git`
  (or an `http.extraheader` carrying the PAT) set immediately
  before the push step forces the PAT's credential over the
  Action's installation token, against a real
  `.github/workflows/*.yml` diff.
- The same session confirms hypothesis (b): `ACTIONS_PAT`'s
  actual granted scopes, read from GitHub's token settings UI
  (not assumed from the mint-time request).
- **If (a) fixes it:** land the explicit remote-credential step
  in `.github/workflows/march.yml` and
  `templates/.github/workflows/march.yml` (and `heartbeat.yml`
  in both locations, if it ever pushes). Then retire the
  hold-for-local-session branch it replaces:
  `skills/ship-a-chunk.md` §6 item 5 and the matching
  `.github/CLOUD_LOOP.md` troubleshooting entry both go, or are
  rewritten to say the gap is closed.
- **If neither hypothesis yields a fix:** the existing fallback
  (already live in `skills/ship-a-chunk.md` and
  `.github/CLOUD_LOOP.md`) stays as the standing answer; this
  chunk's only output is the recorded negative result (a line
  in `plan/AUDIT.md` or this spec's own close, whichever lands
  first), so a future tick's `/expand` doesn't re-score the same
  open question as a fresh signal.

## Acceptance

- **A1** A local session has tested hypothesis (a) — an
  explicit remote-credential override set immediately before
  the push step — against a real `.github/workflows/*.yml`
  diff, and the result (forced the PAT's credential, or didn't)
  is recorded.
- **A2** `ACTIONS_PAT`'s actual granted scopes are confirmed
  from GitHub's token settings UI and recorded.
- **A3** If A1 found a fix: `.github/workflows/march.yml` and
  `templates/.github/workflows/march.yml` (and `heartbeat.yml`
  in both locations, if applicable) carry the explicit
  remote-credential step, and `skills/ship-a-chunk.md` §6 item
  5 plus the matching `.github/CLOUD_LOOP.md` entry are updated
  or removed to match.
- **A4** If A1 found no fix: the negative result is recorded
  (`plan/AUDIT.md` or this spec's close note) so the question
  reads as settled, not open, for future `/expand` passes.

## Open questions

(None — the design branches on A1/A2's result, which is the
point of the chunk.)

## Chunks
Measure: 4 open · 0 closed · next A5

Not chunked yet.
