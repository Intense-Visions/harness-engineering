import type { AgentBackend, BackendDef } from '@harness-engineering/types';
import type { CacheMetricsRecorder } from '@harness-engineering/core';
import { MockBackend } from './backends/mock.js';
import { ClaudeBackend } from './backends/claude.js';
import { AnthropicBackend } from './backends/anthropic.js';
import { OpenAIBackend } from './backends/openai.js';
import { GeminiBackend } from './backends/gemini.js';
import { LocalBackend } from './backends/local.js';
import { PiBackend } from './backends/pi.js';
import { SshBackend } from './backends/ssh.js';
import { OciServerlessBackend } from './backends/serverless.js';

/**
 * Orchestrator-owned dependencies threaded into backend constructors. Today
 * only the prompt-cache recorder is plumbed (consumed by ClaudeBackend); other
 * backends accept the option without using it so a single recorder instance
 * can be shared across the dispatch tree. The recorder itself is instantiated
 * by the orchestrator at startup — Phase 5 Task 16.
 */
export interface CreateBackendOptions {
  /** Optional prompt-cache recorder shared across Anthropic-capable backends. */
  cacheMetrics?: CacheMetricsRecorder;
}

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

/** Narrow a BackendDef to a specific discriminated variant by `type`. */
type BackendDefOf<T extends BackendDef['type']> = Extract<BackendDef, { type: T }>;

function createClaudeBackend(
  def: BackendDefOf<'claude'>,
  options: CreateBackendOptions
): AgentBackend {
  return new ClaudeBackend(def.command ?? 'claude', {
    ...(options.cacheMetrics ? { cacheMetrics: options.cacheMetrics } : {}),
  });
}

function createAnthropicBackend(def: BackendDefOf<'anthropic'>): AgentBackend {
  return new AnthropicBackend({
    model: def.model,
    ...(def.apiKey !== undefined ? { apiKey: def.apiKey } : {}),
  });
}

function createOpenAIBackend(def: BackendDefOf<'openai'>): AgentBackend {
  return new OpenAIBackend({
    model: def.model,
    ...(def.apiKey !== undefined ? { apiKey: def.apiKey } : {}),
  });
}

function createGeminiBackend(def: BackendDefOf<'gemini'>): AgentBackend {
  return new GeminiBackend({
    model: def.model,
    ...(def.apiKey !== undefined ? { apiKey: def.apiKey } : {}),
  });
}

function createLocalBackend(def: BackendDefOf<'local'>): AgentBackend {
  const isArray = Array.isArray(def.model);
  return new LocalBackend({
    endpoint: def.endpoint,
    ...(typeof def.model === 'string' ? { model: def.model } : {}),
    ...(isArray ? { getModel: makeGetModel(def.model) } : {}),
    ...(def.apiKey !== undefined ? { apiKey: def.apiKey } : {}),
    ...(def.timeoutMs !== undefined ? { timeoutMs: def.timeoutMs } : {}),
  });
}

function createPiBackend(def: BackendDefOf<'pi'>): AgentBackend {
  const isArray = Array.isArray(def.model);
  return new PiBackend({
    endpoint: def.endpoint,
    ...(typeof def.model === 'string' ? { model: def.model } : {}),
    ...(isArray ? { getModel: makeGetModel(def.model) } : {}),
    ...(def.apiKey !== undefined ? { apiKey: def.apiKey } : {}),
    ...(def.timeoutMs !== undefined ? { timeoutMs: def.timeoutMs } : {}),
  });
}

function createSshBackend(def: BackendDefOf<'ssh'>): AgentBackend {
  return new SshBackend({
    host: def.host,
    remoteCommand: def.remoteCommand,
    ...(def.user !== undefined ? { user: def.user } : {}),
    ...(def.port !== undefined ? { port: def.port } : {}),
    ...(def.identityFile !== undefined ? { identityFile: def.identityFile } : {}),
    ...(def.sshOptions !== undefined ? { sshOptions: def.sshOptions } : {}),
    ...(def.sshBinary !== undefined ? { sshBinary: def.sshBinary } : {}),
  });
}

function createServerlessBackend(def: BackendDefOf<'serverless'>): AgentBackend {
  switch (def.adapter) {
    case 'oci':
      return new OciServerlessBackend({
        image: def.image,
        ...(def.registry !== undefined ? { registry: def.registry } : {}),
        ...(def.pullPolicy !== undefined ? { pullPolicy: def.pullPolicy } : {}),
        ...(def.envPassthrough !== undefined ? { envPassthrough: def.envPassthrough } : {}),
        ...(def.runtime !== undefined ? { runtime: def.runtime } : {}),
      });
    default: {
      const exhaustive: never = def.adapter;
      throw new Error(`createBackend: unknown serverless adapter ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * Pure constructor: BackendDef -> concrete AgentBackend instance.
 * No side effects beyond the underlying class constructors.
 * Container wrapping (sandbox policy) is the orchestrator's job, not the factory's.
 *
 * `options.cacheMetrics`, when provided, is forwarded to backends that
 * record prompt-cache hits (currently `ClaudeBackend`). Other backends
 * accept-but-ignore the recorder.
 */
export function createBackend(def: BackendDef, options: CreateBackendOptions = {}): AgentBackend {
  switch (def.type) {
    case 'mock':
      return new MockBackend();
    case 'claude':
      return createClaudeBackend(def, options);
    case 'anthropic':
      return createAnthropicBackend(def);
    case 'openai':
      return createOpenAIBackend(def);
    case 'gemini':
      return createGeminiBackend(def);
    case 'local':
      return createLocalBackend(def);
    case 'pi':
      return createPiBackend(def);
    case 'ssh':
      return createSshBackend(def);
    case 'serverless':
      return createServerlessBackend(def);
    default: {
      const exhaustive: never = def;
      throw new Error(`createBackend: unknown backend type ${JSON.stringify(exhaustive)}`);
    }
  }
}
