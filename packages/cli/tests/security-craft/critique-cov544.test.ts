import { describe, it, expect } from 'vitest';
import {
  critiqueOne,
  buildPrompt,
  parseFindingFromRaw,
  CRITIQUE_SYSTEM_PROMPT,
} from '../../src/security-craft/phases/critique.js';
import { trustBoundaryRespectedRubric } from '../../src/security-craft/catalog/rubrics/trust-boundary-respected.js';
import { MockLlmProvider } from '../../src/shared/craft/llm/provider.js';
import type { SecuritySignal } from '../../src/security-craft/findings/schema.js';

/**
 * Branch-coverage tests for the security-craft CRITIQUE phase: prompt building
 * with the context-window slicer (short + long source), the fenced-JSON parser
 * with each validation guard, and the critiqueOne provider path.
 */

const signal: SecuritySignal = { kind: 'raw-query', marker: 'query(...)', line: 3 };

function validRaw(overrides?: Record<string, unknown>): string {
  return [
    '```json',
    JSON.stringify({
      tier: 'foundational',
      impact: 'large',
      confidence: 'high',
      message: 'User input flows into the query unparameterized.',
      ...overrides,
    }),
    '```',
  ].join('\n');
}

describe('parseFindingFromRaw', () => {
  const ctx = { file: 'a.ts', signal, rubric: trustBoundaryRespectedRubric };

  it('parses a valid finding and derives a priority', () => {
    const f = parseFindingFromRaw(validRaw(), ctx);
    expect(f).not.toBeNull();
    expect(f!.code).toBe(trustBoundaryRespectedRubric.id);
    expect(f!.target.line).toBe(3);
    expect(f!.derived.priority).toBeGreaterThanOrEqual(0);
  });

  it('returns null for a literal null response', () => {
    expect(parseFindingFromRaw('```json\nnull\n```', ctx)).toBeNull();
  });

  it('returns null for an invalid tier', () => {
    expect(parseFindingFromRaw(validRaw({ tier: 'bogus' }), ctx)).toBeNull();
  });

  it('returns null for an invalid impact', () => {
    expect(parseFindingFromRaw(validRaw({ impact: 'huge' }), ctx)).toBeNull();
  });

  it('returns null for an invalid confidence', () => {
    expect(parseFindingFromRaw(validRaw({ confidence: 'certain' }), ctx)).toBeNull();
  });

  it('returns null for an empty message', () => {
    expect(parseFindingFromRaw(validRaw({ message: '' }), ctx)).toBeNull();
  });

  it('returns null when there is no fenced JSON', () => {
    expect(parseFindingFromRaw('no json at all', ctx)).toBeNull();
  });
});

describe('buildPrompt / context window', () => {
  it('includes the rubric, signal, and full source when source is short', () => {
    const prompt = buildPrompt({
      file: 'a.ts',
      source: 'const q = db.query(sql);',
      signal,
      rubric: trustBoundaryRespectedRubric,
    });
    expect(prompt).toContain(trustBoundaryRespectedRubric.id);
    expect(prompt).toContain('kind=raw-query');
    expect(prompt).toContain('db.query(sql)');
  });

  it('slices a window around the signal line for long source', () => {
    const lines = Array.from({ length: 400 }, (_, i) => `line_${i} = ${i};`);
    lines[199] = 'const q = db.query(userInput); // signal line';
    const source = lines.join('\n');
    const prompt = buildPrompt({
      file: 'big.ts',
      source,
      signal: { kind: 'raw-query', marker: 'query(...)', line: 200 },
      rubric: trustBoundaryRespectedRubric,
    });
    expect(prompt).toContain('db.query(userInput)');
    // The window is bounded well under the whole 400-line file.
    expect(prompt.length).toBeLessThan(source.length);
  });
});

describe('critiqueOne', () => {
  it('calls the provider with the system prompt and parses the finding', async () => {
    const provider = new MockLlmProvider([{ promptIncludes: 'Rubric', response: validRaw() }]);
    const f = await critiqueOne({
      file: 'a.ts',
      source: 'const q = db.query(userInput);',
      signal,
      rubric: trustBoundaryRespectedRubric,
      provider,
    });
    expect(f).not.toBeNull();
    expect(f!.message).toContain('unparameterized');
    expect(CRITIQUE_SYSTEM_PROMPT).toContain('CONFIDENCE POLICY');
  });

  it('returns null when the provider abstains with null', async () => {
    const provider = new MockLlmProvider([
      { promptIncludes: 'Rubric', response: '```json\nnull\n```' },
    ]);
    const f = await critiqueOne({
      file: 'a.ts',
      source: 'const q = db.query(x);',
      signal,
      rubric: trustBoundaryRespectedRubric,
      provider,
    });
    expect(f).toBeNull();
  });
});
