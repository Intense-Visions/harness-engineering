// packages/cli/src/commands/roadmap/triage-pool.ts
//
// Roadmap Auto-Triage — pool-first local-model selection for the CLI brainstorm/report path.
//
// The static `agent.backends.local.model` config list is a fixed, hand-maintained array whose
// FIRST entry was the only model triage ever used — so triage could be pinned to a weak model
// even after the LMLM pool had installed and RANKED a stronger one. The live orchestrator does
// not have this problem: its `LocalModelResolver` derives candidates from the pool via
// `poolStateToCandidates(snapshot, profile)` AND then intersects them with the models the
// endpoint is actually SERVING (its `/v1/models` probe) before picking one. This module brings
// that SAME pool-first-then-health-checked pick to the one-shot CLI triage path, so the CLI and
// live agents agree on a model that is actually loadable.
//
// The health check is what keeps the two honest: a pool entry that was `ollama rm`'d out-of-band,
// or a pool copied onto a host whose `pi` endpoint is vLLM/LM-Studio (different model ids), is
// NOT served → it is skipped → the static config list remains the fallback. Pool is the PREFERRED
// source; config is the documented floor.

import {
  PoolStateStore,
  poolStateToCandidates,
  type PoolState,
  type RankProfile,
} from '@harness-engineering/orchestrator';

/** How long to wait on the endpoint `/v1/models` health probe before giving up (→ config fallback). */
const PROBE_TIMEOUT_MS = 4000;

/** Minimal read view of the persisted pool the resolver needs (hydrate + snapshot). */
export interface PoolSnapshotStore {
  load(): Promise<void>;
  snapshot(): PoolState;
}

/** Dependencies for {@link resolvePreferredLocalModel} — injectable seams for tests. */
export interface ResolvePreferredLocalModelDeps {
  /**
   * Store to read. Defaults to a `PoolStateStore` over the global
   * `~/.harness/local-models/pool.json`. Injected in tests to avoid disk IO.
   */
  store?: PoolSnapshotStore;
  /**
   * The local backend's OpenAI-compatible base URL (e.g. `http://127.0.0.1:11434/v1`). Required
   * for the health check — without it we cannot verify a pool pick is served, so we return
   * `undefined` (config fallback) rather than bake in a possibly-unserved model.
   */
  endpoint?: string;
  /** Bearer token for the endpoint (Ollama accepts any; defaults to none). */
  apiKey?: string;
  /** Injectable fetch for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/**
 * The set of model ids the endpoint is currently serving, via its OpenAI-compatible
 * `/v1/models` route. Returns `undefined` on any failure (unreachable, non-2xx, bad shape,
 * timeout) — the caller treats that as "cannot verify" → config fallback. Never throws.
 */
async function probeServedModels(
  endpoint: string,
  apiKey: string | undefined,
  fetchImpl: typeof fetch
): Promise<Set<string> | undefined> {
  const url = endpoint.replace(/\/$/, '') + '/models';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      ...(apiKey !== undefined ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}),
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { data?: Array<{ id?: unknown }> };
    const ids = (body.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    return new Set(ids);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Derive the preferred LOCAL model from the persisted LMLM pool, ranked for `profile`, restricted
 * to models the endpoint is ACTUALLY SERVING.
 *
 * Returns the highest-ranked pool candidate that the endpoint's `/v1/models` reports as served,
 * or `undefined` when: the pool is empty/absent, no `endpoint` was supplied, the probe fails, or
 * none of the ranked candidates are served — in every case the caller falls back to the static
 * `agent.backends.local.model` config list. NEVER throws. This mirrors the live
 * `LocalModelResolver` (rank via `poolStateToCandidates`, then intersect with the probe) so the
 * CLI and live agents pick the same LOADABLE model.
 */
export async function resolvePreferredLocalModel(
  profile: RankProfile,
  deps: ResolvePreferredLocalModelDeps = {}
): Promise<string | undefined> {
  try {
    const store = deps.store ?? new PoolStateStore();
    await store.load();
    // `load()` degrades a missing/malformed pool to an empty snapshot → `candidates` is `[]`.
    // `.filter(Boolean)` guards a corrupt entry with an empty `ollamaName` from being selected.
    const candidates = poolStateToCandidates(store.snapshot(), profile).filter(
      (name): name is string => typeof name === 'string' && name.length > 0
    );
    if (candidates.length === 0) return undefined;

    // Health check (parity with the live resolver): only pick a model the endpoint serves. No
    // endpoint OR a failed probe ⇒ we cannot verify ⇒ config fallback (never bake in a dead model).
    if (deps.endpoint === undefined) return undefined;
    const served = await probeServedModels(deps.endpoint, deps.apiKey, deps.fetchImpl ?? fetch);
    if (served === undefined) return undefined;
    return candidates.find((name) => served.has(name));
  } catch {
    // Defensive: any unexpected throw must degrade to the config fallback, not break triage.
    return undefined;
  }
}
