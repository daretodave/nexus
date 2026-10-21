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
