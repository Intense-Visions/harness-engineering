import { describe, it, expect } from 'vitest';
import type { AnalysisProvider } from '@harness-engineering/intelligence';
import { buildBenchJudge, JUDGE_PAYLOAD_CHAR_BUDGET } from './bench-judge.js';

/** A provider whose analyze() returns a fixed result, capturing the request. */
function fakeProvider(
  result: unknown,
  capture?: (req: { prompt: string }) => void
): AnalysisProvider {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async analyze(req: any) {
      capture?.(req);
      return {
        result,
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        model: 'fake',
        latencyMs: 0,
      };
    },
  } as AnalysisProvider;
}

describe('buildBenchJudge', () => {
  it('returns the provider verdict for a well-formed response', async () => {
    const judge = buildBenchJudge(
      fakeProvider({ sufficient: true, confidence: 'high', rationale: 'names the right files' })
    );
    const grade = await judge.grade('What is the impact of X?', 'graph', 'impacted: a.ts, b.ts');
    expect(grade.sufficient).toBe(true);
    expect(grade.confidence).toBe('high');
  });

  it('degrades to INCONCLUSIVE (sufficient=null) when the provider rejects', async () => {
    const rejecting: AnalysisProvider = {
      analyze: () => Promise.reject(new Error('rate limited')),
    } as AnalysisProvider;
    const grade = await buildBenchJudge(rejecting).grade('q', 'naive', 'payload');
    expect(grade.sufficient).toBeNull();
    expect(grade.confidence).toBe('low');
  });

  it('degrades to INCONCLUSIVE when the response is malformed or injects extra keys', async () => {
    // Strict re-parse rejects an injected `authority` key — the judge cannot smuggle authority.
    const judge = buildBenchJudge(
      fakeProvider({ sufficient: true, confidence: 'high', rationale: 'x', authority: 'blocking' })
    );
    const grade = await judge.grade('q', 'graph', 'payload');
    expect(grade.sufficient).toBeNull();
  });

  it('truncates an oversized payload before sending it to the judge', async () => {
    let seenPrompt = '';
    const judge = buildBenchJudge(
      fakeProvider({ sufficient: false, confidence: 'low', rationale: 'too little' }, (r) => {
        seenPrompt = r.prompt;
      })
    );
    const huge = 'x'.repeat(JUDGE_PAYLOAD_CHAR_BUDGET * 3);
    await judge.grade('q', 'naive', huge);
    expect(seenPrompt).toMatch(/truncated for judging/);
    // The prompt is bounded — it does not carry the full 3× payload verbatim.
    expect(seenPrompt.length).toBeLessThan(JUDGE_PAYLOAD_CHAR_BUDGET + 500);
  });
});
