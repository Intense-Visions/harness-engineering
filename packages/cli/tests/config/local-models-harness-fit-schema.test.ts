import { describe, it, expect } from 'vitest';
import {
  HarnessConfigSchema,
  LocalModelsConfigSchema,
  LocalModelsHarnessFitConfigSchema,
} from '../../src/config/schema';

/**
 * Phase 3 / Task 2 (harness-fit-probe D5) — `harness.config.json` must accept a
 * `localModels.harnessFit` block. This guards the strict-Zod silent-reject trap:
 * a field that exists only on the TS type but NOT on the schema is stripped at
 * parse time and never reaches the runtime. These tests assert the field
 * survives `safeParse` (with defaults) AND that bad values are rejected.
 */

describe('LocalModelsHarnessFitConfigSchema', () => {
  it('accepts an empty block and populates cost-gating defaults (disabled by default)', () => {
    const result = LocalModelsHarnessFitConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(false); // opt-in (D5)
      expect(result.data.topN).toBe(3);
      expect(result.data.cadenceMs).toBe(604_800_000); // 7d
      expect(result.data.cacheTtlMs).toBe(2_592_000_000); // 30d
      expect(result.data.taskIds).toBeUndefined();
    }
  });

  it('accepts a fully populated block with a task-suite override', () => {
    const result = LocalModelsHarnessFitConfigSchema.safeParse({
      enabled: true,
      topN: 5,
      cadenceMs: 86_400_000,
      cacheTtlMs: 1_209_600_000,
      taskIds: ['pure-fn', 'bugfix'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.topN).toBe(5);
      expect(result.data.taskIds).toEqual(['pure-fn', 'bugfix']);
    }
  });

  it('rejects a non-positive topN', () => {
    expect(LocalModelsHarnessFitConfigSchema.safeParse({ topN: 0 }).success).toBe(false);
    expect(LocalModelsHarnessFitConfigSchema.safeParse({ topN: -1 }).success).toBe(false);
  });

  it('rejects a non-integer / non-positive cadence or TTL', () => {
    expect(LocalModelsHarnessFitConfigSchema.safeParse({ cadenceMs: 0 }).success).toBe(false);
    expect(LocalModelsHarnessFitConfigSchema.safeParse({ cacheTtlMs: -5 }).success).toBe(false);
    expect(LocalModelsHarnessFitConfigSchema.safeParse({ cadenceMs: 1.5 }).success).toBe(false);
  });

  it('rejects a wrong-typed enabled flag', () => {
    expect(LocalModelsHarnessFitConfigSchema.safeParse({ enabled: 'yes' }).success).toBe(false);
  });
});

describe('LocalModelsConfigSchema with harnessFit', () => {
  it('threads harnessFit through the local-models block (not stripped)', () => {
    const result = LocalModelsConfigSchema.safeParse({
      enabled: true,
      harnessFit: { enabled: true, topN: 4 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // The strict-Zod trap guard: the field SURVIVES the parse.
      expect(result.data.harnessFit?.enabled).toBe(true);
      expect(result.data.harnessFit?.topN).toBe(4);
    }
  });

  it('leaves harnessFit undefined when omitted (opt-in — no probe path)', () => {
    const result = LocalModelsConfigSchema.safeParse({ enabled: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.harnessFit).toBeUndefined();
    }
  });
});

describe('HarnessConfigSchema with localModels.harnessFit', () => {
  it('accepts a full harness config carrying localModels.harnessFit', () => {
    const result = HarnessConfigSchema.safeParse({
      version: 1,
      localModels: {
        enabled: true,
        harnessFit: {
          enabled: true,
          topN: 3,
          cadenceMs: 604_800_000,
          cacheTtlMs: 2_592_000_000,
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.localModels?.harnessFit?.enabled).toBe(true);
      expect(result.data.localModels?.harnessFit?.topN).toBe(3);
    }
  });

  it('rejects a harness config whose harnessFit.topN is invalid', () => {
    const result = HarnessConfigSchema.safeParse({
      version: 1,
      localModels: { harnessFit: { topN: 0 } },
    });
    expect(result.success).toBe(false);
  });
});
