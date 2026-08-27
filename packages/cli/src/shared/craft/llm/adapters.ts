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
import type { LlmCallCost, LlmProvider, VisionInput } from './contracts.js';

const RAW_SCHEMA = z.object({ raw: z.string() });

const RAW_INSTRUCTIONS =
  'Return a JSON object with a single field "raw" whose string value is the fenced JSON block ' +
  'you would normally emit. Do not add prose outside the JSON object.';

/** Structural mirror of the intelligence-package `AnalysisImage`. */
interface AnalyzeImage {
  base64?: string;
  url?: string;
  mediaType?: 'image/png' | 'image/jpeg' | 'image/webp';
}

interface AnalyzeFn {
  analyze<T>(req: {
    prompt: string;
    systemPrompt?: string;
    responseSchema: z.ZodType;
    model?: string;
    maxTokens?: number;
    images?: AnalyzeImage[];
  }): Promise<{
    result: T;
    tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
    model: string;
    latencyMs: number;
  }>;
}

/**
 * Convert an {@link VisionInput} into the intelligence-package image shape.
 * Prefers raw bytes (base64) over a URL; `mediaType` defaults downstream to
 * `image/png` when omitted. Throws when neither a buffer nor a URL is present
 * so a mis-wired caller fails loudly rather than sending a text-only request
 * that silently pretends to be vision.
 */
function toAnalyzeImage(image: VisionInput): AnalyzeImage {
  if (image.imageBuffer) {
    return {
      base64: image.imageBuffer.toString('base64'),
      ...(image.mediaType ? { mediaType: image.mediaType } : {}),
    };
  }
  if (image.imageUrl) {
    return {
      url: image.imageUrl,
      ...(image.mediaType ? { mediaType: image.mediaType } : {}),
    };
  }
  throw new Error('callVision requires a VisionInput with either imageBuffer or imageUrl.');
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
  /**
   * Whether the wrapped provider can actually SEE images. When false,
   * `callVision` throws rather than silently forwarding images to a backend
   * that drops them and scores a blank page — the failure mode that would
   * make a vision benchmark hallucinate. Set true only for backends whose
   * `analyze` renders `images` (anthropic, claude-cli).
   */
  private readonly supportsVision: boolean;

  constructor(opts: {
    providerId: string;
    model: string;
    inner: AnalyzeFn;
    supportsVision?: boolean;
  }) {
    this.providerId = opts.providerId;
    this.model = opts.model;
    this.inner = opts.inner;
    this.supportsVision = opts.supportsVision ?? false;
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

  async callVision(
    prompt: string,
    image: VisionInput,
    opts?: { systemPrompt?: string }
  ): Promise<string> {
    if (!this.supportsVision) {
      throw new Error(
        `The "${this.providerId}" craft provider is not vision-capable, so it cannot score a ` +
          'rendered screenshot (deep mode). Configure a vision-capable provider ' +
          '(craft.llm.provider = "anthropic" or "claude-cli") or use fast mode.'
      );
    }
    const wrappedSystem = [opts?.systemPrompt, RAW_INSTRUCTIONS].filter(Boolean).join('\n\n');
    const response = await this.inner.analyze<{ raw: string }>({
      prompt,
      systemPrompt: wrappedSystem,
      responseSchema: RAW_SCHEMA,
      images: [toAnalyzeImage(image)],
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
    supportsVision: true,
  });
}

export function adaptAnthropic(inner: AnthropicAnalysisProvider, model?: string): LlmProvider {
  return new AnalysisProviderAdapter({
    providerId: 'anthropic',
    model: model ?? 'claude-sonnet-4-20250514',
    inner: inner as unknown as AnalyzeFn,
    supportsVision: true,
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
