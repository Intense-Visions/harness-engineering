# Plan: LMLM Phase 2a — HuggingFace Client + Cache

**Date:** 2026-05-27 | **Spec:** `docs/changes/local-model-lifecycle-manager/proposal.md` (Phase 2, lines 414–429) | **Tasks:** 6 | **Time:** ~2–3 hours | **Integration Tier:** small | **Session:** `changes--local-model-lifecycle-manager--phase2a`

## Goal

Land the HuggingFace API client and its cache layer as a standalone, dependency-injected slice of Phase 2. The client surfaces the same drift-tolerant warning envelope as `HardwareDetector` (S4 mirrors S3): network errors, decode failures, and rate limiting degrade to warnings rather than throws, and the cache provides a stable read path when HF is unreachable.

Phase 2a deliberately stops short of the ranker (`ranker/{vram,speed,evidence,recency,benchmarks,algorithm}.ts`), benchmark sources, and the frozen on-disk snapshot. Those land in Phase 2b–2d. This phase only needs to deliver the _data plumbing_ that the ranker will sit on top of:

- A typed, version-tagged `HuggingFaceClient.listModels()` that paginates HF's `/api/models` and decodes rows into `HuggingFaceModelSummary[]`.
- An in-memory + on-disk cache with TTL that the client transparently consults.
- A `HttpFetcher` DI seam so unit tests stay deterministic and the production code can plug in retry/proxy wrappers without churning the client.

The full Phase 2 checkpoint criteria (F3 + Q1–Q5 + S4) require the ranker — Phase 2a only validates S4 (HF failure → cache fallback path) so the downstream phases inherit a stable foundation.

## Phase 2a Scope (subset of spec Phase 2)

In:

- `src/huggingface/types.ts` — `HuggingFaceModelSummary`, `HuggingFaceWarning`, `HuggingFaceFetchResult`, `HuggingFaceListOptions`, drift-tolerant Zod schema (committed in pre-phase scaffolding; this plan ratifies it).
- `src/huggingface/http.ts` — `HttpFetcher` interface + default `globalThis.fetch`-backed implementation with timeout + User-Agent (committed in pre-phase scaffolding; this plan ratifies it).
- `src/huggingface/cache.ts` — `HuggingFaceCache` with TTL (in-memory map of namespaced keys; optional on-disk JSON store written via tmp+rename to `~/.harness/local-models/hf-cache/`).
- `src/huggingface/client.ts` — `HuggingFaceClient` with `listModels(opts)`; paginates via `Link: rel="next"` (capped by `maxPages`); never throws — failures resolve as `{ value: [], warnings, source: 'cache' | 'live' }`.
- `src/huggingface/index.ts` — barrel re-export.
- `src/index.ts` — already re-exports from `./huggingface/index.js`; just confirm the comment block names Phase 2a.
- Tests: `tests/huggingface/{client,cache,types}.test.ts` — decode parity, pagination, retry budget, error fallback, cache TTL.

Out of Phase 2a (deferred):

- Ranker math, benchmark adapters, evidence grading, recency weighting (Phase 2b–2d).
- Frozen `benchmarks/snapshot.json` (Phase 2d once benchmark sources exist).
- Authenticated requests (HF API token); Phase 2a only consumes public endpoints.
- Per-model detail fetch (`/api/models/<id>`); Phase 2a only paginates the list.
- Wiring the client into the scheduler (Phase 6) or HTTP/WS (Phase 7).

## Observable Truths (Acceptance Criteria — Phase 2a only)

1. **OT1** — `HuggingFaceClient.listModels({ author: 'Qwen', limit: 50 })` resolves to `{ value: HuggingFaceModelSummary[], warnings: [], source: 'live' }` on a happy-path stub. Unknown rows are dropped; the `dropped` count surfaces as a structured warning when ≥ 1.
2. **OT2** — Pagination follows `Link: <…>; rel="next"` up to `maxPages` (default 5); the test stub returns three pages and asserts all rows are merged.
3. **OT3** — A 5xx response or thrown fetch is retried with exponential backoff (initial 200 ms, multiplier 2, max 3 attempts); after exhaustion, the client returns the cache (if present) or `{ value: [], warnings: [{ code: 'hf_fetch_failed', … }], source: 'cache' }`.
4. **OT4** — A 429 response with `Retry-After` honors the header (capped at 5 s in tests); a 429 without the header falls back to exponential backoff.
5. **OT5** — `HuggingFaceCache` round-trips through the in-memory layer instantly; with an injected `FsAdapter`, on-disk reads warm the in-memory layer on first access. Expired entries are evicted on read.
6. **OT6** — The on-disk store writes via tmp + rename (atomicity) and tolerates a missing parent directory by creating it on demand.
7. **OT7** — Decode of a row missing `id` is dropped (not thrown). A drop count > 0 produces a `hf_decode_dropped_rows` warning.
8. **OT8** — `pnpm --filter @harness-engineering/local-models build && test && typecheck` green; existing hardware tests still pass; no flakes across 3 consecutive runs locally.
9. **OT9** — `harness validate` passes on a legacy config (N4 from spec success criteria).

## File Map

- KEEP `packages/local-models/src/huggingface/types.ts` (already drafted)
- KEEP `packages/local-models/src/huggingface/http.ts` (already drafted)
- CREATE `packages/local-models/src/huggingface/cache.ts`
- CREATE `packages/local-models/src/huggingface/client.ts`
- CREATE `packages/local-models/src/huggingface/index.ts`
- CREATE `packages/local-models/tests/huggingface/client.test.ts`
- CREATE `packages/local-models/tests/huggingface/cache.test.ts`
- CREATE `packages/local-models/tests/huggingface/types.test.ts`
- CREATE `.changeset/lmlm-phase2a-huggingface-client.md`

## Tasks

### Task 1: HuggingFaceCache — in-memory + injectable filesystem layer

**Depends on:** none | **Files:** `src/huggingface/cache.ts`, `tests/huggingface/cache.test.ts`

1. `interface FsAdapter { readFile(path): Promise<string | null>; writeFile(path, data): Promise<void>; ensureDir(path): Promise<void>; }` — minimal so tests can supply a Map-backed in-memory adapter.
2. Default impl uses `node:fs/promises` and writes atomically (tmp + rename).
3. `HuggingFaceCache` constructor takes `{ ttlMs?: number; fs?: FsAdapter; rootDir?: string; now?: () => Date }`. Default TTL is 24h (matches the spec's daily refresh cadence, D9).
4. API: `get<T>(key): Promise<{ value: T; storedAt: number } | undefined>`, `set<T>(key, value): Promise<void>`, `invalidate(key?): Promise<void>` (full clear when no key).
5. Tests cover: in-memory hit, TTL expiry eviction, tmp+rename via injected FS, missing-parent-dir handling, namespace isolation (different keys don't collide).

### Task 2: HuggingFaceClient — `listModels` with pagination, retry, decode

**Depends on:** Task 1 + existing `types.ts` + existing `http.ts` | **Files:** `src/huggingface/client.ts`, `tests/huggingface/client.test.ts`

1. Constructor accepts `{ http?: HttpFetcher; cache?: HuggingFaceCache; baseUrl?: string; maxAttempts?: number; backoffMs?: number; retryAfterCapMs?: number; now?: () => Date }`. Defaults: `baseUrl = 'https://huggingface.co'`, `maxAttempts = 3`, `backoffMs = 200`, `retryAfterCapMs = 5_000`.
2. `listModels(opts: HuggingFaceListOptions = {})` resolves to `HuggingFaceFetchResult<HuggingFaceModelSummary[]>`.
   - Build query string from `author`, `search`, `filter`, `tags` (joined with `,`), `limit`.
   - Always include `sort=downloads&direction=-1` (spec uses popularity-aware ranking).
   - Follow `Link: <…>; rel="next"` up to `maxPages` (default 5) when `paginate: true`.
   - On 2xx: decode via `decodeModelSummaries`; emit `hf_decode_dropped_rows` warning if any rows dropped; persist to cache; resolve `source: 'live'`.
   - On 4xx (non-429): no retry; surface `hf_client_error` warning carrying the status code; fall back to cache when present.
   - On 429: honor `Retry-After` seconds (capped); else exponential backoff.
   - On 5xx / network throw: exponential backoff up to `maxAttempts`; after exhaustion fall back to cache; never throw.
3. Tests: stub `HttpFetcher` with a Map of URL → response sequence; cover live success, multi-page pagination, decode drops, 5xx → retry → success, 5xx exhausted → cache fallback, 429 honoring header, 4xx no retry.

### Task 3: Decode + types unit tests

**Depends on:** none (the pre-phase scaffolding lands the implementation) | **Files:** `tests/huggingface/types.test.ts`

1. Verify `HuggingFaceModelSummarySchema` accepts a realistic row, drops a malformed row, and surfaces the `library_name` → `libraryName` rename + `pipeline_tag` → `pipelineTag` rename.
2. Verify `decodeModelSummaries` returns `{ models: [], dropped: 0 }` for non-array input.
3. Verify dropped count is correct for a mixed batch.

### Task 4: Public surface — barrel + main index

**Depends on:** Tasks 1–3 | **Files:** `src/huggingface/index.ts`, `src/index.ts` (verify)

1. `src/huggingface/index.ts` re-exports `HuggingFaceClient`, `HuggingFaceCache`, `defaultHttpFetcher`, the public types, and `decodeModelSummaries`.
2. Confirm `src/index.ts` already re-exports from `./huggingface/index.js`; bump the comment block to name Phase 2a explicitly.

### Task 5: Changeset

**Depends on:** Tasks 1–4 | **Files:** `.changeset/lmlm-phase2a-huggingface-client.md`

1. `minor` bump on `@harness-engineering/local-models`.
2. Body: "Adds Phase 2a of the Local Model Lifecycle Manager — HuggingFace API client + cache. Drift-tolerant decode (unknown rows dropped, never thrown), pagination via `Link: rel='next'` (capped at 5 pages), exponential backoff on 5xx, `Retry-After`-aware on 429, in-memory + on-disk cache with 24h TTL. Network failures degrade gracefully to cached data — the client never throws. The ranker that sits on top of this (Phase 2b+) is unimplemented; the new exports are wired but not yet consumed by the orchestrator."

### Task 6: Verification gate — build, typecheck, test, validate

**Depends on:** Tasks 1–5 | **Files:** none

1. `pnpm --filter @harness-engineering/local-models build` — green.
2. `pnpm --filter @harness-engineering/local-models typecheck` — green.
3. `pnpm --filter @harness-engineering/local-models test` — green (new tests + existing hardware tests).
4. `pnpm exec harness validate` from repo root — green.
5. If any step fails: stop, diagnose, fix, re-run.

## Integration Notes

Phase 2a's integration footprint stays inside the package barrel — no new orchestrator wiring, HTTP routes, CLI commands, or dashboard panels. Downstream phases consume it:

- **Phase 2b–2d (Ranker)** call `HuggingFaceClient.listModels` to source candidate repos; the cache absorbs HF rate limits during the algorithm port.
- **Phase 6 (Scheduler)** owns the client lifecycle (`new HuggingFaceClient({ cache: new HuggingFaceCache({ rootDir: '~/.harness/local-models/hf-cache' }) })`) and invalidates the cache on `harness models refresh`.
- **Phase 7 (HTTP/WS)** never touches the client directly; the scheduler's ranking output is what the routes serve.

**Knowledge graph**: no new business concepts in Phase 2a. The five spec concepts (Local Model Pool, Model Proposal, etc.) land alongside their implementations in Phases 3, 5, 6.

**ADRs**: none in Phase 2a. The seven ADRs in the spec land with the code that justifies them (Phases 3, 5, 6 primarily).

**Docs**: changeset only. The operator-facing `local-model-lifecycle.md` guide lands in Phase 9.

## Uncertainties

- **[ASSUMPTION]** The HF `/api/models` Link header pagination remains stable. If HF switches to cursor-based pagination, the client surfaces a `hf_pagination_unsupported` warning and returns the first page only.
- **[ASSUMPTION]** No HF API token in v1; we only consume public endpoints. Authenticated requests (higher rate limits, private repos) are deferred until an operator asks for them.
- **[DEFERRABLE]** Per-model detail fetch (`/api/models/<id>` with `siblings`, `gguf`, etc.) lands when the ranker needs file-level quant info — likely Phase 2b alongside the VRAM math.
- **[DEFERRABLE]** The on-disk cache key strategy is a simple SHA-1 of the URL today. If we observe cache directory bloat, we'll add a sharded layout (e.g., `aa/bbcc…`) in a follow-up.
