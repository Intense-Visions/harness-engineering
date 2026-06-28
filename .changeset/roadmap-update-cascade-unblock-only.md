---
'@harness-engineering/cli': patch
---

Stop `manage_roadmap update` from re-blocking unrelated features (#610). The post-update cascade re-ran `syncRoadmap`, whose `inferStatus` re-derives `blocked` for any `planned` feature with an unfinished blocker. Because `planned` and `blocked` are lateral in `STATUS_RANK`, that move was not treated as a regression and got applied verbatim — so editing one feature (e.g. setting an assignee) silently flipped every unrelated `planned`-with-pending-blocker row to `blocked`. The cascade is now unblock-only: it drops any transition _into_ `blocked`, matching its documented intent ("flip dependents from `blocked → planned`"). Re-deriving `blocked` remains the explicit `sync` action's job. (Symptoms 1 & 2 from the issue — inline assignee not written and a bystander assignee wiped — were already resolved by the assignee-lifecycle chokepoint, ADR-0045.)
