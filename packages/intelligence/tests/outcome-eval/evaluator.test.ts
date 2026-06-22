import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { GraphStore } from '@harness-engineering/graph';
import type { AnalysisProvider, AnalysisResponse } from '../../src/analysis-provider/interface.js';
import { OutcomeEvaluator } from '../../src/outcome-eval/evaluator.js';
import type { LlmVerdict } from '../../src/outcome-eval/prompts.js';

function makeProvider(
  payload: Record<string, unknown>,
  analyzeSpy = vi.fn()
): { provider: AnalysisProvider; analyzeSpy: ReturnType<typeof vi.fn> } {
  const provider: AnalysisProvider = {
    async analyze<T>(): Promise<AnalysisResponse<T>> {
      analyzeSpy();
      return {
        result: payload as T,
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        model: 'stub',
        latencyMs: 0,
      };
    },
  };
  return { provider, analyzeSpy };
}

const SPEC_WITH_CRITERIA = [
  '# Spec',
  '## Success Criteria',
  '1. The endpoint returns 200.',
  '',
].join('\n');

const SPEC_NO_SECTION = ['# Spec', '## Random Heading', 'nothing judgable here', ''].join('\n');

describe('OutcomeEvaluator — no judgable section', () => {
  it('returns INCONCLUSIVE/advisory WITHOUT calling the provider', async () => {
    const { provider, analyzeSpy } = makeProvider({});
    const dir = mkdtempSync(join(tmpdir(), 'outcome-eval-'));
    const noSectionPath = join(dir, 'no-section.md');
    writeFileSync(noSectionPath, SPEC_NO_SECTION);
    const evaluator = new OutcomeEvaluator(provider, new GraphStore());
    const verdict = await evaluator.evaluate({
      specPath: noSectionPath,
      diff: 'some diff',
      testOutput: 'ok',
    });
    expect(analyzeSpy).not.toHaveBeenCalled();
    expect(verdict.verdict).toBe('INCONCLUSIVE');
    expect(verdict.authority).toBe('advisory');
    expect(verdict.judgedAgainst).toBe('overview');
    expect(verdict.unmetCriteria).toEqual([]);
  });
});

describe('OutcomeEvaluator — provider path', () => {
  it('flows verdict/confidence/judgedAgainst through and derives authority (Criterion 1)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'outcome-eval-'));
    const p = join(dir, 'spec.md');
    writeFileSync(p, SPEC_WITH_CRITERIA);
    const { provider, analyzeSpy } = makeProvider({
      verdict: 'SATISFIED',
      confidence: 'high',
      rationale: 'Criterion "returns 200" met by the new handler.',
      unmetCriteria: [],
    } satisfies LlmVerdict);
    const evaluator = new OutcomeEvaluator(provider, new GraphStore());
    const v = await evaluator.evaluate({ specPath: p, diff: 'd', testOutput: 't' });
    expect(analyzeSpy).toHaveBeenCalledOnce();
    expect(v.verdict).toBe('SATISFIED');
    expect(v.confidence).toBe('high');
    expect(v.judgedAgainst).toBe('success-criteria');
    expect(v.authority).toBe('advisory'); // SATISFIED is never blocking
    expect(v.rationale).toContain('returns 200');
  });

  it('derives blocking ONLY for NOT_SATISFIED+high', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'outcome-eval-'));
    const p = join(dir, 'spec.md');
    writeFileSync(p, SPEC_WITH_CRITERIA);
    const { provider } = makeProvider({
      verdict: 'NOT_SATISFIED',
      confidence: 'high',
      rationale: 'Criterion "returns 200" unmet — handler returns 500.',
      unmetCriteria: ['returns 200'],
    } satisfies LlmVerdict);
    const v = await new OutcomeEvaluator(provider, new GraphStore()).evaluate({
      specPath: p,
      diff: 'd',
      testOutput: 't',
    });
    expect(v.authority).toBe('blocking');
    expect(v.unmetCriteria).toEqual(['returns 200']);
  });

  it('rejects an LLM-injected authority key at the strict parse boundary (Criterion 4)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'outcome-eval-'));
    const p = join(dir, 'spec.md');
    writeFileSync(p, SPEC_WITH_CRITERIA);
    const { provider } = makeProvider({
      verdict: 'NOT_SATISFIED',
      confidence: 'high',
      rationale: 'x',
      unmetCriteria: [],
      authority: 'blocking', // malicious/buggy extra key
    });
    const evaluator = new OutcomeEvaluator(provider, new GraphStore());
    // Strict schema rejects the extra key -> evaluate throws.
    await expect(evaluator.evaluate({ specPath: p, diff: 'd', testOutput: 't' })).rejects.toThrow();
  });
});
