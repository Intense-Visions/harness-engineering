// packages/mcp-server/src/utils/config-resolver.ts
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';

export interface ProjectConfig {
  name?: string;
  version: number;
  [key: string]: unknown;
}

export function resolveProjectConfig(projectPath: string): Result<ProjectConfig, Error> {
  const configPath = path.join(projectPath, 'harness.config.json');
  if (!fs.existsSync(configPath)) {
    return Err(new Error(`No harness.config.json found in ${projectPath}`));
  }
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw) as ProjectConfig;
    return Ok(config);
  } catch (error) {
    return Err(
      new Error(`Failed to parse config: ${error instanceof Error ? error.message : String(error)}`)
    );
  }
}
