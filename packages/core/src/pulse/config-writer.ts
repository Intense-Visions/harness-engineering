import * as fs from 'node:fs';
import { PulseConfigSchema } from './schema';
import type { PulseConfig } from '@harness-engineering/types';

export interface WritePulseConfigOptions {
  /** Absolute path to harness.config.json. */
  configPath: string;
  /** When true, do not write a .bak (default: false). */
  skipBackup?: boolean;
}

/**
 * Persist a `pulse:` block to harness.config.json, preserving every other
 * top-level key. Existing pulse blocks are replaced (not merged). A `.bak`
 * is written before mutation unless `skipBackup` is true.
 *
 * Throws when:
 * - configPath does not exist
 * - the existing config is not valid JSON
 * - the supplied PulseConfig fails PulseConfigSchema validation
 */
export function writePulseConfig(config: PulseConfig, opts: WritePulseConfigOptions): void {
  // Validate input first; do not touch disk if invalid.
  PulseConfigSchema.parse(config);

  if (!fs.existsSync(opts.configPath)) {
    throw new Error(`harness.config.json not found at ${opts.configPath}`);
  }
  const raw = fs.readFileSync(opts.configPath, 'utf-8');
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON in ${opts.configPath}: ${(e as Error).message}`, { cause: e });
  }

  if (!opts.skipBackup) {
    fs.writeFileSync(`${opts.configPath}.bak`, raw, 'utf-8');
  }

  parsed.pulse = config;
  const serialized = JSON.stringify(parsed, null, 2) + '\n';
  fs.writeFileSync(opts.configPath, serialized, 'utf-8');
}
