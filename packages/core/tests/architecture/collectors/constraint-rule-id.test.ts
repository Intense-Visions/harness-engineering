import { describe, it, expect } from 'vitest';
import { constraintRuleId } from '../../../src/architecture/collectors/hash';

describe('constraintRuleId', () => {
  it('produces a 64-char hex string (sha256)', () => {
    const id = constraintRuleId('circular-deps', 'project', 'No circular dependencies allowed');
    expect(id).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic across calls', () => {
    const a = constraintRuleId('circular-deps', 'project', 'No circular dependencies');
    const b = constraintRuleId('circular-deps', 'project', 'No circular dependencies');
    expect(a).toBe(b);
  });

  it('differs when category changes', () => {
    const a = constraintRuleId('circular-deps', 'project', 'rule');
    const b = constraintRuleId('coupling', 'project', 'rule');
    expect(a).not.toBe(b);
  });

  it('differs when scope changes', () => {
    const a = constraintRuleId('complexity', 'project', 'rule');
    const b = constraintRuleId('complexity', 'src/services/', 'rule');
    expect(a).not.toBe(b);
  });

  it('differs when description changes', () => {
    const a = constraintRuleId('complexity', 'project', 'rule A');
    const b = constraintRuleId('complexity', 'project', 'rule B');
    expect(a).not.toBe(b);
  });
});
