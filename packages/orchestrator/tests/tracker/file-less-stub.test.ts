import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { Orchestrator } from '../../src/orchestrator';
import { GitHubIssuesIssueTrackerAdapter } from '../../src/tracker/adapters/github-issues-issue-tracker';
import { RoadmapTrackerAdapter } from '../../src/tracker/adapters/roadmap';
import type { WorkflowConfig } from '@harness-engineering/types';

function createConfig(
  workspaceRoot: string,
  trackerKind: 'roadmap' | 'github-issues' = 'roadmap'
): WorkflowConfig {
  const trackerBase = {
    activeStates: ['planned', 'in-progress'],
    terminalStates: ['done'],
  };
  const tracker =
    trackerKind === 'roadmap'
      ? {
          kind: 'roadmap' as const,
          filePath: path.join(workspaceRoot, '..', '..', 'docs', 'roadmap.md'),
          ...trackerBase,
        }
      : {
          kind: 'github-issues' as const,
          projectSlug: 'owner/repo',
          apiKey: 'fake-token-for-test',
          ...trackerBase,
        };
  return {
    tracker,
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
      maxConcurrentAgents: 0,
      maxTurns: 3,
      maxRetryBackoffMs: 1000,
      maxRetries: 5,
      maxConcurrentAgentsByState: {},
      turnTimeoutMs: 5000,
      readTimeoutMs: 5000,
      stallTimeoutMs: 5000,
    },
    intelligence: { enabled: false },
    server: { port: null },
  } as WorkflowConfig;
}

describe('Orchestrator — Phase 4 file-less tracker dispatch (S2)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-s2-'));
    execSync(
      'git init && git config user.email "test@test" && git config user.name "test" && git commit --allow-empty -m "init"',
      { cwd: dir, stdio: 'ignore' }
    );
    fs.mkdirSync(path.join(dir, '.harness', 'workspaces'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({
        version: 1,
        roadmap: {
          mode: 'file-less',
        },
      })
    );
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('createTracker returns a GitHubIssuesIssueTrackerAdapter when tracker.kind === "github-issues"', () => {
    const cfg = createConfig(path.join(dir, '.harness', 'workspaces'), 'github-issues');
    const orch = new Orchestrator(cfg, 'Prompt');
    // The orchestrator's `tracker` field is private; inspect via runtime
    // duck-typing (instanceof on the underlying adapter).
    const tracker = (orch as unknown as { tracker: unknown }).tracker;
    expect(tracker).toBeInstanceOf(GitHubIssuesIssueTrackerAdapter);
  });

  it('createTracker returns a RoadmapTrackerAdapter when tracker.kind === "roadmap" (regression)', () => {
    // Use a file-backed-mode config so the harness.config.json mode does not
    // contradict the workflow tracker kind.
    fs.writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify({ version: 1 }));
    const cfg = createConfig(path.join(dir, '.harness', 'workspaces'), 'roadmap');
    const orch = new Orchestrator(cfg, 'Prompt');
    const tracker = (orch as unknown as { tracker: unknown }).tracker;
    expect(tracker).toBeInstanceOf(RoadmapTrackerAdapter);
  });

  it('falls through to file-backed createTracker when harness.config has no mode', () => {
    fs.writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify({ version: 1 }));
    const cfg = createConfig(path.join(dir, '.harness', 'workspaces'), 'roadmap');
    expect(() => new Orchestrator(cfg, 'Prompt')).not.toThrow();
  });

  it('defensive default: behaves as file-backed when harness.config.json is missing entirely', () => {
    // REV-P3-V-1: the file-less dispatch logic must not throw when the
    // config file itself is absent. The defensive default is 'file-backed',
    // so the orchestrator should still construct (with a RoadmapTracker
    // when the workflow config says `kind: roadmap`).
    fs.rmSync(path.join(dir, 'harness.config.json'), { force: true });
    expect(fs.existsSync(path.join(dir, 'harness.config.json'))).toBe(false);

    const cfg = createConfig(path.join(dir, '.harness', 'workspaces'), 'roadmap');
    let orch: Orchestrator | undefined;
    expect(() => {
      orch = new Orchestrator(cfg, 'Prompt');
    }).not.toThrow();
    const tracker = (orch as unknown as { tracker: unknown }).tracker;
    expect(tracker).toBeInstanceOf(RoadmapTrackerAdapter);
  });
});
