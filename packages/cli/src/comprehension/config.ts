/**
 * Comprehension config defaults reader. Parses the optional `comprehension`
 * block through its Zod schema so every field is present with a sane default,
 * even when the block (or the whole config) is absent. Never throws.
 */

import {
  ComprehensionConfigSchema,
  type ComprehensionConfig,
  type HarnessConfig,
} from '../config/schema';
import { resolveProviderKind, type AnalysisEndpoint } from '../mcp/utils/analysis-provider';
import { defaultSemanticModel } from './generate-semantic';

/** Resolve the comprehension config, defaulting every field when absent. */
export function readComprehensionConfig(config?: HarnessConfig | null): ComprehensionConfig {
  return ComprehensionConfigSchema.parse(config?.comprehension ?? {});
}

/**
 * The config-declared OpenAI-compatible analysis endpoint (ADR 0109 slice 3). Only
 * the non-secret base URL comes from config; the API key stays env-only
 * (`HARNESS_ANALYSIS_API_KEY`, read by `makeLocalProvider`). Empty when unset.
 */
export function comprehensionEndpoint(cconf: ComprehensionConfig): AnalysisEndpoint {
  return cconf.analysisBaseUrl ? { baseUrl: cconf.analysisBaseUrl } : {};
}

/**
 * Single source of truth for the semantic model a comprehension run should request
 * (ADR 0109 slice 3 fix). An explicit `comprehension.model` wins for any provider;
 * otherwise the model defaults from the PROVIDER KIND resolved with the SAME
 * config endpoint that `resolveCompileProvider` constructs from — so the model
 * decision and the provider decision cannot diverge (the bug that forced a Claude
 * id onto a config-declared vendor endpoint). A local/OpenAI-compatible endpoint
 * yields `undefined` (the provider uses its own configured model, never a Claude id).
 */
export function selectSemanticModel(
  cconf: ComprehensionConfig,
  opts: { isClaudeCliAvailable?: () => boolean; env?: NodeJS.ProcessEnv } = {}
): string | undefined {
  if (cconf.model) return cconf.model;
  return defaultSemanticModel(
    resolveProviderKind({ endpoint: comprehensionEndpoint(cconf), ...opts })
  );
}
