# Upgrade nexus — agent prompt

> Paste the short version from README.md's
> [Used v1? On v2?](../README.md#used-v1-on-v2) into any agent
> at your project's root; it points here. This file is the
> full instruction set the agent then follows: a dry run of
> `npx @usenexus/cli upgrade`, read back to you, and a write
> only on your say-so. It works for a v1 repo (a phase plan)
> and for a v2 repo behind the current kit alike. Read it
> yourself first if you want to know exactly what you're
> authorizing.

---

## The prompt

```
Upgrade this repo to the current nexus kit.

nexus is at ../nexus (or ./.nexus if submoduled). Read
../nexus/playbooks/upgrade.md top to bottom before running
anything. The command it describes does the work; your job
is to run it, read its report, and stop where this prompt
says.

  1. Say which version this repo is on, from the playbook's
     "Which version am I on" table: v1, half-done or v2.

  2. Run the dry run from the repo root:

       npx @usenexus/cli upgrade --verify

     It fetches origin and works in a temporary worktree; it
     never reads or writes this checkout. If it exits 2, say
     why and stop.

  3. Read the report back, part by part, as the playbook's
     "Reading the report" table lists them. Call out, by
     name:
       - every file marked kept-custom or moved-to-lane, and
         the lane each custom section became;
       - every warning;
       - any gate leg that is red;
       - the predicted first dispatch, and whether it is the
         work this repo's loop does today (an idle prediction
         on a live loop is a stop);
       - the knobs written and the loop-mode line.

  4. If anything above is wrong, say what and stop. Do not
     edit the repo to make the report look right; the fix is
     a finding for the owner.

  5. Ask the owner which landing they want, and run only
     that:
       - npx @usenexus/cli upgrade --write      (a local commit
         on a branch, nothing pushed)
       - npx @usenexus/cli upgrade --pr         (a pull request
         whose body is the report)
       - npx @usenexus/cli upgrade --land owner (lands between
         two ticks of a live loop and watches the first)
     Without an answer, stop after the dry run.

  6. After a landing, report the commit (or the pull request)
     and, for --land owner, the first tick's dispatch and
     commit. A tick that no-ops where the report predicted
     work: give the owner the --rollback line from the
     output; do not run it yourself.

Hard rules:
  - Never run --write, --pr, --land or --rollback without the
    owner's answer in this session.
  - Never copy kit files by hand, edit the lock, or delete v1
    files yourself; the command does all of it in one commit.
  - Never set repository variables or secrets. Print the
    gh variable set lines the report gives, for the owner.
  - Never add a Co-Authored-By trailer or emojis to anything
    you commit.
```

## What to expect back

- The version this repo is on.
- The report, read back: custom text and where it went,
  warnings, the gate, the predicted first dispatch, the knobs.
- One question: which landing.
- After a landing: the commit or pull request, and the first
  tick when you chose `--land owner`.

## See also

- [`../playbooks/upgrade.md`](../playbooks/upgrade.md): the
  runbook the agent reads, and the by-hand route.
- [`adopt.md`](./adopt.md): a repo with no nexus yet.
