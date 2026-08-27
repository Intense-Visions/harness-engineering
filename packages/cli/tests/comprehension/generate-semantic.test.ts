import { describe, it, expect } from 'vitest';
import type { SourceFile } from '@harness-engineering/core';
import {
  semanticResponseSchema,
  boundSourceDigest,
  buildSemanticPrompt,
  DEFAULT_DIGEST_CHAR_BUDGET,
} from '../../src/comprehension/generate-semantic.js';

describe('semanticResponseSchema — authority-in-TS at the seam', () => {
  it('accepts a well-formed { summary, invariants }', () => {
    expect(semanticResponseSchema.parse({ summary: 's', invariants: ['a'] })).toEqual({
      summary: 's',
      invariants: ['a'],
    });
  });

  it('rejects a non-string summary', () => {
    expect(() => semanticResponseSchema.parse({ summary: 5, invariants: [] })).toThrow();
  });

  it('rejects invariants that are not a string array', () => {
    expect(() => semanticResponseSchema.parse({ summary: 's', invariants: [1, 2] })).toThrow();
  });

  it('rejects extra keys (strict)', () => {
    expect(() =>
      semanticResponseSchema.parse({ summary: 's', invariants: [], extra: true })
    ).toThrow();
  });
});

describe('boundSourceDigest — input bounded by budget, not module size', () => {
  it('returns full joined contents when total is under budget', () => {
    const files: SourceFile[] = [
      { path: 'a.ts', content: 'export const a = 1;' },
      { path: 'b.ts', content: 'export const b = 2;' },
    ];
    const out = boundSourceDigest(files, 10_000);
    expect(out).toContain('a.ts');
    expect(out).toContain('export const a = 1;');
    expect(out).toContain('b.ts');
    expect(out).toContain('export const b = 2;');
    expect(out).not.toContain('truncated');
  });

  it('caps output at the budget and appends a truncation marker when over budget', () => {
    const big = 'x'.repeat(5_000);
    const files: SourceFile[] = [
      { path: 'a.ts', content: big },
      { path: 'b.ts', content: big },
      { path: 'c.ts', content: big },
    ];
    const budget = 4_000;
    const out = boundSourceDigest(files, budget);
    expect(out.length).toBeLessThanOrEqual(budget);
    expect(out).toContain('[source truncated for comprehension digest]');
  });
});

describe('buildSemanticPrompt — static-feeds-semantic, bounded', () => {
  const input = {
    module: 'pkg/mod',
    interfaceContract: 'CONTRACT_MARKER export function f(): void',
    dependencySlice: 'DEP_MARKER imports: ./x',
    sourceFiles: [
      { path: 'a.ts', content: 'RAW_SOURCE_MARKER_' + 'y'.repeat(20_000) },
    ] as SourceFile[],
  };

  it('contains the static interface contract and dependency slice', () => {
    const prompt = buildSemanticPrompt(input);
    expect(prompt).toContain('CONTRACT_MARKER');
    expect(prompt).toContain('DEP_MARKER');
  });

  it('bounds the source digest and does NOT include an over-budget file whole', () => {
    const prompt = buildSemanticPrompt(input, 2_000);
    expect(prompt).toContain('[source truncated for comprehension digest]');
    // The full 20k raw body must not survive the digest budget.
    expect(prompt).not.toContain('y'.repeat(20_000));
  });

  it('uses DEFAULT_DIGEST_CHAR_BUDGET when no budget is given', () => {
    expect(DEFAULT_DIGEST_CHAR_BUDGET).toBeGreaterThan(0);
    const prompt = buildSemanticPrompt(input);
    // over the default budget → truncation marker present
    expect(prompt).toContain('[source truncated for comprehension digest]');
  });
});
