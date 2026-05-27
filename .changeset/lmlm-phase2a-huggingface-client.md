---
'@harness-engineering/local-models': minor
---

Adds Phase 2a of the Local Model Lifecycle Manager — the HuggingFace API client and cache layer.

The new `HuggingFaceClient` wraps `huggingface.co/api/models` with `listModels` and `getModel`, follows `Link: rel="next"` pagination cursors when asked, and degrades to a structured warning on 4xx/5xx, network failure, or JSON-decode failure rather than throwing — matching the S4 contract that `harness models status` stays usable when HF is unreachable. Rows are decoded through a drift-tolerant Zod schema so unexpected HF API churn drops individual rows instead of rejecting whole batches.

The cache layer ships two implementations:

- `InMemoryHuggingFaceCache` — a `Map`-backed TTL cache for unit tests and process-local hot paths.
- `FileHuggingFaceCache` — a disk-backed JSON cache that writes via tmp file + `rename` so a crash mid-write cannot corrupt an entry (the same atomic-write pattern Phase 3 needs for the pool-state file). Envelope is schema-versioned, mkdir is lazy and idempotent, and the most recent decode/IO warning is exposed via a `lastWarning` getter for downstream operator surfaces.

The HTTP fetcher, file system, and clock are all dependency-injected through the same DI pattern Phase 1's `ShellRunner` established, so unit tests stay deterministic and the production scheduler can plug a `FileHuggingFaceCache` in without further wiring.

No orchestrator wiring yet — the ranker (Phase 2b), benchmark adapters (Phase 2c), ranking algorithm (Phase 2d), scheduler (Phase 6), and HTTP routes (Phase 7) that consume this surface arrive in subsequent phases. LMLM remains opt-in and disabled by default per Phase 0.
