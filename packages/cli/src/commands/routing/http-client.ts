/**
 * Spec B Phase 6: shared HTTP helpers for the `harness routing`
 * subcommand group. Mirrors `packages/cli/src/mcp/tools/gateway-tools.ts`
 * — `orchestratorBase()` reads `HARNESS_ORCHESTRATOR_URL` (default
 * `http://127.0.0.1:8080`); `authHeader()` forwards `HARNESS_API_TOKEN`
 * as `Authorization: Bearer ...`. Both Phase 5 routes use
 * `read-telemetry` scope (D-OP-1 of Phase 5); the legacy
 * `HARNESS_API_TOKEN` resolves as admin in dev mode, so no token
 * configuration is required for localhost orchestrators.
 */
export function orchestratorBase(): string {
  return process.env['HARNESS_ORCHESTRATOR_URL'] ?? 'http://127.0.0.1:8080';
}

export function authHeader(): Record<string, string> {
  const tok = process.env['HARNESS_API_TOKEN'];
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}

export interface CallResult<T> {
  ok: boolean;
  status: number;
  body: T | null;
  error?: string;
}

/**
 * GET helper. Returns parsed JSON on 2xx, `{ ok:false, status, error }`
 * on non-2xx or network failure. Callers map status -> exit code.
 */
export async function getJson<T>(path: string): Promise<CallResult<T>> {
  try {
    const res = await fetch(`${orchestratorBase()}${path}`, {
      headers: { ...authHeader() },
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, body: null, error: text };
    return { ok: true, status: res.status, body: text ? (JSON.parse(text) as T) : null };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * POST helper. Same shape as getJson; serializes body as JSON.
 */
export async function postJson<T>(path: string, body: unknown): Promise<CallResult<T>> {
  try {
    const res = await fetch(`${orchestratorBase()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, body: null, error: text };
    return { ok: true, status: res.status, body: text ? (JSON.parse(text) as T) : null };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
