// packages/cli/src/design-craft/llm/provider.ts
//
// Thin LLM provider adapter for the design-craft skill.
//
// MVP scope (this commit):
//   - Defines the `LlmProvider` interface that the phases (critique, polish,
//     benchmark) consume.
//   - Ships a deterministic `MockLlmProvider` used by tests to validate the
//     pipeline end-to-end without network calls or non-determinism.
//   - `getProvider({ provider, model })` returns the mock for now and
//     records a TODO for the real integration.
//
// TODO (next task — out of MVP scope):
//   Wire `getProvider` to `packages/intelligence/`'s analysis-provider
//   surface (AnthropicAnalysisProvider / OpenAICompatibleAnalysisProvider /
//   ClaudeCliAnalysisProvider). The intelligence provider currently expects
//   a Zod responseSchema and emits a structured tool-call response — for
//   design-craft we want a free-form text response (the rubric prompts
//   return a fenced JSON block parsed by phases/critique.ts:parseFinding).
//   Two-line bridge: either (a) extend the intelligence interface to expose
//   raw text mode, or (b) wrap calls in a passthrough Zod schema. ADR 0018
//   (LLM-judgment skill pattern) leaves this provider integration as a
//   per-skill concern.
//
// Honors ADR 0018 (LLM-judgment skill pattern):
//   - `recordCost` is a first-class method so every skill invocation
//     surfaces aggregate cost to the human (Success Criterion 24).
//   - `callText` and `callVision` are separate so vision-LLM calls can be
//     gated on `mode: 'deep'` and tracked as a distinct cost line.

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
  /** Either an inline buffer or a URL. */
  imageUrl?: string;
  imageBuffer?: Buffer;
  mediaType?: 'image/png' | 'image/jpeg' | 'image/webp';
}

export interface LlmProvider {
  /** Provider id (`anthropic`, `openai-compatible`, `mock`, ...). */
  readonly providerId: string;
  /** Model id (e.g. `claude-sonnet-4-6`). */
  readonly model: string;

  /**
   * Free-form text completion. Returns the raw assistant text — the caller
   * is responsible for parsing fenced JSON / structured content.
   */
  callText(prompt: string, opts?: { systemPrompt?: string }): Promise<string>;

  /**
   * Vision-capable completion. Phase 1 MVP does not wire this through; the
   * default mock throws so consumers in fast mode never accidentally hit it.
   */
  callVision(prompt: string, image: VisionInput, opts?: { systemPrompt?: string }): Promise<string>;

  /**
   * Side-effect: append a cost entry to whatever sink the provider was
   * created with. Mock implementations record to an internal array
   * exposed via `getCosts()` for test assertions.
   */
  recordCost(cost: LlmCallCost): void;
}

/**
 * Deterministic mock provider used by tests + as the default `getProvider`
 * return until the real intelligence-package integration lands.
 *
 * `callText` returns a fixed fenced-JSON response shaped to satisfy the
 * critique-phase parser. Tests can override the response via the
 * constructor's `responses` map (keyed by substring match on the prompt).
 *
 * The default response intentionally emits `confidence: 'low'` so the
 * integration test can assert ADR 0019's "confidence is honest" property
 * (Success Criterion 6) — a mock that always returned `high` would let
 * the contract regress silently.
 */
export class MockLlmProvider implements LlmProvider {
  readonly providerId = 'mock';
  readonly model = 'mock-text-deterministic-1';

  private readonly costs: LlmCallCost[] = [];

  constructor(
    private readonly responses: Array<{
      /** Substring match against the prompt. First hit wins. */
      promptIncludes: string;
      response: string;
    }> = []
  ) {}

  async callText(prompt: string, _opts?: { systemPrompt?: string }): Promise<string> {
    // Record a nominal cost so cost-tracking assertions can verify the call
    // was made. Mock pricing: $0.000 (free).
    this.recordCost({
      provider: this.providerId,
      model: this.model,
      inputTokens: prompt.length,
      outputTokens: 200,
      costUsd: 0,
    });

    const hit = this.responses.find((r) => prompt.includes(r.promptIncludes));
    if (hit) return hit.response;

    // Default — a low-confidence finding so ADR 0019's honesty property is
    // observable in tests. Format matches the rubric prompt's JSON contract.
    return [
      '```json',
      JSON.stringify(
        {
          tier: 'foundational',
          impact: 'medium',
          confidence: 'low',
          message:
            'Mock provider default response: target appears to lack a clear primary signal among its top-level interactive elements, but the code-only view leaves the actual rendered weights ambiguous. Confidence is low.',
        },
        null,
        2
      ),
      '```',
    ].join('\n');
  }

  async callVision(): Promise<string> {
    throw new Error(
      'MockLlmProvider.callVision not implemented — vision pipeline is Phase 2 work.'
    );
  }

  recordCost(cost: LlmCallCost): void {
    this.costs.push(cost);
  }

  /** Test-only — read back accumulated cost entries. */
  getCosts(): readonly LlmCallCost[] {
    return this.costs;
  }
}

/**
 * Factory for the provider used by phase implementations.
 *
 * MVP behavior: always returns a `MockLlmProvider`. The `provider`/`model`
 * args are accepted now so phase implementations can pass them through
 * unchanged when the real integration lands.
 */
export function getProvider(_opts?: { provider?: string; model?: string }): LlmProvider {
  // TODO: route to packages/intelligence/ providers per `_opts.provider`.
  // See file-level TODO for the bridge work required.
  return new MockLlmProvider();
}
