import type { RuleConfig } from '../schema/linter-config';

// Package version - update when releasing
const GENERATOR_VERSION = '0.1.0';

export interface RuleContext {
  /** Original kebab-case name */
  name: string;
  /** camelCase version */
  nameCamel: string;
  /** PascalCase version */
  namePascal: string;
  /** ESLint severity */
  severity: string;
  /** Template-specific config object */
  config: Record<string, unknown>;
  /** Generation metadata */
  meta: {
    generatedAt: string;
    generatorVersion: string;
    configPath: string;
  };
}

/**
 * Convert kebab-case to camelCase
 */
function toCamelCase(str: string): string {
  return str.replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase());
}

/**
 * Convert kebab-case to PascalCase
 */
function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * Build template context from rule configuration
 */
export function buildRuleContext(rule: RuleConfig, configPath: string): RuleContext {
  return {
    name: rule.name,
    nameCamel: toCamelCase(rule.name),
    namePascal: toPascalCase(rule.name),
    severity: rule.severity,
    config: rule.config as Record<string, unknown>,
    meta: {
      generatedAt: new Date().toISOString(),
      generatorVersion: GENERATOR_VERSION,
      configPath,
    },
  };
}
