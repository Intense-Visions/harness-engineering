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
