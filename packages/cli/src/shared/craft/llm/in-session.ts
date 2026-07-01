// packages/cli/src/shared/craft/llm/in-session.ts
//
// InSessionLlmProvider — collects prompts instead of calling an LLM.
//
// The craft skill family's MVP path calls a real LLM provider that returns
// fenced JSON for each (target, rubric) prompt. The "in-session" provider
// inverts that: when a phase calls `callText`, the provider records the
// prompt and throws `PromptDeferredError`. The orchestrator catches that
// sentinel, accumulates the prompts, and returns them to the calling agent
// (the host chat session) which produces the actual judgments and feeds
// them back via a second MCP tool invocation (`<skill>_finalize`).
//
// This makes the craft pipeline behave correctly when invoked from inside
// a Claude Code chat: the host model performs the judgment in-conversation,
// no API key is required, and no nested CLI invocation is spawned.

import type { LlmCallCost, LlmProvider, VisionInput } from './contracts.js';

/** Sentinel thrown by InSessionLlmProvider.callText to defer the call. */
export class PromptDeferredError extends Error {
  readonly promptId: string;

  constructor(promptId: string) {
    super(`In-session prompt ${promptId} deferred to calling agent`);
    this.name = 'PromptDeferredError';
    this.promptId = promptId;
  }
}

/** One queued prompt awaiting a response from the calling agent. */
export interface DeferredPrompt {
  promptId: string;
  systemPrompt: string | undefined;
  userPrompt: string;
}

/**
 * Provider that records prompts and throws PromptDeferredError instead of
 * calling an LLM. Read out the queue with `getDeferred()` after the
 * orchestrator finishes its sweep.
 */
export class InSessionLlmProvider implements LlmProvider {
  readonly providerId = 'in-session';
  readonly model = 'host-chat';

  private readonly deferred: DeferredPrompt[] = [];
  private readonly costs: LlmCallCost[] = [];
  private counter = 0;

  async callText(prompt: string, opts?: { systemPrompt?: string }): Promise<string> {
    const promptId = `p${(++this.counter).toString(36)}`;
    this.deferred.push({
      promptId,
      systemPrompt: opts?.systemPrompt,
      userPrompt: prompt,
    });
    throw new PromptDeferredError(promptId);
  }

  async callVision(_prompt: string, _image: VisionInput): Promise<string> {
    throw new Error(
      'InSessionLlmProvider.callVision is not implemented — vision flows must use a real provider.'
    );
  }

  recordCost(cost: LlmCallCost): void {
    this.costs.push(cost);
  }

  getCosts(): readonly LlmCallCost[] {
    return this.costs;
  }

  /** Read out the queue of deferred prompts (in the order callText was invoked). */
  getDeferred(): readonly DeferredPrompt[] {
    return this.deferred;
  }
}
