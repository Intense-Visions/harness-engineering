import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { Orchestrator } from '../../src/orchestrator';
import { MockBackend } from '../../src/agent/backends/mock';
import type { WorkflowConfig, Issue } from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';

describe('Intelligence Pipeline Circuit Breaker', () => {
  let tmpDir: string;
  let orchestrator: Orchestrator;
  let mockTracker: any;

  function makeIssue(n: number): Issue {
    return {
      id: `issue-${n}`,
      identifier: `H-${n}`,
      title: `Test issue ${n}`,
      description: `Description ${n}`,
      priority: 1,
      state: 'planned',
      branchName: `feat/test-${n}`,
      url: null,
      labels: ['scope:guided-change'],
      blockedBy: [],
      spec: null,
      plans: [],
      createdAt: null,
      updatedAt: null,
      externalId: null,
    };
  }

  const createConfig = (
    workspaceRoot: string,
    circuitBreakerThreshold?: number
  ): WorkflowConfig => ({
    tracker: {
      kind: 'mock',
      activeStates: ['planned'],
      terminalStates: ['done'],
    },
    polling: { intervalMs: 1000 },
    workspace: { root: workspaceRoot },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 1000,
    },
    agent: {
      backend: 'mock',
      maxConcurrentAgents: 0, // prevent dispatch
      maxTurns: 3,
      maxRetryBackoffMs: 1000,
      maxRetries: 5,
      maxConcurrentAgentsByState: {},
      turnTimeoutMs: 5000,
      readTimeoutMs: 5000,
      stallTimeoutMs: 5000,
    },
    intelligence: {
      enabled: true,
      ...(circuitBreakerThreshold !== undefined && { circuitBreakerThreshold }),
    },
    server: { port: null },
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-orch-cb-'));
    execSync('git init && git commit --allow-empty -m "init"', { cwd: tmpDir, stdio: 'ignore' });
    fs.mkdirSync(path.join(tmpDir, '.harness', 'workspaces'), { recursive: true });
  });

  afterEach(async () => {
    if (orchestrator) await orchestrator.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should stop calling pipeline after consecutive connection errors hit threshold', async () => {
    const issues = Array.from({ length: 10 }, (_, i) => makeIssue(i + 1));
    mockTracker = {
      fetchCandidateIssues: vi.fn().mockResolvedValue(Ok(issues)),
      fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
      fetchIssueStatesByIds: vi.fn().mockResolvedValue(Ok(new Map(issues.map((i) => [i.id, i])))),
      markIssueComplete: vi.fn().mockResolvedValue(Ok(undefined)),
      claimIssue: vi.fn().mockResolvedValue(Ok(undefined)),
      releaseIssue: vi.fn().mockResolvedValue(Ok(undefined)),
    };

    const config = createConfig(path.join(tmpDir, '.harness', 'workspaces'), 2);
    orchestrator = new Orchestrator(config, 'Prompt', {
      tracker: mockTracker,
      backend: new MockBackend(),
    });

    // Replace the pipeline with a mock that always throws connection errors
    const mockPreprocess = vi.fn().mockRejectedValue(new Error('Connection error.'));
    (orchestrator as any).pipeline = {
      preprocessIssue: mockPreprocess,
      simulate: vi.fn().mockResolvedValue({}),
      recordOutcome: vi.fn(),
    };

    // Spy on logger
    const warnSpy = vi.spyOn((orchestrator as any).logger, 'warn');

    await orchestrator.tick();

    // With threshold=2, pipeline should be called exactly 2 times, not 10
    expect(mockPreprocess).toHaveBeenCalledTimes(2);

    // Should have logged a single warn about the circuit break
    const circuitWarn = warnSpy.mock.calls.find(
      (args) => typeof args[0] === 'string' && args[0].includes('unreachable')
    );
    expect(circuitWarn).toBeDefined();
    expect(circuitWarn![0]).toContain('skipping remaining 8 issues');
  });

  it('should reset consecutive error count on success', async () => {
    const issues = Array.from({ length: 6 }, (_, i) => makeIssue(i + 1));
    mockTracker = {
      fetchCandidateIssues: vi.fn().mockResolvedValue(Ok(issues)),
      fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
      fetchIssueStatesByIds: vi.fn().mockResolvedValue(Ok(new Map(issues.map((i) => [i.id, i])))),
      markIssueComplete: vi.fn().mockResolvedValue(Ok(undefined)),
      claimIssue: vi.fn().mockResolvedValue(Ok(undefined)),
      releaseIssue: vi.fn().mockResolvedValue(Ok(undefined)),
    };

    const config = createConfig(path.join(tmpDir, '.harness', 'workspaces'), 2);
    orchestrator = new Orchestrator(config, 'Prompt', {
      tracker: mockTracker,
      backend: new MockBackend(),
    });

    // Fail, succeed, fail, fail → should trip on the last two
    const mockPreprocess = vi
      .fn()
      .mockRejectedValueOnce(new Error('Connection error.'))
      .mockResolvedValueOnce({ spec: null, score: null, signals: [] })
      .mockRejectedValueOnce(new Error('Connection error.'))
      .mockRejectedValueOnce(new Error('Connection error.'));

    (orchestrator as any).pipeline = {
      preprocessIssue: mockPreprocess,
      simulate: vi.fn().mockResolvedValue({}),
      recordOutcome: vi.fn(),
    };

    await orchestrator.tick();

    // Should call 4 times: fail, success (resets), fail, fail (trips)
    expect(mockPreprocess).toHaveBeenCalledTimes(4);
  });

  it('should not trip circuit breaker for non-connection errors', async () => {
    const issues = Array.from({ length: 5 }, (_, i) => makeIssue(i + 1));
    mockTracker = {
      fetchCandidateIssues: vi.fn().mockResolvedValue(Ok(issues)),
      fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
      fetchIssueStatesByIds: vi.fn().mockResolvedValue(Ok(new Map(issues.map((i) => [i.id, i])))),
      markIssueComplete: vi.fn().mockResolvedValue(Ok(undefined)),
      claimIssue: vi.fn().mockResolvedValue(Ok(undefined)),
      releaseIssue: vi.fn().mockResolvedValue(Ok(undefined)),
    };

    const config = createConfig(path.join(tmpDir, '.harness', 'workspaces'), 2);
    orchestrator = new Orchestrator(config, 'Prompt', {
      tracker: mockTracker,
      backend: new MockBackend(),
    });

    // All fail with a non-connection error (e.g., LLM returned invalid JSON)
    const mockPreprocess = vi.fn().mockRejectedValue(new Error('Invalid JSON response'));
    (orchestrator as any).pipeline = {
      preprocessIssue: mockPreprocess,
      simulate: vi.fn().mockResolvedValue({}),
      recordOutcome: vi.fn(),
    };

    await orchestrator.tick();

    // Should call all 5 — non-connection errors don't trip the breaker
    expect(mockPreprocess).toHaveBeenCalledTimes(5);
  });
});
