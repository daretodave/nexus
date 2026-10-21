# Archive

> Append-only: one line per finished chunk, added in the commit
> that closes it. Never edited or reordered. `.gitattributes`
> marks it `merge=union`.

---

Format: `- <date> · <chunk> · <what now works, ≤ 10 words> ·
<commit or range>`. Phases 1–33 shipped under the v1 plan
shape and are archived here one line each, under their phase
number; their briefs and the old build plan are recoverable at
the `v1.0.0` tag (`git show v1.0.0:plan/steps/01_build_plan.md`,
`git show v1.0.0:plan/phases/<file>`). Specs 20 and 32 were
still pending at the move and live on as specs.

- 2026-05-17 · 01 · The kit: methodology, templates, playbooks, bootstrap layer · b27d21f..cf05598
- 2026-07-02 · 02 · The kit's own verify gate · 84ea179
- 2026-07-02 · 03 · Harness enforcement templates and unattended-run hardening · e593606
- 2026-07-02 · 04 · Hands-off and recovery playbooks; claude-code and lanes · fe75c78
- 2026-07-02 · 05 · Self-adoption substrate: agents.md, plan/, skills/, .claude/ · df709e0
- 2026-07-02 · 06 · Cloud loop: nexus marches on Actions · b4d40ef..803c940
- 2026-07-02 · 16 · Heartbeat: model-free watchdog for wedged and flatlined runs · 056f8ef..d86bf10
- 2026-07-02 · 18 · Loop shapes: night shift, concierge lane, genus taxonomy · 056f8ef..d86bf10
- 2026-07-03 · 07 · Lessons layer: reflexes plus domain-keyed lessons · 91b0266
- 2026-07-03 · 08 · Polyrepo variant: plan/ as its own repo · 4dc4840
- 2026-07-04 · 09 · Windows-first pass: dual-shell commands and hazards page · 1cfab4b
- 2026-07-04 · 10 · templates/skills/moderate.md, the moderation Option A · e318b64
- 2026-07-04 · 11 · ship-migration skill and additive-migration linter · fc54023
- 2026-07-04 · 12 · Critique-session refresher and secret liveness probes · 5cee3e6
- 2026-07-05 · 13 · Nightly full-smoke workflow and stack:up/down scripts · fbeaa40
- 2026-07-05 · 14 · Bootstrap v2: the first adopter's lessons list · c2724f5
- 2026-07-05 · 15 · Brownfield kit: CURRENT-STATE.md, preview-branch deploy gate · 7cd7836
- 2026-07-05 · 17 · Budget-aware ceiling weighs ships against churn · 1f3818c
- 2026-08-23 · 19 · new-project step 4: copy, sweep, prune as one sequence · 147439f
- 2026-08-24 · 21 · prompts/ as canonical files and a five-line paste · ad8ae3c
- 2026-08-25 · 22 · Workspace playbook: un-versioned root, org-per-project · 5d2d16c
- 2026-08-26 · 23 · Cloud tick failure raises a deduped alarm issue · 8dc2080
- 2026-08-26 · 24 · scripts/pulse.mjs offline instrument panel · cdfb446
- 2026-08-27 · 25 · scripts/adopt-dryrun.mjs mechanizes the adoption dry-run · e1b2d00
- 2026-08-27 · 26 · Issue templates keyed to triage routes · 96d7d17
- 2026-08-28 · 27 · scripts/new-skill.mjs skill scaffolder · fc871f1
- 2026-08-28 · 28 · Commit-verb vocabulary lint in the guard hook · 2c2e90c
- 2026-08-29 · 29 · Dual-shell parity lint leg for playbooks · d4d7470
- 2026-08-29 · 30 · Candidate-aging silt guard in digest and expand · 9b11149
- 2026-08-30 · 31 · scripts/install-hooks.mjs opt-in pre-commit gate · 6762cc9
- 2026-08-31 · 33 · Workspace templates: root pointer family, topology ask · 0d45e8d
- 2026-10-20 · 20.1 · Cloud ticks dispatch every agent in the foreground · 45b742c7..a1f5f127
- 2026-10-20 · 20 · spec complete: every agent a cloud tick dispatches runs in the foreground (both march prompts, CLOUD_LOOP) · 45b742c7..a1f5f127
- 2026-10-21 · 41.4 · @usenexus/cli 0.1.0 on npm from its tag, with provenance · de9b9839..f9fec5b0
- 2026-10-21 · 38.4 · The owner's checkout arms the pre-push policy and its allowlist covers an overnight /heads-down · plan only
- 2026-10-21 · 41.5 · The Trusted Publisher reads validated and the hand-published 0.0.1 and 0.0.0-stage are deprecated (owner, on npmjs.com) · plan only
- 2026-10-21 · 41.3 · Claude Design's handoff is the GUI: every screen, both themes · d8a0601c..d476b8d4
- 2026-10-21 · 36.3 · order refuses bad --limit; progress --json prints spec data · 1637f034..1431cccd
- 2026-10-21 · 34.1 · diagrams.mjs draws three SVGs; the gate catches drift · 662485d0..662485d0
- 2026-10-21 · 36.6 · whoami warns on the pid fallback; docs lead NEXUS_SESSION · f1721b98..65891b54
- 2026-10-21 · 36.7 · settle drops an emptied Acceptance heading; neutral fixtures · b0812060..593c8d28
- 2026-10-21 · 34.2 · the README opens on three doors, with the diagrams · 3ef5002f..3ef5002f
- 2026-10-21 · 34 · spec complete: the README opens on three doors (npx GUI, agent prompt, manual) beside generated SVG diagrams the gate keeps in step · 662485d0..3ef5002f
- 2026-10-21 · 36.8 · workflow-lint reads any indentation and composite actions · 4435f921..6c06de42
- 2026-10-21 · 36.1 · scripts resolve ROOT with fileURLToPath; the gate refuses pathname · c2df3b02..c2df3b02
- 2026-10-21 · 36.5 · guard sees worktree remove behind git options; list checks pids · 8edaa751..13c0923c
- 2026-10-21 · 37.1 · heads-down beats the ledger, wears its star, records its loop · def103d2..dca827b6
- 2026-10-21 · 36.2 · loop-issue suite in the gate; progress main runs spaced · f31dd7c1..3e0bba2e
- 2026-10-21 · 38.2 · push-policy guards main on origin and upstream only · ed84d83a..9357324e
- 2026-10-21 · 35.1 · both plan READMEs name /plot, /messy and priority rows · 826fbef0..826fbef0
- 2026-10-21 · 35.4 · neither guard knows a phases verb · 1cd9a3d5..1cd9a3d5
- 2026-10-21 · 35.6 · upgrade-plan.mjs converts a v1 plan; upgrade.md Step 4 runs it · ca603e2f..03772a15
- 2026-10-21 · 38.1 · adoption asks owner or contributor and arms the hooks · c4fddf0b..c4fddf0b
- 2026-10-21 · 35.3 · loop-issue spec-open/spec-close; ship-a-chunk mirrors specs · 7c514a9a..93e24315
- 2026-10-21 · 37.2 · claims session tags carry the star name · 0db3ec1b..8e90d882
- 2026-10-21 · 32.1 · heartbeat alarms on unarmed workflows; check_cadence per workflow · b6acc842..b6acc842
- 2026-10-21 · 32.2 · loop-shapes and CLOUD_LOOP describe the heartbeat checks · fe136587..fe136587
- 2026-10-21 · 32 · spec complete: the heartbeat alarms once per unarmed scheduled workflow (never re-enables one) and checks cadence per workflow, march 14h and night 48h · b6acc842..fe136587
- 2026-10-21 · 39.1 · bootstrap sets the loop mode; pr-resolve follows DEFAULT_BRANCH · d9c843bd..d9c843bd
- 2026-10-21 · 35.7 · adopt-dryrun walks new-project 3 and runs on Windows · a1caba9a..920626c3
- 2026-10-21 · 39.2 · nexus releases a closed contributor PR's claims · 0aded94a..b726e0b8
- 2026-10-21 · 35.2 · public docs speak v2; sibling adopters go unnamed · 465f1d99..f3818460
- 2026-10-21 · 39.3 · the optional claims-board workflow keeps one live issue · d0bdaac4..d0bdaac4
- 2026-10-21 · 37.3 · claims refuse a Claude Code session that loaded no hooks · a10d950c..1453639d
- 2026-10-21 · 35.5 · plan/CANDIDATES.md replaces PHASE_CANDIDATES.md everywhere · 4cb343fd..4cb343fd
- 2026-10-21 · 37.5 · plan-check reads the settled view; a plot test proves agreement · f6c33541..1fad223e
- 2026-10-21 · 41.1 · a linked terminal session takes an owner line at its next tool · 240b8f36..388c17b9
- 2026-10-21 · 37.4 · every committing skill lands per owner mode; cloud-tick note · 4ee6bbdc..95eb2efb
- 2026-10-21 · 37 · spec complete: heads-down beats its ledger and wears its star, claims carry the star and refuse a session with no hooks, every committing skill lands per owner mode, and the plan gate reads the settled view · def103d2..95eb2efb
- 2026-10-21 · 36.9 · scripts-ci runs green on both runners, timeout ten minutes · 889e8e82..4ce0154e
- 2026-10-21 · 40.9 · npx @usenexus/cli run answers one prompt headless · 91beab70..e903967c
- 2026-10-21 · 36.4 · ledger and notice board survive concurrent writers · f12d1f67..e7a43ff2
- 2026-10-21 · 36 · spec complete: scripts behave the same from a spaced path, under concurrent sessions and on Windows; every suite runs in the gate or scripts-ci · 1637f034..e7a43ff2
- 2026-10-21 · 40.3 · the plan board reads order.mjs and progress.mjs · 13b5666c..9d9bf4bf
- 2026-10-21 · 41.2 · the stage draws each tug's path, state and age · 0cdb2ebd..991b2aad
- 2026-10-21 · 40.7 · Actions panel pauses, runs a pass, shows stalls, least privilege · 3c533099..40612240
- 2026-10-21 · 40.8 · owner lines post through announce.mjs; explode draws theme cards · 6682ccf4..fa249fa5
- 2026-10-21 · 40.1 · one server hosts many sessions; deep links; a second launch reuses it · 6c992c1b..d3330711
- 2026-10-21 · 40.4 · undescribed chunks show a cached, marked AI one-liner · 53ccdc43..29ab0197
- 2026-10-21 · 41.9 · screens load per route under 500 kB; fonts ship latin only · 448e249f..3c0aaa50
- 2026-10-21 · 40.11 · run mode and owner mode live in .nexus/local.json via /api/local · 8c379d20..85391147
- 2026-10-21 · 40.2 · fleet home tiles by star, a merged inbox, Resume on a fallen tile · ec219710..1f1a1629
- 2026-10-21 · 40.6 · every session and the repo show git; tidy dry run lists idle trees · 6d4ca0c6..5e4c0711
- 2026-10-21 · 40.10 · Recover reads a Workflow run folder and resumes the run · cf3546a3..97209d2a
- 2026-10-21 · 41.8 · fleet idle curves, the orphan's tidy link, one switcher rule · ce67d9e2..1d222f64
- 2026-10-21 · 40.5 · claims panel groups, claims, releases, holds, assigns, requests · 4b28490e..bfb03e87
- 2026-10-21 · 41.7 · boards draw durations, diffstats, times, estimates from real data · a37caf1c..8957c92d
- 2026-10-21 · 40.12 · the board's grip reorders a spec's chunks; Reassign picks a claimant · 5a86bc41..cad98343
- 2026-10-21 · 40 · spec complete: the GUI hosts many sessions with a fleet home, merged inbox and Resume, a plan board on order.mjs with AI one-liners and a reordering grip, claims, git and Actions panels, recovery and headless run · 91beab70..cad98343
- 2026-10-21 · 42.1 · nexus.secrets.json declares names; plan-check refuses undeclared ones · 8efdf581..da5cc180
- 2026-10-21 · 44.1 · nexus --demo plays fixture scenarios with no repo or network · cf7c55c4..6da228fb
- 2026-10-21 · 42.2 · the vault keeps values in .env, .env.workspace or the OS keychain · 7b165b1b..b3c9df94
- 2026-10-21 · 42.4 · secrets push sets a GitHub Actions secret through stdin · bdfdd702..a2b5c560
- 2026-10-21 · 41.6 · live pass in both themes; five fixes; on-accent button ink kept · b66171a7..422f5872
- 2026-10-21 · 42.9 · a contributor keeps local-only keys; sinks refuse; no project secrets · 2cc4dca2..84522c6e
- 2026-10-21 · 42.5 · secrets push sets Vercel and Cloudflare secrets through stdin · e3609fad..bf1dfa2d
- 2026-10-21 · 44.2 · npm run record turns a demo scenario into a GIF and a poster · b72bdae5..46ac8e58
- 2026-10-21 · 43.1 · the Claude Design round trip has a concept doc and a playbook · bedb4c36..bedb4c36
- 2026-10-21 · 42.6 · a missing secret parks its chunk and files a names-only request · fb1b1981..91e48734
- 2026-10-21 · 42.3 · secrets run supplies values; the guard and a gate leg keep them out · 5f55b49d..751f7add
- 2026-10-21 · 43.2 · /design prompt and addendum draft numbered prompts from the plan · 31b37052..8a09ae8f
- 2026-10-21 · 42.7 · the GUI server lists secret names, stores values, masks transcripts · f2b03bdb..7612b013
- 2026-10-21 · 43.3 · /design ingest writes a dated handoff with a manifest and plots the port · 71f213de..3de80eb0
- 2026-10-21 · 41.10 · the second and third handoffs re-ported outside the vault · 01779662..3c899851
- 2026-10-21 · 41 · spec complete: a linked terminal session takes an owner line at its next tool, tugs and real data drawn on the stage, the Claude Design handoffs ported and re-ported at fidelity, a lighter package · 240b8f36..3c899851
- 2026-10-21 · 43.4 · design render draws a handoff's boards; compare scores the app · b5a67eb9..a3127926
- 2026-10-21 · 43.5 · the port recipe runs as a Workflow; an opt-in leg checks the port map · d638c51a..466a05db
- 2026-10-21 · 44.3 · fleet to tug plays in the README; the gifs leg holds its budget · e2a9c183..5f424fb1
- 2026-10-21 · 44 · spec complete: nexus --demo plays fixture scenarios, a pure-JS recorder makes the GIF, and fleet to tug plays in the README with a gate leg holding its budget · 567d168f..5f424fb1
- 2026-10-21 · 45.1 · an ## Add numbers new spec work at settle · b1c9b54e..eb902373
- 2026-10-21 · 45.2 · plan-check and order read pending Adds as settled · 85041378..85041378
- 2026-10-21 · 45.3 · /plot extends before it adds, through ## Add · 8e7dfb3a..4bc5178e
- 2026-10-21 · 45.4 · /plot spots a spec an open PR extends · c156c6b3..c156c6b3
- 2026-10-21 · 45 · spec complete: an ## Add extends a spec without quoting it, numbered and placed at settle in merge order; the settled view, plan-check and order --mark read it; /plot extends before it adds and spots a spec an open PR extends · b1c9b54e..c156c6b3
- 2026-10-21 · 43.6 · the GUI hands off a design link and shows each board's port status · 3194063e..c2f930fb
- 2026-10-21 · 43 · spec complete: the Claude Design round trip runs from the kit: /design prompt, addendum and ingest, a board renderer and compare, the port recipe as a Workflow with an opt-in map leg, and the GUI's hand-off and gallery · bedb4c36..c2f930fb
- 2026-10-21 · 42.8 · the vault, its key cards, import and onboarding step drawn in the GUI · bba54560..85799bdb
- 2026-10-21 · 42 · spec complete: secrets declared by name in nexus.secrets.json, kept in a two-ring or keychain vault, run and pushed through stdin, guarded in hook and gate, parked and requested by /next, and drawn in the GUI's vault · da5cc180..85799bdb
- 2026-10-21 · 46.1 · plots settle before same-date closes; a close waits for its Add · d81f96ce..ab067f4c
- 2026-10-21 · 46.4 · /triage files an issue inside an open spec as an ## Add to it · c07cdb20..2057bc24
- 2026-10-21 · 46.2 · a plot commit bounds archive ranges and sits in none · bc724c5c..bc724c5c
- 2026-10-21 · 46.3 · settle refuses section Chunks/Acceptance; footgun placeholders numbered · 31f277c6..31f277c6
- 2026-10-21 · 46 · spec complete: plots settle before same-date closes, a plot commit bounds archive ranges, settle refuses the last silent appends and numbers footgun placeholders, and /triage extends the spec an issue belongs to · d81f96ce..31f277c6
- 2026-10-21 · 35.9 · v2.0.0 is tagged and both lock files and plan-shape point at it · plan only
- 2026-10-21 · 38.3 · main needs a PR except for the owner and the loop; claims never force-pushed · plan only
- 2026-10-21 · 38 · spec complete: adoption asks owner or contributor and arms the hooks, push-policy guards main on origin and upstream only, the owner's checkout is armed for overnight runs, and nexus's main and claims carry their rulesets · c4fddf0b..9357324e
