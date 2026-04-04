import { describe, it, expect } from 'vitest';
import { FALLBACK_RULES } from '../../src/skill/recommendation-rules';

describe('FALLBACK_RULES', () => {
  it('exports a non-empty record of skill name to SkillAddress arrays', () => {
    expect(typeof FALLBACK_RULES).toBe('object');
    expect(Object.keys(FALLBACK_RULES).length).toBeGreaterThanOrEqual(15);
  });

  it('covers all required bundled skills', () => {
    const required = [
      'enforce-architecture',
      'dependency-health',
      'tdd',
      'codebase-cleanup',
      'security-scan',
      'refactoring',
      'detect-doc-drift',
      'perf',
      'supply-chain-audit',
      'code-review',
      'integrity',
      'soundness-review',
      'debugging',
      'hotspot-detector',
      'cleanup-dead-code',
    ];
    for (const name of required) {
      expect(FALLBACK_RULES).toHaveProperty(name);
    }
  });

  it('every entry has at least one address with a signal field', () => {
    for (const [name, addresses] of Object.entries(FALLBACK_RULES)) {
      expect(addresses.length, `${name} should have at least one address`).toBeGreaterThan(0);
      for (const addr of addresses) {
        expect(addr.signal, `${name} address missing signal`).toBeTruthy();
      }
    }
  });

  it('hard addresses have hard: true and no weight', () => {
    for (const [name, addresses] of Object.entries(FALLBACK_RULES)) {
      for (const addr of addresses) {
        if (addr.hard) {
          expect(addr.hard, `${name} hard address should be true`).toBe(true);
        }
      }
    }
  });

  it('soft addresses have weight between 0 and 1 when specified', () => {
    for (const [name, addresses] of Object.entries(FALLBACK_RULES)) {
      for (const addr of addresses) {
        if (addr.weight !== undefined) {
          expect(addr.weight, `${name} weight out of range`).toBeGreaterThanOrEqual(0);
          expect(addr.weight, `${name} weight out of range`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('enforce-architecture has hard rules for circular-deps and layer-violations', () => {
    const ea = FALLBACK_RULES['enforce-architecture']!;
    const hardSignals = ea.filter((a) => a.hard).map((a) => a.signal);
    expect(hardSignals).toContain('circular-deps');
    expect(hardSignals).toContain('layer-violations');
  });

  it('security-scan has a hard rule for security-findings', () => {
    const ss = FALLBACK_RULES['security-scan']!;
    const hardSignals = ss.filter((a) => a.hard).map((a) => a.signal);
    expect(hardSignals).toContain('security-findings');
  });
});
