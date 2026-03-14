import * as path from 'path';
import type { RuleConfig } from '../schema/linter-config.js';
import type { TemplateSource } from '../engine/template-loader.js';
import { buildRuleContext } from '../engine/context-builder.js';
import { renderTemplate, TemplateError } from '../engine/template-renderer.js';

export interface GeneratedRule {
  name: string;
  outputPath: string;
  content: string;
}

export type GenerateRuleResult =
  | { success: true; rule: GeneratedRule }
  | { success: false; error: TemplateError; ruleName: string };

/**
 * Generate a single ESLint rule file from config and template
 */
export function generateRule(
  rule: RuleConfig,
  template: TemplateSource,
  outputDir: string,
  configPath: string
): GenerateRuleResult {
  // Build template context
  const context = buildRuleContext(rule, configPath);

  // Render template
  const renderResult = renderTemplate(template.content, context);
  if (!renderResult.success) {
    return {
      success: false,
      error: renderResult.error,
      ruleName: rule.name,
    };
  }

  // Construct output path
  const outputPath = path.join(outputDir, `${rule.name}.ts`);

  return {
    success: true,
    rule: {
      name: rule.name,
      outputPath,
      content: renderResult.output,
    },
  };
}
