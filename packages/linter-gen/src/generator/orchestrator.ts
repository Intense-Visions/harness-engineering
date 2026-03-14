// src/generator/orchestrator.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { parseConfig, type ParseError } from '../parser/config-parser.js';
import { loadTemplate, type TemplateLoadError } from '../engine/template-loader.js';
import { generateRule } from './rule-generator.js';
import { generateIndex } from './index-generator.js';
import type { TemplateError } from '../engine/template-renderer.js';

export interface GenerateOptions {
  /** Path to harness-linter.yml */
  configPath: string;
  /** Override output directory from config */
  outputDir?: string;
  /** Remove existing files before generating */
  clean?: boolean;
  /** Preview without writing files */
  dryRun?: boolean;
}

export interface ValidateOptions {
  configPath: string;
}

export type GeneratorError =
  | { type: 'parse'; error: ParseError }
  | { type: 'template'; error: TemplateLoadError; ruleName: string }
  | { type: 'render'; error: TemplateError; ruleName: string }
  | { type: 'write'; error: Error; path: string };

export type GenerateResult =
  | {
      success: true;
      rulesGenerated: string[];
      outputDir: string;
      dryRun: boolean;
    }
  | {
      success: false;
      errors: GeneratorError[];
    };

export type ValidateResult =
  | { success: true; ruleCount: number }
  | { success: false; error: ParseError };

/**
 * Validate a harness-linter.yml config without generating
 */
export async function validate(options: ValidateOptions): Promise<ValidateResult> {
  const parseResult = await parseConfig(options.configPath);
  if (!parseResult.success) {
    return { success: false, error: parseResult.error };
  }
  return { success: true, ruleCount: parseResult.data.rules.length };
}

/**
 * Generate ESLint rules from harness-linter.yml config
 */
export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const errors: GeneratorError[] = [];

  // Parse config
  const parseResult = await parseConfig(options.configPath);
  if (!parseResult.success) {
    return { success: false, errors: [{ type: 'parse', error: parseResult.error }] };
  }

  const config = parseResult.data;
  const configDir = path.dirname(path.resolve(options.configPath));
  const outputDir = options.outputDir
    ? path.resolve(options.outputDir)
    : path.resolve(configDir, config.output);

  // Clean output directory if requested
  if (options.clean && !options.dryRun) {
    try {
      await fs.rm(outputDir, { recursive: true, force: true });
    } catch {
      // Ignore errors - directory might not exist
    }
  }

  // Create output directory
  if (!options.dryRun) {
    await fs.mkdir(outputDir, { recursive: true });
  }

  const generatedRules: string[] = [];

  // Generate each rule
  for (const rule of config.rules) {
    // Load template
    const templateResult = await loadTemplate(rule.type, config.templates, configDir);
    if (!templateResult.success) {
      errors.push({
        type: 'template',
        error: templateResult.error,
        ruleName: rule.name,
      });
      continue;
    }

    // Generate rule
    const ruleResult = generateRule(
      rule,
      templateResult.source,
      outputDir,
      options.configPath
    );
    if (!ruleResult.success) {
      errors.push({
        type: 'render',
        error: ruleResult.error,
        ruleName: ruleResult.ruleName,
      });
      continue;
    }

    // Write file
    if (!options.dryRun) {
      try {
        await fs.writeFile(ruleResult.rule.outputPath, ruleResult.rule.content, 'utf-8');
      } catch (err) {
        errors.push({
          type: 'write',
          error: err as Error,
          path: ruleResult.rule.outputPath,
        });
        continue;
      }
    }

    generatedRules.push(rule.name);
  }

  // Generate index file
  if (generatedRules.length > 0 && !options.dryRun) {
    const indexContent = generateIndex(generatedRules);
    const indexPath = path.join(outputDir, 'index.ts');
    try {
      await fs.writeFile(indexPath, indexContent, 'utf-8');
    } catch (err) {
      errors.push({ type: 'write', error: err as Error, path: indexPath });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    rulesGenerated: generatedRules,
    outputDir,
    dryRun: options.dryRun ?? false,
  };
}
