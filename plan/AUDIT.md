# Kit audit — 2026-07-02

> Bias: none

Seeded from two deep survey passes over the kit (playbooks +
customization + templates) and a survey of the sibling
adopters (`../semilayer`, `../kintilla`). Rows here are
iterate-shaped (one tick each); bigger items became phases in
`plan/steps/01_build_plan.md` or candidates in
`plan/PHASE_CANDIDATES.md`.

## Pending

### [ ] [7.2] data-layer.md cites an invented model id
- category: freshness
- impact: 6
- ease: 9
- evidence: `customization/data-layer.md` example uses
  `"claude-opus-4.7"` (not a real id; real ids look like
  `claude-opus-4-8`). Adopters copy examples verbatim.
- next: make the example provider-generic or use a real
  current id with the "ids age — check /model" caveat.

### [ ] [6.3] deploy-check.mjs covers 4 of 8 documented providers
- category: doc-drift
- impact: 7
- ease: 4
- evidence: `playbooks/ci-providers.md` walks 8 providers;
  `templates/scripts/deploy-check.mjs` implements netlify,
  vercel, github-actions, health-check. Cloudflare Pages,
  Render, Fly are "follow the patterns" prose.
- next: implement the three missing adapters in the template
  (each ~40 lines, same exit-code contract).

### [ ] [5.4] bootstrap.mjs mixes findstr (Windows) and awk (POSIX)
- category: adopter-friction
- impact: 5
- ease: 7
- evidence: `execGithub`'s install-claude-app verify shells
  `findstr`; every skill doc uses `awk`/`grep`. Either seam
  breaks on the other OS.
- next: normalize on node-internal string checks (no shell
  text tools) inside bootstrap.mjs.

### [ ] [4.9] verify-gate composition drifts across three docs
- category: doc-drift
- impact: 7
- ease: 5
- evidence: `templates/agents.md` says `typecheck → test:run →
  data:validate → build → e2e`; `customization/verify-gate.md`
  web example omits `data:validate`, adds `lint`;
  `templates/plan/bearings.md` echoes agents.md.
- next: declare one canonical composition + one documented
  variance rule ("data:validate iff data layer; lint optional
  leg"), align all three in one commit.

### [ ] [4.2] existing-project audit snippet is crude
- category: adopter-friction
- impact: 4
- ease: 8
- evidence: `playbooks/existing-project.md` measures repo
  history with `git log | grep -c '^Author:'` and assumes
  pnpm+pytest+go simultaneously.
- next: replace with `git rev-list --count HEAD` + per-stack
  detection blocks.

### [ ] [3.8] generic-specialist template omits the model: lever
- category: completeness
- impact: 4
- ease: 9
- evidence: `customization/claude-code.md` §5 documents
  per-agent `model:` frontmatter; no agent template shows it.
- next: add a commented `model:` line + one sentence to
  `templates/claude/agents/generic-specialist.md`.

### [ ] [3.5] cloud-loop reference implementation is an external link
- category: freshness
- impact: 3
- ease: 6
- evidence: `playbooks/cloud-loop.md` points at a live repo
  for the reference run; link-rot risk, and this repo now runs
  its own loop.
- next: point the reference at nexus's own `.github/` loop
  (the ouroboros) with the external repo as secondary.

### [ ] [3.2] data-layer mermaid diagram is a style outlier
- category: voice
- impact: 2
- ease: 8
- evidence: the kit's docs are prose+tables; one mermaid
  flowchart in `customization/data-layer.md` (README's is the
  only other).
- next: keep or convert to the decision-table idiom — decide
  once, note in bearings voice rules.

## Done

(empty — the loop moves rows here with `[x]` + commit hash)
