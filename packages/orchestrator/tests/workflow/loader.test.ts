import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { WorkflowLoader } from '../../src/workflow/loader';

describe('WorkflowLoader', () => {
  let tempDir: string;
  let loader: WorkflowLoader;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-test-'));
    loader = new WorkflowLoader();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('loads and parses a valid harness.orchestrator.md', async () => {
    const workflowPath = path.join(tempDir, 'harness.orchestrator.md');
    const content = `---
tracker:
  kind: roadmap
  filePath: docs/roadmap.md
  activeStates: [planned]
  terminalStates: [done]
polling:
  intervalMs: 30000
workspace:
  root: .harness/workspaces
hooks:
  timeoutMs: 60000
agent:
  backend: claude
  maxConcurrentAgents: 1
  maxTurns: 10
  maxRetryBackoffMs: 5000
  maxConcurrentAgentsByState: {}
  turnTimeoutMs: 300000
  readTimeoutMs: 30000
  stallTimeoutMs: 60000
server:
  port: 8080
---
# Prompt Template
Hello {{ issue.title }}
`;
    await fs.writeFile(workflowPath, content);

    const result = await loader.loadWorkflow(workflowPath);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.config.tracker.kind).toBe('roadmap');
      expect(result.value.config.agent.backend).toBe('claude');
      expect(result.value.promptTemplate).toContain('# Prompt Template');
    }
  });

  it('returns error for invalid format', async () => {
    const workflowPath = path.join(tempDir, 'harness.orchestrator.md');
    const content = 'No frontmatter here';
    await fs.writeFile(workflowPath, content);

    const result = await loader.loadWorkflow(workflowPath);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/Invalid harness.orchestrator.md format/);
    }
  });
});

describe('WorkflowLoader — Spec B Phase 2 warnings surfacing', () => {
  let tmpRoot: string;
  let workflowPath: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'loader-warnings-test-'));
    workflowPath = path.join(tmpRoot, 'harness.orchestrator.md');

    // Plant a skill catalog so the warning fires on the unknown skill name.
    const skillDir = path.join(tmpRoot, 'agents', 'skills', 'claude-code', 'harness-debugging');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'skill.yaml'),
      'name: harness-debugging\nversion: 1.0.0\n'
    );
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('returns warnings:[] on a clean modern config', async () => {
    await fs.writeFile(
      workflowPath,
      [
        '---',
        'tracker:',
        '  kind: roadmap',
        '  filePath: docs/roadmap.md',
        '  activeStates: []',
        '  terminalStates: []',
        'polling: { intervalMs: 1000, jitterMs: 0 }',
        'workspace: { root: .harness/workspaces }',
        'hooks: { afterCreate: null, beforeRun: null, afterRun: null, beforeRemove: null, timeoutMs: 1000 }',
        'agent:',
        '  backends:',
        '    claude-opus: { type: claude }',
        '  routing:',
        '    default: claude-opus',
        '    skills:',
        '      harness-debugging: claude-opus',
        'server: { port: 8080 }',
        '---',
        'PROMPT TEMPLATE',
      ].join('\n')
    );

    const loader = new WorkflowLoader();
    const result = await loader.loadWorkflow(workflowPath);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.warnings).toEqual([]);
    expect(result.value.config).toBeDefined();
    expect(result.value.promptTemplate).toContain('PROMPT TEMPLATE');
  });

  it('surfaces a warning when routing.skills.<name> is not in the discovered catalog', async () => {
    await fs.writeFile(
      workflowPath,
      [
        '---',
        'tracker: { kind: roadmap, filePath: docs/roadmap.md, activeStates: [], terminalStates: [] }',
        'polling: { intervalMs: 1000, jitterMs: 0 }',
        'workspace: { root: .harness/workspaces }',
        'hooks: { afterCreate: null, beforeRun: null, afterRun: null, beforeRemove: null, timeoutMs: 1000 }',
        'agent:',
        '  backends:',
        '    claude-opus: { type: claude }',
        '  routing:',
        '    default: claude-opus',
        '    skills:',
        '      harness-debuggin: claude-opus',
        'server: { port: 8080 }',
        '---',
        'PROMPT TEMPLATE',
      ].join('\n')
    );

    const loader = new WorkflowLoader();
    const result = await loader.loadWorkflow(workflowPath);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.warnings.length).toBeGreaterThan(0);
    expect(result.value.warnings.some((w) => w.includes('routing.skills.harness-debuggin'))).toBe(
      true
    );
  });

  it('returns Err when routing.skills references an unknown backend (hard error preserved)', async () => {
    await fs.writeFile(
      workflowPath,
      [
        '---',
        'tracker: { kind: roadmap, filePath: docs/roadmap.md, activeStates: [], terminalStates: [] }',
        'polling: { intervalMs: 1000, jitterMs: 0 }',
        'workspace: { root: .harness/workspaces }',
        'hooks: { afterCreate: null, beforeRun: null, afterRun: null, beforeRemove: null, timeoutMs: 1000 }',
        'agent:',
        '  backends:',
        '    claude-opus: { type: claude }',
        '  routing:',
        '    default: claude-opus',
        '    skills:',
        '      harness-debugging: typo-backend',
        'server: { port: 8080 }',
        '---',
        'PROMPT TEMPLATE',
      ].join('\n')
    );

    const loader = new WorkflowLoader();
    const result = await loader.loadWorkflow(workflowPath);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('typo-backend');
  });
});
