import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { createAgentCommand } from '../../src/commands/agent';
import { createRunCommand, runAgentTask } from '../../src/commands/agent/run';
import { createReviewCommand } from '../../src/commands/agent/review';

const FIXTURES_DIR = join(__dirname, '../fixtures');
const VALID_CONFIG_PATH = join(FIXTURES_DIR, 'valid-project/harness.config.json');

describe('agent command', () => {
  describe('createAgentCommand', () => {
    it('creates command with subcommands', () => {
      const cmd = createAgentCommand();
      expect(cmd.name()).toBe('agent');
      expect(cmd.commands.map((c) => c.name())).toContain('run');
      expect(cmd.commands.map((c) => c.name())).toContain('review');
    });
  });
});

describe('runAgentTask', () => {
  it('rejects unknown task names', async () => {
    const result = await runAgentTask('unknown-task', { configPath: VALID_CONFIG_PATH });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Unknown task');
    }
  });
});

describe('createRunCommand', () => {
  it('has correct description', () => {
    const cmd = createRunCommand();
    expect(cmd.description()).toContain('agent task');
  });
});

describe('createReviewCommand', () => {
  it('has correct description', () => {
    const cmd = createReviewCommand();
    expect(cmd.description()).toContain('code review');
  });
});
