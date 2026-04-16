import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../../src/persona/loader', () => ({
  loadPersona: vi.fn(),
}));

vi.mock('../../../src/persona/generators/runtime', () => ({
  generateRuntime: vi.fn(),
}));

vi.mock('../../../src/persona/generators/agents-md', () => ({
  generateAgentsMd: vi.fn(),
}));

vi.mock('../../../src/persona/generators/ci-workflow', () => ({
  generateCIWorkflow: vi.fn(),
}));

vi.mock('../../../src/output/logger', () => ({
  logger: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../../src/utils/paths', () => ({
  resolvePersonasDir: vi.fn(() => '/tmp/personas'),
}));

import { loadPersona } from '../../../src/persona/loader';
import { generateRuntime } from '../../../src/persona/generators/runtime';
import { generateAgentsMd } from '../../../src/persona/generators/agents-md';
import { generateCIWorkflow } from '../../../src/persona/generators/ci-workflow';
import { logger } from '../../../src/output/logger';
import { createGenerateCommand } from '../../../src/commands/persona/generate';

const mockedLoadPersona = vi.mocked(loadPersona);
const mockedGenerateRuntime = vi.mocked(generateRuntime);
const mockedGenerateAgentsMd = vi.mocked(generateAgentsMd);
const mockedGenerateCIWorkflow = vi.mocked(generateCIWorkflow);

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.option('--quiet', 'Quiet output');
  // Nest under 'persona' like the real CLI does
  const personaCmd = new Command('persona');
  personaCmd.addCommand(createGenerateCommand());
  program.addCommand(personaCmd);
  return program;
}

const mockPersona = {
  name: 'Architecture Enforcer',
  description: 'Enforces architecture constraints',
  version: 2,
  skills: ['enforce-architecture'],
  triggers: [{ event: 'on_pr' as const }],
  steps: [{ command: 'harness verify', when: 'always' as const }],
  config: { timeout: 300, severity: 'error' as const },
};

describe('persona generate command', () => {
  const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit');
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createGenerateCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createGenerateCommand();
      expect(cmd.name()).toBe('generate');
    });

    it('has --output-dir option', () => {
      const cmd = createGenerateCommand();
      const opt = cmd.options.find((o) => o.long === '--output-dir');
      expect(opt).toBeDefined();
    });

    it('has --only option', () => {
      const cmd = createGenerateCommand();
      const opt = cmd.options.find((o) => o.long === '--only');
      expect(opt).toBeDefined();
    });
  });

  describe('action handler', () => {
    it('exits with error when persona loading fails', async () => {
      mockedLoadPersona.mockReturnValue({
        ok: false,
        error: new Error('Persona not found'),
      } as any);

      const program = createProgram();
      await expect(
        program.parseAsync(['node', 'test', 'persona', 'generate', 'my-persona'])
      ).rejects.toThrow('process.exit');

      expect(mockExit).toHaveBeenCalledWith(2);
      expect(logger.error).toHaveBeenCalledWith('Persona not found');
    });

    it('generates all artifacts when no --only flag', async () => {
      mockedLoadPersona.mockReturnValue({ ok: true, value: mockPersona } as any);
      mockedGenerateRuntime.mockReturnValue({ ok: true, value: '{}' } as any);
      mockedGenerateAgentsMd.mockReturnValue({ ok: true, value: '# Agents' } as any);
      mockedGenerateCIWorkflow.mockReturnValue({ ok: true, value: 'name: ci' } as any);

      const program = createProgram();
      await expect(
        program.parseAsync(['node', 'test', 'persona', 'generate', 'arch-enforcer'])
      ).rejects.toThrow('process.exit');

      // Should exit with success (0)
      expect(mockExit).toHaveBeenCalledWith(0);
      expect(mockedGenerateRuntime).toHaveBeenCalledWith(mockPersona);
      expect(mockedGenerateAgentsMd).toHaveBeenCalledWith(mockPersona);
      expect(mockedGenerateCIWorkflow).toHaveBeenCalledWith(mockPersona, 'github');
      expect(logger.success).toHaveBeenCalledWith(expect.stringContaining('Generated 3 artifacts'));
    });

    it('generates only runtime when --only runtime', async () => {
      mockedLoadPersona.mockReturnValue({ ok: true, value: mockPersona } as any);
      mockedGenerateRuntime.mockReturnValue({ ok: true, value: '{}' } as any);

      const program = createProgram();
      await expect(
        program.parseAsync([
          'node',
          'test',
          'persona',
          'generate',
          'arch-enforcer',
          '--only',
          'runtime',
        ])
      ).rejects.toThrow('process.exit');

      expect(mockExit).toHaveBeenCalledWith(0);
      expect(mockedGenerateRuntime).toHaveBeenCalled();
      expect(mockedGenerateAgentsMd).not.toHaveBeenCalled();
      expect(mockedGenerateCIWorkflow).not.toHaveBeenCalled();
    });

    it('generates only agents-md when --only agents-md', async () => {
      mockedLoadPersona.mockReturnValue({ ok: true, value: mockPersona } as any);
      mockedGenerateAgentsMd.mockReturnValue({ ok: true, value: '# Agents' } as any);

      const program = createProgram();
      await expect(
        program.parseAsync([
          'node',
          'test',
          'persona',
          'generate',
          'arch-enforcer',
          '--only',
          'agents-md',
        ])
      ).rejects.toThrow('process.exit');

      expect(mockExit).toHaveBeenCalledWith(0);
      expect(mockedGenerateRuntime).not.toHaveBeenCalled();
      expect(mockedGenerateAgentsMd).toHaveBeenCalled();
      expect(mockedGenerateCIWorkflow).not.toHaveBeenCalled();
    });

    it('generates only ci when --only ci', async () => {
      mockedLoadPersona.mockReturnValue({ ok: true, value: mockPersona } as any);
      mockedGenerateCIWorkflow.mockReturnValue({ ok: true, value: 'name: ci' } as any);

      const program = createProgram();
      await expect(
        program.parseAsync(['node', 'test', 'persona', 'generate', 'arch-enforcer', '--only', 'ci'])
      ).rejects.toThrow('process.exit');

      expect(mockExit).toHaveBeenCalledWith(0);
      expect(mockedGenerateRuntime).not.toHaveBeenCalled();
      expect(mockedGenerateAgentsMd).not.toHaveBeenCalled();
      expect(mockedGenerateCIWorkflow).toHaveBeenCalled();
    });

    it('suppresses output when --quiet is set', async () => {
      mockedLoadPersona.mockReturnValue({ ok: true, value: mockPersona } as any);
      mockedGenerateRuntime.mockReturnValue({ ok: true, value: '{}' } as any);
      mockedGenerateAgentsMd.mockReturnValue({ ok: true, value: '# Agents' } as any);
      mockedGenerateCIWorkflow.mockReturnValue({ ok: true, value: 'name: ci' } as any);

      const program = createProgram();
      await expect(
        program.parseAsync(['node', 'test', '--quiet', 'persona', 'generate', 'arch-enforcer'])
      ).rejects.toThrow('process.exit');

      expect(mockExit).toHaveBeenCalledWith(0);
      expect(logger.success).not.toHaveBeenCalled();
    });

    it('handles generators that return errors gracefully', async () => {
      mockedLoadPersona.mockReturnValue({ ok: true, value: mockPersona } as any);
      mockedGenerateRuntime.mockReturnValue({ ok: false, error: new Error('fail') } as any);
      mockedGenerateAgentsMd.mockReturnValue({ ok: false, error: new Error('fail') } as any);
      mockedGenerateCIWorkflow.mockReturnValue({ ok: false, error: new Error('fail') } as any);

      const program = createProgram();
      await expect(
        program.parseAsync(['node', 'test', 'persona', 'generate', 'arch-enforcer'])
      ).rejects.toThrow('process.exit');

      expect(mockExit).toHaveBeenCalledWith(0);
      expect(logger.success).toHaveBeenCalledWith(expect.stringContaining('Generated 0 artifacts'));
    });
  });
});
