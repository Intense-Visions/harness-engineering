/**
 * @harness-engineering/linter-gen
 *
 * Generate ESLint rules from YAML configuration
 */

// Main API
export { generate, validate } from './generator/orchestrator.js';
export type {
  GenerateOptions,
  ValidateOptions,
  GenerateResult,
  ValidateResult,
  GeneratorError,
} from './generator/orchestrator.js';

// Schema types
export { LinterConfigSchema, RuleConfigSchema } from './schema/linter-config.js';
export type { LinterConfig, RuleConfig } from './schema/linter-config.js';

// Engine types (for advanced usage)
export type { RuleContext } from './engine/context-builder.js';
export type { TemplateSource, TemplateSourceType } from './engine/template-loader.js';

// Error types
export { ParseError } from './parser/config-parser.js';
export { TemplateLoadError } from './engine/template-loader.js';
export { TemplateError } from './engine/template-renderer.js';
