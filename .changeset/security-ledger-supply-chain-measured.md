---
'@harness-engineering/core': patch
---

fix(security): the security ledger no longer records an unmeasured supply chain as zero findings (#2082). `SupplyChainSnapshot` gains an additive `measured` flag (legacy snapshots still parse and read as unmeasured); a snapshot captured without audit data is stamped `measured: false` and its `securityScore` is capped at 90 instead of crediting the dimension as clean. `captureSupplyChain()` now runs the audit matching the lockfile (`pnpm audit` / `npm audit`), derives `total` from the severity buckets when pnpm omits it, and reports a failed or unparseable audit as unmeasured rather than zero. New `SecurityTimelineManager.supplyChainFromAuditJson()` lets callers that already ran an audit merge its counts in.
