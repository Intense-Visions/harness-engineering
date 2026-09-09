---
'@harness-engineering/core': patch
---

**Canary review detectors never wired: availability matching is now prefix-insensitive.**

`planCanaryReviewDetectors` matched the bare detector names (`canary-savant`,
`canary-blackhawk`, `canary-katana`, `canary-cassandra`) against the caller's
installed-skill catalog with a plain set lookup. Canary exposes its skills
plugin-qualified — `canary:canary-cassandra`, the same form harness dispatches
elsewhere via `harness-test-advisor` — so the lookup missed on every detector and
all four were silently skipped in a canary-present project.

The skip is contractually silent (a forward-wired default must never hard-halt),
and both the module comment and `harness-autopilot/SKILL.md` still asserted that
canary 5.12.0 ships none of the four. Canary has shipped all four since 7.2.0, so a
`0/4` result read as the documented expected state rather than as the defect it was.

- Availability now matches bare or plugin-qualified names at any qualification
  depth; wired hooks still dispatch the bare name.
- Detector dedup and the `enabled: false` opt-out normalize the same way, so a
  project declaring `canary:canary-cassandra` no longer gets it dispatched twice
  or silently loses its opt-out.
- The stale canary-version claims are removed from the module and the skill doc,
  and the doc test now asserts their absence rather than their presence.
