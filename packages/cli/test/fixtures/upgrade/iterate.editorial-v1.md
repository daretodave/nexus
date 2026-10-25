# Skill: iterate

> Audit the site, ship the top finding.

## 1. Purpose

The site is never done: each tick finds the best cheap win.

## 4. The audit (run unless `/iterate audit` is the only ask)

### Audit categories

#### A. Content gaps

- **Pillar quota.** A pillar with fewer than eight articles is a
  content-gap finding, scored by how far under it sits.

## 5. Procedure

### Step 3 — Delegate or implement

- **Cross-links (cluster-aware)**: when the winning row is a
  cross-links row, take its hub article, drain every open
  cross-links row naming it in one commit
  (`node scripts/article-crosslink-survey.mjs --json --slug X`),
  and tick them all.

### Step 8 — Done

Return cleanly. The loop's next tick re-audits and ships the new top.

## 6. Failure modes — when to stop

1. A red deploy after a fix: revert first, then report.
