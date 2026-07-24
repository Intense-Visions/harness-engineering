// packages/orchestrator/src/agent/analysis-env.ts
//
// Derive the local analysis endpoint/model for the eval MCP tools
// (acceptance_eval / outcome_eval) from the orchestrator config. Those tools
// judge a spec's acceptance criteria / an outcome via an LLM; without a cloud
// key they degrade to an advisory stub. Pointing them at the reasoner (the
// strong local THINKING model) lets the judgment run fully-locally — the
// verifier/reviewer persona logic, on-device.
//
// The orchestrator applies the result to `process.env` at startup; codex (which
// spawns with `env: process.env`) then passes it to the harness MCP server it
// injects, where the shared `resolveAnalysisProvider` reads it.

import type { WorkflowConfig, RoutingValue } from '@harness-engineering/types';

/** First backend name of a routing value (scalar or prefer-list). */
function firstBackendName(value: RoutingValue | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

/**
 * The env vars the eval tools read (see cli `mcp/utils/analysis-provider`).
 * `HARNESS_ANALYSIS_BASE_URL` is an OpenAI-compatible `/v1` endpoint; the model
 * is optional (the provider falls back to the endpoint's default).
 */
export interface AnalysisEnv {
  HARNESS_ANALYSIS_BASE_URL: string;
  HARNESS_ANALYSIS_MODEL?: string;
}

/**
 * Resolve the analysis env from the THINKING-mode backend (the reasoner). Returns
 * null when there is no such backend or it has no local endpoint — nothing to
 * point the eval provider at, so the tools degrade exactly as before.
 */
export function deriveAnalysisEnv(config: WorkflowConfig): AnalysisEnv | null {
  const name = firstBackendName(config.agent?.routing?.modes?.thinking);
  if (name === undefined) return null;

  const def = config.agent?.backends?.[name] as { endpoint?: unknown; model?: unknown } | undefined;
  if (def === undefined) return null;
  const endpoint = def.endpoint;
  if (typeof endpoint !== 'string' || endpoint.length === 0) return null;

  const rawModel = def.model;
  const model = Array.isArray(rawModel) ? rawModel[0] : rawModel;

  return {
    HARNESS_ANALYSIS_BASE_URL: endpoint,
    ...(typeof model === 'string' && model.length > 0 ? { HARNESS_ANALYSIS_MODEL: model } : {}),
  };
}

/**
 * Apply {@link deriveAnalysisEnv} to `process.env`, guarded so an explicit
 * operator value always wins and a non-local config is a no-op. Returns the
 * applied env (or null) for logging/testing. Idempotent.
 */
export function applyAnalysisEnv(config: WorkflowConfig): AnalysisEnv | null {
  if (typeof process.env.HARNESS_ANALYSIS_BASE_URL === 'string') return null;
  const env = deriveAnalysisEnv(config);
  if (env === null) return null;
  process.env.HARNESS_ANALYSIS_BASE_URL = env.HARNESS_ANALYSIS_BASE_URL;
  if (env.HARNESS_ANALYSIS_MODEL !== undefined) {
    process.env.HARNESS_ANALYSIS_MODEL = env.HARNESS_ANALYSIS_MODEL;
  }
  return env;
}
