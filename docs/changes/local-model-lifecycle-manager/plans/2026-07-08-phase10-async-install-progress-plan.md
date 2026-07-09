# Phase 10 — Async operator install + WebSocket download progress

**Spec:** local-model-lifecycle-manager (resolves the D3 note deferred in Phase 8)
**Date:** 2026-07-08

## Problem

Clicking **Install** on a recommended model POSTs `/api/v1/local-models/pool/install`,
which the dashboard reverse-proxies to the orchestrator. `handleInstall` awaits the
entire `ollama pull` **synchronously** before writing any HTTP response
(`local-models-pool-mutation.ts` — "Install awaits the streamed `ollama pull`
synchronously ... byte-level progress over WS is a deferred enhancement (D3 note)").

For a multi-GB model the pull exceeds the dashboard proxy's undici default
`headersTimeout` (~5 min), so the proxied `fetch()` aborts with
`UND_ERR_HEADERS_TIMEOUT` and the middleware returns
`502 Orchestrator proxy error: fetch failed (cause: Headers Timeout Error)`.

The same synchronous design is why there is **no progress feedback**: the Ollama
installer already emits `{ kind:'progress', completedBytes, totalBytes }` per
`/api/pull` NDJSON line, `PoolManager.install` already forwards an `onEvent`
callback, but `onApproveModelProposal` calls `pool.install()` **without** one, so
every progress event is dropped and no bytes reach the client until completion.

Both reported symptoms (the 502 and the missing progress bar) are one root cause.

## Fix — make install asynchronous, stream progress over a dedicated WS topic

The install returns `202 Accepted` as soon as the proposal is created and the pull
is kicked off (well under the proxy timeout), then streams progress + terminal
status over a **new** WS topic `local-models:install`. A separate topic (not the
existing `local-models:pool` refetch-delta) avoids a per-byte refetch storm.

### Tasks

1. **Types (`packages/types/src/local-models.ts`)** — add `ModelInstallEvent`
   `{ proposalId, hfRepoId, ollamaName, phase: 'started'|'progress'|'complete'|'error',
completedBytes?, totalBytes?, message?, code? }`; add `'installing'` to
   `PoolMutationDisposition`. Export both from `index.ts`.
2. **`model-handlers.ts`** — add `MODEL_INSTALL_TOPIC = 'local-models:install'`;
   add optional `onInstallEvent?: (e: InstallEvent) => void` to `ModelHandlerDeps`;
   pass `onEvent: deps.onInstallEvent` into `deps.pool.install(...)`.
3. **`local-models-pool-mutation.ts` `handleInstall`** — keep synchronous validation
   (400/404/422/503) and proposal creation; emit a `started` frame; call
   `onApproveModelProposal` **without awaiting**, passing an `onInstallEvent` that
   translates each `InstallEvent` into a `ModelInstallEvent` on `MODEL_INSTALL_TOPIC`;
   respond `202 { disposition:'installing', proposalId, ollamaName, evicted:[] }`;
   on the background promise resolution emit `complete` (approved) or `error`
   (failed_target_missing / not_allowed / budget_exceeded / install_failed) frames.
   `.catch` guards against unhandled rejection.
4. **`http.ts`** — subscribe the orchestrator emitter on `MODEL_INSTALL_TOPIC` and
   broadcast to WS clients; detach in `stop()` (mirror `modelPoolListener`).
5. **Client types + hook** — add `LocalModelsInstallEvent` mirror +
   `{ type:'local-models:install' }` to `WebSocketMessage`; in `useLocalModelsPanel`
   consume install frames into an `installProgress` map keyed by `hfRepoId`
   (progress → bytes; complete → clear + refetch pool/recommendations; error → keep
   message). Expose `installProgress`; thread through `LocalModels.tsx`.
6. **`RecommendationsCard`** — `RecommendationRow` accepts a `progress` prop, treats
   `202` as success-of-request (not completion), renders a progress bar from
   `completedBytes/totalBytes`, stays in "Installing…" until a terminal frame, and
   surfaces a WS `error` frame on the row.

### Consequence / contract change

Install outcomes that require running the pull (approved, budget_exceeded,
not_allowed, install_failed, failed_target_missing) move from the synchronous HTTP
response to `local-models:install` WS frames. The HTTP response now only reports
**pre-pull** validation failures (invalid body, unknown repo, no Ollama mirror,
LMLM disabled) and otherwise `202`. `/pool/remove` is unchanged (eviction is fast,
no pull). Existing `local-models-pool-mutation.test.ts` install assertions updated
accordingly; a regression test asserts the route responds without awaiting the pull
and that progress frames are emitted.
