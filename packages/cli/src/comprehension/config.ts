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
import {
  resolveProviderKind,
  type AnalysisEndpoint,
  type AnalysisCliConfig,
} from '../mcp/utils/analysis-provider';
import { defaultSemanticModel } from './generate-semantic';

/** Resolve the comprehension config, defaulting every field when absent. */
export function readComprehensionConfig(config?: HarnessConfig | null): ComprehensionConfig {
  return ComprehensionConfigSchema.parse(config?.comprehension ?? {});
}

/** The CI behavior of the comprehension gate (ADR 0110 §2). */
export type ComprehensionCiMode = ComprehensionConfig['ci'];

/**
 * Read the (previously dormant) `comprehension.ci` seam (ADR 0110 §2). Now
 * CONSUMED by `comprehend --check`:
 *  - `'verify'` (default) — run the token-free freshness + regression gate.
 *  - `'off'` — disable the gate entirely (exit 0), for adopters who opt out.
 *  - `'refresh'` — run the gate, then attempt the provider-backed **main-pass**
 *    (regenerate + commit semantic) when a provider is available and this is the
 *    main-pass context. With the default maintainer-local provider (ADR 0110 §3)
 *    CI has no credential, so `refresh` degrades gracefully to `verify`; the
 *    opt-in token-gated runner (#1689) plugs its provider into exactly this seam.
 */
export function resolveComprehensionCiMode(config?: HarnessConfig | null): ComprehensionCiMode {
  return readComprehensionConfig(config).ci;
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
 * The config-declared bare subscription CLI (#1710), or undefined when unset. This
 * is the provider-NEUTRAL escape hatch for a non-Claude agent with no API key and
 * no `/v1` endpoint: `resolveAnalysisProvider` inserts it in precedence BEFORE the
 * Claude CLI when its `command` is on PATH. No secret lives here — the CLI
 * authenticates itself.
 */
export function comprehensionCli(cconf: ComprehensionConfig): AnalysisCliConfig | undefined {
  if (!cconf.analysisCli) return undefined;
  const { vendor, command, model, custom } = cconf.analysisCli;
  return {
    vendor,
    command,
    ...(model !== undefined && { model }),
    ...(custom !== undefined && { custom }),
  };
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
  opts: {
    isClaudeCliAvailable?: () => boolean;
    isGenericCliAvailable?: (command: string) => boolean;
    env?: NodeJS.ProcessEnv;
  } = {}
): string | undefined {
  if (cconf.model) return cconf.model;
  const cli = comprehensionCli(cconf);
  return defaultSemanticModel(
    resolveProviderKind({
      endpoint: comprehensionEndpoint(cconf),
      ...(cli ? { cli } : {}),
      ...opts,
    })
  );
}
