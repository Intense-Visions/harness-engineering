import type { AgentBackend, BackendDef } from '@harness-engineering/types';
import { MockBackend } from './backends/mock.js';
import { ClaudeBackend } from './backends/claude.js';
import { AnthropicBackend } from './backends/anthropic.js';
import { OpenAIBackend } from './backends/openai.js';
import { GeminiBackend } from './backends/gemini.js';
import { LocalBackend } from './backends/local.js';
import { PiBackend } from './backends/pi.js';

/**
 * Resolve a BackendDef.model (string | string[]) into a getModel function
 * suitable for LocalBackend / PiBackend constructors. The resolver returns
 * the head of the array (or the string itself), or null when neither is
 * available. Richer multi-model resolution (probe-aware fallback) lives in
 * Spec 1's LocalModelResolver and will be wired in autopilot Phase 2.
 */
function makeGetModel(model: string | string[] | undefined): () => string | null {
  if (typeof model === 'string') return () => model;
  if (Array.isArray(model) && model.length > 0) return () => model[0] ?? null;
  return () => null;
}

/**
 * Pure constructor: BackendDef -> concrete AgentBackend instance.
 * No side effects beyond the underlying class constructors.
 * Container wrapping (sandbox policy) is the orchestrator's job, not the factory's.
 */
export function createBackend(def: BackendDef): AgentBackend {
  switch (def.type) {
    case 'mock':
      return new MockBackend();
    case 'claude':
      return new ClaudeBackend(def.command ?? 'claude');
    case 'anthropic':
      return new AnthropicBackend({
        model: def.model,
        ...(def.apiKey !== undefined ? { apiKey: def.apiKey } : {}),
      });
    case 'openai':
      return new OpenAIBackend({
        model: def.model,
        ...(def.apiKey !== undefined ? { apiKey: def.apiKey } : {}),
      });
    case 'gemini':
      return new GeminiBackend({
        model: def.model,
        ...(def.apiKey !== undefined ? { apiKey: def.apiKey } : {}),
      });
    case 'local': {
      const isArray = Array.isArray(def.model);
      return new LocalBackend({
        endpoint: def.endpoint,
        ...(typeof def.model === 'string' ? { model: def.model } : {}),
        ...(isArray ? { getModel: makeGetModel(def.model) } : {}),
        ...(def.apiKey !== undefined ? { apiKey: def.apiKey } : {}),
        ...(def.timeoutMs !== undefined ? { timeoutMs: def.timeoutMs } : {}),
      });
    }
    case 'pi': {
      const isArray = Array.isArray(def.model);
      return new PiBackend({
        endpoint: def.endpoint,
        ...(typeof def.model === 'string' ? { model: def.model } : {}),
        ...(isArray ? { getModel: makeGetModel(def.model) } : {}),
        ...(def.apiKey !== undefined ? { apiKey: def.apiKey } : {}),
        ...(def.timeoutMs !== undefined ? { timeoutMs: def.timeoutMs } : {}),
      });
    }
    default: {
      const exhaustive: never = def;
      throw new Error(`createBackend: unknown backend type ${JSON.stringify(exhaustive)}`);
    }
  }
}
