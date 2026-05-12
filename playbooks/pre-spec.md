# Playbook: pre-spec (pitch → spec.md, interactive)

> **You have a pitch. You don't have a spec.** This is the
> playbook for the 30-minute interactive session that takes
> you from "I want to build X" to a written `spec.md`,
> `bearings.md` stub, and a clear hand-off to
> [`new-project.md`](./new-project.md).
>
> Estimated time: **30–45 minutes** of conversation, three
> batches of four questions, ~10 minutes per batch. Use this
> when an empty repo and a verbal pitch are all you've got.

This is the only nexus playbook where the agent is *expected*
to ask the user questions. Read the carve-out below before
starting.

---

## When to use this playbook

- You have a working name and a 1–2 sentence pitch.
- You have **no** `spec.md` yet, or only scratch notes.
- The next thing you want to do is `/ship-a-phase` on the
  adoption phase — but `new-project.md` requires a spec, and
  you don't have one.

When **not** to use it:

- You have a spec already (skip to
  [`new-project.md`](./new-project.md)).
- You don't have a pitch yet either. Come back when you can
  describe the product in two sentences.
- The repo has existing code and history. Use
  [`existing-project.md`](./existing-project.md) instead;
  the pre-spec interview is for blank-slate work.

---

## Decide vs. ask — the carve-out

Nexus's standing rule is "skills decide; only `/oversight`
asks." **The pre-spec session is an explicit carve-out.**
The agent running this playbook isn't yet inside a shipping
skill; it's helping the user write the brief that *will be*
the input to skills. Asking questions here is the job.

Once `spec.md` is written and committed at the end of this
session, the no-AskUserQuestion-outside-`/oversight` rule
kicks back in. From that commit forward, the agent decides.

For the shape of the asks during this session, follow
[`../concepts/asking-well.md`](../concepts/asking-well.md):
1–4 questions per batch, recommended option first labeled
`(Recommended)`, each option description names the
trade-off, prose-led intro before each batch.

---

## TL;DR — paste-into-fresh-agent prompt

If you'd rather have an agent run this playbook against your
empty repo, paste this at your project root:

```
Run nexus's pre-spec playbook.

nexus is at ../nexus (or ./.nexus if submoduled). The
playbook is at ../nexus/playbooks/pre-spec.md. Read it
end-to-end before asking the first question.

I have a pitch but no spec. Here's the pitch in my own
words:

  <ONE-PARAGRAPH PITCH — what the product is, who it's for,
  what makes it interesting. Don't polish; the agent will
  ask follow-up questions.>

Then:
  1. Read pre-spec.md fully.
  2. Read ../nexus/concepts/asking-well.md for question
     shape.
  3. Run the three question batches (foundation, spine,
     surface) per the playbook. 1-4 questions each batch,
     recommended option first, trade-off named in every
     option's description.
  4. After each batch, write what you can to spec.md,
     bearings.md, and (if relevant) claude-design.prompt.md
     incrementally. The user shouldn't have to wait until
     the end to see progress.
  5. End the session with:
     - spec.md committed
     - bearings.md stub committed (Surface, Stack, Auth,
       URL contract, Standing decisions, Hard rules — at
       minimum)
     - Optional claude-design.prompt.md if the project has
       a visual-system need (see
       ../nexus/customization/visual-system.md)
     - A NEXUS_LESSONS.md scratch file capturing any gap
       in nexus you hit during this session (see
       ../nexus/playbooks/new-project.md step 10).
  6. Then stop. Point me at ../nexus/playbooks/new-project.md
     and the TL;DR adoption prompt. Don't invoke
     /ship-a-phase.

Standing rules:
  - Commit and push as a single atomic act per batch.
  - No Co-Authored-By trailers, no emojis.
  - No --no-verify, no force-push.
  - AskUserQuestion is allowed in this session (it's pre-spec,
    not in-skill). Once spec.md is committed at the end,
    that rule goes back to oversight-only.

Estimated time: 30-45 minutes. Begin.
```

That's the whole playbook in one paste. The rest of this
document is the playbook the agent reads when it runs.

---

## The three batches

The interview is shaped as three batches of four questions.
Each batch covers one layer of the product: foundation,
spine, surface. Roughly: *what we're building*, *how it
works under the hood*, *how it shows up to the user*.

After each batch, the agent writes what it learned to
`spec.md` (and `bearings.md` stub) before moving to the next.
The user sees the spec grow in three drafts rather than one
big reveal.

### Batch 1 — Foundation (what we're building)

The big questions that anchor everything else. If you get
batch 1 wrong, batches 2 and 3 are wasted.

**Leading prose** (the agent writes this, customizing to the
pitch):

> Four decisions about scope and data. The biggest call
> here is the data architecture (Q4) — picking it now saves
> a full migration later. If unsure, take the recommended
> option; it accommodates most downstream choices without
> re-litigating.

**Questions:**

1. **Name.** What's the project's working name (lowercase
   token, ≤12 chars)?
   - *Recommended:* use the working name you mentioned in
     the pitch — we can rename pre-launch.
   - Pick a new one now.
   - Defer — write `<PROJECT>` placeholders everywhere.

2. **Scope.** What's in v1 vs. punted?
   - *Recommended:* v1 = core feature only; everything
     else labeled `out of v1`. Easier to ship; later phases
     earn their slot.
   - Wide v1 = ship multi-feature substrate.
   - I'll dictate the v1 list myself (free-form).

3. **Audience.** Who is the v1 user — specifically?
   - *Recommended:* one named persona (e.g. "backend
     engineers evaluating Postgres"). Forces specificity;
     spec stays honest.
   - Two related personas.
   - Broad consumer audience — accept the trade-off that
     the spec stays less testable.

4. **Data architecture.** Where does v1's structured data
   live?
   - *Recommended:* `hybrid-with-managed-postgres` —
     static editorial content in the repo + a managed
     Postgres (Supabase / Neon / Turso / etc.) for dynamic
     write-heavy data (votes, comments, sessions). Covers
     90% of real projects; one migration to pure-DB later
     if needed.
   - `gh-as-db` — everything in markdown/JSON in the repo.
     Hermetic, no external service. Trade-off: no real-time
     writes, ≤~10k records.
   - `pure-db` — everything in the database; repo is just
     code. App-like, less editorial.
   - `none` — no structured records at all (CLI, library,
     renderer).

   See
   [`../customization/data-layer.md`](../customization/data-layer.md)
   for what each variant entails.

**After Batch 1, write:**
- `spec.md` v0: name, one-line pitch, audience persona,
  v1 scope (3–5 bullets), out-of-scope (3–5 bullets), data
  architecture note.
- `bearings.md` stub: stack placeholder, Surface line, data
  variant from the answer.

Commit: `pre-spec: foundation (name, scope, audience, data
architecture)`.

### Batch 2 — Spine (how it works)

How the product behaves at runtime. Authentication,
authorization, and the moderation/policy surface. These are
the decisions that drive phase 9–12 of every nexus build
plan.

**Leading prose:**

> Four decisions about the runtime spine: who can do what,
> how they prove identity, what auto-moderation looks like.
> These shape every phase that touches user-generated
> content. Auth (Q1) is the highest-impact choice — pin it
> on day one to avoid re-litigation.

**Questions:**

1. **Auth provider.** Who handles identity?
   - *Recommended:* a managed provider with magic-link
     support (Auth0, Clerk, Supabase Auth, next-auth with
     an email provider). Cost: external service to wire +
     pre-flight per
     [`../customization/external-services.md`](../customization/external-services.md).
   - Build it yourself (Lucia, Iron Session, Better Auth).
     Cost: more code; full control.
   - `none` — no accounts in v1. Trade-off: defers every
     user-state feature.

2. **Identity tiers.** What can anonymous users do vs.
   logged-in?
   - *Recommended:* read-anonymous, write-authenticated.
     Standard editorial pattern.
   - Anonymous-write allowed (with rate-limit + IP-hash).
     Trade-off: moderation queue grows fast.
   - Authenticated-only (login-walled). Trade-off:
     visibility takes a hit.
   - No write surfaces in v1 — skip the question.

3. **Anti-abuse posture.** What does the loop do to
   prevent abuse?
   - *Recommended:* vote-weight by account age + login
     frequency; comment rate-limits per user; IP-hash
     retained 30d. Standard editorial defaults.
   - Stricter (account-age gate before write; CAPTCHA on
     submit).
   - Permissive (rate-limit only; anti-abuse deferred to
     post-v1).
   - Not applicable — no UGC in v1.

4. **Moderation flow.** How do flagged items move
   through the system?
   - *Recommended:* AI-pre-filter (OpenAI moderation
     endpoint or equivalent) → public if clean, queue if
     suspect. Manual mod queue drained by `/oversight` or
     a `/moderate` skill; see
     [`../customization/moderation-loop.md`](../customization/moderation-loop.md).
   - Post-mod (everything public, flagged items reviewed
     by a moderator).
   - Pre-mod (nothing public until reviewed). Trade-off:
     low throughput; high editorial control.
   - Not applicable.

**After Batch 2, write:**
- `spec.md` updates: identity tiers section, anti-abuse
  defaults, moderation flow section.
- `bearings.md` updates: Auth pin, identity tier rules,
  anti-abuse limits, moderation flow choice.

Commit: `pre-spec: spine (auth, identity, anti-abuse,
moderation)`.

### Batch 3 — Surface (how it shows up)

The user-facing layer. Hosting, visual system, voice,
content cadence. The decisions that determine what the v1
*feels like*.

**Leading prose:**

> Four decisions about the surface. Hosting (Q1) and the
> visual system (Q2) drive what the loop needs to wire up
> before phase 1. Voice and cadence (Q3, Q4) shape what
> `/iterate` produces over time.

**Questions:**

1. **Hosting provider.** Where does the site deploy?
   - *Recommended:* the provider where you already have
     an account + recent muscle memory (Vercel / Netlify /
     Fly.io / Cloudflare Pages). Speed beats optimality at
     v1.
   - A new provider you want to learn — trade-off: 1–2h
     of friction during the deploy-gate wiring.
   - Self-hosted (your own VPS, your own CI). Trade-off:
     more ops; the loop's deploy gate still works against
     it.
   - Not applicable — no public deploy in v1 (library,
     CLI, internal tool).

2. **Visual system depth.** What does the v1 *look like*?
   - *Recommended:* commission a per-project visual
     system from a design-focused Claude session — see
     [`../customization/visual-system.md`](../customization/visual-system.md)
     and [`../templates/design-prompt.md`](../templates/design-prompt.md).
     Cost: 1–2 hours of async work; payoff: a coherent
     primitive set that every phase builds on.
   - Use a starter theme (Tailwind defaults, shadcn/ui,
     Catalyst, etc.) and let the loop iterate.
   - Defer — `bearings.md` declares "no visual system at
     v1"; loop ships unstyled until the user lands one.

3. **Voice.** How does the product talk to the user?
   - *Recommended:* one sentence in `bearings.md` that the
     loop reads every phase ("knowledgeable peer, terse,
     no marketing fluff" or similar). Concrete enough to
     check against.
   - A paragraph of voice doc with do/don't examples.
     Trade-off: longer to write; pays off if you'll
     publish a lot of copy.
   - Defer — borrow the voice from a sibling site you
     point at.

4. **Content cadence.** How often does the loop produce
   new content / records / pages?
   - *Recommended:* `/iterate` drains audit findings as
     it finds them; no fixed cadence. Volume = a function
     of audit depth, not a schedule.
   - A weekly automation pulse (e.g. weekly trend page,
     daily digest). Trade-off: more bearings discipline;
     easier to point at.
   - Not applicable — non-editorial product (tool, CLI,
     library).

**After Batch 3, write:**
- `spec.md` final: hosting, visual system commitment, voice,
  cadence.
- `bearings.md` final stub: hosting pin, design pointer,
  voice line, cadence rule.
- If visual system answer was "commission a design system,"
  also write `claude-design.prompt.md` per the template
  in [`../templates/design-prompt.md`](../templates/design-prompt.md).

Commit: `pre-spec: surface (hosting, visual, voice, cadence)`.

---

## Hand-off — what the user has at the end

After the three batches:

- [ ] `spec.md` is at least one page, anchored to a named
      persona, lists v1 scope and out-of-scope.
- [ ] `bearings.md` stub covers Surface, Auth, Stack pins,
      identity, anti-abuse, moderation, hosting, voice. (Full
      build plan + phase briefs come later, in
      `new-project.md`.)
- [ ] (Optional) `claude-design.prompt.md` is ready to paste
      into a design-focused agent.
- [ ] (Optional) `NEXUS_LESSONS.md` captures any gap the
      session hit in nexus itself — for a later
      `/lessons-pr` pass back to the nexus repo. See
      [`../skills/lessons-pr.md`](../skills/lessons-pr.md).
- [ ] Three commits on `main`, pushed.

Then the agent hands off:

> Pre-spec session complete. `spec.md` and `bearings.md`
> stub are written and pushed. Next: run nexus's adoption
> per `../nexus/playbooks/new-project.md` — or paste its
> TL;DR prompt at this repo root. The autonomy rule
> (only `/oversight` asks) takes effect from this commit
> forward.

---

## Common pitfalls

- **The user's pitch is two paragraphs of marketing.** Ask
  for one paragraph in plain language. If they can't write
  it, they're not ready to spec.
- **Q4 of Batch 1 (data architecture) gets answered "I don't
  know."** Take the recommended (`hybrid-with-managed-postgres`).
  It's the most forgiving choice; the migration to `pure-db`
  later is cheap, the migration to `gh-as-db` from there is
  almost free if scale stayed small.
- **The user re-litigates Batch 1 during Batch 2.** Commit
  Batch 1 first — *push* it. Coming back to revise after a
  commit is fine; coming back mid-batch invalidates the
  whole flow.
- **The agent skips the "leading prose" before a batch.**
  The prose is what makes the questions answerable in 10
  minutes instead of 30. Don't skip.
- **The interview runs past 45 minutes.** Stop. Commit what
  you have. The user is in decision fatigue; further
  answers will be worse than guesses.
- **No carve-out written into spec.md.** The agent should
  put a one-line note in `spec.md`: "Pre-spec interview
  ran on <date>; AskUserQuestion was permitted under the
  pre-spec carve-out. From this commit forward, autonomy
  resumes."

---

## You're done when

- [ ] `spec.md` is committed and pushed (one page minimum,
      v1 scope clear, persona named).
- [ ] `bearings.md` stub is committed and pushed (Surface,
      Auth, Stack, hosting, voice).
- [ ] (If visual-system answer was "commission") `claude-design.prompt.md`
      is committed.
- [ ] `git log --oneline` shows three `pre-spec:` commits.
- [ ] The user can paste the
      [`new-project.md`](./new-project.md) TL;DR prompt at
      this repo root and continue.

When all four pass: hand off and stop.

---

## See also

- [`new-project.md`](./new-project.md) — the playbook the
  user runs *after* this one.
- [`../concepts/asking-well.md`](../concepts/asking-well.md)
  — the question-shape pattern this playbook applies.
- [`../customization/visual-system.md`](../customization/visual-system.md)
  — what to commission when Batch 3 Q2 lands on "commission
  a design system."
- [`../customization/external-services.md`](../customization/external-services.md)
  — pre-flighting the services Batch 2's auth answer
  implies.
- [`../customization/moderation-loop.md`](../customization/moderation-loop.md)
  — how Batch 2 Q4's moderation choice plays into the
  loop.
- [`../skills/lessons-pr.md`](../skills/lessons-pr.md) —
  for capturing nexus gaps you hit during the session.
