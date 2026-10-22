---
date: 2026-10-22
---
## Edit plan/README.md
~~~ old
 left |

Spec numbers continue from the v1 phase numbers
~~~
~~~ new
 left |
| 49 | The GUI tells the truth on the owner's walk (0.4.2) | [49-gui-walk-fixes.md](49-gui-walk-fixes.md) | planned | 11 left |

Spec numbers continue from the v1 phase numbers
~~~

## Edit plan/README.md
~~~ old
plan moved to chunks on 2026-10-20). The next new spec is 49.
~~~
~~~ new
plan moved to chunks on 2026-10-20). The next new spec is 50.
~~~

## Decisions
- **D?secret-optional** · 2026-10-22 · (proposed) A `nexus.secrets.json` entry may carry `optional: true`; the GUI and `secrets.mjs status` show an unset optional secret as "optional · not set", never missing. *Why:* prose in `for` can't be read by a tool, and a warning on a secret nobody needs teaches people to ignore warnings.
- **D?gui-bypass** · 2026-10-22 · (proposed) The GUI may start sessions in `bypassPermissions`, chosen per checkout in Settings, default Ask, shown with a plain warning; `nexus run` keeps refusing it. *Why:* the owner asked for it for his own machine; the opt-in is explicit and visible, and the headless path stays allowlist-only, per `customization/claude-code.md`.
