import { describe, it, expect } from 'vitest';
import { CircularDepsCollector } from '../../../src/architecture/collectors/circular-deps';
import { LayerViolationCollector } from '../../../src/architecture/collectors/layer-violations';
import { ComplexityCollector } from '../../../src/architecture/collectors/complexity';
import { CouplingCollector } from '../../../src/architecture/collectors/coupling';
import { ForbiddenImportCollector } from '../../../src/architecture/collectors/forbidden-imports';
import { ModuleSizeCollector } from '../../../src/architecture/collectors/module-size';
import { DepDepthCollector } from '../../../src/architecture/collectors/dep-depth';
import type { ArchConfig, ConstraintRule } from '../../../src/architecture/types';

const defaultConfig: ArchConfig = {
  enabled: true,
  baselinePath: '.harness/arch/baselines.json',
  thresholds: {},
  modules: {},
};

function assertValidRules(rules: ConstraintRule[], expectedCategory: string) {
  expect(rules.length).toBeGreaterThan(0);
  for (const rule of rules) {
    expect(rule.id).toMatch(/^[a-f0-9]{64}$/);
    expect(rule.category).toBe(expectedCategory);
    expect(rule.description).toBeTruthy();
    expect(rule.scope).toBeTruthy();
  }
}

describe('Collector.getRules()', () => {
  it('CircularDepsCollector returns valid rules', () => {
    const collector = new CircularDepsCollector();
    const rules = collector.getRules(defaultConfig, '/tmp/test');
    assertValidRules(rules, 'circular-deps');
  });

  it('LayerViolationCollector returns valid rules', () => {
    const collector = new LayerViolationCollector();
    const rules = collector.getRules(defaultConfig, '/tmp/test');
    assertValidRules(rules, 'layer-violations');
  });

  it('ComplexityCollector returns valid rules', () => {
    const collector = new ComplexityCollector();
    const rules = collector.getRules(defaultConfig, '/tmp/test');
    assertValidRules(rules, 'complexity');
  });

  it('CouplingCollector returns valid rules', () => {
    const collector = new CouplingCollector();
    const rules = collector.getRules(defaultConfig, '/tmp/test');
    assertValidRules(rules, 'coupling');
  });

  it('ForbiddenImportCollector returns valid rules', () => {
    const collector = new ForbiddenImportCollector();
    const rules = collector.getRules(defaultConfig, '/tmp/test');
    assertValidRules(rules, 'forbidden-imports');
  });

  it('ModuleSizeCollector returns valid rules', () => {
    const collector = new ModuleSizeCollector();
    const rules = collector.getRules(defaultConfig, '/tmp/test');
    assertValidRules(rules, 'module-size');
  });

  it('ModuleSizeCollector includes threshold in description when configured', () => {
    const config: ArchConfig = {
      ...defaultConfig,
      thresholds: { 'module-size': { maxLoc: 500, maxFiles: 20 } },
    };
    const collector = new ModuleSizeCollector();
    const rules = collector.getRules(config, '/tmp/test');
    expect(rules.length).toBe(2);
    expect(rules.some((r) => r.description.includes('500'))).toBe(true);
    expect(rules.some((r) => r.description.includes('20'))).toBe(true);
  });

  it('DepDepthCollector returns valid rules', () => {
    const collector = new DepDepthCollector();
    const rules = collector.getRules(defaultConfig, '/tmp/test');
    assertValidRules(rules, 'dependency-depth');
  });

  it('DepDepthCollector includes threshold in description when configured', () => {
    const config: ArchConfig = {
      ...defaultConfig,
      thresholds: { 'dependency-depth': 5 },
    };
    const collector = new DepDepthCollector();
    const rules = collector.getRules(config, '/tmp/test');
    expect(rules[0]!.description).toContain('5');
  });

  it('all collectors produce deterministic rule IDs', () => {
    const collectors = [
      new CircularDepsCollector(),
      new LayerViolationCollector(),
      new ComplexityCollector(),
      new CouplingCollector(),
      new ForbiddenImportCollector(),
      new ModuleSizeCollector(),
      new DepDepthCollector(),
    ];

    for (const collector of collectors) {
      const rules1 = collector.getRules(defaultConfig, '/tmp/test');
      const rules2 = collector.getRules(defaultConfig, '/tmp/test');
      expect(rules1.map((r) => r.id)).toEqual(rules2.map((r) => r.id));
    }
  });
});
