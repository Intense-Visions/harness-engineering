// packages/cli/src/shared/craft/llm/adapters.ts
//
// Adapters that wrap the intelligence-package AnalysisProvider surface
// (AnthropicAnalysisProvider, ClaudeCliAnalysisProvider) into the
// LlmProvider.callText contract used by craft phases.
//
// The mismatch addressed here:
//   - AnalysisProvider expects a Zod responseSchema and returns parsed T.
//   - Craft phases want raw assistant text (fenced JSON, parsed by the
//     phase itself).
//
// Bridge strategy: pass a passthrough Zod schema (`z.object({ raw: z.string() })`)
// so the underlying provider yields a structured object whose single field
// carries the raw response. Phases then strip the envelope and parse as
// usual. This matches option (b) from the TODO in provider.ts.

import { z } from 'zod';
import type {
  AnthropicAnalysisProvider,
  ClaudeCliAnalysisProvider,
  OpenAICompatibleAnalysisProvider,
} from '@harness-engineering/intelligence';
import type { LlmCallCost, LlmProvider, VisionInput } from './provider.js';

const RAW_SCHEMA = z.object({ raw: z.string() });

const RAW_INSTRUCTIONS =
  'Return a JSON object with a single field "raw" whose string value is the fenced JSON block ' +
  'you would normally emit. Do not add prose outside the JSON object.';

interface AnalyzeFn {
  analyze<T>(req: {
    prompt: string;
    systemPrompt?: string;
    responseSchema: z.ZodType;
    model?: string;
    maxTokens?: number;
  }): Promise<{
    result: T;
    tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
    model: string;
    latencyMs: number;
  }>;
}

/**
 * Wraps any AnalysisProvider into the LlmProvider surface. Used by the
 * ClaudeCli and Anthropic adapters below; exported so future craft skills
 * that want to plug their own AnalysisProvider can do so without
 * re-implementing the bridge.
 */
export class AnalysisProviderAdapter implements LlmProvider {
  readonly providerId: string;
  readonly model: string;

  private readonly inner: AnalyzeFn;
  private readonly costs: LlmCallCost[] = [];

  constructor(opts: { providerId: string; model: string; inner: AnalyzeFn }) {
    this.providerId = opts.providerId;
    this.model = opts.model;
    this.inner = opts.inner;
  }

  async callText(prompt: string, opts?: { systemPrompt?: string }): Promise<string> {
    const wrappedSystem = [opts?.systemPrompt, RAW_INSTRUCTIONS].filter(Boolean).join('\n\n');
    const response = await this.inner.analyze<{ raw: string }>({
      prompt,
      systemPrompt: wrappedSystem,
      responseSchema: RAW_SCHEMA,
    });
    this.recordCost({
      provider: this.providerId,
      model: response.model || this.model,
      inputTokens: response.tokenUsage.inputTokens,
      outputTokens: response.tokenUsage.outputTokens,
      costUsd: 0,
    });
    return response.result.raw;
  }

  async callVision(_prompt: string, _image: VisionInput): Promise<string> {
    throw new Error(
      `${this.providerId} adapter does not implement callVision — wire vision when needed.`
    );
  }

  recordCost(cost: LlmCallCost): void {
    this.costs.push(cost);
  }

  getCosts(): readonly LlmCallCost[] {
    return this.costs;
  }
}

export function adaptClaudeCli(inner: ClaudeCliAnalysisProvider, model?: string): LlmProvider {
  return new AnalysisProviderAdapter({
    providerId: 'claude-cli',
    model: model ?? 'claude',
    inner: inner as unknown as AnalyzeFn,
  });
}

export function adaptAnthropic(inner: AnthropicAnalysisProvider, model?: string): LlmProvider {
  return new AnalysisProviderAdapter({
    providerId: 'anthropic',
    model: model ?? 'claude-sonnet-4-20250514',
    inner: inner as unknown as AnalyzeFn,
  });
}

export function adaptOpenAICompatible(
  inner: OpenAICompatibleAnalysisProvider,
  model?: string
): LlmProvider {
  return new AnalysisProviderAdapter({
    providerId: 'openai-compatible',
    model: model ?? 'unknown',
    inner: inner as unknown as AnalyzeFn,
  });
}
