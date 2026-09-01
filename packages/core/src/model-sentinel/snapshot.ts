/**
 * Model-update regression sentinel (#1617) — snapshot.
 *
 * Reads the configured source of truth (`harness.config.json` → `agent.backends`)
 * and normalises it into a deterministic {@link ModelSnapshot}. Pure and
 * network-free: it operates on an already-loaded, loosely-typed backends map so
 * it can be unit-tested offline and reused from both the CLI and a scheduled task.
 */

import type { BackendModelIdentity, ModelSnapshot } from './types';

/**
 * The loosely-typed shape of `config.agent.backends`. Each value is a backend
 * definition carrying at least a `type` and a `model` (string or string[]); we
 * read defensively so a malformed config never throws.
 */
export type RawBackendsMap = Record<string, unknown>;

/** Coerce a def's `model` field (string | string[] | unknown) to a sorted id list. */
function normaliseModels(model: unknown): string[] {
  const ids: string[] = [];
  if (typeof model === 'string') {
    if (model.length > 0) ids.push(model);
  } else if (Array.isArray(model)) {
    for (const m of model) {
      if (typeof m === 'string' && m.length > 0) ids.push(m);
    }
  }
  // Sort + de-dup so ordering/aliasing in config does not perturb the digest.
  return [...new Set(ids)].sort();
}

/** Read a def's `type` discriminator, defaulting to `'unknown'` when absent. */
function readType(def: Record<string, unknown>): string {
  const t = def['type'];
  return typeof t === 'string' && t.length > 0 ? t : 'unknown';
}

/**
 * FNV-1a 32-bit hash rendered as an 8-char hex string. No crypto/network dep —
 * a stable content digest is all we need to detect "did the identity set change".
 */
export function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619, kept in 32-bit unsigned space.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Canonical, order-independent serialisation of the identity set for hashing. */
function canonicalise(backends: BackendModelIdentity[]): string {
  return JSON.stringify(
    backends.map((b) => ({ backend: b.backend, type: b.type, models: b.models }))
  );
}

/**
 * Snapshot the configured model identities into a deterministic {@link ModelSnapshot}.
 *
 * @param backends - `config.agent.backends` (may be undefined/empty).
 * @param now - injectable clock for deterministic tests. Defaults to `new Date()`.
 */
export function snapshotModelIdentities(
  backends: RawBackendsMap | undefined,
  now: Date = new Date()
): ModelSnapshot {
  const identities: BackendModelIdentity[] = [];
  if (backends && typeof backends === 'object') {
    for (const [name, rawDef] of Object.entries(backends)) {
      if (rawDef === null || typeof rawDef !== 'object') continue;
      const def = rawDef as Record<string, unknown>;
      identities.push({
        backend: name,
        type: readType(def),
        models: normaliseModels(def['model']),
      });
    }
  }
  identities.sort((a, b) => (a.backend < b.backend ? -1 : a.backend > b.backend ? 1 : 0));
  return {
    takenAt: now.toISOString(),
    backends: identities,
    digest: fnv1aHex(canonicalise(identities)),
  };
}
