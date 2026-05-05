import { z } from 'zod';
import {
  WorkflowConfig,
  Result,
  Ok,
  Err,
  BackendDef,
  RoutingConfig,
} from '@harness-engineering/types';
import { BackendDefSchema, RoutingConfigSchema } from './schema.js';

const REQUIRED_SECTIONS = ['tracker', 'polling', 'workspace', 'hooks', 'agent', 'server'] as const;

const BackendsMapSchema = z.record(z.string(), BackendDefSchema);

/**
 * Cross-field check: every value in `routing` must reference a key in
 * `backends`. Mirrors the Phase 1 standalone helper but returns a flat
 * array of issues for synchronous consumption inside
 * `validateWorkflowConfig` (which is hand-rolled, not a Zod parse).
 */
function crossFieldRoutingIssues(
  backends: Record<string, BackendDef>,
  routing: RoutingConfig
): Array<{ path: string[]; message: string }> {
  const issues: Array<{ path: string[]; message: string }> = [];
  const names = new Set(Object.keys(backends));
  const checkRef = (path: string[], name: string | undefined): void => {
    if (name !== undefined && !names.has(name)) {
      issues.push({
        path,
        message: `routing.${path.join('.')} references unknown backend '${name}'. Defined: [${[...names].join(', ')}].`,
      });
    }
  };
  checkRef(['default'], routing.default);
  checkRef(['quick-fix'], routing['quick-fix']);
  checkRef(['guided-change'], routing['guided-change']);
  checkRef(['full-exploration'], routing['full-exploration']);
  checkRef(['diagnostic'], routing.diagnostic);
  checkRef(['intelligence', 'sel'], routing.intelligence?.sel);
  checkRef(['intelligence', 'pesl'], routing.intelligence?.pesl);
  return issues;
}

export function validateWorkflowConfig(config: unknown): Result<WorkflowConfig, Error> {
  if (!config || typeof config !== 'object')
    return Err(new Error('Config is missing or not an object'));

  const c = config as Record<string, unknown>;
  for (const section of REQUIRED_SECTIONS) {
    if (!c[section]) return Err(new Error(`Config is missing ${section} section`));
  }

  if (
    c.intelligence !== undefined &&
    (typeof c.intelligence !== 'object' || c.intelligence === null)
  ) {
    return Err(new Error('Config intelligence section must be an object if present'));
  }

  // SC15: a config must define either `agent.backend` (legacy) or
  // `agent.backends` (modern). Neither is a hard error — the orchestrator
  // would otherwise crash at construction time when it tries to instantiate
  // a backend.
  const agent = (c.agent ?? {}) as Record<string, unknown>;
  const hasLegacyBackend = typeof agent.backend === 'string' && agent.backend.length > 0;
  const hasModernBackends =
    agent.backends !== undefined && typeof agent.backends === 'object' && agent.backends !== null;
  if (!hasLegacyBackend && !hasModernBackends) {
    return Err(new Error('Config must define agent.backend or agent.backends.'));
  }

  // Modern path: validate the new shape via Phase 0's Zod schemas + the
  // cross-field validator. The legacy path remains hand-rolled until
  // autopilot Phase 4+ retires the legacy schema entirely.
  if (hasModernBackends) {
    const backendsParsed = BackendsMapSchema.safeParse(agent.backends);
    if (!backendsParsed.success) {
      return Err(new Error(`agent.backends: ${backendsParsed.error.message}`));
    }
    const routingParsed = RoutingConfigSchema.optional().safeParse(agent.routing);
    if (!routingParsed.success) {
      return Err(new Error(`agent.routing: ${routingParsed.error.message}`));
    }
    if (routingParsed.data) {
      // Zod's inferred output types include `| undefined` on optional fields,
      // whereas our `BackendDef` (with `exactOptionalPropertyTypes`) does not.
      // Cast through `unknown` — the runtime shape is identical, only the
      // type-level optionality model differs.
      const cross = crossFieldRoutingIssues(
        backendsParsed.data as unknown as Record<string, BackendDef>,
        routingParsed.data as unknown as RoutingConfig
      );
      if (cross.length > 0) {
        return Err(
          new Error(
            `Cross-field: ${cross.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
          )
        );
      }
    }
  }

  return Ok(config as WorkflowConfig);
}

export function getDefaultConfig(): WorkflowConfig {
  return {
    tracker: {
      kind: 'roadmap',
      filePath: 'docs/roadmap.md',
      activeStates: ['planned', 'in-progress'],
      terminalStates: ['done'],
    },
    polling: {
      intervalMs: 30000,
      jitterMs: 0,
    },
    workspace: {
      root: '.harness/workspaces',
    },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 60000,
    },
    agent: {
      backend: 'mock',
      maxConcurrentAgents: 1,
      maxTurns: 10,
      maxRetryBackoffMs: 5000,
      maxRetries: 5,
      maxConcurrentAgentsByState: {},
      turnTimeoutMs: 300000,
      readTimeoutMs: 30000,
      stallTimeoutMs: 60000,
      escalation: {
        alwaysHuman: ['full-exploration'],
        autoExecute: ['quick-fix', 'diagnostic'],
        primaryExecute: [],
        signalGated: ['guided-change'],
        diagnosticRetryBudget: 1,
      },
    },
    server: {
      port: 8080,
    },
    intelligence: {
      enabled: false,
      requestTimeoutMs: 90_000,
      failureCacheTtlMs: 300_000,
    },
  };
}
