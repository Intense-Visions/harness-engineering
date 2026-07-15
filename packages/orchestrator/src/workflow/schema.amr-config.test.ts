import { describe, it, expect } from 'vitest';
import {
  BackendDefSchema,
  RoutingConfigSchema,
  BackendCapabilitiesSchema,
  RoutingPolicySchema,
} from './schema';
import { validateWorkflowConfig, getDefaultConfig } from './config';
import type { WorkflowConfig } from '@harness-engineering/types';

/**
 * AMR config-file surface — the "front door" that the AMR types + engine expected
 * but the config schema never exposed (backends silently rejected `capabilities`,
 * routing silently rejected `policy`, so config-file AMR could not be enabled).
 * These are the regression guards for that type-vs-schema drift.
 */

const caps = {
  tier: 'fast',
  costPer1kTokens: 0,
  privacyClass: 'on-device',
  contextWindow: 32768,
};

describe('BackendDefSchema — capabilities (AMR)', () => {
  it('accepts a backend with a full capabilities block', () => {
    const r = BackendDefSchema.safeParse({
      type: 'pi',
      endpoint: 'http://localhost:11434/v1',
      model: 'qwen2.5-coder:7b',
      capabilities: caps,
    });
    expect(r.success).toBe(true);
  });

  it('accepts pooled-isolated privacyClass (the value the old route-local enum omitted)', () => {
    expect(
      BackendCapabilitiesSchema.safeParse({ ...caps, privacyClass: 'pooled-isolated' }).success
    ).toBe(true);
  });

  it('rejects a mistyped capabilities field (strict — catches config typos)', () => {
    const r = BackendDefSchema.safeParse({
      type: 'claude',
      capabilities: { ...caps, costPer1KTokens: 0 }, // wrong case
    });
    expect(r.success).toBe(false);
  });

  it('still accepts a backend with NO capabilities (backward-compatible / default-off)', () => {
    expect(BackendDefSchema.safeParse({ type: 'claude', command: 'claude' }).success).toBe(true);
  });

  it('rejects nonsense numeric capabilities (negative cost, non-positive context)', () => {
    // The schema adds runtime refinements the `number` type cannot express — a
    // regression here would silently accept a policy that can never route sanely.
    expect(BackendCapabilitiesSchema.safeParse({ ...caps, costPer1kTokens: -1 }).success).toBe(
      false
    );
    expect(BackendCapabilitiesSchema.safeParse({ ...caps, contextWindow: 0 }).success).toBe(false);
  });
});

describe('RoutingConfigSchema — policy (AMR)', () => {
  const policy = {
    complexityTierMatrix: { trivial: 'fast', complex: 'strong' },
    budget: { capUsd: 20, degradeAtPct: 90, onBudgetExhausted: 'degrade' },
    escalationThreshold: 2,
    acceptanceEval: { enabled: true, model: 'claude-opus-4-8' },
    allowedProviders: ['anthropic'],
    privacyFloor: 'pooled-isolated',
  };

  it('accepts a full policy AND preserves its fields (Zod does not strip them)', () => {
    const r = RoutingConfigSchema.safeParse({ default: 'primary', policy });
    expect(r.success).toBe(true);
    if (r.success) {
      // Survival — the parse output carries every field intact (contrast the
      // loader, which returns the raw input, so this is the real strip check).
      expect(r.data.policy?.escalationThreshold).toBe(2);
      expect(r.data.policy?.complexityTierMatrix?.complex).toBe('strong');
      expect(r.data.policy?.privacyFloor).toBe('pooled-isolated');
      expect(r.data.policy?.acceptanceEval?.enabled).toBe(true);
      expect(r.data.policy?.budget?.capUsd).toBe(20);
    }
  });

  it('tolerates a forward-compatible extra field INSIDE the policy (shared with the Shuttle wire)', () => {
    expect(RoutingPolicySchema.safeParse({ ...policy, futureField: 'x' }).success).toBe(true);
  });

  it('still rejects an unknown key at the routing level (outer schema stays strict)', () => {
    expect(RoutingConfigSchema.safeParse({ default: 'primary', bogusKey: 'x' }).success).toBe(
      false
    );
  });

  it('still accepts routing with NO policy (default-off, backward-compatible)', () => {
    expect(RoutingConfigSchema.safeParse({ default: 'primary' }).success).toBe(true);
  });
});

describe('validateWorkflowConfig — full-config round-trip (the front door that was missed)', () => {
  it('loads a config whose backends carry capabilities and routing carries a policy', () => {
    const base = getDefaultConfig();
    const agent = {
      ...base.agent,
      backends: {
        primary: {
          type: 'claude',
          command: 'claude',
          capabilities: {
            tier: 'strong',
            costPer1kTokens: 15,
            privacyClass: 'shared-cloud',
            contextWindow: 200000,
          },
        },
        local: {
          type: 'pi',
          endpoint: 'http://localhost:11434/v1',
          model: 'qwen2.5-coder:7b',
          capabilities: caps,
        },
      },
      routing: {
        default: 'primary',
        policy: {
          complexityTierMatrix: {
            trivial: 'fast',
            simple: 'fast',
            moderate: 'standard',
            complex: 'strong',
          },
          escalationThreshold: 2,
        },
      },
    };
    // `backend` (legacy single-backend) and `backends` are mutually exclusive (SC15).
    delete (agent as { backend?: unknown }).backend;
    const config = { ...base, agent } as unknown as WorkflowConfig;

    // The regression this pins: the loader ACCEPTS a config carrying
    // capabilities/policy. Without the fix it returns Err at the backends/routing
    // Zod parse — the exact "front door" failure. (Field survival is asserted
    // separately on the schema parse output above; validateWorkflowConfig returns
    // the raw input config, so re-reading it here would be tautological.)
    const r = validateWorkflowConfig(config);
    expect(r.ok).toBe(true);
  });
});

describe('RoutingConfigSchema — workflowGates (SC6, Phase 3)', () => {
  it("accepts workflowGates: 'local'", () => {
    expect(
      RoutingConfigSchema.safeParse({ default: 'primary', workflowGates: 'local' }).success
    ).toBe(true);
  });
  it("accepts workflowGates: 'primary'", () => {
    expect(
      RoutingConfigSchema.safeParse({ default: 'primary', workflowGates: 'primary' }).success
    ).toBe(true);
  });
  it('rejects an unknown workflowGates value (strict enum)', () => {
    expect(
      RoutingConfigSchema.safeParse({ default: 'primary', workflowGates: 'remote' }).success
    ).toBe(false);
  });
  it('still accepts a routing config with NO workflowGates (default-off, byte-identical)', () => {
    expect(RoutingConfigSchema.safeParse({ default: 'primary' }).success).toBe(true);
  });
});
