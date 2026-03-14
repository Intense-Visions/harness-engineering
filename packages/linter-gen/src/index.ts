/**
 * @harness-engineering/linter-gen
 *
 * Generate ESLint rules from YAML configuration
 */

// Main API
export { generate, validate } from './generator/orchestrator';
export type {
  GenerateOptions,
  ValidateOptions,
  GenerateResult,
  ValidateResult,
  GeneratorError,
} from './generator/orchestrator';

// Schema types
export { LinterConfigSchema, RuleConfigSchema } from './schema/linter-config';
export type { LinterConfig, RuleConfig } from './schema/linter-config';

// Engine types (for advanced usage)
export type { RuleContext } from './engine/context-builder';
export type { TemplateSource, TemplateSourceType } from './engine/template-loader';

// Error types
export { ParseError } from './parser/config-parser';
export { TemplateLoadError } from './engine/template-loader';
export { TemplateError } from './engine/template-renderer';
