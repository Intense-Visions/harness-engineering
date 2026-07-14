import { describe, it, expect } from 'vitest';
import { HarnessConfigSchema } from '../../src/config/schema';

describe('HarnessConfigSchema — roadmap.mode', () => {
  const base = { version: 1 as const };
  it('accepts no roadmap field (default file-backed)', () => {
    expect(HarnessConfigSchema.safeParse(base).success).toBe(true);
  });
  it('accepts roadmap with no mode', () => {
    expect(HarnessConfigSchema.safeParse({ ...base, roadmap: {} }).success).toBe(true);
  });
  it('accepts mode: "file-backed"', () => {
    expect(
      HarnessConfigSchema.safeParse({ ...base, roadmap: { mode: 'file-backed' } }).success
    ).toBe(true);
  });
  it('accepts mode: "file-less"', () => {
    expect(HarnessConfigSchema.safeParse({ ...base, roadmap: { mode: 'file-less' } }).success).toBe(
      true
    );
  });
  it('rejects mode: "weird"', () => {
    expect(HarnessConfigSchema.safeParse({ ...base, roadmap: { mode: 'weird' } }).success).toBe(
      false
    );
  });

  it('populates roadmap.mode = "file-backed" when roadmap is present but mode is omitted (REV-P6-S-5)', () => {
    // Canonical-source regression: the Zod default on RoadmapConfigSchema.mode
    // must materialize the field at parse time. Downstream callers
    // (getRoadmapMode, validateRoadmapMode, the dashboard/orchestrator branch
    // sites) rely on this so they can read config.roadmap?.mode without a
    // separate "is the field absent?" branch.
    const parsed = HarnessConfigSchema.safeParse({ ...base, roadmap: {} });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.roadmap?.mode).toBe('file-backed');
  });
});

// FOLLOW-UP 3: the CLI's autoTriage.ratchetStage literal set must MATCH the orchestrator's
// canonical RATCHET_STAGE schema — v1 caps at stage 2; stages 3/4 are deferred post-v1 and
// rejected. A config must not validate under the CLI yet fail the orchestrator (or vice-versa).
describe('HarnessConfigSchema — roadmap.autoTriage.ratchetStage (v1 cap = 2)', () => {
  const base = { version: 1 as const };
  const withStage = (ratchetStage: number) => ({
    ...base,
    roadmap: { autoTriage: { enabled: true, ratchetStage } },
  });

  it('accepts stage 1 and stage 2', () => {
    expect(HarnessConfigSchema.safeParse(withStage(1)).success).toBe(true);
    expect(HarnessConfigSchema.safeParse(withStage(2)).success).toBe(true);
  });

  it('rejects deferred stages 3 and 4 (matches the orchestrator schema)', () => {
    expect(HarnessConfigSchema.safeParse(withStage(3)).success).toBe(false);
    expect(HarnessConfigSchema.safeParse(withStage(4)).success).toBe(false);
  });

  it('defaults ratchetStage to 1 (most conservative) when omitted', () => {
    const parsed = HarnessConfigSchema.safeParse({
      ...base,
      roadmap: { autoTriage: { enabled: true } },
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.roadmap?.autoTriage?.ratchetStage).toBe(1);
  });
});
