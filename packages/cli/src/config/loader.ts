import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { HarnessConfigSchema, type HarnessConfig } from './schema';
import { collectStrippedKeys, formatStrippedKeyWarnings } from './stripped-keys';
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

  // Inclusive of the root itself: `currentDir === root` still runs one more
  // check-then-break rather than exiting the loop before checking it, so a
  // harness.config.json placed directly at the filesystem root is found.
  for (;;) {
    for (const filename of CONFIG_FILENAMES) {
      const configPath = path.join(currentDir, filename);
      if (fs.existsSync(configPath)) {
        return Ok(configPath);
      }
    }
    if (currentDir === root) break;
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

  // Non-fatal: warn about keys the schema silently dropped (unknown or
  // mis-nested). zod strips these with no signal, so a plausible-but-wrong
  // config becomes a silent no-op (issue #862). Sections that intentionally
  // use `.passthrough()` (security, performance, ...) are respected and never
  // reported. Loading still succeeds.
  warnStrippedKeys(rawConfig);

  return Ok(parsed.data);
}

/**
 * Emit a non-fatal warning to stderr for each config key the schema dropped.
 * Written to stderr so JSON stdout stays clean; never throws and never affects
 * load success.
 */
function warnStrippedKeys(rawConfig: unknown): void {
  if (process.env.HARNESS_SUPPRESS_CONFIG_WARNINGS === '1') return;
  try {
    const dropped = collectStrippedKeys(HarnessConfigSchema, rawConfig);
    for (const line of formatStrippedKeyWarnings(dropped)) {
      process.stderr.write(`${line}\n`);
    }
  } catch {
    // Detection is best-effort diagnostics; a walk failure must never break load.
  }
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

/**
 * A loaded config together with the project root it implies.
 */
export interface ResolvedProject {
  /** The validated config. */
  config: HarnessConfig;
  /** Absolute path to the config file the config was loaded from. */
  configPath: string;
  /**
   * The directory that owns the config — the root every scan, baseline and
   * generated artifact should be resolved against.
   */
  root: string;
}

/**
 * Resolves both the config AND the project root it implies.
 *
 * Commands that scan, measure or write a tree need two things from `-c`: the
 * config's *contents* and the *project* that owns it. `resolveConfig` returns
 * only the former, so a command that pairs it with `process.cwd()` reads one
 * project's config while measuring another directory — reporting a confident
 * number for the wrong tree. `check-arch` was fixed into this shape under
 * issue #911 (commit 9f322084c, `options.cwd ?? path.dirname(configPath)`);
 * the same split survived in a dozen sibling commands because the pattern was
 * copied inline rather than shared. This function is that one shape, so the
 * next command cannot acquire the defect by omission.
 *
 * @param configPath - Value of the global `-c/--config` option, when set.
 * @param cwdOverride - An explicit root that wins over the implied one. Used by
 *   callers (and tests) that genuinely want to point a config at another tree.
 * @returns Ok with the config, its path, and the implied root; Err if the
 *   config cannot be found, read or validated.
 */
export function resolveProject(
  configPath?: string,
  cwdOverride?: string
): Result<ResolvedProject, CLIError> {
  const found = configPath ? Ok(path.resolve(configPath)) : findConfigFile();
  if (!found.ok) {
    return found;
  }
  const resolvedConfigPath = found.value;

  const configResult = loadConfig(resolvedConfigPath);
  if (!configResult.ok) {
    return configResult;
  }

  return Ok({
    config: configResult.value,
    configPath: resolvedConfigPath,
    root: cwdOverride ?? path.dirname(resolvedConfigPath),
  });
}
