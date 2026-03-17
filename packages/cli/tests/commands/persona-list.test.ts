import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

// Mock resolvePersonasDir
let mockPersonasDir = '/tmp/fake-personas';
vi.mock('../../src/utils/paths', () => ({
  resolvePersonasDir: () => mockPersonasDir,
}));

// Mock persona loader
const mockListPersonas = vi.fn();
vi.mock('../../src/persona/loader', () => ({
  listPersonas: (...args: unknown[]) => mockListPersonas(...args),
}));

import { createListCommand } from '../../src/commands/persona/list';

function makeProgram(globalOpts: Record<string, unknown> = {}): Command {
  const program = new Command();
  for (const [key, val] of Object.entries(globalOpts)) {
    if (typeof val === 'boolean') {
      program.option(`--${key}`);
      if (val) program.setOptionValue(key, true);
    }
  }
  program.addCommand(createListCommand());
  return program;
}

describe('persona list command', () => {
  beforeEach(() => {
    mockExit.mockClear();
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockListPersonas.mockReset();
  });

  describe('createListCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createListCommand();
      expect(cmd.name()).toBe('list');
    });
  });

  describe('action', () => {
    it('exits with error when listPersonas fails', async () => {
      mockListPersonas.mockReturnValue({
        ok: false,
        error: new Error('Failed to read directory'),
      });

      const program = makeProgram();
      // process.exit is mocked so execution continues past it, which may cause
      // downstream errors when the code tries to use result.value (undefined).
      // We catch those and just verify process.exit was called correctly.
      try {
        await program.parseAsync(['node', 'test', 'list']);
      } catch {
        // expected — execution continues after mocked process.exit
      }

      expect(mockExit).toHaveBeenCalledWith(2);
    });

    it('shows no personas message when list is empty', async () => {
      mockListPersonas.mockReturnValue({ ok: true, value: [] });

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'list']);

      const output = mockConsoleLog.mock.calls.flat().join(' ');
      expect(output).toContain('No personas found');
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('lists personas with names and descriptions', async () => {
      mockListPersonas.mockReturnValue({
        ok: true,
        value: [
          { name: 'enforcer', description: 'Enforces architecture rules', filePath: '/a.yaml' },
          { name: 'reviewer', description: 'Reviews pull requests', filePath: '/b.yaml' },
        ],
      });

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'list']);

      const output = mockConsoleLog.mock.calls.flat().join('\n');
      expect(output).toContain('enforcer');
      expect(output).toContain('Enforces architecture rules');
      expect(output).toContain('reviewer');
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('outputs JSON when --json flag is set', async () => {
      const personas = [{ name: 'enforcer', description: 'Enforces rules', filePath: '/a.yaml' }];
      mockListPersonas.mockReturnValue({ ok: true, value: personas });

      const program = makeProgram({ json: true });
      await program.parseAsync(['node', 'test', '--json', 'list']);

      const jsonOutput = mockConsoleLog.mock.calls.flat().join('');
      const parsed = JSON.parse(jsonOutput);
      expect(parsed).toEqual(personas);
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('outputs only names in quiet mode', async () => {
      mockListPersonas.mockReturnValue({
        ok: true,
        value: [{ name: 'enforcer', description: 'Enforces rules', filePath: '/a.yaml' }],
      });

      const program = makeProgram({ quiet: true });
      await program.parseAsync(['node', 'test', '--quiet', 'list']);

      expect(mockConsoleLog).toHaveBeenCalledWith('enforcer');
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });
});
