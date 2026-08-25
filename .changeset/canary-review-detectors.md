---
'@harness-engineering/core': minor
---

Auto-wire canary's deterministic test detectors at autopilot `REVIEW` /
`FINAL_REVIEW`. When canary is present (detected via the existing `canary_probe`
tool), autopilot now runs canary's specific deterministic detectors —
`canary-savant` (order dependence / shared-state leakage), `canary-blackhawk`
(temporal dependence), `canary-katana` (tests deleted or newly skipped), and
`canary-cassandra` (vacuous tests) — **alongside** `harness-code-reviewer`,
reusing the merged `skillHooks` dispatch path. New pure resolvers in
`@harness-engineering/core`: `resolveCanaryReviewHooks` and
`resolveReviewHooksWithCanary` (plus `CANARY_REVIEW_DETECTORS`/
`CANARY_REVIEW_EVENTS`) layer the canary defaults on top of a project's
configured `skillHooks`, deduping any detector the project already declares. A
named detector that cannot be dispatched while canary is present is a hard halt
(false-green protection); canary absent = today's exact behavior, no regression.
Zero per-project config required. Closes #1482.
