import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { Orchestrator } from '../../src/orchestrator';
import type { WorkflowConfig } from '@harness-engineering/types';

function createConfig(workspaceRoot: string): WorkflowConfig {
  return {
    tracker: {
      kind: 'roadmap',
      filePath: path.join(workspaceRoot, '..', '..', 'docs', 'roadmap.md'),
      activeStates: ['planned', 'in-progress'],
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

describe('Orchestrator — Phase 3 file-less tracker stub', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-stub-'));
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
          tracker: { kind: 'github', statusMap: { 'in-progress': 'open' } },
        },
      })
    );
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('createTracker throws stub error when roadmap.mode is file-less', () => {
    // Orchestrator constructor calls createTracker() eagerly via the overrides path;
    // pass NO tracker override so the factory runs and throws.
    const cfg = createConfig(path.join(dir, '.harness', 'workspaces'));
    expect(() => new Orchestrator(cfg, 'Prompt')).toThrowError(
      /file-less roadmap mode is not yet wired in orchestrator tracker factory; see Phase 4\./
    );
  });

  it('falls through to file-backed createTracker when mode is absent', () => {
    fs.writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify({ version: 1 }));
    const cfg = createConfig(path.join(dir, '.harness', 'workspaces'));
    // file-backed tracker construction should succeed (RoadmapTrackerAdapter created from config).
    expect(() => new Orchestrator(cfg, 'Prompt')).not.toThrow();
  });
});
