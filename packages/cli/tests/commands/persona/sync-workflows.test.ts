import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

vi.mock('../../../src/persona/generators/repo-workflows', () => ({
  checkPersonaWorkflows: vi.fn(),
  writePersonaWorkflows: vi.fn(),
  resolveWorkflowsDir: vi.fn(() => '/tmp/wf'),
}));

vi.mock('../../../src/utils/paths', () => ({
  resolvePersonasDir: vi.fn(() => '/tmp/personas'),
}));

vi.mock('../../../src/output/logger', () => ({
  logger: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  checkPersonaWorkflows,
  writePersonaWorkflows,
} from '../../../src/persona/generators/repo-workflows';
import { logger } from '../../../src/output/logger';
import { createSyncWorkflowsCommand } from '../../../src/commands/persona/sync-workflows';

const mockedCheck = vi.mocked(checkPersonaWorkflows);
const mockedWrite = vi.mocked(writePersonaWorkflows);

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.option('--quiet', 'Quiet output');
  const personaCmd = new Command('persona');
  personaCmd.addCommand(createSyncWorkflowsCommand());
  program.addCommand(personaCmd);
  return program;
}

describe('persona sync-workflows command', () => {
  const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit');
  });

  beforeEach(() => vi.clearAllMocks());

  it('has a --check option', () => {
    const cmd = createSyncWorkflowsCommand();
    expect(cmd.name()).toBe('sync-workflows');
    expect(cmd.options.find((o) => o.long === '--check')).toBeDefined();
  });

  it('write mode regenerates and exits 0', async () => {
    mockedWrite.mockReturnValue({
      ok: true,
      value: { targets: [], issues: [], written: ['a.yml'] },
    } as any);
    const program = createProgram();
    await expect(program.parseAsync(['node', 'test', 'persona', 'sync-workflows'])).rejects.toThrow(
      'process.exit'
    );
    expect(mockedWrite).toHaveBeenCalledWith('/tmp/personas', '/tmp/wf');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('--check exits 0 when there is no drift', async () => {
    mockedCheck.mockReturnValue({
      ok: true,
      value: { targets: [{ filename: 'a.yml' }], issues: [], written: [] },
    } as any);
    const program = createProgram();
    await expect(
      program.parseAsync(['node', 'test', 'persona', 'sync-workflows', '--check'])
    ).rejects.toThrow('process.exit');
    expect(mockExit).toHaveBeenCalledWith(0);
    expect(mockedWrite).not.toHaveBeenCalled();
  });

  it('--check exits non-zero and reports each issue on drift', async () => {
    mockedCheck.mockReturnValue({
      ok: true,
      value: {
        targets: [],
        issues: [{ filename: 'persona-x.yml', kind: 'missing', detail: 'gone' }],
        written: [],
      },
    } as any);
    const program = createProgram();
    await expect(
      program.parseAsync(['node', 'test', 'persona', 'sync-workflows', '--check'])
    ).rejects.toThrow('process.exit');
    expect(mockExit).toHaveBeenCalledWith(2);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('persona-x.yml'));
  });
});
