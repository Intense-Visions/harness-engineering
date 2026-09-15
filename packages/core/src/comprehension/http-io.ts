/**
 * A REMOTE comprehension read source — the consumer half of pnyon's
 * `harness-comprehension-serve` (docs live in the pnyon repo). It fetches a module's compiled
 * `_module.md` unit from a hosted vault over HTTP, so the harness can serve comprehension that
 * a central service (pnyon) maintains, rather than recompiling every module locally.
 *
 * It implements the read side of {@link ComprehensionIO} (`readFile` + `listUnitPaths`); the
 * WRITE side throws, because the remote vault is authoritative and read-only to this consumer —
 * a local recompile is cached by a LOCAL node store, never pushed here (single-writer: the
 * hosted pipeline). The store-selection layer keeps the two apart, so this file only ever reads.
 *
 * Auth is an identity-bound bearer serve token (a PAT): the vault resolves it to an identity and
 * authorizes the requested Outpost against that identity. The token is read from the environment
 * by the config layer and passed in here — it is never logged or spliced into an error.
 *
 * `fetch` is injected, so every branch (200 / 404 / non-2xx / bad-JSON / network) is unit-tested
 * with no network. Pure over the injected `fetch`; no node:fs, no credential in code.
 */
import type { ComprehensionIO } from './store';
import { COMPREHENSION_ROOT, UNIT_FILE } from './store';

/** Config for {@link createHttpComprehensionReadIO}. */
export interface HttpComprehensionConfig {
  /** The hosted vault base URL (e.g. pnyon-core), no trailing slash required. */
  readonly baseUrl: string;
  /** The identity-bound, read-only serve token (a PAT). Sent as `Authorization: Bearer`. */
  readonly token: string;
  /** The Outpost (UUID) whose comprehension to read — authorized against the token's identity. */
  readonly outpost: string;
  /** The shard-tree root the store keys paths under (to recover `module` from a path). */
  readonly root?: string;
  /** Injected `fetch` (the real global in prod; a fake in tests). */
  readonly fetch?: typeof globalThis.fetch;
}

/** Thrown by `readFile` when the remote has no unit for the module — shaped like ENOENT so the
 *  serve gate treats it as "absent" (recompile locally) rather than a hard failure. */
export class RemoteUnitNotFoundError extends Error {
  readonly code = 'ENOENT';
  constructor(module: string) {
    super(`remote comprehension unit not found for "${module}"`);
    this.name = 'RemoteUnitNotFoundError';
  }
}

/** The serve envelope pnyon returns (structural subset — we only need `unit`). */
interface ServeEnvelope {
  readonly unit?: unknown;
}

/**
 * Build the READ-only remote {@link ComprehensionIO}. `readFile(path)` maps the store path
 * (`<root>/<module>/_module.md`) back to `module` and GETs the vault's serve route; `writeFile`
 * throws (read-only); `listUnitPaths` returns `[]` for now — a batch listing endpoint is a
 * follow-up on the vault, and the primary consumer (`get_comprehension`, a single-module read)
 * does not need it.
 */
export function createHttpComprehensionReadIO(config: HttpComprehensionConfig): ComprehensionIO {
  const base = config.baseUrl.replace(/\/+$/, '');
  const root = (config.root ?? COMPREHENSION_ROOT).replaceAll('\\', '/');
  const doFetch = config.fetch ?? globalThis.fetch;

  /** Recover the module from a `<root>/<module>/_module.md` store path. */
  const moduleOf = (p: string): string => {
    let rel = p.replaceAll('\\', '/');
    if (rel.startsWith(`${root}/`)) rel = rel.slice(root.length + 1);
    if (rel.endsWith(`/${UNIT_FILE}`)) rel = rel.slice(0, -(UNIT_FILE.length + 1));
    return rel;
  };

  return {
    async readFile(p: string): Promise<string> {
      const module = moduleOf(p);
      const url =
        `${base}/comprehension-unit` +
        `?outpost=${encodeURIComponent(config.outpost)}&module=${encodeURIComponent(module)}`;
      let res: Response;
      try {
        res = await doFetch(url, { headers: { authorization: `Bearer ${config.token}` } });
      } catch {
        // Network/transport failure: never surface the URL/token — category only.
        throw new Error('remote comprehension read failed (network error)');
      }
      if (res.status === 404) throw new RemoteUnitNotFoundError(module);
      if (!res.ok) {
        // 401 (bad token), 403 (unauthorized Outpost), 5xx — status only, no body.
        throw new Error(`remote comprehension read failed (HTTP ${res.status})`);
      }
      let envelope: ServeEnvelope;
      try {
        envelope = (await res.json()) as ServeEnvelope;
      } catch {
        throw new Error('remote comprehension read returned an unparseable body');
      }
      if (typeof envelope.unit !== 'string' || envelope.unit.length === 0) {
        throw new Error('remote comprehension read returned no unit blob');
      }
      return envelope.unit;
    },
    async writeFile(): Promise<void> {
      // The hosted vault is authoritative + read-only to this consumer; local recompiles are
      // cached by a LOCAL node store, never pushed here (single-writer = the hosted pipeline).
      throw new Error('remote comprehension store is read-only (writes go to the local cache)');
    },
    async listUnitPaths(): Promise<string[]> {
      // No batch-listing endpoint on the vault yet; the single-module read path is what
      // `get_comprehension` uses. Empty is correct here (no remote enumeration) — a batch
      // endpoint + real listing is a tracked follow-up.
      return [];
    },
  };
}
