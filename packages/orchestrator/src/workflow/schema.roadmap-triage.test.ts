import { describe, it, expect } from 'vitest';
import { RoadmapAutoTriageSchema, RoadmapConfigSchema } from './schema';
import { validateWorkflowConfig, getDefaultConfig } from './config';
import type { WorkflowConfig, RoadmapAutoTriageConfig } from '@harness-engineering/types';

/**
 * Roadmap Auto-Triage config surface (Phase 0 Contract 2). Regression guard for the
 * AMR-style type-vs-schema drift: a type-only add would be silently rejected at
 * validate. These pin that `roadmap.autoTriage` is accepted present-but-off AND
 * validated strictly (typos rejected, not dropped).
 */

const validAutoTriage: RoadmapAutoTriageConfig = {
  enabled: false,
  ratchetStage: 1,
  thresholds: {
    dispatchConfidence: 'medium',
    boundedScopeMax: 10,
    brainstormConfidence: 0.7,
    exceededByBands: 1,
    ratchetAdvanceRate: 0.9,
    ratchetMinSample: 5,
  },
  depthBudget: { trivial: 1, simple: 2 },
};

describe('RoadmapAutoTriageSchema', () => {
  it('accepts the full default-off surface (no schedule ⇒ on-demand only)', () => {
    expect(RoadmapAutoTriageSchema.safeParse(validAutoTriage).success).toBe(true);
  });

  it('accepts an optional cron schedule', () => {
    expect(
      RoadmapAutoTriageSchema.safeParse({ ...validAutoTriage, schedule: '0 2 * * *' }).success
    ).toBe(true);
  });

  it("rejects a typo'd field (strict — catches config drift, not silently dropped)", () => {
    const r = RoadmapAutoTriageSchema.safeParse({
      ...validAutoTriage,
      enabeld: false, // misspelled master switch
    });
    expect(r.success).toBe(false);
  });

  it('rejects an out-of-range ratchet stage', () => {
    expect(RoadmapAutoTriageSchema.safeParse({ ...validAutoTriage, ratchetStage: 5 }).success).toBe(
      false
    );
  });

  it('SC4: accepts v1 stages 1 and 2', () => {
    expect(RoadmapAutoTriageSchema.safeParse({ ...validAutoTriage, ratchetStage: 1 }).success).toBe(
      true
    );
    expect(RoadmapAutoTriageSchema.safeParse({ ...validAutoTriage, ratchetStage: 2 }).success).toBe(
      true
    );
  });

  it('SC4: rejects a deferred stage (3/4) at config-load — the v1 ratchet cap', () => {
    // Stages 3–4 (sampled-verify / fully-autonomous merge) are deferred post-v1; a
    // config opting into them is a hard error, not a silent clamp.
    expect(RoadmapAutoTriageSchema.safeParse({ ...validAutoTriage, ratchetStage: 3 }).success).toBe(
      false
    );
    expect(RoadmapAutoTriageSchema.safeParse({ ...validAutoTriage, ratchetStage: 4 }).success).toBe(
      false
    );
  });

  it('rejects a missing thresholds seed', () => {
    const { thresholds, ...rest } = validAutoTriage;
    void thresholds;
    expect(RoadmapAutoTriageSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a typo inside thresholds (strict nested object)', () => {
    const r = RoadmapAutoTriageSchema.safeParse({
      ...validAutoTriage,
      thresholds: { ...validAutoTriage.thresholds, boundedScopeMaxx: 10 },
    });
    expect(r.success).toBe(false);
  });
});

describe('RoadmapConfigSchema', () => {
  it('accepts an empty roadmap block (autoTriage absent ⇒ feature off)', () => {
    expect(RoadmapConfigSchema.safeParse({}).success).toBe(true);
  });

  it('rejects an unknown roadmap-level key (strict)', () => {
    expect(RoadmapConfigSchema.safeParse({ autoTriageX: {} }).success).toBe(false);
  });
});

describe('validateWorkflowConfig — roadmap.autoTriage present-but-off (harness validate accepts it)', () => {
  it('accepts a full config with roadmap.autoTriage.enabled = false', () => {
    const base = getDefaultConfig();
    const config = {
      ...base,
      roadmap: { autoTriage: validAutoTriage },
    } as unknown as WorkflowConfig;

    const r = validateWorkflowConfig(config);
    expect(r.ok).toBe(true);
  });

  it('is byte-identical to today when the roadmap section is absent (SC-S1)', () => {
    const base = getDefaultConfig();
    // getDefaultConfig carries NO roadmap section — the feature ships off.
    expect('roadmap' in base).toBe(false);
    expect(validateWorkflowConfig(base).ok).toBe(true);
  });

  it('rejects a malformed roadmap section at config-load (not silently dropped)', () => {
    const base = getDefaultConfig();
    const config = {
      ...base,
      roadmap: { autoTriage: { ...validAutoTriage, ratchetStage: 9 } },
    } as unknown as WorkflowConfig;
    const r = validateWorkflowConfig(config);
    expect(r.ok).toBe(false);
  });
});
