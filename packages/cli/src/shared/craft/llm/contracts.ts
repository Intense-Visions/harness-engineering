// packages/cli/src/shared/craft/llm/contracts.ts
//
// Pure type contracts for the craft LLM provider family.
//
// These live in their own import-free module so the provider
// implementations (in-session.ts, adapters.ts, lazy-local-adapter.ts) can
// depend on the `LlmProvider` shape without importing back from
// provider.ts — which imports all three for its runtime factory. Hoisting
// the shared types here breaks that type-only import cycle. provider.ts
// re-exports these so it remains the stable public surface.

/** Aggregate cost / token usage for one LLM call. */
export interface LlmCallCost {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** Optional vision input (image bytes or URL) for `callVision`. */
export interface VisionInput {
  imageUrl?: string;
  imageBuffer?: Buffer;
  mediaType?: 'image/png' | 'image/jpeg' | 'image/webp';
}

export interface LlmProvider {
  readonly providerId: string;
  readonly model: string;

  /**
   * Free-form text completion. Returns the raw assistant text — the caller
   * is responsible for parsing fenced JSON / structured content.
   */
  callText(prompt: string, opts?: { systemPrompt?: string }): Promise<string>;

  /**
   * Vision-capable completion. Phase 1 MVP does not wire this through;
   * the mock throws so consumers in fast mode never accidentally hit it.
   */
  callVision(prompt: string, image: VisionInput, opts?: { systemPrompt?: string }): Promise<string>;

  /** Side-effect: append a cost entry. */
  recordCost(cost: LlmCallCost): void;
}
