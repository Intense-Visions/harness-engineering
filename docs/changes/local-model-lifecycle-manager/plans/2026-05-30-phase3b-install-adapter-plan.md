# Plan: LMLM Phase 3b — Install adapter layer

**Date:** 2026-05-30 | **Spec:** `docs/changes/local-model-lifecycle-manager/proposal.md` (Phase 3, lines 431–443; D4, D12, D13, S6, S7) | **Tasks:** 5 | **Time:** ~3 hours | **Integration Tier:** small | **Session:** `changes--local-model-lifecycle-manager--phase3b`

## Goal

Ship the three install-adapter modules the Phase 3c `PoolManager` orchestrator will compose with Phase 3a's `PoolStateStore` + `planEviction`: the transport-agnostic `InstallAdapter` contract, the first-class `OllamaInstallAdapter` speaking `/api/pull|delete|tags|show`, and the `AdvisoryInstallAdapter` rendering copy-paste commands for backends whose lifecycle is operator-driven (D4). Together these modules give the rest of LMLM a single error taxonomy (`InstallErrorCode`) to branch on and a single streaming envelope (`InstallEvent`) for progress.

Phase 3b explicitly **does not** ship the `PoolManager` orchestrator (Phase 3c), the `LocalModelResolver` integration (Phase 4), CLI subcommands (Phase 7), the background scheduler (Phase 6), or the proposal engine (Phase 5b). Every Phase 3b module is opt-in and is consumed by Phase 3c's manager only when `localModels.enabled = true`.

## Phase 3b Scope (from spec Phase 3, lines 431–443)

In:

- `src/installer/types.ts` — public type surface: `InstallAdapter` interface, `InstallEvent` discriminated union (`pulling | progress | success | error`), `InstallResult` (`success | error`), `InstallErrorCode` enum (`advisory_only`, `failed_target_missing`, `installer_unavailable`, `install_failed`, `not_in_pool`, `parse_failed`), `InstallerFetcher` + `InstallerFetchResponse` (with optional NDJSON `body: AsyncIterable<string>`), and the request shapes (`InstallRequest`, `EvictRequest`, `ListRequest`, `InspectRequest`).
- `src/installer/errors.ts` — `InstallError` extends `Error` with a stable `code: InstallErrorCode`, `status?`, `target?`, plus `toJSON()` preserving the discriminant across the structured-logger boundary. `isInstallError` guard for catch blocks that need to distinguish adapter failures from unrelated errors.
- `src/installer/interface.ts` — re-exports the `InstallAdapter` interface and ships `nullInstallAdapter()` whose methods reject with `InstallError('installer_unavailable', …)`. The null adapter is the manager's default when LMLM is disabled and a test seam for scenarios that don't exercise the install path.
- `src/installer/ollama.ts` — `OllamaInstallAdapter` implementing the contract against the Ollama REST API. NDJSON pull streaming decoded into `InstallEvent`s; transport rejects mapped to `installer_unavailable`; HTTP 404 → `failed_target_missing`; mid-stream abort → `install_failed`; malformed NDJSON line → `onWarn` + skip; stream that never reports success → `install_failed`. Throws `InstallError` for `list`/`inspect` transport failures so the scheduler can distinguish "Ollama down" from "empty pool" during D12 drift reconciliation.
- `src/installer/advisory.ts` — `AdvisoryInstallAdapter` for LM Studio / vLLM / llama.cpp (D4). `renderCommand(req)` builds the backend-specific shell command with names shell-quoted on render; `install`/`evict` reject with `InstallError('advisory_only', …)` carrying the rendered command; `list` resolves to `[]`; `inspect` rejects with `advisory_only`.
- `src/installer/index.ts` — public barrel re-exporting all three adapters + types + `InstallError` + `nullInstallAdapter`.
- `src/index.ts` — re-export `./installer/index.js` alongside the existing hardware / huggingface / pool / ranker exports.
- Tests under `tests/installer/`: `ollama.test.ts`, `advisory.test.ts`, `errors.test.ts`, `interface.test.ts`.
- `.changeset/lmlm-phase3b-install-adapter.md` — minor bump.
- README — single-paragraph Phase 3b status note.

Out of Phase 3b (deferred to Phase 3c and beyond):

- `pool/manager.ts` — the `PoolManager` orchestrator that combines this layer with allowlist enforcement, budget-driven eviction, and drift reconciliation. Phase 3c.
- CLI subcommands `harness models pool {show,set-budget,allow-org,allow-family}`, `install`, `evict`. Phase 7.
- `LocalModelResolver` integration. Phase 4.
- Background scheduler. Phase 6.
- Proposal engine. Phase 5b.
- Integration tests against a real Ollama instance. Out-of-band; spec mandates "gated; skip in CI if Ollama not present".

## Observable Truths (Acceptance Criteria — Phase 3b only)

### OllamaInstallAdapter.install

1. **OT1** — A stub fetcher recording three NDJSON lines (`{"status":"pulling manifest"}`, `{"status":"downloading","completed":50,"total":100}`, `{"status":"success"}`) yields events in order: `pulling`, `progress`, `success`. The adapter resolves to `{ status: 'success', name }` and invokes the fetcher exactly once with `POST /api/pull` body `{ name, stream: true }`.
2. **OT2** — `/api/pull` HTTP 404 resolves to `{ status: 'error', code: 'failed_target_missing', message }`. A stream line with `error: "manifest does not exist"` also yields `failed_target_missing` via the in-stream classifier.
3. **OT3** — Fetcher network reject resolves to `{ status: 'error', code: 'installer_unavailable', message }` (or `install_failed` if the reject is an AbortError mid-stream — see OT4). The message includes the configured endpoint.
4. **OT4** — `signal.abort()` mid-stream resolves to `{ status: 'error', code: 'install_failed', message: /canceled/i }`. The adapter does not automatically invoke `evict` — partial-byte cleanup is the manager's job (S7).
5. **OT5** — A stream line that fails to parse as JSON is silently skipped; the rest of the stream continues. A stream that ends without `{"status":"success"}` resolves to `install_failed`.
6. **OT6** — A throwing `onEvent` callback is caught and routed through `onWarn`; the install does not strand.

### OllamaInstallAdapter.evict

7. **OT7** — `DELETE /api/delete` body `{ name }`. 200 → `{ status: 'success', name }`; 404 → `{ status: 'error', code: 'not_in_pool' }` (the manager treats this as D12 reconciliation); fetcher reject → `installer_unavailable`; other non-2xx → `install_failed`.

### OllamaInstallAdapter.list

8. **OT8** — `GET /api/tags` body `{ models: [{ name, size, digest, modified_at }] }` parses into `RemoteModelInfo[]` with `sizeOnDiskGb = size / 1024 ** 3`. Malformed entries are skipped with `onWarn`. Transport failure throws `InstallError('installer_unavailable', …)` so the scheduler distinguishes "Ollama down" from "empty pool".

### OllamaInstallAdapter.inspect

9. **OT9** — `POST /api/show` body `{ name }`. 200 → `RemoteModelInfo`; 404 → throw `InstallError('failed_target_missing')`; non-JSON body → throw `InstallError('parse_failed')`; missing `size`/`size_bytes` field → `parse_failed`.

### AdvisoryInstallAdapter

10. **OT10** — `install` for backend `lmstudio` rejects with `InstallError('advisory_only', /lms get qwen3:32b/, { target })`. Backend `vllm` and `llamacpp` render the symmetric commands. `evict` rejects with `advisory_only`. `list` resolves to `[]`. `inspect` rejects with `advisory_only`.
11. **OT11** — `renderCommand` shell-quotes names that contain whitespace or shell metacharacters; idiomatic names (`Qwen/Qwen3-32B-GGUF`, `qwen3:32b`) pass through unquoted.

### Package-level

12. **OT12** — `pnpm --filter @harness-engineering/local-models build`, `typecheck`, `lint`, and `test` are all green; Phases 1, 2a, 2b, 2c, 3a tests pass unchanged. `harness validate` passes on a config without a `localModels` block (N4).

## Skill Recommendations

- `tdd-classicist` — every Phase 3b module has a recorded-fetch or in-memory-port seam; tests run with no real I/O.
- `ts-type-guards` — the Ollama adapter parses untrusted server output; type guards keep the parse failures localized.
- `single-writer` — adapter failures are deterministic state transitions; no shared mutable state crosses adapter boundaries.

## File Map

- CREATE `packages/local-models/src/installer/types.ts`
- CREATE `packages/local-models/src/installer/errors.ts`
- CREATE `packages/local-models/src/installer/interface.ts`
- CREATE `packages/local-models/src/installer/ollama.ts`
- CREATE `packages/local-models/src/installer/advisory.ts`
- CREATE `packages/local-models/src/installer/index.ts`
- MODIFY `packages/local-models/src/index.ts` — re-export `./installer/index.js`
- CREATE `packages/local-models/tests/installer/ollama.test.ts`
- CREATE `packages/local-models/tests/installer/advisory.test.ts`
- CREATE `packages/local-models/tests/installer/errors.test.ts`
- CREATE `packages/local-models/tests/installer/interface.test.ts`
- CREATE `.changeset/lmlm-phase3b-install-adapter.md`
- MODIFY `packages/local-models/README.md` — single-paragraph Phase 3b note

## Skeleton

1. Land `installer/types.ts` — `InstallAdapter` contract + the streaming + result + error-code shapes.
2. Land `installer/errors.ts` — `InstallError` + `toJSON` + guard.
3. Land `installer/interface.ts` — re-exports + `nullInstallAdapter` factory.
4. Land `installer/ollama.ts` — NDJSON stream parser; HTTP-status → error-code mapping; clean abort handling; per-method tag/show parsers.
5. Land `installer/advisory.ts` — pure adapter; per-backend command renderer; shell quoting.
6. Land `installer/index.ts` barrel + `src/index.ts` re-export.
7. Tests for all four modules — recorded-fetch harness for the Ollama adapter, table tests for the advisory adapter, structural tests for `InstallError` JSON, contract tests for `nullInstallAdapter`.
8. Verification gate (`build`, `typecheck`, `test`, `lint`, `harness validate`).
9. Changeset + README touch-up.

## Uncertainties

- **[ASSUMPTION]** Ollama's `/api/pull` body shape is `{ name: string, stream?: boolean }`. The adapter passes `stream: true` so progress lines arrive incrementally. If a future Ollama release drops the `stream` flag the adapter degrades to a single terminal status line — captured in OT5.
- **[ASSUMPTION]** `/api/tags` returns `{ models: Array<{ name, size, digest, modified_at }> }` with `size` in bytes. The adapter divides by `1024 ** 3` to produce `sizeOnDiskGb`. A future field rename surfaces as `parse_failed` via the type guard.
- **[ASSUMPTION]** `/api/show` ships either `size_bytes` (newer) or `size` (older); the adapter accepts both. A schema rename that drops both surfaces as `parse_failed`.
- **[DEFERRABLE]** Mid-dispatch swap deferral (D10 / S1). The dispatch tracker that gates eviction on zero-active-dispatches lives in the orchestrator runtime, not the adapter. Phase 3c's `PoolManager` is the right layer for the seam; the adapters are intentionally unaware of dispatch state.

## Tasks

### Task 1: Land `installer/types.ts`

**Depends on:** none | **Files:** `src/installer/types.ts`

1. Define `InstallErrorCode` union with the six stable codes.
2. Define `InstallEvent` discriminated union (`pulling | progress | success | error`).
3. Define `InstallResult` (`{ status: 'success', name } | { status: 'error', code, message }`).
4. Define `InstallerFetcher` + `InstallerFetchResponse`; the response carries an optional `body: AsyncIterable<string>` so the same shape supports streamed (`/api/pull`) and non-streamed (`/api/delete`, `/api/tags`, `/api/show`) endpoints.
5. Define the four request shapes (`InstallRequest`, `EvictRequest`, `ListRequest`, `InspectRequest`).
6. Define `RemoteModelInfo` (the Phase 3c manager checks `sizeOnDiskGb` against `diskBudgetGb` before committing an install).
7. Define `InstallAdapter` interface — `install`, `evict`, `list`, `inspect`.

Acceptance: typecheck clean.

### Task 2: Land `installer/errors.ts`

**Depends on:** Task 1 | **Files:** `src/installer/errors.ts`

1. `InstallError` extends `Error` with `code: InstallErrorCode`, optional `status?` (HTTP), `target?` (model id).
2. `toJSON()` returns an `InstallErrorJson` envelope so the structured logger preserves the discriminant across `JSON.stringify`.
3. `isInstallError` guard.

Acceptance: typecheck clean; OT5 of `errors.test.ts` (the existing test asserts `toJSON` preserves `code` + omits absent fields).

### Task 3: Land `installer/interface.ts`

**Depends on:** Tasks 1, 2 | **Files:** `src/installer/interface.ts`

1. Re-export the `InstallAdapter` interface and the supporting request/response shapes (via `export type`).
2. Ship `nullInstallAdapter()` factory whose methods reject with `InstallError('installer_unavailable', …)` carrying the target name when relevant.

Acceptance: typecheck clean; contract tests in `interface.test.ts` verify every method rejects with `installer_unavailable`.

### Task 4: Land `installer/ollama.ts`

**Depends on:** Tasks 1–3 | **Files:** `src/installer/ollama.ts`

1. `OllamaInstallAdapter` ctor options: `{ baseUrl?, fetcher?, timeoutMs?, onWarn? }`. Default base URL `http://localhost:11434`; default fetcher wraps the global `fetch` and adapts `ReadableStream<Uint8Array>` into an async iterable of decoded NDJSON lines.
2. `install(req)` — `POST /api/pull` body `{ name, stream: true }`. Decode NDJSON lines, classify by `status`/`error`/`completed+total`, emit through `req.onEvent`, resolve to `InstallResult`. Clean handling of abort + onEvent throw.
3. `evict(req)` — `DELETE /api/delete` body `{ name }`. 200 → success; 404 → `not_in_pool`; other non-2xx → `install_failed`; transport reject → `installer_unavailable`.
4. `list(req)` — `GET /api/tags`. Throw `InstallError('installer_unavailable')` on transport failure (scheduler distinguishes from "empty pool"); malformed body / entry → `onWarn` + skip; happy path → `RemoteModelInfo[]`.
5. `inspect(req)` — `POST /api/show` body `{ name }`. 200 → `RemoteModelInfo` (accept `size_bytes` or `size`); 404 → throw `failed_target_missing`; non-JSON / missing size → `parse_failed`.
6. Internal `fetchWithTimeout` combines the caller's signal with a timeout AbortController.
7. `buildInit` strips `undefined` so the fetcher init satisfies `exactOptionalPropertyTypes`.

Acceptance: typecheck clean; OT1–OT9.

### Task 5: Land `installer/advisory.ts`

**Depends on:** Tasks 1–3 | **Files:** `src/installer/advisory.ts`

1. `AdvisoryInstallAdapter` ctor option: `{ backend: 'lmstudio' | 'vllm' | 'llamacpp' }`.
2. `renderCommand({ name })` — switch on backend; shell-quote names that contain non-idiomatic characters.
3. `install`/`evict` reject with `InstallError('advisory_only', /<rendered command>/, { target })`.
4. `list` resolves to `[]`; `inspect` rejects with `advisory_only`.

Acceptance: typecheck clean; OT10, OT11.

### Task 6: Wire barrel + index + tests + verification

**Depends on:** Tasks 1–5 | **Files:** `src/installer/index.ts`, `src/index.ts`, `tests/installer/*.test.ts`, `.changeset/lmlm-phase3b-install-adapter.md`, `README.md`

1. Public barrel re-exports the adapters, `InstallError`, `isInstallError`, `nullInstallAdapter`, and the contract types via `export type`.
2. `src/index.ts` adds `export * from './installer/index.js'`.
3. Tests cover every OT above; the Ollama tests use a `streamingResponse` helper that yields a pre-recorded array of lines so the adapter exercises the NDJSON path without a `ReadableStream` polyfill.
4. `pnpm --filter @harness-engineering/local-models build && pnpm --filter @harness-engineering/local-models typecheck && pnpm --filter @harness-engineering/local-models lint && pnpm --filter @harness-engineering/local-models test`.
5. `pnpm exec harness validate` — no new local-models findings against the pre-existing baseline.
6. Changeset file mirroring the Phase 3a changeset's tone and content depth.
7. README — single paragraph noting what Phase 3b adds and what Phase 3b explicitly defers (manager, resolver wiring, CLI, scheduler).

Acceptance: every command exits 0; the README diff matches the Phase 3a precedent.
