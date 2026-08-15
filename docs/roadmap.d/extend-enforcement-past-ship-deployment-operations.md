---
slug: "extend-enforcement-past-ship-deployment-operations"
milestone: "Full-lifecycle reach"
order: 3
---

### Extend enforcement past ship (deployment + operations)

- **Status:** done
- **Spec:** docs/changes/enforcing-deploy-gate/proposal.md
- **Summary:** DELIVERED (PR #1193, merged) — Half A. Upgraded `harness-deployment` from Tier-3 advisory to an enforcing pre/post-deploy gate + rollback wiring. Today the lifecycle no longer stops enforcing the moment code ships; this extends the constraint loop past release. Half B — an operations skill that pulls live production signals (incidents, monitoring) back into the knowledge graph — was deferred by owner decision pending real production-signal sources and is split out as a new planned item (Operations enforcement skill). --- _Part of the **Full-lifecycle reach** track (STRATEGY.md v2). Rationale: `docs/knowledge/skills/sdlc-coverage-and-agentic-trajectory.md`._
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#712
