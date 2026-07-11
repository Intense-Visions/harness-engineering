import type {
  BackendCapabilities,
  BackendCapabilityRegistry,
  CapabilityTier,
  PrivacyClass,
  BackendDef,
} from '@harness-engineering/types';

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
