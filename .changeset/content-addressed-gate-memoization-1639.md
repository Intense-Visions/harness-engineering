---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

feat(ci): content-addressed memoization cache for gate verdicts — an action
cache that skips recomputing an unchanged check (#1639).

Adds an opt-in (default OFF), local, content-addressed `VerdictCache` wired
transparently into the CI check orchestrator. Each check's verdict is keyed by a
SHA-256 over `(check identity × gate version × config hash × input hash)`, where
the input hash is a single content digest of the project's tracked
source/config/docs tree computed once per run and shared by every check. On a
hit the stored `CICheckResult` is returned instead of re-running the check; on a
miss the check runs and records its verdict.

Correct-by-construction: only checks whose full verdict closure the source-tree
hash covers are memoized. `arch` and `traceability` are excluded because their
verdicts depend on `.harness` baseline/graph state (and, for `arch`, the git
base-ref) that no working-tree hash captures — so they always run and are never
cached. For the memoized checks the closure is an honest over-approximation, so
any changed input yields a different hash and forces a miss (it may over-miss,
which only wastes compute). Gate-version and config changes miss by construction;
a check that threw is never cached; entries are written atomically. Hit/miss
telemetry is
attached as an optional `cacheStats` field on `CICheckReport`, absent on the
default cache-off path so existing report output is byte-identical.

Enable per project via `cache.verdicts.enabled` (dir defaults to
`.harness/cache/verdicts`). Scope note: this slice is a local cache with
over-approximated closures; per-gate input-closure declaration + runtime
access-recorder, a shareable/distributed backend, and per-gate savings telemetry
are deferred (see `Refs #1639`).
