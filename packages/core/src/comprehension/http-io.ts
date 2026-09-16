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

/** The serve envelope pnyon returns (structural subset — we only need `module` + `unit`). */
interface ServeEnvelope {
  readonly module?: unknown;
  readonly unit?: unknown;
}

/** The batch serve response (`POST /comprehension-units`). */
interface BatchEnvelope {
  readonly units?: readonly ServeEnvelope[];
}

/** Shared context for the remote IO helpers (keeps the factory a thin wire-up). */
interface RemoteIoCtx {
  readonly base: string;
  readonly root: string;
  readonly outpost: string;
  readonly doFetch: typeof globalThis.fetch;
  readonly authHeaders: Record<string, string>;
  /** module -> unit blob, primed by listUnitPaths so the store's per-path readFile is a hit. */
  readonly cache: Map<string, string>;
}

/** Recover the module from a `<root>/<module>/_module.md` store path. */
function moduleFromPath(p: string, root: string): string {
  let rel = p.replaceAll('\\', '/');
  if (rel.startsWith(`${root}/`)) rel = rel.slice(root.length + 1);
  if (rel.endsWith(`/${UNIT_FILE}`)) rel = rel.slice(0, -(UNIT_FILE.length + 1));
  return rel;
}

/** Parse a serve envelope's `unit` blob, or throw a category error (never the body). */
async function parseServeUnit(res: Response): Promise<string> {
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
}

/** Read one unit's blob: cache-first (primed by listUnitPaths), else a single GET serve. */
async function remoteReadFile(p: string, ctx: RemoteIoCtx): Promise<string> {
  const module = moduleFromPath(p, ctx.root);
  const cached = ctx.cache.get(module);
  if (cached !== undefined) return cached;
  const url =
    `${ctx.base}/comprehension-unit` +
    `?outpost=${encodeURIComponent(ctx.outpost)}&module=${encodeURIComponent(module)}`;
  let res: Response;
  try {
    res = await ctx.doFetch(url, { headers: ctx.authHeaders });
  } catch {
    // Network/transport failure: never surface the URL/token — category only.
    throw new Error('remote comprehension read failed (network error)');
  }
  if (res.status === 404) throw new RemoteUnitNotFoundError(module);
  if (!res.ok) throw new Error(`remote comprehension read failed (HTTP ${res.status})`);
  return parseServeUnit(res);
}

/** POST the batch route ONCE, cache every returned unit, and return the module store paths. */
async function remoteListUnitPaths(ctx: RemoteIoCtx): Promise<string[]> {
  let res: Response;
  try {
    res = await ctx.doFetch(`${ctx.base}/comprehension-units`, {
      method: 'POST',
      headers: { ...ctx.authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ outpost: ctx.outpost, modules: [] }),
    });
  } catch {
    return []; // network failure => no remote enumeration (caller degrades to local)
  }
  if (!res.ok) return [];
  let body: BatchEnvelope;
  try {
    body = (await res.json()) as BatchEnvelope;
  } catch {
    return [];
  }
  const units = Array.isArray(body.units) ? body.units : [];
  const paths: string[] = [];
  for (const u of units) {
    if (typeof u.module !== 'string' || typeof u.unit !== 'string' || u.unit.length === 0) continue;
    ctx.cache.set(u.module, u.unit); // prime the cache so readFile is a hit
    paths.push(`${ctx.root}/${u.module}/${UNIT_FILE}`);
  }
  return paths;
}

/**
 * Build the READ-only remote {@link ComprehensionIO}. `readFile` serves cache-first (primed by
 * `listUnitPaths`'s one batch call) else a single GET; `writeFile` throws (the vault is
 * authoritative; local recompiles cache in a LOCAL node store); `listUnitPaths` batches + caches.
 */
export function createHttpComprehensionReadIO(config: HttpComprehensionConfig): ComprehensionIO {
  const ctx: RemoteIoCtx = {
    base: config.baseUrl.replace(/\/+$/, ''),
    root: (config.root ?? COMPREHENSION_ROOT).replaceAll('\\', '/'),
    outpost: config.outpost,
    doFetch: config.fetch ?? globalThis.fetch,
    authHeaders: { authorization: `Bearer ${config.token}` },
    cache: new Map<string, string>(),
  };
  return {
    readFile: (p) => remoteReadFile(p, ctx),
    writeFile: async () => {
      throw new Error('remote comprehension store is read-only (writes go to the local cache)');
    },
    listUnitPaths: () => remoteListUnitPaths(ctx),
  };
}
