import type { AutonomySessionOverride, AutonomySetting } from '@harness-engineering/types';
import type { Result } from '../shared/result';
import { Err } from '../shared/result';
import { writeSessionOverride, type OverrideStoreOptions } from './override-store';
import { isRaisingChange, validateAutonomySetting } from './schema';

export { AUTONOMY_INVALID_SETTING, AutonomyInvalidSettingError, isRaisingChange } from './schema';

export const AUTONOMY_RAISE_REJECTED = 'AUTONOMY_RAISE_REJECTED';

export class AutonomyRaiseRejectedError extends Error {
  readonly code = AUTONOMY_RAISE_REJECTED;
  readonly rejected: AutonomySetting;
  constructor(rejected: AutonomySetting) {
    super(
      `Refusing to raise autonomy through an agent-callable path (${JSON.stringify(rejected)}). ` +
        'Only supervised and audit=on may be set here; raising requires `harness autonomy set` on an interactive terminal.'
    );
    this.name = 'AutonomyRaiseRejectedError';
    this.rejected = rejected;
  }
}

/** The only override writer agent-callable surfaces (MCP) may use. */
export function writeLoweringOverride(
  projectPath: string,
  slug: string,
  change: AutonomySetting,
  opts: OverrideStoreOptions = {}
): Result<AutonomySessionOverride, Error> {
  // Validate first: a mistyped value must be rejected as invalid, never reach the policy check.
  const valid = validateAutonomySetting(change);
  if (!valid.ok) return valid;
  if (isRaisingChange(valid.value)) return Err(new AutonomyRaiseRejectedError(valid.value));
  return writeSessionOverride(projectPath, slug, valid.value, 'mcp', opts);
}
