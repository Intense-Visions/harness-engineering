import type { DeploymentExitCode, DeploymentGateResult } from './types';

/**
 * Map a {@link DeploymentGateResult} to the process exit-code contract (D2).
 *
 * Returns a plain numeric literal that EQUALS the CLI `ExitCode` values
 * (SUCCESS=0, VALIDATION_FAILED=1, ERROR=2, ZERO_DENOMINATOR=3). The core package
 * cannot import the CLI `ExitCode` enum (layer direction: CLI depends on core, not
 * the reverse), so the CLI (Phase 2) maps this number through `process.exit`.
 *
 * - `pass` / `disabled` → 0 (opt-out is a deliberate SUCCESS, not an abstention).
 * - `blocked` → 1 (a hard violation).
 * - `abstained` → 3 (ZERO_DENOMINATOR — the gate examined NOTHING; it is NOT a pass).
 *
 * ERROR (2) is NOT produced here: a config-parse failure is raised by the CLI
 * layer before the engine runs.
 */
export function deriveExitCode(result: DeploymentGateResult): DeploymentExitCode {
  switch (result.status) {
    case 'pass':
    case 'disabled':
      return 0;
    case 'blocked':
      return 1;
    case 'abstained':
      return 3;
  }
}
