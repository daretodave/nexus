# 54 — The model and effort are visible and chosen

> Every session shows the model and effort it runs on,
> Settings chooses both for new sessions, a running session
> can switch them, and the helpers' model is named.

## Why

A user asked: "where do i see what model its running?" Nowhere;
and the owner added effort.
Hosted sessions pass no `model` to the Agent SDK, so they run on
whatever Claude Code resolves for the login (`/model`,
`~/.claude/settings.json`'s `model`, else the plan's default);
the GUI's helpers (Explode, the Plan board's AI summaries) use
Haiku (`SUMMARY_MODEL`); none of it is shown, and nothing chooses.

## Design

- **Shown.** The SDK's init message names the session's model;
  the cockpit's top bar shows it as a badge ("Opus 5.5"), and
  Fleet tiles show it small. A model not yet known reads
  "model: starting…".
- **Chosen.** Settings → "Model for new sessions": Claude Code's
  default (labelled with what it resolved to on the last
  session, when known), Fable 5.1, Opus 5.5, Sonnet 5.5,
  Haiku 5.5 (ids `claude-fable-5-1`, `claude-opus-5-5`,
  `claude-sonnet-5-5`, `claude-haiku-5-5`; one list in one
  place). Saved per checkout in prefs, passed as the SDK's
  `model` option when a session starts; Claude Code's default
  passes none.
- **Switched.** The cockpit's model badge opens the same list;
  a pick applies to that session from its next turn through the
  SDK query's `setModel`, and says so; the badge updates when
  the SDK confirms.
- **Effort beside the model.** The badge reads "Opus 5.5 · high".
  Settings → "Effort for new sessions": Claude Code's default,
  low, medium, high, xhigh, max, limited to the levels the
  chosen model supports (the SDK's `supportedModels()` lists
  `supportedEffortLevels`); passed as the SDK's `effort` option
  at start; switched mid-session through the query's
  `applyFlagSettings({ effortLevel })` from the same badge menu.
  A model without effort support shows no effort and offers none.
- **Named helpers.** Settings shows "Explode and summaries:
  Haiku 5.5".

## Acceptance

- **A1** The cockpit's top bar and Fleet tiles show each hosted session's model and effort from the SDK; Settings sets "Effort for new sessions" limited to the chosen model's supported levels, and the badge switches a running session's effort; Settings sets "Model for new sessions" (Claude Code's default, Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5) per checkout and a new session starts on it; the cockpit's badge switches a running session's model from its next turn; Settings names the helpers' model. Checked live against a scratch repo: pick Haiku 5.5, start a session, the badge reads Haiku 5.5; switch it to Sonnet 5.5 in the cockpit, the next turn's init or status confirms it; set effort to low, the badge reads low.

## Open questions

(None.)

## Chunks
Measure: 1 open · 0 closed · next A2

- [ ] **54.1** The model and effort are shown, chosen and switched · M · closes A1 · needs —
