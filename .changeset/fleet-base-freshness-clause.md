---
'@harness-engineering/core': minor
---

fleet: add a base-freshness clause to the `-fleet` verification discipline (#1294). A green CI conclusion counts as `verified`/merge-ready only when it ran against current `main` (branch up to date, or branch protection enforces strict/up-to-date-before-merge); green gathered against a base that `main` has since moved past is stale and downgrades the item to `degraded`, reported with the stale tested base SHA vs current `main`. Stated once in the `docs/reference/fleet-family.md` spine and referenced in every member's VERIFY. Adds the mechanical `classifyBaseFreshness` helper to `@harness-engineering/core` so the clause is checkable in code, not only prose.
