/**
 * `OllamaInstallAdapter` — first-class install backend speaking Ollama's REST API.
 *
 * Endpoints consumed:
 *   POST `/api/pull`    — NDJSON stream of `{status,completed?,total?,error?}`.
 *   DELETE `/api/delete` — body `{name}` ⇒ 200 / 404.
 *   GET  `/api/tags`    — `{models:[{name,size,digest,modified_at}]}`.
 *   POST `/api/show`    — body `{name}` ⇒ `{size_bytes, digest, …}`.
 *
 * Failures are mapped to stable `InstallErrorCode` values per the contract in
 * `types.ts`. `install` and `evict` resolve to `InstallResult` with
 * `status: 'error'` for in-band failures (target missing, install_failed,
 * not_in_pool) so the manager branches on a single discriminant; `list` and
 * `inspect` throw `InstallError` for unrecoverable transport failures so the
 * scheduler can distinguish "Ollama down" from "empty pool" during D12 drift
 * reconciliation.
 *
 * The `fetcher` constructor option is the DI seam. Tests inject a stub that
 * pre-records NDJSON lines via the optional `body` async iterable on
 * `InstallerFetchResponse`; production wraps the global `fetch` and adapts the
 * `ReadableStream` body into the same line-delimited iterator.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (Phase 3, lines 431–443; D12, D13, S6, S7)
 */

import { InstallError } from './errors.js';
import type {
  EvictRequest,
  InspectRequest,
  InstallAdapter,
  InstallEvent,
  InstallRequest,
  InstallResult,
  InstallerFetchResponse,
  InstallerFetcher,
  ListRequest,
  RemoteModelInfo,
} from './types.js';

const DEFAULT_BASE_URL = 'http://localhost:11434';
/** Non-streaming requests (delete / tags / show) get a tight timeout. */
const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;
const USER_AGENT = '@harness-engineering/local-models';
const BYTES_PER_GB = 1024 ** 3;

export interface OllamaInstallAdapterOptions {
  /** Base URL of the Ollama server. Defaults to `http://localhost:11434`. */
  baseUrl?: string;
  /** DI seam for tests. Defaults to a `fetch`-backed implementation. */
  fetcher?: InstallerFetcher;
  /** Non-streaming request timeout. Defaults to 8 seconds. */
  timeoutMs?: number;
  /** Optional structured logger; defaults to a silent no-op. */
  onWarn?: (message: string, cause?: unknown) => void;
}

/**
 * Default fetcher backed by the global `fetch`. Adapts the streamed
 * `ReadableStream<Uint8Array>` body into an `AsyncIterable<string>` of
 * NDJSON lines so the adapter logic is identical to the test path.
 */
function defaultFetcher(): InstallerFetcher {
  return async (url, init) => {
    const requestInit: RequestInit = { method: init.method ?? 'GET' };
    if (init.headers !== undefined) requestInit.headers = init.headers;
    if (init.body !== undefined) requestInit.body = init.body;
    if (init.signal !== undefined) requestInit.signal = init.signal;
    const response = await fetch(url, requestInit);
    const result: InstallerFetchResponse = {
      status: response.status,
      json: () => response.json() as Promise<unknown>,
      text: () => response.text(),
    };
    if (response.body) {
      result.body = readNdjsonLines(response.body);
    }
    return result;
  };
}

/**
 * Split a byte stream on `\n` and yield decoded lines, dropping trailing
 * empty fragments. Matches the test harness's pre-recorded line iterator so
 * the adapter doesn't branch on stream source.
 */
async function* readNdjsonLines(stream: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line.length > 0) yield line;
        newlineIndex = buffer.indexOf('\n');
      }
    }
    buffer += decoder.decode();
    const tail = buffer.trim();
    if (tail.length > 0) yield tail;
  } finally {
    reader.releaseLock();
  }
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: string }).name === 'AbortError'
  );
}

/** "manifest does not exist" / "no such file" → target missing. */
function classifyStreamError(message: string): 'failed_target_missing' | 'install_failed' {
  const lower = message.toLowerCase();
  if (
    lower.includes('does not exist') ||
    lower.includes('not found') ||
    lower.includes('manifest')
  ) {
    return 'failed_target_missing';
  }
  return 'install_failed';
}

function safeEmit(
  callback: InstallRequest['onEvent'],
  event: InstallEvent,
  onWarn: (message: string, cause?: unknown) => void
): void {
  if (!callback) return;
  try {
    callback(event);
  } catch (err) {
    // A faulty consumer must not strand an in-flight install. We log and
    // continue; the manager surfaces this via its own structured logger.
    onWarn('install event consumer threw', err);
  }
}

interface ParsedStreamLine {
  status?: string;
  error?: string;
  completed?: number;
  total?: number;
}

function parseStreamLine(line: string): ParsedStreamLine | undefined {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const raw = parsed as Record<string, unknown>;
    const out: ParsedStreamLine = {};
    if (typeof raw.status === 'string') out.status = raw.status;
    if (typeof raw.error === 'string') out.error = raw.error;
    if (typeof raw.completed === 'number') out.completed = raw.completed;
    if (typeof raw.total === 'number') out.total = raw.total;
    return out;
  } catch {
    return undefined;
  }
}

function bytesToGb(bytes: number): number {
  return Math.round((bytes / BYTES_PER_GB) * 100) / 100;
}

export class OllamaInstallAdapter implements InstallAdapter {
  private readonly baseUrl: string;
  private readonly fetcher: InstallerFetcher;
  private readonly timeoutMs: number;
  private readonly onWarn: (message: string, cause?: unknown) => void;

  constructor(options: OllamaInstallAdapterOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetcher = options.fetcher ?? defaultFetcher();
    this.timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.onWarn = options.onWarn ?? (() => undefined);
  }

  async install(request: InstallRequest): Promise<InstallResult> {
    const url = `${this.baseUrl}/api/pull`;
    let response: InstallerFetchResponse;
    try {
      response = await this.fetcher(
        url,
        buildInit({
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify({ name: request.name, stream: true }),
          ...(request.signal ? { signal: request.signal } : {}),
        })
      );
    } catch (err) {
      return errorResult(installerUnavailableCode(err), `ollama pull failed: ${formatError(err)}`);
    }

    if (response.status < 200 || response.status >= 300) {
      const detail = await readDetail(response);
      if (response.status === 404) {
        return errorResult(
          'failed_target_missing',
          `ollama pull 404 for ${request.name}${detail ? `: ${detail}` : ''}`
        );
      }
      return errorResult(
        'installer_unavailable',
        `ollama pull ${response.status}${detail ? `: ${detail}` : ''}`
      );
    }

    if (!response.body) {
      return errorResult('install_failed', 'ollama pull returned an empty body');
    }

    let sawSuccess = false;
    let terminalError: InstallResult | undefined;

    try {
      for await (const rawLine of response.body) {
        const parsed = parseStreamLine(rawLine);
        if (!parsed) continue;
        if (parsed.error) {
          const code = classifyStreamError(parsed.error);
          safeEmit(request.onEvent, { kind: 'error', code, message: parsed.error }, this.onWarn);
          terminalError = errorResult(code, parsed.error);
          break;
        }
        if (parsed.status === 'success') {
          safeEmit(request.onEvent, { kind: 'success' }, this.onWarn);
          sawSuccess = true;
          break;
        }
        if (parsed.completed !== undefined && parsed.total !== undefined) {
          const progress: InstallEvent = {
            kind: 'progress',
            completedBytes: parsed.completed,
            totalBytes: parsed.total,
          };
          if (parsed.status) progress.message = parsed.status;
          safeEmit(request.onEvent, progress, this.onWarn);
          continue;
        }
        if (parsed.status) {
          safeEmit(request.onEvent, { kind: 'pulling', message: parsed.status }, this.onWarn);
        }
      }
    } catch (err) {
      if (isAbortError(err) || request.signal?.aborted) {
        return errorResult('install_failed', 'pull canceled');
      }
      return errorResult('install_failed', `pull stream failed: ${formatError(err)}`);
    }

    if (terminalError) return terminalError;
    if (!sawSuccess) {
      const code = 'install_failed' as const;
      const message = request.signal?.aborted
        ? 'pull canceled'
        : 'pull stream ended without success';
      safeEmit(request.onEvent, { kind: 'error', code, message }, this.onWarn);
      return errorResult(code, message);
    }

    return { status: 'success', name: request.name };
  }

  async evict(request: EvictRequest): Promise<InstallResult> {
    const url = `${this.baseUrl}/api/delete`;
    let response: InstallerFetchResponse;
    try {
      response = await this.fetchWithTimeout(
        url,
        buildInit({
          method: 'DELETE',
          headers: buildHeaders(),
          body: JSON.stringify({ name: request.name }),
          ...(request.signal ? { signal: request.signal } : {}),
        })
      );
    } catch (err) {
      return errorResult(
        installerUnavailableCode(err),
        `ollama delete failed: ${formatError(err)}`
      );
    }

    if (response.status === 404) {
      return errorResult('not_in_pool', `ollama delete 404 for ${request.name}`);
    }
    if (response.status < 200 || response.status >= 300) {
      const detail = await readDetail(response);
      return errorResult(
        'install_failed',
        `ollama delete ${response.status}${detail ? `: ${detail}` : ''}`
      );
    }
    return { status: 'success', name: request.name };
  }

  async list(request: ListRequest = {}): Promise<RemoteModelInfo[]> {
    const url = `${this.baseUrl}/api/tags`;
    let response: InstallerFetchResponse;
    try {
      response = await this.fetchWithTimeout(
        url,
        buildInit({
          method: 'GET',
          headers: buildHeaders(),
          ...(request.signal ? { signal: request.signal } : {}),
        })
      );
    } catch (err) {
      throw new InstallError('installer_unavailable', `ollama tags failed: ${formatError(err)}`, {
        cause: err,
      });
    }

    if (response.status < 200 || response.status >= 300) {
      throw new InstallError('installer_unavailable', `ollama tags ${response.status}`, {
        status: response.status,
      });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (err) {
      this.onWarn('ollama tags response was not JSON', err);
      return [];
    }
    return parseTagsBody(body, this.onWarn);
  }

  async inspect(request: InspectRequest): Promise<RemoteModelInfo> {
    const url = `${this.baseUrl}/api/show`;
    let response: InstallerFetchResponse;
    try {
      response = await this.fetchWithTimeout(
        url,
        buildInit({
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify({ name: request.name }),
          ...(request.signal ? { signal: request.signal } : {}),
        })
      );
    } catch (err) {
      throw new InstallError('installer_unavailable', `ollama show failed: ${formatError(err)}`, {
        target: request.name,
        cause: err,
      });
    }

    if (response.status === 404) {
      throw new InstallError('failed_target_missing', `ollama show 404 for ${request.name}`, {
        status: 404,
        target: request.name,
      });
    }
    if (response.status < 200 || response.status >= 300) {
      throw new InstallError('installer_unavailable', `ollama show ${response.status}`, {
        status: response.status,
        target: request.name,
      });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (err) {
      throw new InstallError(
        'parse_failed',
        `ollama show response was not JSON for ${request.name}`,
        { target: request.name, cause: err }
      );
    }
    return parseShowBody(request.name, body);
  }

  /**
   * `fetcher` wrapped with an AbortController-driven timeout. Combines the
   * caller's signal with the internal timeout so either can cancel.
   */
  private async fetchWithTimeout(
    url: string,
    init: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }
  ): Promise<InstallerFetchResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const externalSignal = init.signal;
    const onAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener('abort', onAbort, { once: true });
    }
    try {
      return await this.fetcher(url, buildInit({ ...init, signal: controller.signal }));
    } finally {
      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
    }
  }
}

function buildHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
  };
}

/**
 * Build a fetcher init object that omits undefined fields. With
 * `exactOptionalPropertyTypes` enabled, a literal `{ signal: undefined }`
 * does not satisfy `{ signal?: AbortSignal }`; this helper preserves the
 * "field absent" semantics so call sites can pass through optionals freely.
 */
function buildInit(input: {
  method?: string | undefined;
  headers?: Record<string, string> | undefined;
  body?: string | undefined;
  signal?: AbortSignal | undefined;
}): {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
} {
  const out: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  } = {};
  if (input.method !== undefined) out.method = input.method;
  if (input.headers !== undefined) out.headers = input.headers;
  if (input.body !== undefined) out.body = input.body;
  if (input.signal !== undefined) out.signal = input.signal;
  return out;
}

function errorResult(code: import('./types.js').InstallErrorCode, message: string): InstallResult {
  return { status: 'error', code, message };
}

function installerUnavailableCode(err: unknown): 'installer_unavailable' | 'install_failed' {
  // A reject mid-stream during pull is mapped to install_failed by the caller;
  // a reject before the stream started (DNS, ECONNREFUSED) is unavailability.
  if (isAbortError(err)) return 'install_failed';
  return 'installer_unavailable';
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function readDetail(response: InstallerFetchResponse): Promise<string> {
  try {
    return (await response.text()).slice(0, 200);
  } catch {
    return '';
  }
}

function parseTagsBody(body: unknown, onWarn: (message: string) => void): RemoteModelInfo[] {
  if (typeof body !== 'object' || body === null) {
    onWarn('ollama tags response had unexpected shape');
    return [];
  }
  const raw = body as Record<string, unknown>;
  if (!Array.isArray(raw.models)) {
    onWarn('ollama tags response missing models array');
    return [];
  }
  const result: RemoteModelInfo[] = [];
  for (const entry of raw.models) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.name !== 'string' || typeof e.size !== 'number') continue;
    const info: RemoteModelInfo = {
      ollamaName: e.name,
      sizeOnDiskGb: bytesToGb(e.size),
    };
    if (typeof e.digest === 'string') info.digest = e.digest;
    if (typeof e.modified_at === 'string') info.modifiedAt = e.modified_at;
    result.push(info);
  }
  return result;
}

function parseShowBody(name: string, body: unknown): RemoteModelInfo {
  if (typeof body !== 'object' || body === null) {
    throw new InstallError(
      'parse_failed',
      `ollama show response had unexpected shape for ${name}`,
      {
        target: name,
      }
    );
  }
  const raw = body as Record<string, unknown>;
  // Ollama variants ship either `size_bytes` (newer) or `size` (older); accept both.
  const sizeBytes =
    typeof raw.size_bytes === 'number'
      ? raw.size_bytes
      : typeof raw.size === 'number'
        ? raw.size
        : undefined;
  if (sizeBytes === undefined) {
    throw new InstallError('parse_failed', `ollama show missing size field for ${name}`, {
      target: name,
    });
  }
  const info: RemoteModelInfo = {
    ollamaName: name,
    sizeOnDiskGb: bytesToGb(sizeBytes),
  };
  if (typeof raw.digest === 'string') info.digest = raw.digest;
  if (typeof raw.modified_at === 'string') info.modifiedAt = raw.modified_at;
  return info;
}
