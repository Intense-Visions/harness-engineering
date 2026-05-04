import type {
  AgentConfig,
  BackendDef,
  ClaudeBackendDef,
  AnthropicBackendDef,
  OpenAIBackendDef,
  GeminiBackendDef,
  MockBackendDef,
  LocalBackendDef,
  PiBackendDef,
  RoutingConfig,
  ScopeTier,
} from '@harness-engineering/types';

/**
 * Result of running `migrateAgentConfig`.
 *
 * `config` is the *effective* AgentConfig — either the input unchanged
 * (when `agent.backends` is already set or no migration is needed) or
 * the input augmented with synthesized `backends` and `routing` fields.
 *
 * `warnings` is a list of human-readable deprecation messages, one per
 * legacy field encountered. Each message names the deprecated field
 * (dotted path) and includes a pointer to the migration guide. The
 * orchestrator emits these as `warn`-level log entries at startup.
 */
export interface MigrationResult {
  config: AgentConfig;
  warnings: string[];
}

const MIGRATION_GUIDE = 'docs/guides/multi-backend-routing.md';

/**
 * Translate legacy `agent.backend` / `agent.localBackend` /
 * `agent.escalation.autoExecute` into the new `agent.backends` +
 * `agent.routing` shape (Spec 2 D3, D4, D8, D11).
 *
 * Behavior matrix:
 * - `agent.backends` already set, no legacy fields:
 *     no-op; returns input config unchanged, warnings = [].
 * - `agent.backends` already set + at least one legacy field:
 *     no-op on config; warnings name each ignored legacy field (D4).
 * - No `agent.backends`, at least one of `agent.backend` /
 *   `agent.localBackend` / `agent.localEndpoint` / etc. set:
 *     synthesize `backends.primary` (always, from `agent.backend`)
 *     and `backends.local` (when `localBackend` is set), plus a
 *     `routing` map driven by `escalation.autoExecute` (D3).
 * - No `agent.backends`, no legacy fields:
 *     no-op; the caller's downstream Zod validation surfaces the gap
 *     as a missing-required-field error.
 *
 * Throws on internal inconsistencies (e.g., `agent.backend = 'pi'`
 * with no `localEndpoint`/`localModel`) — these are user-config bugs
 * that would have produced a runtime crash today.
 */
export function migrateAgentConfig(agent: AgentConfig): MigrationResult {
  const warnings: string[] = [];

  // Identify which legacy fields are present (dotted paths).
  const legacyFields: Array<{ path: string; present: boolean }> = [
    { path: 'agent.backend', present: agent.backend !== undefined && agent.backend !== '' },
    { path: 'agent.command', present: agent.command !== undefined },
    { path: 'agent.model', present: agent.model !== undefined },
    { path: 'agent.apiKey', present: agent.apiKey !== undefined },
    { path: 'agent.localBackend', present: agent.localBackend !== undefined },
    { path: 'agent.localEndpoint', present: agent.localEndpoint !== undefined },
    { path: 'agent.localModel', present: agent.localModel !== undefined },
    { path: 'agent.localApiKey', present: agent.localApiKey !== undefined },
    { path: 'agent.localTimeoutMs', present: agent.localTimeoutMs !== undefined },
    { path: 'agent.localProbeIntervalMs', present: agent.localProbeIntervalMs !== undefined },
  ];
  const presentLegacy = legacyFields.filter((f) => f.present).map((f) => f.path);

  // Case 1: `agent.backends` already set — new schema wins.
  //
  // Two-tier suppression for case 1 (NF-1, Spec 2 Phase 4):
  //
  // `CASE1_ALWAYS_SUPPRESS`: `agent.backend` is required-by-type today.
  // Every Spec-2-migrated config has it set to a placeholder value, so
  // warning about it would be unconditional noise. (Phase 5+ retires
  // the field by making it optional.)
  //
  // `CASE1_LOCAL_GROUP`: the legacy local* fields. These are inert
  // without `agent.localBackend` (which is the gate that activates
  // them). We suppress them only when `agent.localBackend` IS itself
  // set — i.e., the whole group is a coherent unit and the user is
  // mid-migration with both shapes (suppress to avoid noisy boot
  // logs). When `localBackend` is undefined, a stray local* field is
  // genuine user-config drift (the user partially migrated and forgot
  // to clean a legacy field) — we emit the warning so the drift is
  // visible.
  //
  // NF-1 carry-forward from Phase 0: previously the local* group was
  // unconditionally suppressed, which silently hid genuine user-config
  // drift (e.g., `localEndpoint` set without `localBackend`).
  const CASE1_ALWAYS_SUPPRESS = new Set(['agent.backend']);
  const CASE1_LOCAL_GROUP = new Set([
    'agent.localBackend',
    'agent.localEndpoint',
    'agent.localModel',
    'agent.localApiKey',
    'agent.localTimeoutMs',
    'agent.localProbeIntervalMs',
  ]);
  const suppressLocalGroup = agent.localBackend !== undefined;

  if (agent.backends !== undefined) {
    for (const path of presentLegacy) {
      if (CASE1_ALWAYS_SUPPRESS.has(path)) continue;
      if (suppressLocalGroup && CASE1_LOCAL_GROUP.has(path)) continue;
      warnings.push(
        `Ignoring legacy field '${path}': 'agent.backends' is set and takes precedence. See ${MIGRATION_GUIDE}.`
      );
    }
    return { config: agent, warnings };
  }

  // Case 2: No `agent.backends` and no legacy fields — caller's downstream
  // validation (Phase 3) surfaces the gap. Phase 1 is a no-op.
  if (presentLegacy.length === 0) {
    return { config: agent, warnings };
  }

  // Case 3: synthesize backends and routing from legacy fields.
  const backends: Record<string, BackendDef> = {};
  const routing: RoutingConfig = { default: 'primary' };

  // Synthesize `backends.primary` from `agent.backend`.
  backends.primary = synthesizePrimary(agent);

  // Synthesize `backends.local` from `agent.localBackend` (if set).
  if (agent.localBackend !== undefined) {
    backends.local = synthesizeLocal(agent);
  }

  // Translate `escalation.autoExecute` into routing entries.
  const autoExec: ScopeTier[] = agent.escalation?.autoExecute ?? [];
  if (backends.local !== undefined) {
    for (const tier of autoExec) {
      routing[tier] = 'local';
    }
  }

  // One warning per legacy field present, naming the field and the
  // guide. The orchestrator's logger collapses these into a single
  // `warn` call (Phase 3 wiring).
  for (const path of presentLegacy) {
    warnings.push(
      `Deprecated config field '${path}' is in use. Migrate to 'agent.backends' / 'agent.routing'. See ${MIGRATION_GUIDE}.`
    );
  }

  return {
    config: {
      ...agent,
      backends,
      routing,
    },
    warnings,
  };
}

function synthesizePrimary(agent: AgentConfig): BackendDef {
  const backend = agent.backend;
  switch (backend) {
    case 'mock':
      return { type: 'mock' } satisfies MockBackendDef;
    case 'claude': {
      const def: ClaudeBackendDef = { type: 'claude' };
      if (agent.command !== undefined) def.command = agent.command;
      return def;
    }
    case 'anthropic': {
      if (agent.model === undefined) {
        throw new Error("migrateAgentConfig: agent.backend='anthropic' requires agent.model");
      }
      const def: AnthropicBackendDef = { type: 'anthropic', model: agent.model };
      if (agent.apiKey !== undefined) def.apiKey = agent.apiKey;
      return def;
    }
    case 'openai': {
      if (agent.model === undefined) {
        throw new Error("migrateAgentConfig: agent.backend='openai' requires agent.model");
      }
      const def: OpenAIBackendDef = { type: 'openai', model: agent.model };
      if (agent.apiKey !== undefined) def.apiKey = agent.apiKey;
      return def;
    }
    case 'gemini': {
      if (agent.model === undefined) {
        throw new Error("migrateAgentConfig: agent.backend='gemini' requires agent.model");
      }
      const def: GeminiBackendDef = { type: 'gemini', model: agent.model };
      if (agent.apiKey !== undefined) def.apiKey = agent.apiKey;
      return def;
    }
    case 'local': {
      // Treated identically to 'pi' for synthesis; uses the localEndpoint /
      // localModel as the connection details.
      if (agent.localEndpoint === undefined || agent.localModel === undefined) {
        throw new Error(
          "migrateAgentConfig: agent.backend='local' requires agent.localEndpoint and agent.localModel"
        );
      }
      const def: LocalBackendDef = {
        type: 'local',
        endpoint: agent.localEndpoint,
        model: agent.localModel,
      };
      if (agent.localApiKey !== undefined) def.apiKey = agent.localApiKey;
      if (agent.localTimeoutMs !== undefined) def.timeoutMs = agent.localTimeoutMs;
      if (agent.localProbeIntervalMs !== undefined)
        def.probeIntervalMs = agent.localProbeIntervalMs;
      return def;
    }
    case 'pi': {
      if (agent.localEndpoint === undefined || agent.localModel === undefined) {
        throw new Error(
          "migrateAgentConfig: agent.backend='pi' requires agent.localEndpoint and agent.localModel"
        );
      }
      const def: PiBackendDef = {
        type: 'pi',
        endpoint: agent.localEndpoint,
        model: agent.localModel,
      };
      if (agent.localApiKey !== undefined) def.apiKey = agent.localApiKey;
      if (agent.localTimeoutMs !== undefined) def.timeoutMs = agent.localTimeoutMs;
      if (agent.localProbeIntervalMs !== undefined)
        def.probeIntervalMs = agent.localProbeIntervalMs;
      return def;
    }
    default:
      throw new Error(
        `migrateAgentConfig: unknown legacy backend '${String(backend)}'. Expected one of: mock, claude, anthropic, openai, gemini, local, pi.`
      );
  }
}

function synthesizeLocal(agent: AgentConfig): BackendDef {
  if (agent.localBackend === undefined) {
    throw new Error('synthesizeLocal called without agent.localBackend');
  }
  if (agent.localEndpoint === undefined || agent.localModel === undefined) {
    throw new Error(
      'migrateAgentConfig: agent.localBackend requires agent.localEndpoint and agent.localModel'
    );
  }
  if (agent.localBackend === 'pi') {
    const def: PiBackendDef = {
      type: 'pi',
      endpoint: agent.localEndpoint,
      model: agent.localModel,
    };
    if (agent.localApiKey !== undefined) def.apiKey = agent.localApiKey;
    if (agent.localTimeoutMs !== undefined) def.timeoutMs = agent.localTimeoutMs;
    if (agent.localProbeIntervalMs !== undefined) def.probeIntervalMs = agent.localProbeIntervalMs;
    return def;
  }
  // 'openai-compatible'
  const def: LocalBackendDef = {
    type: 'local',
    endpoint: agent.localEndpoint,
    model: agent.localModel,
  };
  if (agent.localApiKey !== undefined) def.apiKey = agent.localApiKey;
  if (agent.localTimeoutMs !== undefined) def.timeoutMs = agent.localTimeoutMs;
  if (agent.localProbeIntervalMs !== undefined) def.probeIntervalMs = agent.localProbeIntervalMs;
  return def;
}
