---
date: 2026-10-21
---
## Add plan/45-plan-additions.md
~~~ acceptance
- **A?open-prs** `/plot` spots an open pull request whose
  pending file extends the same spec ("Already in PR #N").
~~~
~~~ chunks
- [ ] **45.?open-prs** `/plot` reads open pull requests'
  pending files for the specs they extend · S · closes
  A?open-prs · needs 45.3
~~~

## Edit plan/README.md
~~~ old
- 45.3: plan additions that never conflict.
~~~
~~~ new
- 45.3, then 45.?open-prs: plan additions that never conflict.
~~~
