import { describe, it, expect } from 'vitest';
import { ALL_RULES } from './index';

describe('ALL_RULES registry', () => {
  it('contains all 7 STRENGTH rules in ascending id order', () => {
    expect(ALL_RULES.map((r) => r.id)).toEqual([
      'STRENGTH-001',
      'STRENGTH-002',
      'STRENGTH-003',
      'STRENGTH-004',
      'STRENGTH-005',
      'STRENGTH-006',
      'STRENGTH-007',
    ]);
  });

  it('has exactly 7 rules', () => {
    expect(ALL_RULES).toHaveLength(7);
  });

  it('every rule omits severity from detect output (auditor applies it)', () => {
    for (const rule of ALL_RULES) {
      expect(typeof rule.defaultSeverity).toBe('string');
      expect(typeof rule.appliesIn).toBe('function');
      expect(typeof rule.detect).toBe('function');
    }
  });
});
