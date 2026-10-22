**The task:** every board card shows how long ago its chunk last moved.

**Already built / Not built / Not planned**
- Already built: the card's time label (`src/ui/plan.jsx`).
- Not built: a relative clock on the card (A4 in plan/12-board.md).
- Not planned: a tooltip with the exact time.

**Where it would go:** `## Add plan/12-board.md`, one chunk `12.?ago`, S, closes `A?ago`, needs nothing.

**When /next builds it:**

```
now:   Asap lane: 9.2-9.4 -> 11 (2) -> 12.3
after: Asap lane: 9.2-9.4 -> 11 (2) -> 12.3 -> [12.?ago]
```

**Open questions**
1. On every card, or only the claimed ones? Default: every card.
2. Seconds, or minutes at the finest? Default: seconds.

**How to move it:** `/plot "relative age on board cards"`, `/plot asap ...`, `/plot ... and do`.

Retro: clean run.

```nexus-plot
{
  "task": "Every board card shows how long ago its chunk last moved",
  "mode": "peek",
  "built": [{ "what": "The card's time label", "where": "src/ui/plan.jsx" }],
  "notBuilt": [{ "what": "A relative clock on the card", "where": "A4" }],
  "notPlanned": [{ "what": "A tooltip with the exact time" }],
  "spec": { "file": "plan/12-board.md", "joined": true },
  "chunks": [{ "id": "12.?ago", "title": "Relative age on board cards", "size": "S", "closes": "A?ago", "needs": "—", "files": ["src/ui/plan.jsx", "src/styles/base.css"] }],
  "order": { "before": ["9.2-9.4", "11 (2)", "12.3"], "after": ["9.2-9.4", "11 (2)", "12.3", "12.?ago"], "lit": ["12.?ago"], "ahead": 5 },
  "questions": [
    { "q": "On every card, or only the claimed ones?", "options": ["every card", "claimed only"], "default": "every card" },
    { "q": "Seconds, or minutes at the finest?", "options": ["seconds", "minutes"], "default": "seconds" }
  ],
  "move": { "plot": "/plot \"relative age on board cards\"", "asap": "/plot asap \"relative age on board cards\"", "doNow": "/plot \"relative age on board cards\" and do" }
}
```
