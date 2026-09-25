---
'@harness-engineering/stats': minor
---

New leaf package `@harness-engineering/stats`: the durable home for the harness's statistical instruments. This first release ships two instruments, each as one namespace so their functions can never collide: `bandit` (explore/exploit over a half-life-decayed ledger) and `sprt` (Bernoulli sequential probability ratio test); the two instrument entries in this release describe each surface. Later instruments land as sibling namespaces. Runtime dependency is exactly `@harness-engineering/types`, so any consumer can import it without a layer exception.
