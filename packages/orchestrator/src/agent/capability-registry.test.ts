import { describe, it, expect } from 'vitest';
import type {
  BackendCapabilities,
  BackendCapabilityRegistry,
  BackendDef,
} from '@harness-engineering/types';
import type { PoolStateProvider } from '@harness-engineering/local-models';
import {
  selectCheapestQualifying,
  PrivacyNoMatch,
  buildCapabilityRegistry,
  defaultPoolCapabilities,
} from './capability-registry.js';

const cap = (
  o: Partial<BackendCapabilities> & Pick<BackendCapabilities, 'tier' | 'costPer1kTokens'>
): BackendCapabilities => ({
  privacyClass: 'shared-cloud',
  contextWindow: 128_000,
  ...o,
});

const cloudOnly: BackendCapabilityRegistry = new Map([
  ['haiku', cap({ tier: 'fast', costPer1kTokens: 0.25, privacyClass: 'shared-cloud' })],
  ['sonnet', cap({ tier: 'standard', costPer1kTokens: 3, privacyClass: 'shared-cloud' })],
  ['opus', cap({ tier: 'strong', costPer1kTokens: 15, privacyClass: 'shared-cloud' })],
]);

describe('selectCheapestQualifying — SC3 (cloud-only, no local branch)', () => {
  it('routes fast → a fast-tier cloud backend', () => {
    expect(selectCheapestQualifying(cloudOnly, 'fast', {})?.name).toBe('haiku');
  });
  it('routes strong → a strong-tier cloud backend', () => {
    expect(selectCheapestQualifying(cloudOnly, 'strong', {})?.name).toBe('opus');
  });
});

describe('selectCheapestQualifying — fail-closed distinguishability', () => {
  it('returns undefined when only tier/cost excludes all (best-effort)', () => {
    const fastOnly: BackendCapabilityRegistry = new Map([
      ['haiku', cap({ tier: 'fast', costPer1kTokens: 0.25 })],
    ]);
    expect(selectCheapestQualifying(fastOnly, 'strong', {})).toBeUndefined();
  });
  it('throws PrivacyNoMatch when privacy floor excludes all (fail closed)', () => {
    expect(() =>
      selectCheapestQualifying(cloudOnly, 'fast', { privacyFloor: 'on-device' })
    ).toThrow(PrivacyNoMatch);
  });
  it('throws PrivacyNoMatch when the allowlist excludes all (fail closed)', () => {
    // allowlist uses backend provider type carried on the capability entry
    expect(() => selectCheapestQualifying(cloudOnly, 'fast', { allowed: [] })).toThrow(
      PrivacyNoMatch
    );
  });
});

describe('selectCheapestQualifying — SC2 (cheapest qualifying; registry-driven)', () => {
  const base: BackendCapabilityRegistry = new Map([
    ['sonnet', cap({ tier: 'standard', costPer1kTokens: 3 })],
    ['opus', cap({ tier: 'strong', costPer1kTokens: 15 })],
  ]);
  it('standard resolves to the cheapest backend with tier ≥ standard', () => {
    expect(selectCheapestQualifying(base, 'standard', {})?.name).toBe('sonnet');
  });
  it('adding a cheaper qualifying backend flips the choice with no other change', () => {
    const cheaper = new Map(base);
    cheaper.set('gpt4o-mini', cap({ tier: 'standard', costPer1kTokens: 0.6 }));
    expect(selectCheapestQualifying(cheaper, 'standard', {})?.name).toBe('gpt4o-mini');
  });
  it('respects capability superset requirements (minContextTokens)', () => {
    expect(
      selectCheapestQualifying(base, 'standard', { minContextTokens: 1_000_000 })
    ).toBeUndefined();
  });
});

const fakePool = (names: string[]): PoolStateProvider => ({
  snapshot: () => ({
    diskBudgetGb: 100,
    diskUsedGb: 0,
    allowedOrgs: [],
    allowedFamilies: [],
    lastRefreshAt: null,
    entries: names.map((ollamaName, i) => ({
      ollamaName,
      hfRepoId: `org/${ollamaName}`,
      sizeOnDiskGb: 1,
      installedAt: '2026-01-01T00:00:00Z',
      lastUsedAt: null,
      currentScore: 100 - i,
    })),
  }),
});

describe('selectCheapestQualifying — allowlist with providerOf (populated path)', () => {
  const providerOf = (name: string): BackendDef['type'] | undefined => {
    const map: Record<string, BackendDef['type']> = {
      haiku: 'anthropic',
      sonnet: 'anthropic',
      opus: 'anthropic',
    };
    return map[name];
  };

  it('admits the cheapest backend whose provider is on the allowlist', () => {
    expect(
      selectCheapestQualifying(cloudOnly, 'fast', { allowed: ['anthropic'] }, providerOf)?.name
    ).toBe('haiku');
  });
  it('fails closed when the allowlist excludes every backend provider', () => {
    expect(() =>
      selectCheapestQualifying(cloudOnly, 'fast', { allowed: ['openai'] }, providerOf)
    ).toThrow(PrivacyNoMatch);
  });
});

describe('selectCheapestQualifying — empty registry is best-effort, not a privacy violation', () => {
  it('returns undefined (not a throw) for an empty registry even with a privacy floor', () => {
    const empty: BackendCapabilityRegistry = new Map();
    expect(selectCheapestQualifying(empty, 'fast', { privacyFloor: 'on-device' })).toBeUndefined();
  });
});

describe('buildCapabilityRegistry — SC12 (LMLM pool candidates present)', () => {
  const backends: Record<string, BackendDef> = {
    opus: {
      type: 'anthropic',
      model: 'claude-opus',
      capabilities: cap({ tier: 'strong', costPer1kTokens: 15 }),
    },
    plainClaude: { type: 'claude' }, // no capabilities → invisible to tier selection
  };
  it('includes configured backends that declare capabilities; omits those that do not', () => {
    const reg = buildCapabilityRegistry(backends);
    expect(reg.has('opus')).toBe(true);
    expect(reg.has('plainClaude')).toBe(false);
  });
  it('includes pool candidates with derived on-device, zero-cost capabilities', () => {
    const reg = buildCapabilityRegistry(backends, fakePool(['qwen3:32b', 'llama3:8b']));
    expect(reg.get('qwen3:32b')?.privacyClass).toBe('on-device');
    expect(reg.get('qwen3:32b')?.costPer1kTokens).toBe(0);
    expect(reg.get('llama3:8b')?.tier).toBe(defaultPoolCapabilities().tier);
  });
  it('a configured backend of the same name wins over a derived pool default', () => {
    const withNamedLocal = {
      ...backends,
      'qwen3:32b': {
        type: 'local',
        endpoint: 'x',
        model: 'qwen3:32b',
        capabilities: cap({ tier: 'standard', costPer1kTokens: 0 }),
      } as BackendDef,
    };
    const reg = buildCapabilityRegistry(withNamedLocal, fakePool(['qwen3:32b']));
    expect(reg.get('qwen3:32b')?.tier).toBe('standard'); // configured, not derived 'fast'
  });
});
