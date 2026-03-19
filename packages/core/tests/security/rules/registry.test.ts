import { describe, it, expect } from 'vitest';
import { RuleRegistry } from '../../../src/security/rules/registry';
import type { SecurityRule } from '../../../src/security/types';

const mockRule: SecurityRule = {
  id: 'SEC-TEST-001',
  name: 'Test Rule',
  category: 'injection',
  severity: 'error',
  confidence: 'high',
  patterns: [/eval\(/],
  message: 'Do not use eval',
  remediation: 'Remove eval',
};

const stackRule: SecurityRule = {
  id: 'SEC-NODE-001',
  name: 'Node Rule',
  category: 'injection',
  severity: 'warning',
  confidence: 'medium',
  patterns: [/prototype\[/],
  stack: ['node'],
  message: 'Prototype pollution risk',
  remediation: 'Use Object.create(null)',
};

describe('RuleRegistry', () => {
  it('registers and retrieves rules', () => {
    const registry = new RuleRegistry();
    registry.register(mockRule);
    expect(registry.getAll()).toHaveLength(1);
    expect(registry.getById('SEC-TEST-001')).toBe(mockRule);
  });

  it('filters by category', () => {
    const registry = new RuleRegistry();
    registry.register(mockRule);
    registry.register(stackRule);
    const injectionRules = registry.getByCategory('injection');
    expect(injectionRules).toHaveLength(2);
  });

  it('filters by stack', () => {
    const registry = new RuleRegistry();
    registry.register(mockRule);
    registry.register(stackRule);
    const forNode = registry.getForStacks(['node']);
    expect(forNode).toContain(mockRule); // no stack restriction = applies to all
    expect(forNode).toContain(stackRule); // stack matches
  });

  it('excludes rules for non-matching stacks', () => {
    const registry = new RuleRegistry();
    registry.register(stackRule);
    const forGo = registry.getForStacks(['go']);
    expect(forGo).not.toContain(stackRule);
  });

  it('registers multiple rules at once', () => {
    const registry = new RuleRegistry();
    registry.registerAll([mockRule, stackRule]);
    expect(registry.getAll()).toHaveLength(2);
  });
});
