import { z } from 'zod';
import {
  WorkflowConfig,
  Result,
  Ok,
  Err,
  BackendDef,
  RoutingConfig,
  STANDARD_COGNITIVE_MODES,
  type RoutingValue,
} from '@harness-engineering/types';
import { BackendDefSchema, RoutingConfigSchema } from './schema.js';

const REQUIRED_SECTIONS = ['tracker', 'polling', 'workspace', 'hooks', 'agent', 'server'] as const;

const BackendsMapSchema = z.record(z.string(), BackendDefSchema);

/**
 * Cross-field check: every value in `routing` must reference a key in
 * `backends`. Mirrors the Phase 1 standalone helper but returns a flat
 * array of issues for synchronous consumption inside
 * `validateWorkflowConfig` (which is hand-rolled, not a Zod parse).
 *
 * Exported for unit testing. Production callers should prefer
 * `validateWorkflowConfig` (which wraps this helper with the surrounding
 * legacy-vs-modern branching).
 */
export function crossFieldRoutingIssues(
  backends: Record<string, BackendDef>,
  routing: RoutingConfig
): Array<{ path: string[]; message: string }> {
  const issues: Array<{ path: string[]; message: string }> = [];
  const names = new Set(Object.keys(backends));
  // Spec B Phase 0: every routing target is now RoutingValue
  // (scalar OR non-empty chain). Walk each entry in the chain and report
  // the offending index in the issue path (e.g. routing.skills.foo.1).
  const checkRef = (path: string[], value: RoutingValue | undefined): void => {
    if (value === undefined) return;
    const entries = Array.isArray(value) ? value : [value as string];
    entries.forEach((name, idx) => {
      if (names.has(name)) return;
      const pathWithIdx = Array.isArray(value) ? [...path, String(idx)] : path;
      issues.push({
        path: pathWithIdx,
        message: `routing.${pathWithIdx.join('.')} references unknown backend '${name}'. Defined: [${[...names].join(', ')}].`,
      });
    });
  };
  checkRef(['default'], routing.default);
  checkRef(['quick-fix'], routing['quick-fix']);
  checkRef(['guided-change'], routing['guided-change']);
  checkRef(['full-exploration'], routing['full-exploration']);
  checkRef(['diagnostic'], routing.diagnostic);
  checkRef(['intelligence', 'sel'], routing.intelligence?.sel);
  checkRef(['intelligence', 'pesl'], routing.intelligence?.pesl);
  // --- Spec B Phase 2: validate isolation tier chain entries (closes I2) ---
  checkRef(['isolation', 'none'], routing.isolation?.none);
  checkRef(['isolation', 'container'], routing.isolation?.container);
  checkRef(['isolation', 'remote-sandbox'], routing.isolation?.['remote-sandbox']);
  // --- Spec B Phase 0: validate skills + modes chain entries ---
  if (routing.skills) {
    for (const [skill, value] of Object.entries(routing.skills)) {
      checkRef(['skills', skill], value);
    }
  }
  if (routing.modes) {
    for (const [mode, value] of Object.entries(routing.modes)) {
      checkRef(['modes', mode], value);
    }
  }
  return issues;
}

/**
 * Spec B Phase 2 / S3: produce non-blocking warnings for misconfigured
 * routing entries that are SYNTACTICALLY valid (the cross-field check
 * has passed) but SEMANTICALLY suspicious:
 *
 *  - `routing.skills.<name>` where `<name>` is not in the local skill
 *    catalog. Likely a typo or a skill that was renamed / removed.
 *
 *  - `routing.modes.<mode>` where `<mode>` is not in the
 *    STANDARD_COGNITIVE_MODES tuple. Since `CognitiveMode` allows the
 *    `(string & {})` escape hatch, the type system accepts custom modes
 *    — but operators are far more likely to typo a standard mode than
 *    introduce a custom one, so we warn.
 *
 * Returns an empty array when `knownSkillNames` is empty (i.e., the
 * catalog could not be discovered — most likely because `agents/skills/`
 * is absent). Skipping is preferable to flooding the operator with
 * false positives when the catalog itself is missing.
 *
 * Warnings are advisory; the loader continues to return `Ok` and the
 * orchestrator starts normally.
 */
export function routingWarnings(
  routing: RoutingConfig,
  knownSkillNames: readonly string[]
): string[] {
  const warnings: string[] = [];

  // Skill-name warnings (only when a catalog was discovered).
  if (knownSkillNames.length > 0 && routing.skills) {
    const known = new Set(knownSkillNames);
    for (const name of Object.keys(routing.skills)) {
      if (known.has(name)) continue;
      warnings.push(
        `routing.skills.${name} references a skill that is not present in the local skill catalog. ` +
          `If this is intentional (e.g., a skill installed by a downstream consumer), this warning can be ignored.`
      );
    }
  }

  // Cognitive-mode warnings (no catalog needed — STANDARD_COGNITIVE_MODES is static).
  if (routing.modes) {
    const standardModes = new Set<string>(STANDARD_COGNITIVE_MODES);
    for (const mode of Object.keys(routing.modes)) {
      if (standardModes.has(mode)) continue;
      warnings.push(
        `routing.modes.${mode} is not in STANDARD_COGNITIVE_MODES (` +
          `${[...STANDARD_COGNITIVE_MODES].join(', ')}). ` +
          `Custom cognitive modes are allowed but uncommon; verify this is not a typo.`
      );
    }
  }

  return warnings;
}

export interface ValidateWorkflowConfigOptions {
  /**
   * Known skill names from the local catalog. When non-empty, used to
   * warn (S3) on `routing.skills.<name>` references that are not in
   * the catalog. When empty, skill-name warnings are suppressed — the
   * caller is presumed to be running without a discoverable catalog
   * (e.g., tests, or orchestrator outside a harness project root).
   */
  knownSkillNames?: readonly string[];
}

export interface ValidatedWorkflowConfig {
  config: WorkflowConfig;
  /**
   * Non-blocking warnings produced during validation. Currently
   * includes (Spec B Phase 2 / S3):
   *   - `routing.skills.<name>` not in the local catalog
   *   - `routing.modes.<mode>` not in `STANDARD_COGNITIVE_MODES`
   */
  warnings: readonly string[];
}

export function validateWorkflowConfig(
  config: unknown,
  options: ValidateWorkflowConfigOptions = {}
): Result<ValidatedWorkflowConfig, Error> {
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
  const warnings: string[] = [];
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
      const routingData = routingParsed.data as unknown as RoutingConfig;
      const cross = crossFieldRoutingIssues(
        backendsParsed.data as unknown as Record<string, BackendDef>,
        routingData
      );
      if (cross.length > 0) {
        return Err(
          new Error(
            `Cross-field: ${cross.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
          )
        );
      }
      // Spec B Phase 2 / S3: non-blocking warnings.
      warnings.push(...routingWarnings(routingData, options.knownSkillNames ?? []));
    }
  }

  return Ok({ config: config as WorkflowConfig, warnings });
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
