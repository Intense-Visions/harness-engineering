import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseBodyBlock,
  serializeBodyBlock,
  type BodyMeta,
} from '../../../src/roadmap/tracker/body-metadata';

describe('body-metadata: parseBodyBlock', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('a) body with no block → { summary: trimmed body, meta: {} }', () => {
    const body = '  Just a feature summary.  \n';
    const result = parseBodyBlock(body);
    expect(result).toEqual({ summary: 'Just a feature summary.', meta: {} });
  });

  it('b) body with valid block, all five fields → meta has all five with correct types', () => {
    const body = [
      'Summary line one.',
      'Summary line two.',
      '',
      '<!-- harness-meta:start -->',
      'spec: docs/specs/foo.md',
      'plan: docs/plans/foo-plan.md',
      'blocked_by: feature-a, feature-b',
      'priority: P1',
      'milestone: M3',
      '<!-- harness-meta:end -->',
    ].join('\n');
    const result = parseBodyBlock(body);
    expect(result.summary).toBe('Summary line one.\nSummary line two.');
    expect(result.meta).toEqual({
      spec: 'docs/specs/foo.md',
      plan: 'docs/plans/foo-plan.md',
      blocked_by: ['feature-a', 'feature-b'],
      priority: 'P1',
      milestone: 'M3',
    });
  });

  it('c) body with valid block, partial fields → missing fields are undefined', () => {
    const body = [
      'Summary.',
      '',
      '<!-- harness-meta:start -->',
      'priority: P2',
      '<!-- harness-meta:end -->',
    ].join('\n');
    const result = parseBodyBlock(body);
    expect(result.meta.priority).toBe('P2');
    expect(result.meta.spec).toBeUndefined();
    expect(result.meta.plan).toBeUndefined();
    expect(result.meta.blocked_by).toBeUndefined();
    expect(result.meta.milestone).toBeUndefined();
  });

  it('d) body with malformed YAML inside the markers → returns { summary, meta: {} } and warns', () => {
    const body = [
      'Summary.',
      '',
      '<!-- harness-meta:start -->',
      'this: : is : not : valid : yaml',
      '   - bad',
      ' badly indented',
      '<!-- harness-meta:end -->',
    ].join('\n');
    const result = parseBodyBlock(body);
    expect(result.summary).toBe('Summary.');
    expect(result.meta).toEqual({});
    expect(warnSpy).toHaveBeenCalled();
  });

  it('e) body with start marker but no end marker → block treated as missing', () => {
    const body = [
      'Summary.',
      '<!-- harness-meta:start -->',
      'spec: foo',
      // no end marker
    ].join('\n');
    const result = parseBodyBlock(body);
    expect(result.meta).toEqual({});
  });

  it('f) body with the block at the start (no summary) → summary = empty string, meta parsed', () => {
    const body = [
      '<!-- harness-meta:start -->',
      'spec: docs/specs/x.md',
      '<!-- harness-meta:end -->',
    ].join('\n');
    const result = parseBodyBlock(body);
    expect(result.summary).toBe('');
    expect(result.meta.spec).toBe('docs/specs/x.md');
  });

  it('g) body with two blocks → first wins, second ignored, warning emitted', () => {
    const body = [
      'Summary.',
      '',
      '<!-- harness-meta:start -->',
      'priority: P1',
      '<!-- harness-meta:end -->',
      '',
      '<!-- harness-meta:start -->',
      'priority: P3',
      '<!-- harness-meta:end -->',
    ].join('\n');
    const result = parseBodyBlock(body);
    expect(result.meta.priority).toBe('P1');
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe('body-metadata: serializeBodyBlock', () => {
  it('a) summary plus full meta → round-trips via parse', () => {
    const summary = 'Hello world.';
    const meta: BodyMeta = {
      spec: 'docs/specs/x.md',
      plan: 'docs/plans/x.md',
      blocked_by: ['a', 'b'],
      priority: 'P0',
      milestone: 'M1',
    };
    const body = serializeBodyBlock(summary, meta);
    const reparsed = parseBodyBlock(body);
    expect(reparsed).toEqual({ summary, meta });
  });

  it('b) summary plus empty meta → produces summary verbatim with no block', () => {
    const summary = 'Just a summary.';
    const body = serializeBodyBlock(summary, {});
    expect(body).toBe(summary);
    expect(body).not.toContain('<!-- harness-meta:start -->');
  });

  it('c) summary plus partial meta (only priority set) → block contains only priority', () => {
    const summary = 'Sum.';
    const body = serializeBodyBlock(summary, { priority: 'P3' });
    expect(body).toContain('<!-- harness-meta:start -->');
    expect(body).toContain('priority: P3');
    expect(body).not.toContain('spec:');
    expect(body).not.toContain('plan:');
    expect(body).not.toContain('blocked_by:');
    expect(body).not.toContain('milestone:');
  });

  it('d) summary containing literal "<!-- harness-meta:start -->" → false marker preserved verbatim', () => {
    const summary =
      'Note that the marker `<!-- harness-meta:start -->` is illustrated in the docs.';
    const body = serializeBodyBlock(summary, { priority: 'P1' });
    // The serializer always appends a fresh canonical block at the end.
    // The summary itself preserves the false marker.
    expect(body.indexOf(summary)).toBe(0);
    // And the canonical block is appended afterward.
    const lastStart = body.lastIndexOf('<!-- harness-meta:start -->');
    expect(lastStart).toBeGreaterThan(summary.length - 1);
    expect(body).toContain('<!-- harness-meta:end -->');
  });
});

describe('body-metadata: round-trip property', () => {
  const cases: Array<{ name: string; summary: string; meta: BodyMeta }> = [
    {
      name: 'all fields',
      summary: 'Build the foo feature.',
      meta: {
        spec: 'docs/specs/foo.md',
        plan: 'docs/plans/foo.md',
        blocked_by: ['a-feat', 'b-feat'],
        priority: 'P1',
        milestone: 'Q3',
      },
    },
    {
      name: 'spec only',
      summary: 'Summary.',
      meta: { spec: 'docs/specs/only.md' },
    },
    {
      name: 'multi-line summary + minimal meta',
      summary: 'Line 1.\nLine 2.\nLine 3.',
      meta: { priority: 'P2' },
    },
    {
      name: 'blocked_by single entry',
      summary: 'X.',
      meta: { blocked_by: ['only-one'] },
    },
  ];

  for (const c of cases) {
    it(`round-trip: ${c.name}`, () => {
      const body = serializeBodyBlock(c.summary, c.meta);
      const reparsed = parseBodyBlock(body);
      expect(reparsed).toEqual({ summary: c.summary, meta: c.meta });
    });
  }
});
