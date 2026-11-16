// packages/cli/src/shared/entropy-gate.ts
import type { EntropyIssueType } from './duplication-request.js';

/**
 * Whether a run may execute the GATING entropy analyzers — doc drift, dead
 * code and patterns — given the project's `entropy.enabled`.
 *
 * `entropy.enabled: false` declares that gate NOT APPLICABLE to the project
 * (`EntropyConfigSchema.enabled`, #2071): the analyzers are TypeScript-based,
 * so a Go, Python, Rust or Java project — every language-base template —
 * ships it. `harness ci check` honoured the key; `harness cleanup` and
 * `detect_entropy` never read it and ran the analyzers anyway (#2633).
 *
 * Shared by both surfaces for the same reason `resolveDuplicationRequest` is:
 * they must agree on the rule and on the wording.
 *
 * - `enabled` true or absent: `run`, unchanged.
 * - `duplication`: `run`. Clone detection is advisory and has its own switch
 *   (`entropy.duplication`); this key does not govern it.
 * - `all`: `disabled`. The gating analyzers are left off and the caller
 *   reports WHY, so a not-applicable gate never reads as "0 issues".
 * - an explicit `drift` / `dead-code` / `patterns`: `refuse`, mirroring the
 *   `entropy.duplication: false` + explicit request refusal (#1760).
 */
export type EntropyGateRequest =
  | { kind: 'run' }
  | { kind: 'disabled'; message: string }
  | { kind: 'refuse'; message: string };

export const ENTROPY_DISABLED_NOTICE =
  'entropy analysis is disabled by config (`entropy.enabled: false` in harness.config.json), ' +
  'so the doc-drift, dead-code and pattern analyzers did not run';

export function resolveEntropyGate(
  type: EntropyIssueType,
  enabled: boolean | undefined
): EntropyGateRequest {
  if (enabled !== false || type === 'duplication') return { kind: 'run' };
  if (type === 'all') return { kind: 'disabled', message: ENTROPY_DISABLED_NOTICE };
  return {
    kind: 'refuse',
    message:
      `Entropy analysis is disabled (\`entropy.enabled: false\` in harness.config.json), so the ` +
      `"${type}" check does not apply to this project and has nothing to report. Set ` +
      '`entropy.enabled` to true (or remove it) to run it. Refusing to report a clean scan ' +
      'that never ran.',
  };
}
