# 49 — The GUI tells the truth on the owner's walk (0.4.2)

> Eleven fixes from the owner walking nexus's own checkout in
> `@usenexus/cli` 0.4.2: the cloud step keeps a schedule it
> found, the vault counts and labels what the manifest
> declares and what GitHub holds, Fleet draws its bar, the
> Plan board reads the archive's fields, and sessions get a
> permission mode setting and a readable permission card.

## Why

Spec 47 made the GUI read a mature adopter. Walking nexus
itself on 0.4.2 (2026-10-22) still found screens that say
something untrue or could destroy a setting:

- The cloud step offers to replace a working cron.
- The vault miscounts its own secrets and reports
  `ACTIONS_PAT` missing when GitHub has it.
- The Plan board makes up a size for every closed chunk.

None of this needs a new screen. Each fix sits in code that
already exists.

What exists today (2026-10-22):

- **Cloud step:** `src/screens/onboarding/CloudSetup.jsx`
  (`sched` defaults to `'night'` from `draft.js`);
  `server/cloud.mjs` `saveSchedule`, `readCrons`, `setCron`.
- **Vault:** `src/screens/vault/model.js` (`alreadyCopy`,
  `subLine`, `vaultRows`, `destState`);
  `src/ui/vault.jsx` `EnvFile` (`.env-file .t b` is mono);
  `server/secrets.mjs` (`lastPushes` reads
  `.nexus/secrets-audit.jsonl`); `scripts/secrets-vault.mjs`
  `status`; `scripts/secrets.mjs` and its byte-identical
  `templates/scripts/secrets.mjs` `status()`;
  `scripts/plan/secrets-manifest.mjs` (keys `name`, `for`,
  `where`, `destinations`, `provider`, `chunk`).
- **Fleet:** `server/fleet-home.mjs` `progressOf`;
  `src/screens/fleet/model.js` `bar`; `src/ui/fleet.jsx`
  `TileBar`. The design draws `.tile-bar` with `█`/`░` cells
  (`design/handoff/Fleet.dc.html`).
- **Plan board:** `scripts/plan/progress.mjs` `closedChunks`
  (template twin identical): the title is the rest of the
  line less a trailing range, so `· plan only` stays in it.
  `specData` gives closed chunks `size: null`,
  `board/model.js` `normalizePlan` turns that into `'M'`, and
  `rowModel` shows `c.landed || 'closed'`, though nothing
  sets `landed` (`closedOn` is sent and unread).
- **Sessions:** `server/provider.mjs` `PERMISSION_MODES`
  (`default`, `acceptEdits`, `auto`, `plan`); `POST
  /api/prefs` drops a mode it doesn't list; prefs are per
  checkout (`server/repo.mjs`). `server/headless.mjs` refuses
  `bypassPermissions` for `nexus run`.
- **Permission card:** `cockpit/Working.jsx` `PermissionTug`
  shows `req.reason || req.summary`, the input's JSON;
  `shared/tool-arg.mjs` (`toolArg`, `toolArgFromJson`, from
  47.15) picks the argument a tool row shows.

## Design

- **Checked live, every chunk:** each fix is seen working in
  the GUI before it closes. Read-only views run against a
  real repo (nexus's own checkout). Anything that writes runs
  against a scratch repo. Never another of the owner's repos.
  Kit files name no adopter repo.
- **Cloud step:** `GET /api/cloud` returns the loop
  workflow's crons (`readCrons`). When there is one, the
  picker gains a first option, selected: "Current: every 6
  hours (02:00, 08:00, 14:00, 20:00 UTC)", read from the
  cron. Turn on with that option selected writes nothing; it
  only enables what is off. A cron the reader can't describe
  shows as "Current: `<cron>` UTC".
- **Vault wording:** with a manifest present, the card reads
  "N name(s) in .env isn't in nexus.secrets.json yet" with
  an "Add it" (or "Add them") action. Its title uses the
  surrounding headings' sans style. `EnvFile` stays mono
  where the title really is a filename.
- **Vault counts:** the header counts declared names only.
  An undeclared `.env` name gets its own row marking: "in
  .env, not in the manifest", its Local column truthful (set
  where it is set), and a Declare action that adds it to
  `nexus.secrets.json`.
- **Actions sink:** for a `github-actions` destination,
  `status` (the kit script, its template twin, and the GUI's
  Actions column) asks `gh secret list` for names. Names
  only, never values. The audit log stays the record of what
  the vault pushed and when. With no `gh`, no auth, or no
  remote, the state reads "unknown", never "missing". The
  gate stays offline: tests stub `gh`.
- **Optional secrets:** the manifest takes `optional: true`
  (proposed decision `D3`). An optional secret
  that is not set reads "optional · not set", with no
  warning. nexus's own `GH_TOKEN` line sets it.
- **Plan board, the archive's fields:** an archive line is
  `date · id · title · range`. The last field is the range
  when it is a sha, a `sha..sha`, `(this commit)` or
  `plan only`. The title is what lies between. Closed rows
  show no size badge unless the size is read from the spec
  at the closing commit's parent. The claim column shows the
  close date and the closing commit (`10-22 · ec8af4d`), not
  "closed" again.
- **Permission mode setting:** Settings gains "Permissions
  for new sessions": Ask (`default`), Accept edits, Auto,
  Allow everything (`bypassPermissions`). It is saved per
  checkout, defaults to Ask, and goes through `POST
  /api/prefs` `permissionMode`. `PERMISSION_MODES` gains
  `bypassPermissions`. Allow everything carries a plain
  warning: the agent runs every tool with no prompt, on a
  machine that holds real tokens. `nexus run` keeps refusing
  it (proposed decision `D4`). A running session
  keeps the mode it started with.
- **Permission card:** the card's title is the input's
  `description` when it has one, else the tool. Its body is
  `toolArg` / `toolArgFromJson`: a Bash command goes through
  the shell highlighter, as the transcript's tool rows show
  it. Raw JSON never shows.

## Acceptance

- **A1** On a repo whose loop workflow has a cron, the cloud step selects "Current: ..." describing it, and Turn on leaves the cron untouched unless another option is picked. Checked live: read against nexus's checkout, Turn on against a scratch repo.
- **A2** With a manifest present, the vault card says "N name(s) in .env isn't in nexus.secrets.json yet" with an Add action, and its title matches the surrounding sans headings. Checked live against nexus's checkout.
- **A3** A Fleet tile's ledger progress is drawn as the design's `.tile-bar` (filled and empty cells plus the label), not raw ledger text. Checked live against nexus's checkout.
- **A4** The vault header counts only declared names. An undeclared `.env` name is marked "in .env, not in the manifest", shows Local as set, and offers Declare. Checked live: read against nexus's checkout, Declare against a scratch repo.
- **A5** For a `github-actions` sink, the GUI's Actions column and `secrets.mjs status` (kit and template) report a name set when `gh secret list` lists it, and "unknown" when gh can't tell. They never read a value. Checked live: read against nexus's checkout.
- **A6** A manifest secret marked `optional: true` and not set reads "optional · not set" with no warning. The manifest gate accepts the key. Checked live against nexus's checkout.
- **A7** A closed chunk on the Plan board shows no size badge, or the size its spec gave it at the closing commit. Checked live against nexus's checkout.
- **A8** A closed chunk's claim column shows its close date and closing commit. Checked live against nexus's checkout.
- **A9** Archive lines are parsed by field. No range field (`plan only`, `sha..sha`, `(this commit)`) ever reaches a title, in the GUI or `progress.mjs` (kit and template). Checked live against nexus's checkout.
- **A10** Settings sets "Permissions for new sessions" per checkout (Ask, Accept edits, Auto, Allow everything), default Ask, through `POST /api/prefs`. Allow everything shows a plain warning, a new session starts in the chosen mode, and `nexus run` still refuses bypass. Checked live against a scratch repo.
- **A11** The cockpit's permission card shows the input's description as its title and the argument as a tool row shows it (a Bash command highlighted), never raw JSON. Checked live against a scratch repo.

## Open questions

- **Allow everything and the SDK flag:** the Agent SDK and the
  CLI may need an extra opt-in for `bypassPermissions`
  (`allowDangerouslySkipPermissions`, or the CLI's
  `--allow-dangerously-skip-permissions`). Default: 49.10
  passes it only when the mode is bypass.

## Chunks
Measure: 11 open · 0 closed · next A12

- [ ] **49.1** The cloud step keeps a schedule it finds · S · closes A1 · needs —
  - nexus's cron is `0 2,8,14,20 * * *` UTC; `/api/cloud` sends no cron today (`CloudLoop.jsx` already reads `loop.schedule.cron`).
- [ ] **49.2** The vault card names what the manifest lacks · S · closes A2 · needs —
  - `alreadyCopy` in `vault/model.js`, plus the lowercase twin in `onboarding/Secrets.jsx`.
- [ ] **49.3** A Fleet tile draws its ledger progress as a bar · S · closes A3 · needs —
  - Owner saw `[######] 15 of 15 chunks`. `TileBar` draws `█`/`░`, so first find where the `#` text comes from (a ledger line shown verbatim, or a missing glyph).
- [ ] **49.4** The vault counts declared names; undeclared ones say so · S · closes A4 · needs —
- [ ] **49.5** The Actions sink is read from GitHub, names only · M · closes A5 · needs —
  - Touches `templates/scripts/secrets.mjs` and its `scripts/` twin (product: same commit, same text).
- [ ] **49.6** An optional secret reads optional, not missing · S · closes A6 · needs —
  - The `optional` key changes the manifest contract: `secrets-manifest.mjs`, `customization/secrets.md`, nexus's `nexus.secrets.json`.
- [ ] **49.9** The archive's fields parse; no range in a title · S · closes A9 · needs —
  - `39.4 · ... · plan only` in `ARCHIVE.md` is the live case.
- [ ] **49.7** Closed chunks show no made-up size · S · closes A7 · needs 49.9
- [ ] **49.8** A closed chunk's claim column shows date and commit · S · closes A8 · needs 49.9
- [ ] **49.10** Settings sets the permission mode for new sessions · S · closes A10 · needs —
- [ ] **49.11** The permission card reads like a tool row · S · closes A11 · needs —
