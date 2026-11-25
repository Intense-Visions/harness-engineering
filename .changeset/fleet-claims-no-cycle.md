---
'@harness-engineering/core': patch
---

Break the `fleet/claims` runtime import cycle (#2695): the lease primitives move to `claims/claim.ts`, `claims/index.ts` only re-exports, and `select.ts` imports `./claim`. No public API change.
