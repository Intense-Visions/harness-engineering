/**
 * Opt-in constraint packs.
 *
 * A constraint pack is a *named bundle of blocking rules* that a project opts
 * into via `constraintPacks: [...]` in `harness.config.json`. Rather than
 * enforcing every rule all-or-nothing, a project turns on exactly the bundles
 * it wants, and each bundle declares which lifecycle stage(s) it is enforced
 * at (`pre-commit`, `pre-merge`, `pre-release`).
 *
 * Packs are not a new enforcement engine — they are a thin overlay on the
 * existing security rule sets. A pack's effect is to elevate a set of security
 * rules (by id or `SEC-XXX-*` wildcard) to a chosen severity for the stages it
 * targets. Opting into a pack therefore reuses the same `security.rules`
 * override machinery a project could set by hand, packaged under a memorable
 * name and scoped to a stage.
 */

import type { RuleOverride } from '../security/types';
import type { ConstraintStage } from '@harness-engineering/types';

/**
 * What a pack enforces at a single lifecycle stage.
 */
export interface ConstraintPackStageSpec {
  /**
   * Security rule id or `SEC-XXX-*` wildcard → severity to enforce at this
   * stage. These are merged into the project's `security.rules` overrides (with
   * an explicit project-level override always winning, so a project retains an
   * escape hatch).
   */
  securityRules?: Record<string, RuleOverride>;
}

/**
 * A named bundle of blocking rules with per-stage enforcement.
 */
export interface ConstraintPack {
  /** Stable identifier used in `constraintPacks: [...]`. */
  name: string;
  /** One-line, adopter-facing description of what the pack blocks. */
  description: string;
  /** Enforcement spec keyed by the lifecycle stage it applies to. */
  stages: Partial<Record<ConstraintStage, ConstraintPackStageSpec>>;
}

/**
 * Built-in constraint packs. Each maps onto an existing harness security rule
 * set (see `packages/core/src/security/rules`). Names are intentionally
 * descriptive of the risk they block, not the rule ids they wrap.
 */
export const BUILT_IN_CONSTRAINT_PACKS: readonly ConstraintPack[] = [
  {
    name: 'secrets-and-injection',
    description: 'Blocks hardcoded secrets and injection vulnerabilities before merge and release.',
    stages: {
      'pre-merge': {
        securityRules: { 'SEC-SEC-*': 'error', 'SEC-INJ-*': 'error' },
      },
      'pre-release': {
        securityRules: { 'SEC-SEC-*': 'error', 'SEC-INJ-*': 'error' },
      },
    },
  },
  {
    name: 'ai-agent-safety',
    description:
      'Blocks unsafe AI-agent and MCP configurations (prompt-injection surfaces, over-broad tool access) before merge.',
    stages: {
      'pre-merge': {
        securityRules: { 'SEC-AGT-*': 'error', 'SEC-MCP-*': 'error' },
      },
    },
  },
  {
    name: 'web-hardening',
    description:
      'Blocks web-surface risks — XSS, path traversal, unsafe network calls, and weak crypto — before release.',
    stages: {
      'pre-release': {
        // Explicit `error` elevations on exactly the four web-surface prefixes.
        // This pack deliberately does *not* promote every warning/info rule to
        // error (there is no `strict` escape hatch worth the blast radius) — it
        // blocks only the risks it names.
        securityRules: {
          'SEC-XSS-*': 'error',
          'SEC-PTH-*': 'error',
          'SEC-NET-*': 'error',
          'SEC-CRY-*': 'error',
        },
      },
    },
  },
] as const;

/**
 * The effect of the opted-in packs, flattened across the stages that apply.
 */
export interface ResolvedConstraintPacks {
  /** Packs that resolved to a known built-in, in config order (de-duplicated). */
  resolved: ConstraintPack[];
  /** Configured names that matched no built-in pack. */
  unknown: string[];
  /**
   * Merged security-rule overlay across every applicable stage. When two packs
   * set the same rule, the more-blocking severity wins.
   */
  securityRuleOverlay: Record<string, RuleOverride>;
}

/** Higher = more blocking. `off` disables a rule; `error` fails the gate. */
const SEVERITY_RANK: Record<RuleOverride, number> = {
  off: 0,
  info: 1,
  warning: 2,
  error: 3,
};

function mostBlocking(a: RuleOverride, b: RuleOverride): RuleOverride {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

const PACK_BY_NAME = new Map(BUILT_IN_CONSTRAINT_PACKS.map((p) => [p.name, p]));

/** Look up a built-in constraint pack by name. */
export function getConstraintPack(name: string): ConstraintPack | undefined {
  return PACK_BY_NAME.get(name);
}

/**
 * Resolve the opted-in pack names into a flattened overlay.
 *
 * @param packNames - Names from `constraintPacks` in the project config.
 * @param options.stage - When set, only the specs for this stage contribute to
 *   the overlay (used to enforce a single stage's constraints). When omitted,
 *   every stage of every opted-in pack contributes — the most conservative
 *   interpretation, appropriate when the caller runs one combined gate.
 */
export function resolveConstraintPacks(
  packNames: readonly string[],
  options: { stage?: ConstraintStage } = {}
): ResolvedConstraintPacks {
  const resolved: ConstraintPack[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();

  for (const name of packNames) {
    if (seen.has(name)) continue;
    seen.add(name);
    const pack = PACK_BY_NAME.get(name);
    if (pack) {
      resolved.push(pack);
    } else {
      unknown.push(name);
    }
  }

  const securityRuleOverlay: Record<string, RuleOverride> = {};

  for (const pack of resolved) {
    for (const [stage, spec] of Object.entries(pack.stages) as [
      ConstraintStage,
      ConstraintPackStageSpec,
    ][]) {
      if (options.stage && options.stage !== stage) continue;
      for (const [ruleId, severity] of Object.entries(spec.securityRules ?? {})) {
        const existing = securityRuleOverlay[ruleId];
        securityRuleOverlay[ruleId] = existing ? mostBlocking(existing, severity) : severity;
      }
    }
  }

  return { resolved, unknown, securityRuleOverlay };
}
