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
