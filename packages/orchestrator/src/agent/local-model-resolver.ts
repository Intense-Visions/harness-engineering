import type { LocalModelStatus, RoutingUseCase } from '@harness-engineering/types';
import type {
  PoolStateProvider,
  RankProfile,
  PoolCandidateOptions,
} from '@harness-engineering/local-models';
import { poolStateToCandidates } from '@harness-engineering/local-models';

/**
 * Consumption Phase 4 (T16): map a routing use-case to the task profile whose
 * per-model scores the resolver should order pooled candidates by. Code-editing
 * tiers → `coding`; the diagnostic tier (debugging/investigation) → `reasoning`;
 * everything else (analysis layers, chat, maintenance, sandboxing, skills/modes)
 * → `general`, i.e. the composite score. Heuristic + intentionally conservative
 * — see the task-aware-selection ADR. Extend here as more signal is available
 * (e.g. cognitiveMode on `skill`/`mode`).
 */
function useCaseToProfile(useCase: RoutingUseCase): RankProfile {
  switch (useCase.kind) {
    case 'tier':
      return useCase.tier === 'diagnostic' ? 'reasoning' : 'coding';
    default:
      return 'general';
  }
}

const DEFAULT_PROBE_INTERVAL_MS = 30_000;
const MIN_PROBE_INTERVAL_MS = 1_000;
/** Coalescing window for event-driven `refresh()` so a burst of pool frames → one probe. */
const REFRESH_DEBOUNCE_MS = 250;
/**
 * Consumption Phase 3 (T10): consecutive inference failures that trip a model's
 * circuit breaker (deprioritizing it during resolution). A success or an elapsed
 * cooldown clears the count.
 */
const DEFAULT_BREAKER_THRESHOLD = 3;
/** How long a tripped model stays deprioritized before it's eligible again. */
const DEFAULT_BREAKER_COOLDOWN_MS = 60_000;
const DEFAULT_API_KEY = 'lm-studio'; // harness-ignore SEC-SEC-002: LM Studio documented no-auth placeholder, not a real secret
const DEFAULT_FETCH_TIMEOUT_MS = 5_000;

export interface ResolverLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
}

export interface LocalModelResolverOptions {
  endpoint: string;
  apiKey?: string;
  /** Normalized candidate list (already turned from string|string[] into string[]). */
  configured: string[];
  /**
   * Phase 4 (D5): optional read-only pool-state port. When provided, the
   * candidate list derives from pool entries (currentScore desc → ollamaName)
   * instead of `configured`. When absent (default), behavior is byte-identical
   * to the pre-Phase-4 resolver.
   */
  poolState?: PoolStateProvider;
  /** Probe cadence in ms; default 30_000, minimum 1_000. */
  probeIntervalMs?: number;
  /** Debounce window for event-driven {@link LocalModelResolver.refresh}; default 250ms. */
  refreshDebounceMs?: number;
  /**
   * Consumption Phase 5 (T19/T20): called with the newly-resolved model name
   * whenever the resolver's composite selection changes (and is non-null), so
   * the orchestrator can warm it into VRAM before the next dispatch. Naturally
   * debounced — it fires only on an actual selection change, not every probe.
   * Best-effort: a throwing hook is swallowed. Injected in tests; wired to
   * {@link defaultWarmModel} in production.
   */
  warmModel?: (ollamaName: string) => void;
  /**
   * Consumption Phase 3 (T10): consecutive inference failures before a model is
   * deprioritized by the circuit breaker. Default 3.
   */
  breakerThreshold?: number;
  /** Cooldown (ms) after which a tripped model is eligible again. Default 60_000. */
  breakerCooldownMs?: number;
  /** Injectable clock (ms since epoch) for the circuit-breaker cooldown; default `Date.now`. Test seam. */
  now?: () => number;
  /**
   * Per-request timeout for the default fetch implementation, in ms.
   * Default: 5_000. Ignored when a custom `fetchModels` is provided
   * (custom impls own their own timeout policy). Spec §3.1 line 136
   * enumerates timeout as a supported failure mode.
   */
  timeoutMs?: number;
  /**
   * Injectable for tests. Default: GET `${endpoint}/models` with bearer apiKey.
   * Resolves to detected model IDs. Rejects on network/timeout/non-2xx/malformed.
   */
  fetchModels?: (endpoint: string, apiKey?: string) => Promise<string[]>;
  logger?: ResolverLogger;
}

export function normalizeLocalModel(input: string | string[] | undefined): string[] {
  if (input === undefined) return [];
  if (typeof input === 'string') return [input];
  if (input.length === 0) {
    throw new Error('localModel array must be non-empty when provided');
  }
  return [...input];
}

const noopLogger: ResolverLogger = {
  info: () => undefined,
  warn: () => undefined,
};

/**
 * Bind the effective `fetchModels`. A custom injection owns its own timeout
 * policy and is used as-is; otherwise the default impl is bound to `timeoutMs`.
 * Extracted from the constructor to keep its cyclomatic count under budget.
 */
function resolveFetchModels(
  opts: LocalModelResolverOptions
): (endpoint: string, apiKey?: string) => Promise<string[]> {
  if (opts.fetchModels !== undefined) return opts.fetchModels;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  return (endpoint: string, apiKey?: string) => defaultFetchModels(endpoint, apiKey, timeoutMs);
}

/** Clamped numeric knobs, resolved from options with their defaults and floors. */
interface ResolverTunables {
  probeIntervalMs: number;
  refreshDebounceMs: number;
  breakerThreshold: number;
  breakerCooldownMs: number;
}

/**
 * Resolve and clamp the resolver's numeric options. Extracted from the
 * constructor so the option-defaulting decisions live here rather than inflating
 * the constructor's cyclomatic count; the constructor assigns the returned values
 * to its readonly fields.
 */
function resolveTunables(opts: LocalModelResolverOptions): ResolverTunables {
  return {
    probeIntervalMs: Math.max(
      MIN_PROBE_INTERVAL_MS,
      opts.probeIntervalMs ?? DEFAULT_PROBE_INTERVAL_MS
    ),
    refreshDebounceMs: Math.max(0, opts.refreshDebounceMs ?? REFRESH_DEBOUNCE_MS),
    breakerThreshold: Math.max(1, opts.breakerThreshold ?? DEFAULT_BREAKER_THRESHOLD),
    breakerCooldownMs: Math.max(0, opts.breakerCooldownMs ?? DEFAULT_BREAKER_COOLDOWN_MS),
  };
}

/**
 * Default `fetchModels` — GET `${endpoint}/models` with bearer apiKey.
 * Throws on network failure, non-2xx, malformed body, or timeout.
 *
 * `timeoutMs` defaults to 5_000. A timeout aborts the in-flight request and
 * surfaces as `Error('request timeout (Nms)')` so callers can distinguish it
 * from generic network errors.
 */
export async function defaultFetchModels(
  endpoint: string,
  apiKey?: string,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<string[]> {
  const url = `${endpoint.replace(/\/$/, '')}/models`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey ?? DEFAULT_API_KEY}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // AbortSignal.timeout produces a DOMException/Error with name 'TimeoutError'
    // (Node 20+) or 'AbortError' (older runtimes). Map either to a clear message.
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new Error(`request timeout (${timeoutMs}ms)`, { cause: err });
    }
    throw err;
  }
  if (!res.ok) {
    throw new Error(`probe failed: ${res.status} ${res.statusText}`);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error('malformed /v1/models response');
  }
  if (!body || typeof body !== 'object' || !Array.isArray((body as { data?: unknown }).data)) {
    throw new Error('malformed /v1/models response');
  }
  const data = (body as { data: unknown[] }).data;
  const ids: string[] = [];
  for (const entry of data) {
    if (!entry || typeof entry !== 'object' || typeof (entry as { id?: unknown }).id !== 'string') {
      throw new Error('malformed /v1/models response');
    }
    ids.push((entry as { id: string }).id);
  }
  return ids;
}

/**
 * Consumption Phase 5 (T19): warm `ollamaName` into VRAM via Ollama's native
 * `keep_alive`. Derives the native `/api/generate` endpoint from the
 * OpenAI-compatible `endpoint` (`…/v1` → `…`), then POSTs an empty-prompt
 * request with `keep_alive` so Ollama loads (and pins) the model without
 * generating tokens. Best-effort and Ollama-specific (LMLM is Ollama-first):
 * a non-Ollama server or any failure resolves quietly — warming is an
 * optimization, never a correctness requirement. Fire-and-forget: the returned
 * promise is swallowed by callers.
 */
export async function defaultWarmModel(
  endpoint: string,
  ollamaName: string,
  apiKey?: string,
  keepAlive: string = '10m',
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<void> {
  // `http://host:11434/v1` → `http://host:11434/api/generate`.
  const base = endpoint.replace(/\/v1\/?$/, '').replace(/\/$/, '');
  const url = `${base}/api/generate`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey ?? DEFAULT_API_KEY}`,
      },
      // Empty prompt + keep_alive loads the model into VRAM without generating.
      body: JSON.stringify({ model: ollamaName, prompt: '', keep_alive: keepAlive }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // Best-effort — a cold model just costs the next dispatch a load. Swallow.
  }
}

/**
 * Consumption Phase 5 (pi follow-up): warm `model` on an OpenAI-compatible
 * endpoint (LM Studio, the `pi` backend's server) that has no `keep_alive`
 * primitive. Issues a **1-token** chat completion against the model, which is
 * enough to make a JIT-loading server (LM Studio loads on first request) pull
 * the model into memory before the real dispatch. Best-effort: any failure
 * (server down, model missing, non-completions server) resolves quietly.
 * Fire-and-forget — callers swallow the returned promise.
 */
export async function defaultWarmModelViaCompletion(
  endpoint: string,
  model: string,
  apiKey?: string,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<void> {
  const url = `${endpoint.replace(/\/$/, '')}/chat/completions`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey ?? DEFAULT_API_KEY}`,
      },
      // Minimal request: one token is enough to force the server to load the
      // model. The generated content is discarded — we only want the load.
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'warm' }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // Best-effort — a cold model just costs the next dispatch a load. Swallow.
  }
}

export class LocalModelResolver {
  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly configured: string[];
  private readonly poolState?: PoolStateProvider;
  private readonly probeIntervalMs: number;
  private readonly fetchModels: (endpoint: string, apiKey?: string) => Promise<string[]>;
  private readonly warmModel?: (ollamaName: string) => void;
  private readonly logger: ResolverLogger;

  private timer: ReturnType<typeof setInterval> | null = null;
  /** Debounce handle for event-driven {@link refresh}; coalesces a burst into one probe. */
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  /** Test seam for the refresh debounce delay (0 in tests → next-tick probe). */
  private readonly refreshDebounceMs: number;
  /** Consumption Phase 3 (T10): circuit-breaker config + per-model failure/trip state. */
  private readonly breakerThreshold: number;
  private readonly breakerCooldownMs: number;
  private readonly now: () => number;
  /** Consecutive inference failures per model since its last success. */
  private consecutiveFailures = new Map<string, number>();
  /** Epoch-ms at which a tripped model becomes eligible again (cooldown expiry). */
  private trippedUntil = new Map<string, number>();
  private listeners = new Set<(status: LocalModelStatus) => void>();
  /**
   * Tracks an in-flight probe so concurrent invocations (interval tick while a
   * slow probe is running, or a manual `probe()` call mid-flight) share the
   * existing promise instead of racing to mutate `detected/resolved/lastError/
   * warnings` non-atomically across `await` points. Applies to both the timer
   * callback and direct `probe()` calls — any caller that arrives during an
   * in-flight probe gets the same promise back. Cleared in `finally` so the
   * next tick can start a fresh probe.
   */
  private probeInFlight: Promise<LocalModelStatus> | null = null;

  // Mutable status fields (composed into LocalModelStatus on demand).
  private resolved: string | null = null;
  private detected: string[] = [];
  private lastProbeAt: string | null = null;
  private lastError: string | null = null;
  private warnings: string[] = [];
  private available = false;

  constructor(opts: LocalModelResolverOptions) {
    this.endpoint = opts.endpoint;
    this.configured = [...opts.configured];
    // Clamped numeric knobs are resolved in a helper so the option-defaulting
    // decisions don't inflate the constructor's cyclomatic count.
    const tunables = resolveTunables(opts);
    this.probeIntervalMs = tunables.probeIntervalMs;
    this.refreshDebounceMs = tunables.refreshDebounceMs;
    this.breakerThreshold = tunables.breakerThreshold;
    this.breakerCooldownMs = tunables.breakerCooldownMs;
    this.now = opts.now ?? (() => Date.now());
    // Bind timeout into the default impl. Custom `fetchModels` injections own
    // their own timeout policy (typically the test harness), so we leave them
    // untouched.
    this.fetchModels = resolveFetchModels(opts);
    this.logger = opts.logger ?? noopLogger;
    // Optional-typed (`exactOptionalPropertyTypes`) readonly fields — assign only
    // when present. Readonly requires these live in the constructor body.
    if (opts.apiKey !== undefined) this.apiKey = opts.apiKey;
    if (opts.poolState !== undefined) this.poolState = opts.poolState;
    if (opts.warmModel !== undefined) this.warmModel = opts.warmModel;
  }

  /**
   * The model to dispatch to. With no `useCase`, returns the cached composite
   * resolution from the last probe (byte-identical to the pre-Phase-4 resolver).
   * With a `useCase`, orders the (pool-derived) candidates by that use-case's
   * task profile and picks the best loaded, breaker-healthy one — so a
   * coding-tagged dispatch prefers the coding specialist. A `general`-mapped
   * use-case returns the cached composite resolution unchanged.
   */
  resolveModel(useCase?: RoutingUseCase): string | null {
    if (useCase === undefined) return this.resolved;
    const profile = useCaseToProfile(useCase);
    if (profile === 'general') return this.resolved;
    // Re-select from the last-probed detected set ordered by the profile score.
    // No re-probe: `this.detected` reflects the most recent poll/refresh.
    // A non-`general` profile here is ALWAYS a `tier` use-case (execution) — i.e. an AGENTIC
    // dispatch that needs a model which emits native tool_calls. Exclude models known not to
    // (fail-open on unprobed ones) so a build never routes to a text-only model.
    return this.selectMatch(this.candidates(profile, { requireToolCalling: true }), this.detected);
  }

  getStatus(): LocalModelStatus {
    return {
      available: this.available,
      resolved: this.resolved,
      configured: this.candidates(),
      detected: [...this.detected],
      lastProbeAt: this.lastProbeAt,
      lastError: this.lastError,
      warnings: [...this.warnings],
    };
  }

  /**
   * Effective candidate list. With a poolState port present the list derives
   * from pool entries (currentScore desc → ollamaName); otherwise the static
   * `configured` list is returned unchanged (byte-identical to pre-Phase-4).
   */
  private candidates(profile?: RankProfile, opts?: PoolCandidateOptions): string[] {
    return this.poolState
      ? poolStateToCandidates(this.poolState.snapshot(), profile, opts)
      : [...this.configured];
  }

  onStatusChange(handler: (status: LocalModelStatus) => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  async probe(): Promise<LocalModelStatus> {
    // If a probe is already in flight, share its promise instead of starting
    // a second one. This applies uniformly to the interval-driven probe and
    // any manual `probe()` callers (e.g. dashboard hot-refresh) — both face
    // the same torn-state race if allowed to run concurrently.
    if (this.probeInFlight !== null) {
      return this.probeInFlight;
    }
    const inFlight = this.runProbe().finally(() => {
      this.probeInFlight = null;
    });
    this.probeInFlight = inFlight;
    return inFlight;
  }

  private async runProbe(): Promise<LocalModelStatus> {
    const before = this.snapshotForDiff();
    const prevResolved = this.resolved;
    try {
      const detected = await this.fetchModels(this.endpoint, this.apiKey);
      this.detected = [...detected];
      this.lastError = null;
      this.lastProbeAt = new Date().toISOString();
      const candidates = this.candidates();
      const match = this.selectMatch(candidates, detected);
      this.resolved = match;
      this.available = match !== null;
      this.warnings = match
        ? []
        : [
            `No configured local model is loaded. Configured: [${candidates.join(', ')}]. Detected: [${detected.join(', ')}].`,
          ];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'probe failed';
      this.lastError = message;
      this.available = false;
      this.resolved = null;
      this.warnings = [`Local model probe failed against ${this.endpoint}: ${message}.`];
      // detected retains prior value
      this.logger.warn('local-model-resolver probe failed', {
        endpoint: this.endpoint,
        error: message,
      });
    }
    const after = this.snapshotForDiff();
    const status = this.getStatus();
    if (before !== after) {
      for (const listener of this.listeners) {
        try {
          listener(status);
        } catch (err) {
          this.logger.warn('local-model-resolver listener threw', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
    // T20: warm the newly-selected model on a selection change so the next
    // dispatch isn't a cold start. Fires only when the composite resolution
    // actually changed to a non-null model — a natural debounce.
    if (this.resolved !== null && this.resolved !== prevResolved) {
      this.warm(this.resolved);
    }
    return status;
  }

  /** Best-effort warm-hook invocation — a throwing warm never breaks a probe. */
  private warm(ollamaName: string): void {
    if (!this.warmModel) return;
    try {
      this.warmModel(ollamaName);
    } catch (err) {
      this.logger.warn('local-model-resolver warm hook threw', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Consumption Phase 3 (T10): pick the resolved model from the candidates that
   * are actually loaded, preferring ones whose circuit breaker is not tripped.
   * Candidate order (score-desc from the pool) is preserved within each tier, so
   * a tripped top pick sinks below a healthy lower pick but still resolves as a
   * last resort when every loaded candidate is tripped (better a flaky model than
   * none). Returns null when no candidate is loaded.
   */
  private selectMatch(candidates: string[], detected: string[]): string | null {
    const detectedSet = new Set(detected);
    const available = candidates.filter((id) => detectedSet.has(id));
    if (available.length === 0) return null;
    const healthy = available.filter((id) => !this.isTripped(id));
    return healthy[0] ?? available[0] ?? null;
  }

  /**
   * Whether `model`'s circuit breaker is currently tripped. Lazily clears the
   * trip once its cooldown has elapsed so the model becomes eligible again on the
   * next resolution without needing a separate timer.
   */
  private isTripped(model: string): boolean {
    const until = this.trippedUntil.get(model);
    if (until === undefined) return false;
    if (this.now() >= until) {
      this.trippedUntil.delete(model);
      this.consecutiveFailures.delete(model);
      return false;
    }
    return true;
  }

  /**
   * Record a successful inference on `model`: clears its failure count and any
   * active trip so a recovered model is immediately re-preferred.
   */
  recordSuccess(model: string): void {
    if (!model) return;
    const hadState = this.consecutiveFailures.has(model) || this.trippedUntil.has(model);
    this.consecutiveFailures.delete(model);
    this.trippedUntil.delete(model);
    // A recovery may change which model is preferred — re-resolve promptly.
    if (hadState) this.refresh();
  }

  /**
   * Record a failed inference on `model`. On the Nth consecutive failure the
   * breaker trips (deprioritizing the model for `breakerCooldownMs`) and a
   * re-probe is scheduled so the resolver rolls to a healthy alternative.
   */
  recordFailure(model: string): void {
    if (!model) return;
    const next = (this.consecutiveFailures.get(model) ?? 0) + 1;
    this.consecutiveFailures.set(model, next);
    if (next >= this.breakerThreshold) {
      this.trippedUntil.set(model, this.now() + this.breakerCooldownMs);
      // The currently-resolved model just tripped — re-resolve to a healthy one.
      this.refresh();
    }
  }

  /**
   * Event-driven refresh: schedule a debounced re-probe. Called when a
   * `local-models:pool` mutation fires so a just-installed/swapped model becomes
   * usable within a debounce window instead of waiting up to `probeIntervalMs`.
   * A burst of frames coalesces into one probe (the timer is only armed once).
   */
  refresh(): void {
    if (this.refreshTimer !== null) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.probe();
    }, this.refreshDebounceMs);
    const handle = this.refreshTimer as unknown as { unref?: () => void };
    handle.unref?.();
  }

  async start(): Promise<void> {
    if (this.timer !== null) {
      // Idempotent: already running.
      return;
    }
    await this.probe();
    this.timer = setInterval(() => {
      // Fire-and-forget — errors are recorded in lastError by probe().
      void this.probe();
    }, this.probeIntervalMs);
    // Some Node interval handles support unref so they don't keep the
    // process alive on their own. Test environments without it (jsdom
    // synthetic handles, etc.) safely no-op via the optional check.
    const handle = this.timer as unknown as { unref?: () => void };
    handle.unref?.();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private snapshotForDiff(): string {
    return JSON.stringify({
      available: this.available,
      resolved: this.resolved,
      configured: this.candidates(),
      detected: this.detected,
      lastError: this.lastError,
      warnings: this.warnings,
    });
  }
}

export type { LocalModelStatus };
