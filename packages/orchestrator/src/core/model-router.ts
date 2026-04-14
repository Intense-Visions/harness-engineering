import type {
  Issue,
  ScopeTier,
  ConcernSignal,
  RoutingDecision,
  EscalationConfig,
} from '@harness-engineering/types';

/**
 * Artifact presence metadata for scope tier detection.
 */
export interface ArtifactPresence {
  hasSpec: boolean;
  hasPlans: boolean;
}

const SCOPE_LABEL_PREFIX = 'scope:';
const VALID_SCOPE_TIERS: ReadonlySet<string> = new Set([
  'quick-fix',
  'guided-change',
  'full-exploration',
  'diagnostic',
]);

/**
 * Detect the scope tier for an issue based on label overrides and artifact presence.
 *
 * Label override (e.g., `scope:quick-fix`) takes precedence.
 * Otherwise, infer from spec/plan presence:
 *   - No spec, no plan -> full-exploration
 *   - Spec or plan exists -> guided-change
 */
export function detectScopeTier(issue: Issue, artifacts: ArtifactPresence): ScopeTier {
  // Check for label override
  for (const label of issue.labels) {
    if (label.startsWith(SCOPE_LABEL_PREFIX)) {
      const tier = label.slice(SCOPE_LABEL_PREFIX.length);
      if (VALID_SCOPE_TIERS.has(tier)) {
        return tier as ScopeTier;
      }
    }
  }

  // Infer from artifacts
  if (artifacts.hasPlans || artifacts.hasSpec) {
    return 'guided-change';
  }

  return 'full-exploration';
}

/**
 * Pure routing function. Determines whether an issue should be dispatched
 * to the local backend or escalated to needs-human.
 *
 * Routing rules (in order):
 * 1. If tier is in alwaysHuman -> needs-human
 * 2. If tier is in autoExecute -> dispatch-local
 * 3. If tier is in signalGated -> check concern signals
 * 4. Otherwise -> dispatch-local (safe default)
 */
export function routeIssue(
  scopeTier: ScopeTier,
  concernSignals: ConcernSignal[],
  config: EscalationConfig
): RoutingDecision {
  // Rule 1: Always human
  if (config.alwaysHuman.includes(scopeTier)) {
    return {
      action: 'needs-human',
      reasons: [`${scopeTier} tier always requires human`],
    };
  }

  // Rule 2: Auto execute
  if (config.autoExecute.includes(scopeTier)) {
    return { action: 'dispatch-local' };
  }

  // Rule 3: Signal gated
  if (config.signalGated.includes(scopeTier)) {
    if (concernSignals.length > 0) {
      return {
        action: 'needs-human',
        reasons: concernSignals.map((s) => `${s.name}: ${s.reason}`),
      };
    }
    return { action: 'dispatch-local' };
  }

  // Rule 4: Default - dispatch locally
  return { action: 'dispatch-local' };
}
