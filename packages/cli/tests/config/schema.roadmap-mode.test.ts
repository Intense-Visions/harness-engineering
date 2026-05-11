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
