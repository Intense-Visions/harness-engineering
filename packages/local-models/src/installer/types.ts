/**
 * Installer — public types.
 *
 * Phase 3b ships the install-adapter contract that Phase 3c's `PoolManager`
 * composes with `PoolStateStore` + `planEviction`. Two concrete adapters land
 * in this phase: `OllamaInstallAdapter` for the first-class install path
 * (`/api/pull|delete|tags|show`) and `AdvisoryInstallAdapter` for backends
 * (LM Studio / vLLM / llama.cpp) whose install is operator-driven (D4).
 *
 * The interface is transport-agnostic. Tests and Phase 3c both depend only on
 * the shapes here; neither has to know that a particular adapter speaks HTTP
 * or that another speaks copy-paste shell commands.
 *
 * Error handling is contract-first: every adapter method maps failures to a
 * stable `InstallErrorCode` so the manager / proposal engine / scheduler
 * branch deterministically. No raw HTTP statuses or fetcher rejections escape
 * the adapter boundary.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (Phase 3, lines 431–443; D4, F8, S6, S7, D12, D13)
 */

/**
 * Stable error codes every install / evict / inspect failure maps to. Higher
 * layers branch on `code`; the human-readable `message` is for logs only.
 *
 *  - `advisory_only` — operation is unsupported for an advisory backend (LM Studio
 *    / vLLM / llama.cpp). The manager surfaces a copy-paste command instead.
 *  - `failed_target_missing` — the requested model id is not resolvable upstream
 *    (Ollama manifest miss or HF 404 propagated through Ollama). Drives D13's
 *    stale-target cancellation path in Phase 5b.
 *  - `installer_unavailable` — the installer's transport is unreachable (Ollama
 *    server down, network refused). Drives S6 — pool state is not mutated, the
 *    proposal remains pending until recovery.
 *  - `install_failed` — the install began but did not complete (stream truncated,
 *    disk full, signal aborted). Drives S7 — the manager invokes `evict` to
 *    clean up partial bytes.
 *  - `not_in_pool` — `evict` was asked to remove a model that is not present on
 *    the installer. Operator's manual `ollama rm` is authoritative (D12 silent
 *    reconciliation); the manager treats this as a no-op + pool reconcile.
 *  - `parse_failed` — the installer returned a response that did not match the
 *    expected shape. The adapter degrades gracefully (empty list, warning) where
 *    it can; where it cannot (`inspect` returning bogus size), this code surfaces.
 */
export type InstallErrorCode =
  | 'advisory_only'
  | 'failed_target_missing'
  | 'installer_unavailable'
  | 'install_failed'
  | 'not_in_pool'
  | 'parse_failed';

/**
 * Narrow response surface every adapter consumes. Mirrors the HF client's
 * `HuggingFaceFetchResponse` but adds an optional `body` for NDJSON-streaming
 * endpoints (Ollama's `/api/pull` returns one JSON line per progress update).
 *
 * The `body` field is the streaming seam: production wraps the global `fetch`
 * and exposes the response stream as an async iterable of decoded lines; tests
 * provide a pre-recorded array of lines so the adapter logic is exercised
 * without a `ReadableStream` polyfill.
 */
export interface InstallerFetchResponse {
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
  /**
   * Async iterator of NDJSON lines (no trailing newlines). Only present when
   * the adapter requested a streamed endpoint; absent on `/api/tags`,
   * `/api/show`, and `/api/delete`.
   */
  body?: AsyncIterable<string>;
}

/** Outbound HTTP transport. Production wraps `fetch`; tests inject a stub. */
export type InstallerFetcher = (
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
) => Promise<InstallerFetchResponse>;

/**
 * Streaming envelope the install method yields to its caller. The shape is
 * the same across adapters so the Phase 3c manager can plumb events to the
 * dashboard's `local-models:pool` WS topic uniformly.
 */
export type InstallEvent =
  | { kind: 'pulling'; message: string }
  | { kind: 'progress'; completedBytes: number; totalBytes: number; message?: string }
  | { kind: 'success' }
  | { kind: 'error'; code: InstallErrorCode; message: string };

/** Inputs to `InstallAdapter.install`. */
export interface InstallRequest {
  /** Installer-native id (e.g. `'qwen3:32b'` for Ollama). */
  name: string;
  /** Caller-supplied cancellation signal. Aborting mid-stream resolves to `install_failed`. */
  signal?: AbortSignal;
  /**
   * Optional callback for each streamed event. The Phase 3c manager forwards
   * these to the dashboard WS topic; tests record them directly. Errors thrown
   * by the callback do not propagate — the adapter logs and continues so a
   * faulty consumer cannot strand an in-flight install.
   */
  onEvent?: (event: InstallEvent) => void;
}

/** Inputs to `InstallAdapter.evict`. */
export interface EvictRequest {
  name: string;
  signal?: AbortSignal;
}

/** Inputs to `InstallAdapter.list`. */
export interface ListRequest {
  signal?: AbortSignal;
}

/** Inputs to `InstallAdapter.inspect`. */
export interface InspectRequest {
  name: string;
  signal?: AbortSignal;
}

/**
 * Discriminated reply for `install` and `evict`. Resolves rather than throws
 * for in-band failures (target missing, install_failed) so the manager can
 * `switch (result.status)` cleanly. The adapter still throws for out-of-band
 * exceptional cases (parse failure, advisory-only invocation).
 */
export type InstallResult =
  | { status: 'success'; name: string }
  | { status: 'error'; code: InstallErrorCode; message: string };

/**
 * What the installer knows about an installed model. `sizeOnDiskGb` is the
 * field Phase 3c's `PoolManager` checks against `diskBudgetGb` before
 * committing an install.
 */
export interface RemoteModelInfo {
  ollamaName: string;
  sizeOnDiskGb: number;
  digest?: string;
  modifiedAt?: string;
}

/**
 * The contract every install backend implements. `OllamaInstallAdapter` is the
 * first-class implementation; `AdvisoryInstallAdapter` covers backends whose
 * install is operator-driven. Phase 3c's `PoolManager` depends only on this
 * interface — adapter selection is a config concern.
 */
export interface InstallAdapter {
  install(request: InstallRequest): Promise<InstallResult>;
  evict(request: EvictRequest): Promise<InstallResult>;
  list(request?: ListRequest): Promise<RemoteModelInfo[]>;
  inspect(request: InspectRequest): Promise<RemoteModelInfo>;
}
