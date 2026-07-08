---
'@harness-engineering/orchestrator': minor
'@harness-engineering/dashboard': minor
'@harness-engineering/types': minor
---

feat(lmlm): install & remove models directly from the dashboard panel

Adds operator-initiated pool mutation to the LMLM dashboard — an **Install**
action on Recommendations rows and a **Remove** action on Pool-card members — so
the operator no longer has to hand-edit config or use the CLI.

- **Backend:** two convenience routes, `POST /api/v1/local-models/pool/install`
  and `POST /api/v1/local-models/pool/remove`, gated by the same
  `manage-proposals` scope as approve/reject. Both are modeled as user-initiated
  **auto-approved model proposals**, reusing the existing `onApproveModelProposal`
  core — so the pool guards (`not_allowed`/`budget_exceeded` → `409`), the
  in-use evict-deferral (`202 deferred`), and the audit trail all apply, and
  proposals remain the single pool-mutation channel (ADR 0011).
- **Dashboard:** an Install button per recommendation (an already-pooled model
  shows "installed"), a Remove button per pool member (with a "removes after the
  current run" note when the model is in use). Byte-level pull progress over WS
  is a deferred enhancement; install shows an indeterminate "Installing…" state.
- **Types:** `PoolInstallRequest`, `PoolRemoveRequest`, `PoolMutationDisposition`,
  `PoolMutationResult`.
