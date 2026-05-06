import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Ok, Err } from '../shared/result';
import type { Result } from '../shared/result';
import { PulseConfigSchema } from '../pulse/schema';
import { validateConfig } from './config';
import type { ConfigError } from './types';
import { createError } from '../shared/errors';

export interface PulseConfigValidation {
  present: boolean;
  valid: boolean;
}

export async function validatePulseConfig(
  cwd: string
): Promise<Result<PulseConfigValidation, ConfigError>> {
  const configPath = path.join(cwd, 'harness.config.json');
  let raw: string;
  try {
    raw = await fs.readFile(configPath, 'utf-8');
  } catch {
    return Ok({ present: false, valid: true });
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return Err(
      createError<ConfigError>(
        'VALIDATION_FAILED',
        `harness.config.json is not valid JSON: ${(e as Error).message}`,
        {},
        []
      )
    );
  }
  if (!('pulse' in parsed)) return Ok({ present: false, valid: true });
  const result = validateConfig(parsed.pulse, PulseConfigSchema);
  if (!result.ok) return Err(result.error);
  return Ok({ present: true, valid: true });
}
