---
slug: "interface-futures-forward-contracts"
milestone: "Parallel Execution & State"
order: 131
---

### Interface futures — forward contracts on shared interfaces

- **Status:** planned
- **Spec:** —
- **Summary:** Concurrent-change machinery on the roadmap detects collisions after they form; nothing prevents the most expensive class — many in-flight changes building against an interface one of them is about to change. Borrow the forward contract: an agent (or human) intending to change a shared interface declares the future shape first — a signed, versioned declaration of the post-change contract with an intended landing window. Other agents building in the overlap window resolve the interface through the declaration and build against the announced future shape; the coordination layer sequences landings so the interface change lands first and dependents land behind it, already conformant. Declarations are binding-by-default with an explicit abort path (an aborted future notifies every dependent build). This is the constructive complement to collision detection: coordination by declared intent instead of by crash. Scope guard: v1 covers typed, statically-resolvable interfaces (exported signatures, schemas, API contracts), not behavioral semantics.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1615
