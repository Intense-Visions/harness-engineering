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

/** Resolve the comprehension config, defaulting every field when absent. */
export function readComprehensionConfig(config?: HarnessConfig | null): ComprehensionConfig {
  return ComprehensionConfigSchema.parse(config?.comprehension ?? {});
}
