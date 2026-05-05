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

  // Atomic write: write to a sibling temp file, then rename. fs.renameSync is
  // atomic on POSIX (and atomic-on-same-volume on Windows since Node 14), so a
  // crash mid-write leaves harness.config.json either pre-mutation or
  // post-mutation, never truncated. Clean up the temp file if rename fails.
  const tmpPath = `${opts.configPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, serialized, 'utf-8');
  try {
    fs.renameSync(tmpPath, opts.configPath);
  } catch (e) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // best-effort cleanup
    }
    throw e;
  }
}
