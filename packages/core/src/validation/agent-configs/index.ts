/**
 * Agent-config validation entrypoint.
 *
 * Public surface:
 *   - `validateAgentConfigs(cwd, options)` — hybrid validator (agnix binary preferred, TS fallback)
 *   - `runFallbackRules(cwd)` — deterministic TS-only rule set, exposed for tests/CI
 *   - types: `AgentConfigFinding`, `AgentConfigValidation`, `AgentConfigOptions`, `AgentConfigSeverity`,
 *     `AgentConfigFallbackReason`
 */

export { validateAgentConfigs, runFallbackRules } from './runner';
export type {
  AgentConfigFinding,
  AgentConfigValidation,
  AgentConfigOptions,
  AgentConfigSeverity,
  AgentConfigFallbackReason,
} from './types';
