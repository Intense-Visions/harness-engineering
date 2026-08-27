---
slug: "emit-provenance-trailer-from-agent-commits"
milestone: "v5.0 — Trust & Security Model"
order: 99
---

### Emit a machine-readable provenance trailer from agent-authored commits

- **Status:** planned
- **Spec:** —
- **Summary:** Harness-authored work is statistically invisible. Measured across two orgs: a personal org carries **69 AI co-author trailers in 6,570 commits (1%)**, and a dogfood product repo **974 in 4,618 (21%)** — while its highest-volume author shows **5 trailers across 3,988 commits**, because the fleet path emits nothing. Consequences compound: org-wide AI-adoption reporting undercounts by roughly 5x and cannot distinguish the autonomous tier from interactive assistance (the distinction that explains an 18x throughput gap); cost attribution has no key to join spend to authorship; and in a regulated codebase there is no record of which agent, skill and version produced a change touching a gated path. Build: a distinct trailer — `Harness-Run: <skill>@<version>` plus lane and agent id — emitted by the fleet path rather than co-opting `Co-authored-by`, so tier detection is mechanical and the trailer doubles as the accountability record. Foundation for `cost-per-merged-pr-attribution` and for human-in-the-loop attestation on gated paths.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#1531
