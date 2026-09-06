---
slug: "rework-rate-instrumentation"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 96
---

### Instrument rework rate per surface

- **Status:** done
- **Spec:** —
- **Summary:** On a dogfood consumer, **215 of 1,411 distinct issue references appear in more than one commit — 15.2%**. Some of that is legitimately multi-part work; the remainder is rework, and rework at the autonomous tier is waste that scales directly with the token budget rather than with headcount. Today nothing distinguishes "this issue took four PRs because it was large" from "this issue took four PRs because the first three were wrong," so the harness cannot tell an operator that a surface is churning. Build: per-surface rework rate from issue-to-PR fan-out plus superseded/closed-unmerged PRs, separated from planned multi-part delivery by roadmap linkage, and surfaced next to throughput so the two are never read apart. Prerequisite for claiming any efficiency win: a 10x throughput gain with a 15% rework rate is a 10x waste gain too.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#1528
