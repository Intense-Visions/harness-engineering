# Plan: Model Tiering Config (Review Pipeline Phase 8)

**Date:** 2026-03-21
**Spec:** docs/changes/unified-code-review-pipeline/proposal.md
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

Add `review.model_tiers` config support to harness so that the review pipeline can resolve abstract model tiers (`fast`, `standard`, `strong`) to concrete model identifiers from project config, with sensible defaults and graceful fallback to "use current model" when unconfigured.

## Observable Truths (Acceptance Criteria)

1. When `harness.config.json` contains `review: { model_tiers: { fast: "haiku", standard: "sonnet", strong: "opus" } }`, `resolveModelTier('fast', config)` returns `"haiku"`.
2. When no `review.model_tiers` config exists, `resolveModelTier('fast')` returns `undefined` (meaning "use current model").
3. When `review.model_tiers` has a partial mapping (e.g., only `strong`), `resolveModelTier('fast', config)` returns `undefined` for unmapped tiers and the configured value for mapped tiers.
4. The `ModelTierConfigSchema` Zod schema in `packages/cli/src/config/schema.ts` validates `review.model_tiers` with all three tier keys as optional strings.
5. The `HarnessConfigSchema` accepts `review: { model_tiers: {...} }` as an optional field and rejects invalid structures (e.g., `model_tiers: { fast: 123 }`).
6. The system shall provide `DEFAULT_MODEL_TIERS` with sensible defaults per provider (Claude: fast=haiku, standard=sonnet, strong=opus).
7. `resolveModelTier('fast', config, 'claude')` returns the configured value if present, otherwise falls back to the provider default.
8. `cd packages/core && pnpm exec vitest run tests/review/model-tier-resolver.test.ts` passes with 10+ tests.
9. `cd packages/cli && pnpm exec vitest run tests/config/review-schema.test.ts` passes with 8+ tests.
10. `tsc --noEmit` passes in both `packages/core` and `packages/cli`.

## File Map

- CREATE `packages/core/src/review/model-tier-resolver.ts`
- CREATE `packages/core/tests/review/model-tier-resolver.test.ts`
- MODIFY `packages/core/src/review/types.ts` (add `ModelTierConfig` type, `ProviderDefaults` type)
- MODIFY `packages/core/src/review/index.ts` (add exports for resolver and new types)
- MODIFY `packages/cli/src/config/schema.ts` (add `ModelTierConfigSchema`, `ReviewConfigSchema`, wire into `HarnessConfigSchema`)
- CREATE `packages/cli/tests/config/review-schema.test.ts`

## Tasks

### Task 1: Add ModelTierConfig and provider defaults types to review/types.ts

**Depends on:** none
**Files:** `packages/core/src/review/types.ts`

1. Add the following types at the end of `packages/core/src/review/types.ts`, after the `EligibilityResult` interface:

```typescript
// --- Phase 8: Model Tiering Config types ---

/**
 * Configuration mapping abstract model tiers to concrete model identifiers.
 * All tiers are optional — unmapped tiers resolve to undefined (use current model).
 *
 * Example config:
 *   { fast: "haiku", standard: "sonnet", strong: "opus" }
 *   { fast: "gpt-4o-mini", standard: "gpt-4o", strong: "o1" }
 */
export interface ModelTierConfig {
  fast?: string;
  standard?: string;
  strong?: string;
}

/**
 * Known provider identifiers for default tier resolution.
 */
export type ModelProvider = 'claude' | 'openai' | 'gemini';

/**
 * Default model tier mappings per provider.
 * Used as fallback when config does not specify a tier.
 */
export type ProviderDefaults = Record<ModelProvider, ModelTierConfig>;
```

2. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/core && pnpm exec tsc --noEmit`
3. Observe: passes (types only, no implementations)
4. Commit: `feat(review): add ModelTierConfig and provider types`

---

### Task 2: Implement model tier resolver with TDD

**Depends on:** Task 1
**Files:** `packages/core/tests/review/model-tier-resolver.test.ts`, `packages/core/src/review/model-tier-resolver.ts`

1. Create test file `packages/core/tests/review/model-tier-resolver.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveModelTier, DEFAULT_PROVIDER_TIERS } from '../../src/review/model-tier-resolver';
import type { ModelTierConfig } from '../../src/review/types';

describe('DEFAULT_PROVIDER_TIERS', () => {
  it('has defaults for claude provider', () => {
    expect(DEFAULT_PROVIDER_TIERS.claude).toEqual({
      fast: 'haiku',
      standard: 'sonnet',
      strong: 'opus',
    });
  });

  it('has defaults for openai provider', () => {
    expect(DEFAULT_PROVIDER_TIERS.openai).toEqual({
      fast: 'gpt-4o-mini',
      standard: 'gpt-4o',
      strong: 'o1',
    });
  });

  it('has defaults for gemini provider', () => {
    expect(DEFAULT_PROVIDER_TIERS.gemini).toEqual({
      fast: 'gemini-flash',
      standard: 'gemini-pro',
      strong: 'gemini-ultra',
    });
  });
});

describe('resolveModelTier()', () => {
  it('returns undefined when no config and no provider', () => {
    expect(resolveModelTier('fast')).toBeUndefined();
  });

  it('returns undefined when config is undefined and no provider', () => {
    expect(resolveModelTier('standard', undefined)).toBeUndefined();
  });

  it('returns configured value when config has the tier', () => {
    const config: ModelTierConfig = { fast: 'haiku', standard: 'sonnet', strong: 'opus' };
    expect(resolveModelTier('fast', config)).toBe('haiku');
    expect(resolveModelTier('standard', config)).toBe('sonnet');
    expect(resolveModelTier('strong', config)).toBe('opus');
  });

  it('returns undefined for unmapped tier in partial config (no provider)', () => {
    const config: ModelTierConfig = { strong: 'opus' };
    expect(resolveModelTier('fast', config)).toBeUndefined();
    expect(resolveModelTier('standard', config)).toBeUndefined();
    expect(resolveModelTier('strong', config)).toBe('opus');
  });

  it('returns provider default when config is undefined but provider is given', () => {
    expect(resolveModelTier('fast', undefined, 'claude')).toBe('haiku');
    expect(resolveModelTier('standard', undefined, 'openai')).toBe('gpt-4o');
    expect(resolveModelTier('strong', undefined, 'gemini')).toBe('gemini-ultra');
  });

  it('config takes precedence over provider defaults', () => {
    const config: ModelTierConfig = { fast: 'my-custom-fast' };
    expect(resolveModelTier('fast', config, 'claude')).toBe('my-custom-fast');
  });

  it('falls back to provider default for unmapped tier in partial config', () => {
    const config: ModelTierConfig = { strong: 'custom-strong' };
    expect(resolveModelTier('fast', config, 'claude')).toBe('haiku');
    expect(resolveModelTier('strong', config, 'claude')).toBe('custom-strong');
  });

  it('returns undefined for unmapped tier when provider is unknown', () => {
    const config: ModelTierConfig = {};
    expect(resolveModelTier('fast', config)).toBeUndefined();
  });

  it('handles empty config object', () => {
    expect(resolveModelTier('fast', {})).toBeUndefined();
    expect(resolveModelTier('fast', {}, 'claude')).toBe('haiku');
  });

  it('handles all three tiers with each provider', () => {
    for (const tier of ['fast', 'standard', 'strong'] as const) {
      for (const provider of ['claude', 'openai', 'gemini'] as const) {
        const result = resolveModelTier(tier, undefined, provider);
        expect(typeof result).toBe('string');
        expect(result!.length).toBeGreaterThan(0);
      }
    }
  });
});
```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering/packages/core && pnpm exec vitest run tests/review/model-tier-resolver.test.ts`
3. Observe failure: `Cannot find module '../../src/review/model-tier-resolver'`

4. Create implementation `packages/core/src/review/model-tier-resolver.ts`:

```typescript
import type { ModelTier, ModelTierConfig, ModelProvider, ProviderDefaults } from './types';

/**
 * Sensible default model tier mappings per known provider.
 * Used as fallback when project config does not map a tier.
 */
export const DEFAULT_PROVIDER_TIERS: ProviderDefaults = {
  claude: {
    fast: 'haiku',
    standard: 'sonnet',
    strong: 'opus',
  },
  openai: {
    fast: 'gpt-4o-mini',
    standard: 'gpt-4o',
    strong: 'o1',
  },
  gemini: {
    fast: 'gemini-flash',
    standard: 'gemini-pro',
    strong: 'gemini-ultra',
  },
};

/**
 * Resolve an abstract model tier to a concrete model identifier.
 *
 * Resolution order:
 * 1. If config has a mapping for the tier, return it.
 * 2. If a provider is specified and has a default for the tier, return the default.
 * 3. Return undefined (meaning "use whatever model the user is currently running").
 *
 * @param tier - Abstract model tier ('fast', 'standard', 'strong')
 * @param config - Optional model tier config from harness.config.json review.model_tiers
 * @param provider - Optional known provider for default fallback
 * @returns Concrete model identifier string, or undefined if no mapping found
 */
export function resolveModelTier(
  tier: ModelTier,
  config?: ModelTierConfig,
  provider?: ModelProvider
): string | undefined {
  // 1. Check explicit config
  const configValue = config?.[tier];
  if (configValue !== undefined) {
    return configValue;
  }

  // 2. Check provider defaults
  if (provider) {
    const providerDefaults = DEFAULT_PROVIDER_TIERS[provider];
    const defaultValue = providerDefaults[tier];
    if (defaultValue !== undefined) {
      return defaultValue;
    }
  }

  // 3. No mapping — use current model
  return undefined;
}
```

5. Run test: `cd /Users/cwarner/Projects/harness-engineering/packages/core && pnpm exec vitest run tests/review/model-tier-resolver.test.ts`
6. Observe: all tests pass
7. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/core && pnpm exec tsc --noEmit`
8. Commit: `feat(review): implement resolveModelTier with provider defaults`

---

### Task 3: Export resolver and new types from review barrel

**Depends on:** Task 2
**Files:** `packages/core/src/review/index.ts`

1. Add the following exports to `packages/core/src/review/index.ts`:

After the existing type exports (the `export type { ... } from './types'` block), add `ModelTierConfig`, `ModelProvider`, and `ProviderDefaults` to the type export list:

```typescript
// In the existing type export block, add:
  ModelTierConfig,
  ModelProvider,
  ProviderDefaults,
```

After the eligibility gate export, add:

```typescript
// Model tier resolver
export { resolveModelTier, DEFAULT_PROVIDER_TIERS } from './model-tier-resolver';
```

2. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/core && pnpm exec tsc --noEmit`
3. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/core && pnpm exec vitest run tests/review/`
4. Observe: all 157+ tests pass, typecheck passes
5. Commit: `feat(review): export model tier resolver and types from barrel`

---

### Task 4: Add ReviewConfigSchema to CLI config schema

**Depends on:** Task 1 (types only, no runtime dependency on core resolver)
**Files:** `packages/cli/src/config/schema.ts`

1. Add the following schemas to `packages/cli/src/config/schema.ts`, before the `HarnessConfigSchema` definition:

```typescript
export const ModelTierConfigSchema = z.object({
  fast: z.string().optional(),
  standard: z.string().optional(),
  strong: z.string().optional(),
});

export const ReviewConfigSchema = z.object({
  model_tiers: ModelTierConfigSchema.optional(),
});
```

2. Add `review: ReviewConfigSchema.optional(),` to the `HarnessConfigSchema` object, after the `i18n` field and before `updateCheckInterval`.

3. Add type exports at the bottom of the file:

```typescript
export type ReviewConfig = z.infer<typeof ReviewConfigSchema>;
export type ModelTierConfigZod = z.infer<typeof ModelTierConfigSchema>;
```

4. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && pnpm exec tsc --noEmit`
5. Observe: passes
6. Commit: `feat(config): add review.model_tiers to HarnessConfigSchema`

---

### Task 5: Add CLI config schema tests for review block

**Depends on:** Task 4
**Files:** `packages/cli/tests/config/review-schema.test.ts`

1. Create test file `packages/cli/tests/config/review-schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  ModelTierConfigSchema,
  ReviewConfigSchema,
  HarnessConfigSchema,
} from '../../src/config/schema';

describe('ModelTierConfigSchema', () => {
  it('accepts a full model tier config', () => {
    const result = ModelTierConfigSchema.safeParse({
      fast: 'haiku',
      standard: 'sonnet',
      strong: 'opus',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty object (all tiers optional)', () => {
    const result = ModelTierConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts partial config with only one tier', () => {
    const result = ModelTierConfigSchema.safeParse({ strong: 'opus' });
    expect(result.success).toBe(true);
  });

  it('rejects non-string tier values', () => {
    const result = ModelTierConfigSchema.safeParse({ fast: 123 });
    expect(result.success).toBe(false);
  });

  it('accepts OpenAI model names', () => {
    const result = ModelTierConfigSchema.safeParse({
      fast: 'gpt-4o-mini',
      standard: 'gpt-4o',
      strong: 'o1',
    });
    expect(result.success).toBe(true);
  });

  it('accepts Gemini model names', () => {
    const result = ModelTierConfigSchema.safeParse({
      fast: 'gemini-flash',
      standard: 'gemini-pro',
      strong: 'gemini-ultra',
    });
    expect(result.success).toBe(true);
  });
});

describe('ReviewConfigSchema', () => {
  it('accepts review config with model_tiers', () => {
    const result = ReviewConfigSchema.safeParse({
      model_tiers: { fast: 'haiku', standard: 'sonnet', strong: 'opus' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts review config without model_tiers', () => {
    const result = ReviewConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects model_tiers with invalid structure', () => {
    const result = ReviewConfigSchema.safeParse({
      model_tiers: 'not-an-object',
    });
    expect(result.success).toBe(false);
  });
});

describe('HarnessConfigSchema with review block', () => {
  const baseConfig = {
    version: 1 as const,
    name: 'test',
  };

  it('accepts config with review.model_tiers', () => {
    const result = HarnessConfigSchema.safeParse({
      ...baseConfig,
      review: {
        model_tiers: { fast: 'haiku', standard: 'sonnet', strong: 'opus' },
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts config without review block', () => {
    const result = HarnessConfigSchema.safeParse(baseConfig);
    expect(result.success).toBe(true);
  });

  it('accepts config with empty review block', () => {
    const result = HarnessConfigSchema.safeParse({
      ...baseConfig,
      review: {},
    });
    expect(result.success).toBe(true);
  });

  it('rejects config with invalid review.model_tiers', () => {
    const result = HarnessConfigSchema.safeParse({
      ...baseConfig,
      review: { model_tiers: { fast: 123 } },
    });
    expect(result.success).toBe(false);
  });

  it('preserves model_tiers values after parsing', () => {
    const result = HarnessConfigSchema.parse({
      ...baseConfig,
      review: {
        model_tiers: { fast: 'haiku', standard: 'sonnet', strong: 'opus' },
      },
    });
    expect(result.review?.model_tiers?.fast).toBe('haiku');
    expect(result.review?.model_tiers?.standard).toBe('sonnet');
    expect(result.review?.model_tiers?.strong).toBe('opus');
  });
});
```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && pnpm exec vitest run tests/config/review-schema.test.ts`
3. Observe: all tests pass
4. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && pnpm exec tsc --noEmit`
5. Commit: `test(config): add review.model_tiers schema tests`
