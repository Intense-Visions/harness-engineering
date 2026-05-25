import { describe, it, expect } from 'vitest';
import { VerifierRegistry } from '../../src/design-pipeline/registry';
import type { Verifier } from '../../src/shared/verifier';

describe('VerifierRegistry', () => {
  it('registers and lists verifiers in registration order', () => {
    const r = new VerifierRegistry();
    const fakeRunner = async (): Promise<Verifier<unknown>> => ({
      findings: [],
      summary: {
        totalFiles: 0,
        durationMs: 0,
        bySeverity: { error: 0, warn: 0, info: 0 },
        byCode: {},
      },
      catalog: {},
      meta: {},
    });
    r.register('a', fakeRunner);
    r.register('b', fakeRunner);
    r.register('c', fakeRunner);
    const list = r.list();
    expect(list).toHaveLength(3);
    expect(list.map((v) => v.name)).toEqual(['a', 'b', 'c']);
  });

  it('size() returns the number of registered verifiers', () => {
    const r = new VerifierRegistry();
    expect(r.size()).toBe(0);
    r.register('only', async () => ({
      findings: [],
      summary: {
        totalFiles: 0,
        durationMs: 0,
        bySeverity: { error: 0, warn: 0, info: 0 },
        byCode: {},
      },
      catalog: {},
      meta: {},
    }));
    expect(r.size()).toBe(1);
  });

  it('accepts runners with concrete finding types (structural typing)', () => {
    interface MyFinding {
      code: string;
      severity: 'error' | 'warn' | 'info';
      file: string;
      line: number | null;
      message: string;
    }
    const r = new VerifierRegistry();
    const typedRunner = async (): Promise<Verifier<MyFinding>> => ({
      findings: [{ code: 'X', severity: 'error', file: 'a.ts', line: 1, message: 'hi' }],
      summary: {
        totalFiles: 1,
        durationMs: 0,
        bySeverity: { error: 1, warn: 0, info: 0 },
        byCode: { X: 1 },
      },
      catalog: {},
      meta: {},
    });
    r.register('typed', typedRunner);
    expect(r.size()).toBe(1);
  });
});
