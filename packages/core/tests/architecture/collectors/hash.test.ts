import { describe, it, expect } from 'vitest';
import { violationId } from '../../../src/architecture/collectors/hash';

describe('violationId', () => {
  it('produces a 64-char hex string (sha256)', () => {
    const id = violationId('src/a.ts', 'complexity', 'cyclomatic=18 in doStuff');
    expect(id).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic across calls', () => {
    const a = violationId('src/a.ts', 'complexity', 'cyclomatic=18 in doStuff');
    const b = violationId('src/a.ts', 'complexity', 'cyclomatic=18 in doStuff');
    expect(a).toBe(b);
  });

  it('differs when file changes', () => {
    const a = violationId('src/a.ts', 'complexity', 'cyclomatic=18');
    const b = violationId('src/b.ts', 'complexity', 'cyclomatic=18');
    expect(a).not.toBe(b);
  });

  it('differs when category changes', () => {
    const a = violationId('src/a.ts', 'complexity', 'cyclomatic=18');
    const b = violationId('src/a.ts', 'coupling', 'cyclomatic=18');
    expect(a).not.toBe(b);
  });

  it('differs when detail changes', () => {
    const a = violationId('src/a.ts', 'complexity', 'cyclomatic=18');
    const b = violationId('src/a.ts', 'complexity', 'cyclomatic=20');
    expect(a).not.toBe(b);
  });

  it('normalizes Windows backslash paths', () => {
    const a = violationId('src\\a.ts', 'complexity', 'cyclomatic=18');
    const b = violationId('src/a.ts', 'complexity', 'cyclomatic=18');
    expect(a).toBe(b);
  });
});
