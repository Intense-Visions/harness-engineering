import { sanitizeExternalText } from './ConnectorUtils.js';

export interface CondenserOptions {
  maxLength: number;
  summarizationThreshold?: number;
  modelEndpoint?: string;
  modelName?: string;
}

export interface CondenserResult {
  content: string;
  method: 'passthrough' | 'truncated' | 'summarized';
  originalLength: number;
}

/**
 * Custom fetch function type for LLM summarization.
 * Allows dependency injection for testing.
 */
export type SummarizeFn = (
  prompt: string,
  options: { endpoint: string; model: string; maxTokens: number }
) => Promise<string>;

const SUMMARIZE_PROMPT = `Summarize the following content to fit within the specified length.
Preserve all business rules, SLAs, requirements, decisions, and regulatory references.
Remove redundant details and boilerplate while keeping all actionable information.

Content to summarize:
`;

/**
 * Tiered content condensation pipeline:
 * 1. Passthrough: content within limit
 * 2. Truncate: content over limit but under summarization threshold
 * 3. LLM-summarize: content over threshold with model available
 * 4. Fallback truncate: content over threshold without model
 */
export async function condenseContent(
  raw: string,
  options: CondenserOptions,
  summarizeFn?: SummarizeFn
): Promise<CondenserResult> {
  const originalLength = raw.length;
  const { maxLength } = options;
  const summarizationThreshold = options.summarizationThreshold ?? maxLength * 2;

  // Tier 1: Passthrough
  if (raw.length <= maxLength) {
    return { content: raw, method: 'passthrough', originalLength };
  }

  // Tier 2: Truncate (over limit, under summarization threshold)
  if (raw.length < summarizationThreshold) {
    return {
      content: sanitizeExternalText(raw, maxLength),
      method: 'truncated',
      originalLength,
    };
  }

  // Tier 3: LLM-summarize (over threshold, model available)
  if (options.modelEndpoint && summarizeFn) {
    try {
      const summarized = await summarizeFn(SUMMARIZE_PROMPT + raw, {
        endpoint: options.modelEndpoint,
        model: options.modelName ?? 'default',
        maxTokens: Math.ceil(maxLength / 4), // rough token estimate
      });
      // Ensure summarized result fits within maxLength
      const finalContent =
        summarized.length > maxLength ? sanitizeExternalText(summarized, maxLength) : summarized;
      return { content: finalContent, method: 'summarized', originalLength };
    } catch {
      // Tier 4: Fallback to truncation on model failure
      return {
        content: sanitizeExternalText(raw, maxLength),
        method: 'truncated',
        originalLength,
      };
    }
  }

  // Tier 4: Fallback truncate (no model configured)
  return {
    content: sanitizeExternalText(raw, maxLength),
    method: 'truncated',
    originalLength,
  };
}
