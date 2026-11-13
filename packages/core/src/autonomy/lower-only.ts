import type { AutonomySessionOverride, AutonomySetting } from '@harness-engineering/types';
import type { Result } from '../shared/result';
import { Err } from '../shared/result';
import { writeSessionOverride, type OverrideStoreOptions } from './override-store';

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

/**
 * Value-based (D12): any write of `trusted` or audit=off counts as raising, even when it
 * equals the current value, because pinning it in the session tier would outrank a later
 * user-config lowering.
 */
export function isRaisingChange(change: AutonomySetting): boolean {
  return change.level === 'trusted' || change.audit === false;
}

/** The only override writer agent-callable surfaces (MCP) may use. */
export function writeLoweringOverride(
  projectPath: string,
  slug: string,
  change: AutonomySetting,
  opts: OverrideStoreOptions = {}
): Result<AutonomySessionOverride, Error> {
  if (isRaisingChange(change)) return Err(new AutonomyRaiseRejectedError(change));
  return writeSessionOverride(projectPath, slug, change, 'mcp', opts);
}
