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
      maxTokens: 256,
    });
    return result;
  } catch {
    return { level: 'moderate', confidence: 'low' }; // Failure modes: degrade up, never block
  }
}
