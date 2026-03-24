import { describe, it, expect } from 'vitest';
import { resolveThresholds } from '../../src/architecture/config';
import { ArchConfigSchema } from '../../src/architecture/types';
import type { ArchConfig } from '../../src/architecture/types';

function makeConfig(overrides: Partial<ArchConfig> = {}): ArchConfig {
  return {
    enabled: true,
    baselinePath: '.harness/arch/baselines.json',
    thresholds: {},
    modules: {},
    ...overrides,
  };
}

describe('resolveThresholds()', () => {
  it('returns project-wide thresholds when no module match', () => {
    const config = makeConfig({
      thresholds: { complexity: 15, 'circular-deps': 0 },
    });
    const result = resolveThresholds('src/unknown', config);
    expect(result).toEqual({ complexity: 15, 'circular-deps': 0 });
  });

  it('returns empty object when no thresholds configured', () => {
    const config = makeConfig();
    const result = resolveThresholds('src/api', config);
    expect(result).toEqual({});
  });

  it('overrides scalar threshold with module-level value', () => {
    const config = makeConfig({
      thresholds: { complexity: 15 },
      modules: { 'src/api': { complexity: 10 } },
    });
    const result = resolveThresholds('src/api', config);
    expect(result).toEqual({ complexity: 10 });
  });

  it('preserves project thresholds for categories not overridden by module', () => {
    const config = makeConfig({
      thresholds: { complexity: 15, 'circular-deps': 0 },
      modules: { 'src/api': { complexity: 10 } },
    });
    const result = resolveThresholds('src/api', config);
    expect(result).toEqual({ complexity: 10, 'circular-deps': 0 });
  });

  it('deep-merges object thresholds at category level', () => {
    const config = makeConfig({
      thresholds: { coupling: { maxFanIn: 10, maxFanOut: 8 } },
      modules: { 'src/api': { coupling: { maxFanOut: 5 } } },
    });
    const result = resolveThresholds('src/api', config);
    expect(result).toEqual({ coupling: { maxFanIn: 10, maxFanOut: 5 } });
  });

  it('module scalar replaces project object entirely', () => {
    const config = makeConfig({
      thresholds: { coupling: { maxFanIn: 10, maxFanOut: 8 } },
      modules: { 'src/api': { coupling: 5 } },
    });
    const result = resolveThresholds('src/api', config);
    expect(result).toEqual({ coupling: 5 });
  });

  it('module object replaces project scalar entirely', () => {
    const config = makeConfig({
      thresholds: { complexity: 15 },
      modules: { 'src/api': { complexity: { max: 10, warn: 8 } } },
    });
    const result = resolveThresholds('src/api', config);
    expect(result).toEqual({ complexity: { max: 10, warn: 8 } });
  });

  it('uses "project" scope to return project-wide thresholds only', () => {
    const config = makeConfig({
      thresholds: { complexity: 15 },
      modules: { 'src/api': { complexity: 10 } },
    });
    const result = resolveThresholds('project', config);
    expect(result).toEqual({ complexity: 15 });
  });

  it('handles multiple modules without cross-contamination', () => {
    const config = makeConfig({
      thresholds: { complexity: 15 },
      modules: {
        'src/api': { complexity: 10 },
        'src/services': { complexity: 8 },
      },
    });
    expect(resolveThresholds('src/api', config)).toEqual({ complexity: 10 });
    expect(resolveThresholds('src/services', config)).toEqual({ complexity: 8 });
  });
});

describe('ArchConfigSchema integration', () => {
  it('parses a full architecture config from raw JSON', () => {
    const raw = {
      enabled: true,
      baselinePath: '.harness/arch/baselines.json',
      thresholds: {
        'circular-deps': 0,
        'layer-violations': 0,
        complexity: 15,
        coupling: { maxFanIn: 10, maxFanOut: 8 },
        'forbidden-imports': 0,
        'module-size': { maxFiles: 30, maxLoc: 3000 },
        'dependency-depth': 7,
      },
      modules: {
        'src/services': { complexity: 10 },
        'src/api': { coupling: { maxFanOut: 5 } },
      },
    };
    const result = ArchConfigSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.thresholds['coupling']).toEqual({ maxFanIn: 10, maxFanOut: 8 });
      expect(result.data.modules['src/api']).toEqual({ coupling: { maxFanOut: 5 } });
    }
  });

  it('resolveThresholds works with schema-parsed config', () => {
    const raw = {
      thresholds: {
        complexity: 15,
        coupling: { maxFanIn: 10, maxFanOut: 8 },
      },
      modules: {
        'src/api': { complexity: 10, coupling: { maxFanOut: 5 } },
      },
    };
    const config = ArchConfigSchema.parse(raw);
    const resolved = resolveThresholds('src/api', config);
    expect(resolved).toEqual({
      complexity: 10,
      coupling: { maxFanIn: 10, maxFanOut: 5 },
    });
  });

  it('defaults are applied when minimal config is parsed then resolved', () => {
    const config = ArchConfigSchema.parse({});
    const resolved = resolveThresholds('src/anything', config);
    expect(resolved).toEqual({});
    expect(config.enabled).toBe(true);
    expect(config.baselinePath).toBe('.harness/arch/baselines.json');
  });
});
