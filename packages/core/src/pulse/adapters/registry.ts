import type { PulseAdapter } from '@harness-engineering/types';

export class PulseAdapterAlreadyRegisteredError extends Error {
  constructor(public readonly adapterName: string) {
    super(`Pulse adapter "${adapterName}" is already registered.`);
    this.name = 'PulseAdapterAlreadyRegisteredError';
  }
}

const REGISTRY = new Map<string, PulseAdapter>();

/**
 * Register a pulse provider adapter under a unique name.
 *
 * The adapter must have both `query` (fetches raw provider data) and
 * `sanitize` (strips PII to a SanitizedResult). The orchestrator wraps every
 * call with `assertSanitized(adapter.sanitize(raw))` to enforce the PII
 * boundary in defense-in-depth.
 *
 * @throws TypeError if `query` or `sanitize` is missing or not a function.
 * @throws PulseAdapterAlreadyRegisteredError if the name is already taken.
 */
export function registerPulseAdapter(name: string, adapter: PulseAdapter): void {
  if (!adapter || typeof adapter !== 'object') {
    throw new TypeError(`Pulse adapter "${name}" must be an object with query and sanitize.`);
  }
  if (typeof adapter.query !== 'function') {
    throw new TypeError(`Pulse adapter "${name}" is missing required field: query`);
  }
  if (typeof adapter.sanitize !== 'function') {
    throw new TypeError(`Pulse adapter "${name}" is missing required field: sanitize`);
  }
  if (REGISTRY.has(name)) {
    throw new PulseAdapterAlreadyRegisteredError(name);
  }
  REGISTRY.set(name, adapter);
}

export function getPulseAdapter(name: string): PulseAdapter | undefined {
  return REGISTRY.get(name);
}

export function listPulseAdapters(): string[] {
  return [...REGISTRY.keys()].sort();
}

/** Test-only: clear the registry between tests. */
export function clearPulseAdapters(): void {
  REGISTRY.clear();
}
