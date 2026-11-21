---
max_turns: 15
allowed_tools: [Read, Write, Glob, Grep, Skill]
---

In the current directory, write a file at `plan/nexus.lock`
(creating the `plan/` directory first if it doesn't exist) with
exactly this content — nothing else, no git, no other files yet:

    kit: nexus
    version: 1.0.0
    ref: v1.0.0
    shape: chunks

Then run the plugin's `doctor` command (it is a Skill this plugin
registers once loaded). It is read-only by design — it makes no
writes anywhere. Read back the status word it reports and both
version numbers being compared, and say what it points you at next.

Do not write, edit, move or delete `plan/nexus.lock`, or create any
other file, after that first write — this case is checking that
doctor itself never touches disk.

Report: the status word, both version numbers (this repo's and the
plugin's), and what the status word tells you to do next.
