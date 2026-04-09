// src/generator/orchestrator.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { parseConfig, type ParseError } from '../parser/config-parser.js';
import { loadTemplate, type TemplateLoadError } from '../engine/template-loader.js';
import { generateRule } from './rule-generator.js';
import { generateIndex } from './index-generator.js';
import type { TemplateError } from '../engine/template-renderer.js';
import type { RuleConfig } from '../schema/linter-config.js';

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
 * Resolve the output directory from config and options.
 */
function resolveOutputDir(options: GenerateOptions, configOutput: string): string {
  const configDir = path.dirname(path.resolve(options.configPath));
  return options.outputDir
    ? path.resolve(options.outputDir)
    : path.resolve(configDir, configOutput);
}

/**
 * Prepare the output directory: clean if requested and create it.
 */
async function prepareOutputDir(outputDir: string, clean: boolean): Promise<void> {
  if (clean) {
    try {
      await fs.rm(outputDir, { recursive: true, force: true });
    } catch {
      // Ignore errors - directory might not exist
    }
  }
  await fs.mkdir(outputDir, { recursive: true });
}

/**
 * Process a single rule: load template, generate, and optionally write.
 * Returns the rule name on success, or pushes an error and returns null.
 */
async function processRule(
  rule: RuleConfig,
  templates: Parameters<typeof loadTemplate>[1],
  configDir: string,
  outputDir: string,
  configPath: string,
  dryRun: boolean,
  errors: GeneratorError[]
): Promise<string | null> {
  const templateResult = await loadTemplate(rule.type, templates, configDir);
  if (!templateResult.success) {
    errors.push({ type: 'template', error: templateResult.error, ruleName: rule.name });
    return null;
  }

  const ruleResult = generateRule(rule, templateResult.source, outputDir, configPath);
  if (!ruleResult.success) {
    errors.push({ type: 'render', error: ruleResult.error, ruleName: ruleResult.ruleName });
    return null;
  }

  if (!dryRun) {
    try {
      await fs.writeFile(ruleResult.rule.outputPath, ruleResult.rule.content, 'utf-8');
    } catch (err) {
      errors.push({ type: 'write', error: err as Error, path: ruleResult.rule.outputPath });
      return null;
    }
  }

  return rule.name;
}

/**
 * Write the index file for generated rules.
 */
async function writeIndexFile(
  outputDir: string,
  generatedRules: string[],
  errors: GeneratorError[]
): Promise<void> {
  const indexContent = generateIndex(generatedRules);
  const indexPath = path.join(outputDir, 'index.ts');
  try {
    await fs.writeFile(indexPath, indexContent, 'utf-8');
  } catch (err) {
    errors.push({ type: 'write', error: err as Error, path: indexPath });
  }
}

async function processAllRules(
  rules: RuleConfig[],
  templates: Parameters<typeof loadTemplate>[1],
  configDir: string,
  outputDir: string,
  configPath: string,
  dryRun: boolean,
  errors: GeneratorError[]
): Promise<string[]> {
  const generatedRules: string[] = [];
  for (const rule of rules) {
    const name = await processRule(rule, templates, configDir, outputDir, configPath, dryRun, errors);
    if (name) generatedRules.push(name);
  }
  return generatedRules;
}

/**
 * Generate ESLint rules from harness-linter.yml config
 */
export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const errors: GeneratorError[] = [];

  const parseResult = await parseConfig(options.configPath);
  if (!parseResult.success) {
    return { success: false, errors: [{ type: 'parse', error: parseResult.error }] };
  }

  const config = parseResult.data;
  const outputDir = resolveOutputDir(options, config.output);
  const dryRun = options.dryRun ?? false;
  const configDir = path.dirname(path.resolve(options.configPath));

  if (!dryRun) {
    await prepareOutputDir(outputDir, options.clean ?? false);
  }

  const generatedRules = await processAllRules(
    config.rules,
    config.templates,
    configDir,
    outputDir,
    options.configPath,
    dryRun,
    errors
  );

  if (generatedRules.length > 0 && !dryRun) {
    await writeIndexFile(outputDir, generatedRules, errors);
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, rulesGenerated: generatedRules, outputDir, dryRun };
}
