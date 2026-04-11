import { describe, it, expect } from 'vitest';
import {
  serializeEnvelope,
  estimateTokens,
  type PackedEnvelope,
} from '../../src/compaction/envelope';

const makeEnvelope = (overrides: Partial<PackedEnvelope> = {}): PackedEnvelope => ({
  meta: {
    strategy: ['structural', 'truncate'],
    originalTokenEstimate: 4200,
    compactedTokenEstimate: 1100,
    reductionPct: 74,
    cached: false,
  },
  sections: [
    { source: 'gather_context', content: 'some compacted content' },
    { source: 'docs/changes/spec.md', content: 'spec content' },
  ],
  ...overrides,
});

describe('estimateTokens', () => {
  it('estimates tokens as Math.ceil(chars / 4)', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(100))).toBe(25);
    expect(estimateTokens('a'.repeat(101))).toBe(26);
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('serializeEnvelope', () => {
  it('includes the packed comment header with strategy names', () => {
    const result = serializeEnvelope(makeEnvelope());
    expect(result).toContain('<!-- packed: structural+truncate');
  });

  it('includes original and compacted token counts in header', () => {
    const result = serializeEnvelope(makeEnvelope());
    expect(result).toContain('4200');
    expect(result).toContain('1100');
  });

  it('includes reduction percentage in header', () => {
    const result = serializeEnvelope(makeEnvelope());
    expect(result).toContain('-74%');
  });

  it('renders each section with a ### heading using source as label', () => {
    const result = serializeEnvelope(makeEnvelope());
    expect(result).toContain('### [gather_context]');
    expect(result).toContain('### [docs/changes/spec.md]');
  });

  it('renders section content after its heading', () => {
    const result = serializeEnvelope(makeEnvelope());
    expect(result).toContain('some compacted content');
    expect(result).toContain('spec content');
  });

  it('appends (cached) to the header when cached is true', () => {
    const envelope = makeEnvelope({ meta: { ...makeEnvelope().meta, cached: true } });
    const result = serializeEnvelope(envelope);
    expect(result).toContain('cached');
  });

  it('handles an envelope with a single section', () => {
    const envelope: PackedEnvelope = {
      meta: {
        strategy: ['structural'],
        originalTokenEstimate: 100,
        compactedTokenEstimate: 80,
        reductionPct: 20,
        cached: false,
      },
      sections: [{ source: 'tool_output', content: 'data' }],
    };
    const result = serializeEnvelope(envelope);
    expect(result).toContain('### [tool_output]');
    expect(result).toContain('data');
  });

  it('handles an envelope with no sections gracefully', () => {
    const envelope = makeEnvelope({ sections: [] });
    const result = serializeEnvelope(envelope);
    expect(result).toContain('<!-- packed:');
  });

  it('uses "none" label when strategy array is empty', () => {
    const envelope = makeEnvelope({ meta: { ...makeEnvelope().meta, strategy: [] } });
    const result = serializeEnvelope(envelope);
    // Empty strategy must not produce double-space '<!--  packed:  | ...' or empty label
    expect(result).toContain('<!-- packed: none |');
    expect(result).not.toMatch(/packed:\s{2,}/);
  });

  it('includes cache metrics in header when cached with token data', () => {
    const envelope = makeEnvelope({
      meta: {
        ...makeEnvelope().meta,
        cached: true,
        cacheReadTokens: 1200,
        cacheInputTokens: 2000,
      },
    });
    const result = serializeEnvelope(envelope);
    expect(result).toContain('[cached | cache: 1.2K read, 60% hit]');
  });

  it('falls back to [cached] when cache tokens are missing', () => {
    const envelope = makeEnvelope({
      meta: { ...makeEnvelope().meta, cached: true },
    });
    const result = serializeEnvelope(envelope);
    expect(result).toContain('[cached]');
    expect(result).not.toContain('cache:');
  });

  it('formats small cache read tokens without K suffix', () => {
    const envelope = makeEnvelope({
      meta: {
        ...makeEnvelope().meta,
        cached: true,
        cacheReadTokens: 500,
        cacheInputTokens: 1000,
      },
    });
    const result = serializeEnvelope(envelope);
    expect(result).toContain('[cached | cache: 500 read, 50% hit]');
  });
});
