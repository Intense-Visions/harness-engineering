import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { GraphStore } from '@harness-engineering/graph';
import type { AnalysisProvider, AnalysisResponse } from '../../src/analysis-provider/interface.js';
import { OutcomeEvaluator } from '../../src/outcome-eval/evaluator.js';

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
