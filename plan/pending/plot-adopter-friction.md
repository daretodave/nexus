---
date: 2026-10-21
---
## Add plan/39-cloud-loop-proven.md
~~~ section Why
A fresh adoption for the 39.4 tick (a zero-dependency Node
library in pull-request mode, 2026-10-21) hit thirteen
problems in the templates and playbooks; every new adopter
would. The chunks below fix them.
~~~
~~~ acceptance
- **A?tests-portable** Every template script test passes in a fresh adopter: hook imports use `.claude/hooks/`, and the steer settings check reads `<repo>/.claude/settings.json`.
- **A?adopt-complete** new-project.md copies `plan/pending/README.md`, writes `.gitattributes` (`eol=lf`, `plan/ARCHIVE.md merge=union`) and a `.gitignore`, and its prune text agrees with its example.
- **A?placeholders** Every `<PLACEHOLDER>` in templates is documented and swept, or the gate flags an unswept one in an adopter.
- **A?no-host** A library with no deploy host adopts cleanly: agents.md rules 1 and 4 and bearings.md have a "no deploy gate" path.
- **A?pm-neutral** The package manager is a placeholder end to end (install-hooks, the setup action, the march prompts, settings.json), and the setup action works without a lockfile.
- **A?first-day** Day one in an agent session works: the settings allowlist covers claims, plan-check and the plan scripts; `claims whoami` explains `NEXUS_NO_HOOK_CHECK`; the placeholder sweep doesn't need to read `.env.example`; existing-actions Step 9 dispatches after enabling.
- **A?gate-cost** templates/README says which kit script tests belong in an adopter's gate and what they cost, and the workflows use the Node 24 action majors.
~~~
~~~ chunks
- [ ] **39.?tests-portable** Template script tests pass in a fresh adopter · S · closes A?tests-portable · needs —
  - steer.test.mjs:12,14,162 and claims.test.mjs:263 assume the kit's `claude/` layout.
- [ ] **39.?adopt-complete** new-project.md copies everything a v2 plan needs · S · closes A?adopt-complete · needs —
- [ ] **39.?placeholders** Every template placeholder documented, swept or flagged · M · closes A?placeholders · needs —
  - Undocumented today: `<CONTENT_LOCATION>`, `<DATA_LOCATION>`, `<PROVIDER_AUTH_TOKEN>`, `<DEPLOY_URL>`, `<DOMAIN_SPECIALIST>`, `<SPECIALIST_NAME>`, `<CANONICAL SIBLING>`, `<PROJECT-SPECIFIC RULES…>`.
- [ ] **39.?no-host** A no-deploy-host path in the templates · S · closes A?no-host · needs —
- [ ] **39.?pm-neutral** The package manager is a placeholder end to end · M · closes A?pm-neutral · needs —
- [ ] **39.?first-day** Day one in an agent session needs no workaround · S · closes A?first-day · needs —
- [ ] **39.?gate-cost** The adopter gate's cost, and actions on Node 24 majors · S · closes A?gate-cost · needs —
  - checkout and setup-node v4 warn that they target the deprecated Node 20.
~~~
