import type { AgentBackend, BackendDef } from '@harness-engineering/types';
import { createBackend } from './backend-factory.js';

/**
 * Maintenance backend resolver: map a configured backend NAME to a live
 * {@link AgentBackend}, or `null` when the name is absent from the loaded
 * `agent.backends` map. `null` lets the real agent dispatcher no-op honestly
 * (graceful degradation on a plain checkout) instead of throwing.
 */
export type BackendResolver = (backendName: string) => AgentBackend | null;

/**
 * Build a {@link BackendResolver} from a synthesized `agent.backends` map.
 *
 * This is the ONE shared implementation of "resolve a backend name against a
 * backends map via `createBackend`, else null". It is consumed by BOTH:
 *   - the cron orchestrator (`createMaintenanceTaskRunner`), passing
 *     `this.getBackends()`, and
 *   - the on-demand CLI (`harness maintenance run --fix` →
 *     `makeResolveBackend`), passing the config it loaded from
 *     `harness.orchestrator.md`.
 *
 * Keeping it in the orchestrator package (next to `createBackend`) avoids the
 * two call sites drifting. A `null`/`undefined`/empty map yields a resolver
 * that always returns `null` — the nothing-configured degradation case.
 */
export function makeBackendResolver(
  backends: Record<string, BackendDef> | null | undefined
): BackendResolver {
  return (backendName: string) => {
    const def = backends?.[backendName];
    return def ? createBackend(def) : null;
  };
}
