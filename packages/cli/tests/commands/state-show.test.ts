import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

// Mock @harness-engineering/core loadState
const mockLoadState = vi.fn();
vi.mock('@harness-engineering/core', () => ({
  loadState: (...args: unknown[]) => mockLoadState(...args),
}));

import { createShowCommand } from '../../src/commands/state/show';

function makeProgram(globalOpts: Record<string, unknown> = {}): Command {
  const program = new Command();
  for (const [key, val] of Object.entries(globalOpts)) {
    if (typeof val === 'boolean') {
      program.option(`--${key}`);
      if (val) program.setOptionValue(key, true);
    }
  }
  program.addCommand(createShowCommand());
  return program;
}

describe('state show command', () => {
  beforeEach(() => {
    mockExit.mockClear();
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockLoadState.mockReset();
  });

  describe('createShowCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createShowCommand();
      expect(cmd.name()).toBe('show');
    });

    it('has --path option with default .', () => {
      const cmd = createShowCommand();
      const opt = cmd.options.find((o) => o.long === '--path');
      expect(opt).toBeDefined();
      expect(opt!.defaultValue).toBe('.');
    });
  });

  describe('action', () => {
    it('exits with error when loadState fails', async () => {
      mockLoadState.mockResolvedValue({
        ok: false,
        error: new Error('State file not found'),
      });

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'show']);

      expect(mockExit).toHaveBeenCalledWith(2);
    });

    it('displays state in text mode', async () => {
      mockLoadState.mockResolvedValue({
        ok: true,
        value: {
          schemaVersion: 1,
          position: { phase: 'design', task: 'api-spec' },
          lastSession: { date: '2025-01-15', summary: 'Designed API' },
          progress: { 'api-spec': 'done', implementation: 'in-progress' },
          decisions: [{ id: '1', text: 'Use REST' }],
          blockers: [{ id: '1', status: 'open', text: 'Need DB access' }],
        },
      });

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'show']);

      const output = mockConsoleLog.mock.calls.flat().join('\n');
      expect(output).toContain('Schema Version: 1');
      expect(output).toContain('Phase:          design');
      expect(output).toContain('Task:           api-spec');
      expect(output).toContain('Last Session:');
      expect(output).toContain('Progress:');
      expect(output).toContain('Decisions: 1');
      expect(output).toContain('Blockers:');
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('outputs JSON when --json flag is set', async () => {
      const stateData = {
        schemaVersion: 1,
        position: {},
        progress: {},
        decisions: [],
        blockers: [],
      };
      mockLoadState.mockResolvedValue({ ok: true, value: stateData });

      const program = makeProgram({ json: true });
      await program.parseAsync(['node', 'test', '--json', 'show']);

      const jsonOutput = mockConsoleLog.mock.calls.flat().join('');
      const parsed = JSON.parse(jsonOutput);
      expect(parsed.schemaVersion).toBe(1);
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('outputs compact JSON in quiet mode', async () => {
      const stateData = {
        schemaVersion: 1,
        position: {},
        progress: {},
        decisions: [],
        blockers: [],
      };
      mockLoadState.mockResolvedValue({ ok: true, value: stateData });

      const program = makeProgram({ quiet: true });
      await program.parseAsync(['node', 'test', '--quiet', 'show']);

      expect(mockConsoleLog).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('omits optional fields when not present', async () => {
      mockLoadState.mockResolvedValue({
        ok: true,
        value: {
          schemaVersion: 1,
          position: {},
          progress: {},
          decisions: [],
          blockers: [],
        },
      });

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'show']);

      const output = mockConsoleLog.mock.calls.flat().join('\n');
      expect(output).toContain('Schema Version: 1');
      expect(output).not.toContain('Phase:');
      expect(output).not.toContain('Task:');
      expect(output).not.toContain('Last Session:');
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });
});
