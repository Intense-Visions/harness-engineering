// src/utils/config-loader.ts
import * as fs from 'fs';
import * as path from 'path';
import { HarnessConfigSchema, type HarnessConfig } from './schema';

const CONFIG_FILENAME = 'harness.config.json';

let cachedConfig: HarnessConfig | null = null;
let cachedConfigPath: string | null = null;

/**
 * Find harness.config.json by walking up from the given directory
 */
function findConfigFile(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const configPath = path.join(currentDir, CONFIG_FILENAME);
    if (fs.existsSync(configPath)) {
      return configPath;
    }
    currentDir = path.dirname(currentDir);
  }
  return null;
}

/**
 * Load and validate config, with caching
 */
export function getConfig(filePath: string): HarnessConfig | null {
  const configPath = findConfigFile(path.dirname(filePath));
  if (!configPath) {
    return null;
  }

  // Return cached config if same path
  if (cachedConfigPath === configPath && cachedConfig) {
    return cachedConfig;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = HarnessConfigSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      return null;
    }
    cachedConfig = parsed.data;
    cachedConfigPath = configPath;
    return cachedConfig;
  } catch {
    return null;
  }
}

/**
 * Clear the config cache (for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
  cachedConfigPath = null;
}
