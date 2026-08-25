---
'@harness-engineering/core': minor
---

Auto-wire canary's deterministic test detectors at autopilot `REVIEW` /
`FINAL_REVIEW`. When canary is present (detected via the existing `canary_probe`
tool), autopilot runs canary's specific deterministic detectors — `canary-savant`
(order dependence / shared-state leakage), `canary-blackhawk` (temporal
dependence), `canary-katana` (tests deleted or newly skipped), and
`canary-cassandra` (vacuous tests) — **alongside** `harness-code-reviewer`,
reusing the merged `skillHooks` dispatch path.

The detectors are **forward-wired** harness defaults: they are resolve-and-filtered
by availability, so a detector whose skill is not installed is **gracefully
skipped** (recorded in the denominator), **never a hard halt**. Each detector
auto-activates if/when canary ships it. As of canary 5.12.0 the plugin ships none
of the four, so today they all skip and REVIEW proceeds normally. The hard-halt
(false-green protection) stays reserved for **user-declared** unresolvable
`skillHooks` entries — a user's typo still fails loudly.

New pure resolvers in `@harness-engineering/core`: `planCanaryReviewDetectors`
(returns `{ wired, skipped, expected }`), `resolveCanaryReviewHooks`, and
`resolveReviewHooksWithCanary` (layers installed canary defaults on top of a
project's configured `skillHooks`, deduping any detector the project already
declares, incl. `enabled:false` opt-out), plus the `SkillAvailability` type and
`CANARY_REVIEW_DETECTORS`/`CANARY_REVIEW_EVENTS`. Canary absent = today's exact
behavior, no regression. Zero per-project config. Closes #1482 on the harness
side (detectors are forward-wired pending canary shipping them upstream).
