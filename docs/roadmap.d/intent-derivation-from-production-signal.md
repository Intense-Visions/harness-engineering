---
slug: "intent-derivation-from-production-signal"
milestone: "Full-lifecycle reach"
order: 108
---

### Derive candidate work from production signal, not only from human specification
- **Status:** planned
- **Spec:** —
- **Summary:** Human specification supply is the absolute ceiling on autonomous throughput. `unattended-work-decomposition` removes the human from *breaking down* work; nobody has removed them from *originating* it, and no person authors hundreds of units of intent per day. Beyond some rate the organisation stops being engineers implementing decisions and becomes a loop that senses and responds — so candidate work must be derivable from evidence: error and incident streams, performance regressions, usage and abandonment patterns, dependency and security advisories, support themes. `operations-enforcement-skill-production-signal-ingestion` covers *ingesting* production signal into the knowledge graph; this item covers turning ingested signal into ranked, specified candidate work with provenance back to the observation that motivated it. Build with a hard constraint: derived intent enters the same ranked queue and the same human confirmation path as authored intent, never a privileged one. A system that can both invent and execute its own work without a gate is not a productivity tool.
- **Blockers:** Depends on `operations-enforcement-skill-production-signal-ingestion`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1540
