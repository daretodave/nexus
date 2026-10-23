# 53 — Plan answers go back to the session that asked

> Answers to a spec's Open questions are kept as they are
> given, take the defaults the questions name, and go back to
> the session that asked, together, with one Continue.

## Why

Issues #81, #82 and #83 (2026-10-22), all on Oversight's "In
the plan" questions (a spec's Open questions, written by a
`/plot` or `/messy` session that then waits):

- **#81:** questions read "Default if unanswered: …", but
  Batch-answer with defaults stays disabled: 47.8's detector
  knows "Recommendation:", "Default:" and "(recommended)" only.
- **#82:** answers sent, then a tab change: all lost. Each plan
  answer is posted alone (`POST /api/oversight/answer`) as its
  own `/oversight` prompt to the hidden home session, and the
  answered state lives only in the browser; the plan file still
  lists the question, so a reload shows it open again.
- **#83:** all five answered, no Continue: nothing hands the
  answers back to the session that asked, which sits waiting
  ("Your message didn't come with any answers I can see").

## Design

- **Kept as given.** A plan answer is recorded on the server at
  once (`.nexus/answers.json` under the primary checkout, keyed
  by `file:line` and the question text), shown "answered · not
  sent yet" across reloads and tabs, editable until sent, and
  dropped once the plan no longer lists the question.
- **Defaults the question names.** The detector reads "Default
  if unanswered:", "Default:", "Defaults to", "(default)",
  "Recommendation:" and "(recommended)" (bold or not) and takes
  the rest of that sentence as the default; Batch-answer with
  defaults fills only unanswered ones.
- **One Continue, to the asker.** Each spec group in "In the
  plan" has a bar: "Send N answers to <session> and continue",
  live from the first answer (partial sends allowed, the rest
  left open or at their defaults by choice). It sends one
  message (`answersPrompt`, all answers) to the session that
  asked: the hosted or linked session whose plot or close
  wrote that spec's questions (from its ledger, its last
  prompt naming the spec, or the spec file's last commit's
  `Cloud-Run`/session), else a picker of live sessions (most
  recent first), else a new session running `/oversight`.
  Never one prompt per answer to the hidden home session.

## Acceptance

- **A1** Plan answers persist server side across reloads and tab changes until sent; "Default if unanswered:" and the other phrasings count as defaults, so Batch-answer with defaults works on them; a spec's Continue bar sends all its answers in one message to the session that asked (or one picked), from the first answer on. Checked live against a scratch repo: a session plots a spec with three Open questions and stops; answer one, reload, it is still answered; Batch-answer fills the other two from "Default if unanswered:"; Continue sends one message to that session, which applies them and goes on.

## Open questions

(None.)

## Chunks
Measure: 1 open · 0 closed · next A2

- [ ] **53.1** Plan answers are kept, take named defaults, and go back with Continue · M · closes A1 · needs —
