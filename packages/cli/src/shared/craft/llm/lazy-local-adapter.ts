// packages/cli/src/shared/craft/llm/lazy-local-adapter.ts
//
// Lazy resolver for `local` / `pi` backends that declare a prefer-and-
// fallback model list. The first `callText` probes the endpoint's
// `/v1/models`, walks the configured list in order, and constructs an
// OpenAICompatibleAnalysisProvider against the first model that's
// actually loaded. Subsequent calls reuse the resolved provider.
//
// Why lazy: getProvider() is sync and craft skills make many one-shot
// calls per run. Pushing the probe into callText keeps the sync
// contract intact and amortizes the probe over the run's prompts.
//
// On total miss, throws a clear error naming both lists so the operator
// can `ollama pull <id>` or update their config.

import { OpenAICompatibleAnalysisProvider } from '@harness-engineering/intelligence';
import { defaultFetchModels } from '@harness-engineering/orchestrator';
import type { LlmCallCost, LlmProvider, VisionInput } from './provider.js';
import { AnalysisProviderAdapter } from './adapters.js';

export interface LazyLocalAdapterOptions {
  endpoint: string;
  apiKey: string;
  /** Ordered prefer list. Walked in order on first callText. */
  configured: string[];
  /** Optional injection for tests. Defaults to the orchestrator's defaultFetchModels. */
  fetchModels?: (endpoint: string, apiKey?: string) => Promise<string[]>;
  /** Per-request timeout for the LLM call itself (not the probe). */
  llmTimeoutMs?: number;
}

/**
 * Wraps an OpenAICompatibleAnalysisProvider with a deferred model
 * resolution step. Implements LlmProvider so it slots into the craft
 * `callText` contract without phase-side changes.
 */
export class LazyLocalAdapter implements LlmProvider {
  readonly providerId: string;
  readonly model: string;

  private readonly opts: LazyLocalAdapterOptions;
  private readonly costs: LlmCallCost[] = [];
  /** Cached resolution. Populated on first probe; subsequent calls reuse. */
  private resolved: { provider: LlmProvider; modelId: string } | null = null;
  private resolvePromise: Promise<{ provider: LlmProvider; modelId: string }> | null = null;

  constructor(opts: LazyLocalAdapterOptions, providerId = 'local') {
    this.opts = opts;
    this.providerId = providerId;
    // Best-effort label for telemetry until the probe resolves.
    this.model = opts.configured[0] ?? 'unresolved';
  }

  async callText(prompt: string, callOpts?: { systemPrompt?: string }): Promise<string> {
    const { provider } = await this.resolve();
    return provider.callText(prompt, callOpts);
  }

  async callVision(_prompt: string, _image: VisionInput): Promise<string> {
    throw new Error(`${this.providerId}: callVision is not wired for local backends.`);
  }

  recordCost(cost: LlmCallCost): void {
    this.costs.push(cost);
  }

  getCosts(): readonly LlmCallCost[] {
    return this.costs;
  }

  /** Test/debug surface — read the resolved model id (null before first probe). */
  getResolvedModel(): string | null {
    return this.resolved?.modelId ?? null;
  }

  private async resolve(): Promise<{ provider: LlmProvider; modelId: string }> {
    if (this.resolved !== null) return this.resolved;
    if (this.resolvePromise !== null) return this.resolvePromise;
    const fetcher = this.opts.fetchModels ?? defaultFetchModels;
    this.resolvePromise = (async () => {
      let detected: string[];
      try {
        detected = await fetcher(this.opts.endpoint, this.opts.apiKey);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `${this.providerId}: probe failed against ${this.opts.endpoint}: ${message}. ` +
            'Is the server running? (Ollama: `ollama serve`; LM Studio: enable the server.)',
          { cause: err }
        );
      }
      const match = this.opts.configured.find((id) => detected.includes(id));
      if (match === undefined) {
        throw new Error(
          `${this.providerId}: no configured model is loaded at ${this.opts.endpoint}. ` +
            `Configured: [${this.opts.configured.join(', ')}]. ` +
            `Detected: [${detected.join(', ')}]. ` +
            'Load one of the configured models or update agent.backends.<name>.model.'
        );
      }
      const inner = new OpenAICompatibleAnalysisProvider({
        apiKey: this.opts.apiKey,
        baseUrl: this.opts.endpoint,
        defaultModel: match,
        ...(this.opts.llmTimeoutMs !== undefined ? { timeoutMs: this.opts.llmTimeoutMs } : {}),
      });
      const provider = new AnalysisProviderAdapter({
        providerId: this.providerId,
        model: match,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inner: inner as any,
      });
      const resolved = { provider, modelId: match };
      this.resolved = resolved;
      return resolved;
    })().finally(() => {
      this.resolvePromise = null;
    });
    return this.resolvePromise;
  }
}
