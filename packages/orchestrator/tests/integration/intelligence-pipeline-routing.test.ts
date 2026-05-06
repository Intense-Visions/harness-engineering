import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { Orchestrator } from '../../src/orchestrator';
import { MockBackend } from '../../src/agent/backends/mock';
import {
  AnthropicAnalysisProvider,
  ClaudeCliAnalysisProvider,
  OpenAICompatibleAnalysisProvider,
} from '@harness-engineering/intelligence';
import type { WorkflowConfig, IssueTrackerClient } from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';
import { noopExecFile } from '../helpers/noop-exec-file';

let tmpDir: string;

function makeMockTracker(): IssueTrackerClient {
  return {
    fetchCandidateIssues: vi.fn().mockResolvedValue(Ok([])),
    fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
    fetchIssueStatesByIds: vi.fn().mockResolvedValue(Ok(new Map())),
    markIssueComplete: vi.fn().mockResolvedValue(Ok(undefined)),
    claimIssue: vi.fn().mockResolvedValue(Ok(undefined)),
    releaseIssue: vi.fn().mockResolvedValue(Ok(undefined)),
  } as unknown as IssueTrackerClient;
}

function makeConfig(agentOverride: Partial<WorkflowConfig['agent']>): WorkflowConfig {
  return {
    tracker: {
      kind: 'mock',
      activeStates: ['planned'],
      terminalStates: ['done'],
    },
    polling: { intervalMs: 1000 },
    workspace: { root: path.join(tmpDir, '.harness', 'workspaces') },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 1000,
    },
    agent: {
      backend: 'mock',
      maxConcurrentAgents: 2,
      maxTurns: 3,
      maxRetryBackoffMs: 1000,
      maxRetries: 5,
      maxConcurrentAgentsByState: { planned: 1 },
      turnTimeoutMs: 5000,
      readTimeoutMs: 5000,
      stallTimeoutMs: 5000,
      ...agentOverride,
    } as unknown as WorkflowConfig['agent'],
    server: { port: null },
    intelligence: { enabled: true },
  } as unknown as WorkflowConfig;
}

function callCreateAnalysisProvider(orch: Orchestrator, layer: 'sel' | 'pesl' = 'sel') {
  return (
    orch as unknown as { createAnalysisProvider: (layer?: 'sel' | 'pesl') => unknown }
  ).createAnalysisProvider(layer);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-orch-intel-routing-'));
  execSync(
    'git init && git config user.email "test@test" && git config user.name "test" && git commit --allow-empty -m "init"',
    { cwd: tmpDir, stdio: 'ignore' }
  );
  fs.mkdirSync(path.join(tmpDir, '.harness', 'workspaces'), { recursive: true });
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

describe('Spec 2 Phase 4 — intelligence pipeline routing', () => {
  it('SC31: routing.intelligence.sel=local builds OpenAICompatible from backends.local', async () => {
    const cfg = makeConfig({
      backends: {
        local: { type: 'pi', endpoint: 'http://localhost:11434/v1', model: 'gemma-4-e4b' },
      },
      routing: { default: 'local', intelligence: { sel: 'local' } },
    });
    const orch = new Orchestrator(cfg, 'Prompt', {
      tracker: makeMockTracker(),
      backend: new MockBackend(),
      execFileFn: noopExecFile,
    });
    // Stub fetchModels on the local resolver so it reports available.
    const resolver = (
      orch as unknown as {
        localResolvers: Map<string, { fetchModels: unknown }>;
      }
    ).localResolvers
      .values()
      .next().value;
    (resolver as { fetchModels: unknown }).fetchModels = vi.fn().mockResolvedValue(['gemma-4-e4b']);
    await orch.start();
    try {
      const provider = callCreateAnalysisProvider(orch);
      expect(provider).toBeInstanceOf(OpenAICompatibleAnalysisProvider);
    } finally {
      await orch.stop();
    }
  });

  it('SC32: routing.intelligence.sel=cloud (anthropic+apiKey) builds AnthropicAnalysisProvider', () => {
    const cfg = makeConfig({
      backends: {
        cloud: { type: 'anthropic', model: 'claude-3', apiKey: 'k' },
      },
      routing: { default: 'cloud', intelligence: { sel: 'cloud' } },
    });
    const orch = new Orchestrator(cfg, 'Prompt', {
      tracker: makeMockTracker(),
      backend: new MockBackend(),
      execFileFn: noopExecFile,
    });
    const provider = callCreateAnalysisProvider(orch);
    expect(provider).toBeInstanceOf(AnthropicAnalysisProvider);
  });

  it('SC33: explicit intelligence.provider wins over routing', () => {
    const cfg = makeConfig({
      backends: {
        cloud: { type: 'anthropic', model: 'claude-3', apiKey: 'k' },
      },
      routing: { default: 'cloud', intelligence: { sel: 'cloud' } },
    });
    (cfg.intelligence as Record<string, unknown>).provider = {
      kind: 'claude-cli',
    };
    const orch = new Orchestrator(cfg, 'Prompt', {
      tracker: makeMockTracker(),
      backend: new MockBackend(),
      execFileFn: noopExecFile,
    });
    const provider = callCreateAnalysisProvider(orch);
    expect(provider).toBeInstanceOf(ClaudeCliAnalysisProvider);
  });

  it('SC36: routing.intelligence.sel=mock returns null and warns', () => {
    const cfg = makeConfig({
      backends: { mockonly: { type: 'mock' } },
      routing: { default: 'mockonly', intelligence: { sel: 'mockonly' } },
    });
    const orch = new Orchestrator(cfg, 'Prompt', {
      tracker: makeMockTracker(),
      backend: new MockBackend(),
      execFileFn: noopExecFile,
    });
    const warnSpy = vi.fn();
    (orch as unknown as { logger: { warn: typeof warnSpy } }).logger.warn = warnSpy;
    const provider = callCreateAnalysisProvider(orch);
    expect(provider).toBeNull();
    const matched = warnSpy.mock.calls.find((c) =>
      String(c[0]).match(/no AnalysisProvider implementation/i)
    );
    expect(matched, `expected SC36 warn; got: ${JSON.stringify(warnSpy.mock.calls)}`).toBeTruthy();
  });

  it('SC34: routing.intelligence.pesl unset → IntelligencePipeline uses one provider', async () => {
    const cfg = makeConfig({
      backends: { cloud: { type: 'anthropic', model: 'claude-3', apiKey: 'k' } },
      routing: { default: 'cloud', intelligence: { sel: 'cloud' } },
    });
    const orch = new Orchestrator(cfg, 'Prompt', {
      tracker: makeMockTracker(),
      backend: new MockBackend(),
      execFileFn: noopExecFile,
    });
    await orch.start();
    try {
      const pipeline = (orch as unknown as { pipeline: unknown }).pipeline;
      expect(pipeline).not.toBeNull();
      const enrichProv = (pipeline as { provider: unknown }).provider;
      const peslProv = (pipeline as { simulator: { provider: unknown } }).simulator.provider;
      expect(peslProv).toBe(enrichProv);
    } finally {
      await orch.stop();
    }
  });

  it('SC35: routing.intelligence.sel=cloud, pesl=local → distinct providers in pipeline', async () => {
    const cfg = makeConfig({
      backends: {
        cloud: { type: 'anthropic', model: 'claude-3', apiKey: 'k' },
        local: { type: 'pi', endpoint: 'http://localhost:11434/v1', model: 'gemma-4-e4b' },
      },
      routing: {
        default: 'cloud',
        intelligence: { sel: 'cloud', pesl: 'local' },
      },
    });
    const orch = new Orchestrator(cfg, 'Prompt', {
      tracker: makeMockTracker(),
      backend: new MockBackend(),
      execFileFn: noopExecFile,
    });
    const resolver = (
      orch as unknown as {
        localResolvers: Map<string, { fetchModels: unknown }>;
      }
    ).localResolvers
      .values()
      .next().value;
    (resolver as { fetchModels: unknown }).fetchModels = vi.fn().mockResolvedValue(['gemma-4-e4b']);
    await orch.start();
    try {
      const pipeline = (orch as unknown as { pipeline: unknown }).pipeline;
      expect(pipeline).not.toBeNull();
      const enrichProv = (pipeline as { provider: unknown }).provider;
      const peslProv = (pipeline as { simulator: { provider: unknown } }).simulator.provider;
      expect(enrichProv).toBeInstanceOf(AnthropicAnalysisProvider);
      expect(peslProv).toBeInstanceOf(OpenAICompatibleAnalysisProvider);
      expect(enrichProv).not.toBe(peslProv);
    } finally {
      await orch.stop();
    }
  });
});
