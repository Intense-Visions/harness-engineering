import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { HarnessConfigSchema, type HarnessConfig } from './schema';
import { CLIError, ExitCode } from '../utils/errors';

const CONFIG_FILENAMES = ['harness.config.json'];

/**
 * Searches for a Harness configuration file starting from the given directory
 * and moving up the directory tree until the root is reached.
 *
 * @param startDir - The directory to start searching from. Defaults to current working directory.
 * @returns An Ok result containing the absolute path to the config file, or an Err with a CLIError if not found.
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
 * Loads and validates a Harness configuration from a JSON file.
 *
 * @param configPath - The path to the configuration file.
 * @returns An Ok result with the validated HarnessConfig, or an Err with a CLIError if loading or validation fails.
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
 * Resolves the Harness configuration by either loading from a specified path
 * or searching for the default config file in the current directory tree.
 *
 * @param configPath - Optional path to a specific configuration file.
 * @returns An Ok result with the resolved configuration, or an Err with a CLIError.
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
