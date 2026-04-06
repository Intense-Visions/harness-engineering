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

describe('change-type signal fallback rules', () => {
  it('tdd addresses change-bugfix', () => {
    const tdd = FALLBACK_RULES['tdd']!;
    const signals = tdd.map((a) => a.signal);
    expect(signals).toContain('change-bugfix');
  });

  it('refactoring addresses change-refactor', () => {
    const refactoring = FALLBACK_RULES['refactoring']!;
    const signals = refactoring.map((a) => a.signal);
    expect(signals).toContain('change-refactor');
  });

  it('detect-doc-drift addresses change-docs', () => {
    const docDrift = FALLBACK_RULES['detect-doc-drift']!;
    const signals = docDrift.map((a) => a.signal);
    expect(signals).toContain('change-docs');
  });

  it('enforce-architecture addresses change-feature', () => {
    const ea = FALLBACK_RULES['enforce-architecture']!;
    const signals = ea.map((a) => a.signal);
    expect(signals).toContain('change-feature');
  });

  it('code-review addresses change-feature and change-bugfix', () => {
    const cr = FALLBACK_RULES['code-review']!;
    const signals = cr.map((a) => a.signal);
    expect(signals).toContain('change-feature');
    expect(signals).toContain('change-bugfix');
  });

  it('change-type addresses use soft weights (no hard flag)', () => {
    const changeSignals = ['change-feature', 'change-bugfix', 'change-refactor', 'change-docs'];
    for (const [name, addresses] of Object.entries(FALLBACK_RULES)) {
      for (const addr of addresses) {
        if (changeSignals.includes(addr.signal)) {
          expect(addr.hard, `${name} change-type address should not be hard`).toBeFalsy();
          expect(addr.weight, `${name} ${addr.signal} should have weight`).toBeDefined();
        }
      }
    }
  });
});

describe('domain signal fallback rules', () => {
  it('security-scan addresses domain-secrets', () => {
    const ss = FALLBACK_RULES['security-scan']!;
    const signals = ss.map((a) => a.signal);
    expect(signals).toContain('domain-secrets');
  });

  it('supply-chain-audit addresses domain-secrets', () => {
    const sca = FALLBACK_RULES['supply-chain-audit']!;
    const signals = sca.map((a) => a.signal);
    expect(signals).toContain('domain-secrets');
  });

  it('perf addresses domain-load-testing', () => {
    const perf = FALLBACK_RULES['perf']!;
    const signals = perf.map((a) => a.signal);
    expect(signals).toContain('domain-load-testing');
  });

  it('debugging addresses domain-incident-response', () => {
    const debugging = FALLBACK_RULES['debugging']!;
    const signals = debugging.map((a) => a.signal);
    expect(signals).toContain('domain-incident-response');
  });

  it('detect-doc-drift addresses domain-api-design', () => {
    const docDrift = FALLBACK_RULES['detect-doc-drift']!;
    const signals = docDrift.map((a) => a.signal);
    expect(signals).toContain('domain-api-design');
  });

  it('enforce-architecture addresses domain-containerization and domain-infrastructure-as-code', () => {
    const ea = FALLBACK_RULES['enforce-architecture']!;
    const signals = ea.map((a) => a.signal);
    expect(signals).toContain('domain-containerization');
    expect(signals).toContain('domain-infrastructure-as-code');
  });

  it('domain addresses use soft weights (no hard flag)', () => {
    for (const [name, addresses] of Object.entries(FALLBACK_RULES)) {
      for (const addr of addresses) {
        if (addr.signal.startsWith('domain-')) {
          expect(addr.hard, `${name} domain address should not be hard`).toBeFalsy();
          expect(addr.weight, `${name} ${addr.signal} should have weight`).toBeDefined();
        }
      }
    }
  });
});
