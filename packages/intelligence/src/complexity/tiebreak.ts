import { z } from 'zod';
import type { AnalysisProvider } from '../analysis-provider/interface.js';
import type { ComplexityLevel } from '@harness-engineering/types';

const TiebreakSchema = z.object({
  level: z.enum(['trivial', 'simple', 'moderate', 'complex']),
  confidence: z.enum(['high', 'medium', 'low']),
});

export interface TiebreakResult {
  level: ComplexityLevel;
  confidence: 'high' | 'medium' | 'low';
}

/** D4b: fast-tier structured tie-break. Never sets a tier; falls back conservatively on error. */
export async function llmTiebreak(
  provider: AnalysisProvider,
  prompt: string,
  fastModel?: string
): Promise<TiebreakResult> {
  try {
    const { result } = await provider.analyze<TiebreakResult>({
      prompt,
      responseSchema: TiebreakSchema,
      // Only include `model` when supplied (exactOptionalPropertyTypes).
      ...(fastModel !== undefined ? { model: fastModel } : {}),
      // A trivial/simple/moderate/complex classification does not benefit from a reasoning
      // trace (verified: identical verdict with thinking on vs off) — suppress it where the
      // backend can (Ollama native), so a reasoning model answers in ~10 tokens instead of
      // ~1000. No-op on backends that cannot honor it.
      disableThinking: true,
      // Headroom for reasoning models: a thinking model (e.g. Qwen3) emits a
      // `<think>` trace BEFORE the JSON, so a tight cap truncates mid-reasoning →
      // `finish_reason: length` → empty content → the catch below silently returns
      // the `moderate/low` fallback, masking the real verdict. `maxTokens` is a
      // ceiling, not a target (a non-thinking model still stops at ~14 tokens), so
      // this is free on the fast path and only spends tokens when reasoning occurs.
      maxTokens: 4096,
    });
    return result;
  } catch {
    return { level: 'moderate', confidence: 'low' }; // Failure modes: degrade up, never block
  }
}
