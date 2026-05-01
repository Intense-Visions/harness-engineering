import type { LocalModelStatus } from '@harness-engineering/types';

const DEFAULT_PROBE_INTERVAL_MS = 30_000;
const MIN_PROBE_INTERVAL_MS = 1_000;
const DEFAULT_API_KEY = 'lm-studio';
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
  /** Probe cadence in ms; default 30_000, minimum 1_000. */
  probeIntervalMs?: number;
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

export class LocalModelResolver {
  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly configured: string[];
  private readonly probeIntervalMs: number;
  private readonly fetchModels: (endpoint: string, apiKey?: string) => Promise<string[]>;
  private readonly logger: ResolverLogger;

  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(status: LocalModelStatus) => void>();

  // Mutable status fields (composed into LocalModelStatus on demand).
  private resolved: string | null = null;
  private detected: string[] = [];
  private lastProbeAt: string | null = null;
  private lastError: string | null = null;
  private warnings: string[] = [];
  private available = false;

  constructor(opts: LocalModelResolverOptions) {
    this.endpoint = opts.endpoint;
    if (opts.apiKey !== undefined) {
      this.apiKey = opts.apiKey;
    }
    this.configured = [...opts.configured];
    const interval = opts.probeIntervalMs ?? DEFAULT_PROBE_INTERVAL_MS;
    this.probeIntervalMs = Math.max(MIN_PROBE_INTERVAL_MS, interval);
    const timeoutMs = opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
    // Bind timeout into the default impl. Custom `fetchModels` injections own
    // their own timeout policy (typically the test harness), so we leave them
    // untouched.
    this.fetchModels =
      opts.fetchModels ??
      ((endpoint: string, apiKey?: string) => defaultFetchModels(endpoint, apiKey, timeoutMs));
    this.logger = opts.logger ?? noopLogger;
  }

  resolveModel(): string | null {
    return this.resolved;
  }

  getStatus(): LocalModelStatus {
    return {
      available: this.available,
      resolved: this.resolved,
      configured: [...this.configured],
      detected: [...this.detected],
      lastProbeAt: this.lastProbeAt,
      lastError: this.lastError,
      warnings: [...this.warnings],
    };
  }

  onStatusChange(handler: (status: LocalModelStatus) => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  async probe(): Promise<LocalModelStatus> {
    const before = this.snapshotForDiff();
    try {
      const detected = await this.fetchModels(this.endpoint, this.apiKey);
      this.detected = [...detected];
      this.lastError = null;
      this.lastProbeAt = new Date().toISOString();
      const match = this.configured.find((id) => detected.includes(id)) ?? null;
      this.resolved = match;
      this.available = match !== null;
      this.warnings = match
        ? []
        : [
            `No configured local model is loaded. Configured: [${this.configured.join(', ')}]. Detected: [${detected.join(', ')}].`,
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
    return status;
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
  }

  private snapshotForDiff(): string {
    return JSON.stringify({
      available: this.available,
      resolved: this.resolved,
      configured: this.configured,
      detected: this.detected,
      lastError: this.lastError,
      warnings: this.warnings,
    });
  }
}

export type { LocalModelStatus };
