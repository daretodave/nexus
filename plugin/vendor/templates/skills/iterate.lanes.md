# Iterate lanes

> This project's own `/iterate` audit dimensions. The kit
> re-syncs `skills/iterate.md` and never touches this file,
> so a dimension only this project audits lives here.

---

`skills/iterate.md` reads this file at one hook, through
`node scripts/plan/lanes.mjs iterate dimensions`, after its
stock dimensions. Each lane is one more dimension, lettered
back from Y (the first lane is Y, the next X, and so on) so
it never meets a stock letter. Its findings score on the
same scale and compete with the stock ones.

One block per lane. `when` is prose (the agent judges it) or
`script <path>` (exit 0 audits the dimension this tick);
absent, it always runs. `run` says what the audit reads and
what a finding looks like. `Lanes off: <name>` in
`plan/bearings.md` turns one off. No lane blocks here means
the stock dimensions only.

The example below sits inside a comment, so it is no lane.
Copy it out of the comment to make it one.

<!--
## lane: cross-links
- hook: dimensions
- when: a page shipped since the last audit
- run: every new page links to two older ones and is linked from one; each gap is a finding
- return: continue
-->
