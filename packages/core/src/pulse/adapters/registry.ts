import type { SanitizeFn } from '@harness-engineering/types';

export class PulseAdapterAlreadyRegisteredError extends Error {
  constructor(public readonly adapterName: string) {
    super(`Pulse adapter "${adapterName}" is already registered.`);
    this.name = 'PulseAdapterAlreadyRegisteredError';
  }
}

const REGISTRY = new Map<string, SanitizeFn>();

export function registerPulseAdapter(name: string, adapter: SanitizeFn): void {
  if (REGISTRY.has(name)) {
    throw new PulseAdapterAlreadyRegisteredError(name);
  }
  REGISTRY.set(name, adapter);
}

export function getPulseAdapter(name: string): SanitizeFn | undefined {
  return REGISTRY.get(name);
}

export function listPulseAdapters(): string[] {
  return [...REGISTRY.keys()].sort();
}

/** Test-only: clear the registry between tests. */
export function clearPulseAdapters(): void {
  REGISTRY.clear();
}
