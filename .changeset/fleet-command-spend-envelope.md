---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
'@harness-engineering/orchestrator': patch
'@harness-engineering/cli': minor
---

Spend-govern the skill/fleet-command dispatch path, not just the orchestrator engine
(#1600). #1525's per-period token spend envelope previously enforced only inside the
orchestrator engine's `state-machine.ts` dispatch loop; skill-driven fleet fan-out
(`/harness:roadmap-fleet`, `fleet-command`) was bounded by a leaf-SLOT cap only, never a
spend cap, so a single coordinated run could burn unbounded tokens.

The spend-vs-envelope comparison is now a shared, pure primitive in
`@harness-engineering/core` (`fleet/spend-budget`: `isGlobalEnvelopeExhausted`,
`isFleetAllocationExhausted`, `evaluateSpendEnvelope`), with its shapes in
`@harness-engineering/types` (`fleet-spend-budget.ts`) — mirroring how the per-leaf
context budget spans both paths. The orchestrator's `budget-governor` delegates its
exhaustion predicates to it, and a new concrete callable, `harness fleet budget-check`,
is the DISPATCH-time consult the fleet-family / `fleet-command` contract invokes before
scheduling each lane: it reads observed spend from burn's existing per-fleet/per-lane
attribution (#1270) and reports `within | exhausted | unconfigured` (exit `10` on
exhausted), stopping clean at a lane boundary when the envelope is spent. No-op and
byte-identical when unconfigured.
