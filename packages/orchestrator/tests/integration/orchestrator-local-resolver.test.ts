import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { Orchestrator } from '../../src/orchestrator';
import { MockBackend } from '../../src/agent/backends/mock';
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

function makeConfig(overrides: Partial<WorkflowConfig['agent']> = {}): WorkflowConfig {
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
      ...overrides,
    },
    server: { port: null },
  } as WorkflowConfig;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-orch-resolver-'));
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

describe('Orchestrator + LocalModelResolver wiring (Phase 3)', () => {
  describe('SC1 — backwards compat (string form)', () => {
    it('OT1: constructs resolver with normalized 1-element configured list', () => {
      const config = makeConfig({
        localBackend: 'openai-compatible',
        localModel: 'gemma-4-e4b',
        localEndpoint: 'http://localhost:11434/v1',
      });
      const orch = new Orchestrator(config, 'Prompt', {
        tracker: makeMockTracker(),
        backend: new MockBackend(),
        execFileFn: noopExecFile,
      });
      // Access via test-only field exposure: TypeScript private fields are
      // structurally accessible at runtime — read with a typed cast.
      const resolver = (
        orch as unknown as {
          localModelResolver:
            | import('../../src/agent/local-model-resolver').LocalModelResolver
            | null;
        }
      ).localModelResolver;
      expect(resolver).not.toBeNull();
      expect(resolver!.getStatus().configured).toEqual(['gemma-4-e4b']);
    });
  });

  describe('SC2 — resolver gated by localBackend', () => {
    it('OT2a: cloud-only config does NOT instantiate the resolver', () => {
      const config = makeConfig({ backend: 'mock' }); // no localBackend
      const orch = new Orchestrator(config, 'Prompt', {
        tracker: makeMockTracker(),
        backend: new MockBackend(),
        execFileFn: noopExecFile,
      });
      const resolver = (
        orch as unknown as {
          localModelResolver: unknown;
        }
      ).localModelResolver;
      expect(resolver).toBeNull();
    });

    it('OT2b: claude/anthropic/openai/gemini configs do not instantiate the resolver', () => {
      for (const backend of ['claude', 'anthropic', 'openai', 'gemini'] as const) {
        const config = makeConfig({ backend, apiKey: 'test-key' });
        const orch = new Orchestrator(config, 'Prompt', {
          tracker: makeMockTracker(),
          backend: new MockBackend(),
          execFileFn: noopExecFile,
        });
        const resolver = (
          orch as unknown as {
            localModelResolver: unknown;
          }
        ).localModelResolver;
        expect(resolver, `resolver should be null for backend=${backend}`).toBeNull();
      }
    });
  });

  describe('SC-CON1 / SC-CON2 — single read site, single resolver consumer', () => {
    it('OT9: source has exactly one read of agent.localModel, at the resolver ctor site', () => {
      const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'src', 'orchestrator.ts'),
        'utf8'
      );
      const matches = src.match(/this\.config\.agent\.localModel/g) ?? [];
      expect(
        matches.length,
        `expected exactly 1 read of this.config.agent.localModel; got ${matches.length}`
      ).toBe(1);
      // The single read must live in a normalizeLocalModel(...) call.
      expect(src).toMatch(/normalizeLocalModel\(\s*this\.config\.agent\.localModel\s*\)/);
    });

    it('OT10: createLocalBackend and createAnalysisProvider both reference localModelResolver', () => {
      const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'src', 'orchestrator.ts'),
        'utf8'
      );
      // Pull each method body individually and assert resolver references.
      const localBackendMatch = src.match(/private createLocalBackend\(\)[\s\S]*?\n  \}/);
      expect(localBackendMatch, 'createLocalBackend method not found').not.toBeNull();
      expect(localBackendMatch![0]).toMatch(/this\.localModelResolver/);

      const analysisProviderMatch = src.match(/private createAnalysisProvider\(\)[\s\S]*?\n  \}/);
      expect(analysisProviderMatch, 'createAnalysisProvider method not found').not.toBeNull();
      expect(analysisProviderMatch![0]).toMatch(/this\.localModelResolver/);

      // No PHASE3-REMOVE markers remain.
      expect(src).not.toMatch(/PHASE3-REMOVE/);
    });
  });
});
