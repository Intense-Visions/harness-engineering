import type {
  BackendCapabilities,
  BackendCapabilityRegistry,
  CapabilityTier,
  PrivacyClass,
  BackendDef,
} from '@harness-engineering/types';
import type { PoolStateProvider } from '@harness-engineering/local-models';
import { poolStateToCandidates } from '@harness-engineering/local-models';

/** Fail-closed signal: privacy floor / allowlist emptied the candidate set (S4-001).
 *  Distinguishable from a tier/cost-only exclusion, which returns `undefined`. */
export class PrivacyNoMatch extends Error {
  readonly code = 'privacy-no-match' as const;
  constructor(message: string) {
    super(message);
    this.name = 'PrivacyNoMatch';
  }
}

/** Rank: higher index = more capable. A backend qualifies when its tier index ≥ required. */
const TIER_RANK: Record<CapabilityTier, number> = { fast: 0, standard: 1, strong: 2 };

/** Privacy floor: lower index = stronger guarantee. A backend satisfies a floor
 *  when its privacy index ≤ the floor's index (at least as strong). */
const PRIVACY_RANK: Record<PrivacyClass, number> = {
  'on-device': 0,
  'pooled-isolated': 1,
  'byo-endpoint': 2,
  'shared-cloud': 3,
};

/** Registry entry carrying the backend name + its provider type (for allowlist). */
export interface RegistryEntry {
  name: string;
  capabilities: BackendCapabilities;
  /** Provider type for allowlist filtering; optional (pool candidates may omit). */
  provider?: BackendDef['type'];
}

export interface SelectConstraints {
  privacyFloor?: PrivacyClass;
  /** Present ⇒ only these providers allowed. Absent ⇒ all allowed. Empty array ⇒ none. */
  allowed?: BackendDef['type'][];
  needsVision?: boolean;
  needsToolUse?: boolean;
  minContextTokens?: number;
}

/**
 * D1 core: filter the registry to backends with tier ≥ requiredTier, privacyClass
 * at least as strong as the floor, provider in the allowlist, and capabilities ⊇
 * required (vision/toolUse/minContextTokens); sort by costPer1kTokens ascending;
 * return the cheapest.
 *
 * Fail-closed (S4-001): if a privacy-floor OR allowlist constraint empties the set,
 * throw PrivacyNoMatch (the item must surface to the steward — never fall through
 * to identity routing at a non-compliant backend). A tier/cost-only exclusion is
 * best-effort: return undefined so the caller can fall back to the shipped router's
 * identity/default chain. No `if (local)` anywhere.
 */
export function selectCheapestQualifying(
  registry: BackendCapabilityRegistry,
  requiredTier: CapabilityTier,
  constraints: SelectConstraints,
  /** Optional provider lookup by name (for allowlist). Absent ⇒ allowlist not enforced per-entry. */
  providerOf?: (name: string) => BackendDef['type'] | undefined
): { name: string; capabilities: BackendCapabilities } | undefined {
  const requiredRank = TIER_RANK[requiredTier];
  const entries = [...registry.entries()].map(([name, capabilities]) => ({
    name,
    capabilities,
  }));

  // Partition so we can distinguish WHY the set emptied (S4-001).
  const passesPrivacyAllow = entries.filter((e) => {
    if (
      constraints.privacyFloor !== undefined &&
      PRIVACY_RANK[e.capabilities.privacyClass] > PRIVACY_RANK[constraints.privacyFloor]
    ) {
      return false;
    }
    if (constraints.allowed !== undefined) {
      const type = providerOf?.(e.name);
      // When provider is unknown, an explicit allowlist cannot admit it → excluded.
      if (type === undefined || !constraints.allowed.includes(type)) return false;
    }
    return true;
  });

  // Fail closed: the ONLY thing that removed candidates was privacy/allowlist.
  if (passesPrivacyAllow.length === 0 && entries.length > 0) {
    throw new PrivacyNoMatch(
      `No backend satisfies privacyFloor=${constraints.privacyFloor ?? 'none'} / allowlist=${JSON.stringify(constraints.allowed ?? 'all')}`
    );
  }

  const qualifying = passesPrivacyAllow.filter((e) => {
    const c = e.capabilities;
    if (TIER_RANK[c.tier] < requiredRank) return false;
    if (constraints.needsVision && !c.vision) return false;
    if (constraints.needsToolUse && !c.toolUse) return false;
    if (
      constraints.minContextTokens !== undefined &&
      c.contextWindow < constraints.minContextTokens
    )
      return false;
    return true;
  });

  if (qualifying.length === 0) return undefined; // tier/cost-only exclusion → best-effort

  qualifying.sort((a, b) =>
    a.capabilities.costPer1kTokens !== b.capabilities.costPer1kTokens
      ? a.capabilities.costPer1kTokens - b.capabilities.costPer1kTokens
      : a.name < b.name
        ? -1
        : a.name > b.name
          ? 1
          : 0
  );
  const head = qualifying[0]!;
  return { name: head.name, capabilities: head.capabilities };
}

/** Default capability block derived for an LMLM pool candidate that carries no
 *  explicit capabilities. On-device ⇒ strongest privacy, zero marginal cost.
 *  Seed values (tunable in later phases); a candidate is thus visible to tier
 *  selection (spec "Failure modes": a backend with NO capabilities is invisible,
 *  but a pool candidate is always given a derived block so it can win on cost). */
export function defaultPoolCapabilities(): BackendCapabilities {
  return { tier: 'fast', costPer1kTokens: 0, privacyClass: 'on-device', contextWindow: 8192 };
}

/**
 * Build the tier-selection registry (name → capabilities) from configured
 * `agent.backends` (their `capabilities` blocks, when present) merged with LMLM
 * pool candidates (each given a derived on-device/zero-cost block). A configured
 * backend WITHOUT a `capabilities` block is omitted — invisible to tier selection,
 * reachable only via identity routing (spec "Failure modes"). No LMLM code changes.
 */
export function buildCapabilityRegistry(
  backends: Record<string, BackendDef>,
  pool?: PoolStateProvider
): BackendCapabilityRegistry {
  const out = new Map<string, BackendCapabilities>();
  for (const [name, def] of Object.entries(backends)) {
    if (def.capabilities) out.set(name, def.capabilities);
  }
  if (pool) {
    for (const candidate of poolStateToCandidates(pool.snapshot())) {
      if (!out.has(candidate)) out.set(candidate, defaultPoolCapabilities());
    }
  }
  return out;
}
