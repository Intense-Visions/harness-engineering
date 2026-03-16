import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { HarnessConfigSchema, type HarnessConfig } from './schema';
import { CLIError, ExitCode } from '../utils/errors';

const CONFIG_FILENAMES = ['harness.config.json'];

/**
 * Find config file starting from given directory
 */
export function findConfigFile(startDir: string = process.cwd()): Result<string, CLIError> {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    for (const filename of CONFIG_FILENAMES) {
      const configPath = path.join(currentDir, filename);
      if (fs.existsSync(configPath)) {
        return Ok(configPath);
      }
    }
    currentDir = path.dirname(currentDir);
  }

  return Err(
    new CLIError('No harness.config.json found. Run "harness init" to create one.', ExitCode.ERROR)
  );
}

/**
 * Load and validate config from file
 */
export function loadConfig(configPath: string): Result<HarnessConfig, CLIError> {
  // Check file exists
  if (!fs.existsSync(configPath)) {
    return Err(new CLIError(`Config file not found: ${configPath}`, ExitCode.ERROR));
  }

  // Read and parse JSON
  let rawConfig: unknown;
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    rawConfig = JSON.parse(content);
  } catch (error) {
    return Err(
      new CLIError(
        `Failed to parse config: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ExitCode.ERROR
      )
    );
  }

  // Validate against schema
  const parsed = HarnessConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    return Err(new CLIError(`Invalid config:\n${issues}`, ExitCode.ERROR));
  }

  return Ok(parsed.data);
}

/**
 * Load config from default location or specified path
 */
export function resolveConfig(configPath?: string): Result<HarnessConfig, CLIError> {
  if (configPath) {
    return loadConfig(configPath);
  }

  const findResult = findConfigFile();
  if (!findResult.ok) {
    return findResult;
  }

  return loadConfig(findResult.value);
}
