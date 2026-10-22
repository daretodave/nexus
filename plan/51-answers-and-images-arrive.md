# 51 — Answers and images arrive

> What a person types into an answer or attaches to a message
> reaches the agent: an answer is saved as it is typed and sent
> as soon as it is given, and an image attached, pasted or
> dropped reaches the session as an image.

## Why

Reported by users of 0.4.x (2026-10-22, through the owner):

- **Oversight answers are lost.** People answer a session's
  questions, then find no submit: a live session's questions
  go out only once every one is settled ("starts working once
  all N are settled", `QuestionsStart.jsx` and
  `screens/Inbox.jsx`), and nothing is saved while they type,
  so leaving the page loses it all. The owner: "it needs to
  submit asap (even one oversight answered -- give it back --
  buttons to save it -- saves it mid typing -- even leaving)".
- **Images don't send.** A message with an image attached
  reaches the session as text only; the agent answers "Your
  message didn't come with any answers I can see. No text or
  file was attached." The composer inlines each attachment's
  text (`Cockpit.jsx`: `Attached: <name>` and its text in a
  fence; an image has none) and `POST /api/send` carries text
  only. Paste does nothing. The owner: "copy paste needs to
  work for images".

## Design

- **Answers save as typed, send as given.** A draft answer is
  saved while typing (debounced, server side per question, so
  a reload, another tab or a closed window keeps it) and shown
  again where it was left. A plan (durable) or parked question
  sends the moment it is answered (Enter, a choice clicked).
  A live session's set of questions shows a Send button from
  the first answer on: the answered ones go to the session,
  the rest take their defaults, and the button says so
  ("Send 2 answers · 3 take their defaults"). Leaving the page
  (route change, tab close, visibility hidden) flushes drafts
  and nothing is silently dropped. Each saved and sent state
  shows ("saved", "sent").
- **Images are content, not text.** Attach (the paperclip),
  paste (Ctrl/Cmd+V) and drop put images in the composer as
  thumbnails with a remove button. `POST /api/send` takes
  `attachments` (images as base64 with their media type, text
  files as text); the session sends images to the Agent SDK
  as image content blocks beside the text, and text files as
  today. Sizes are capped with a plain message; the user's
  bubble shows the thumbnails.

## Acceptance

- **A1** An Oversight or cockpit answer is saved while typed (a reload or leaving shows it again), a plan or parked question sends as soon as it is answered, and a live session's questions send from the first answer with a Send button that names how many take defaults. Checked live against a scratch repo with a session asking several questions: answer one, Send, the session continues with the rest at their defaults; type a draft, reload, the draft is there.

## Open questions

(None.)

## Chunks
Measure: 1 open · 1 closed · next A3

- [ ] **51.1** Answers save as typed and send as given · M · closes A1 · needs —
