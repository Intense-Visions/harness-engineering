import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

vi.mock('@harness-engineering/core', () => ({
  clearTaint: vi.fn(),
  listTaintedSessions: vi.fn(),
  checkTaint: vi.fn(),
}));

import { clearTaint, listTaintedSessions, checkTaint } from '@harness-engineering/core';
import { createTaintCommand } from '../../src/commands/taint';

const mockedClearTaint = vi.mocked(clearTaint);
const mockedListTaintedSessions = vi.mocked(listTaintedSessions);
const mockedCheckTaint = vi.mocked(checkTaint);

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.addCommand(createTaintCommand());
  return program;
}

describe('taint command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/fake-project');
  });

  describe('createTaintCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createTaintCommand();
      expect(cmd.name()).toBe('taint');
    });
  });

  describe('taint clear', () => {
    it('clears all taint files when no sessionId given', async () => {
      mockedClearTaint.mockReturnValue(3);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const program = createProgram();
      await program.parseAsync(['node', 'test', 'taint', 'clear']);
      expect(mockedClearTaint).toHaveBeenCalledWith('/tmp/fake-project', undefined);
      logSpy.mockRestore();
    });

    it('clears taint for a specific session', async () => {
      mockedClearTaint.mockReturnValue(1);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const program = createProgram();
      await program.parseAsync(['node', 'test', 'taint', 'clear', 'session-abc']);
      expect(mockedClearTaint).toHaveBeenCalledWith('/tmp/fake-project', 'session-abc');
      logSpy.mockRestore();
    });

    it('reports when no taint found for specific session', async () => {
      mockedClearTaint.mockReturnValue(0);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const program = createProgram();
      await program.parseAsync(['node', 'test', 'taint', 'clear', 'missing-session']);
      expect(mockedClearTaint).toHaveBeenCalledWith('/tmp/fake-project', 'missing-session');
      logSpy.mockRestore();
    });

    it('reports when no active taint files found (no sessionId)', async () => {
      mockedClearTaint.mockReturnValue(0);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const program = createProgram();
      await program.parseAsync(['node', 'test', 'taint', 'clear']);
      expect(mockedClearTaint).toHaveBeenCalledWith('/tmp/fake-project', undefined);
      logSpy.mockRestore();
    });
  });

  describe('taint status', () => {
    it('shows status for all sessions when no sessionId given', async () => {
      mockedListTaintedSessions.mockReturnValue(['session-1', 'session-2']);
      mockedCheckTaint.mockReturnValue({
        tainted: true,
        expired: false,
        state: {
          severity: 'high',
          reason: 'test reason',
          findings: [],
          expiresAt: new Date(Date.now() + 600000).toISOString(),
        },
      } as any);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const program = createProgram();
      await program.parseAsync(['node', 'test', 'taint', 'status']);
      expect(mockedListTaintedSessions).toHaveBeenCalledWith('/tmp/fake-project');
      expect(mockedCheckTaint).toHaveBeenCalledTimes(2);
      logSpy.mockRestore();
    });

    it('shows status for a specific session', async () => {
      mockedCheckTaint.mockReturnValue({
        tainted: true,
        expired: false,
        state: {
          severity: 'high',
          reason: 'dangerous operation',
          findings: ['finding1'],
          expiresAt: new Date(Date.now() + 300000).toISOString(),
        },
      } as any);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const program = createProgram();
      await program.parseAsync(['node', 'test', 'taint', 'status', 'session-xyz']);
      expect(mockedCheckTaint).toHaveBeenCalledWith('/tmp/fake-project', 'session-xyz');
      logSpy.mockRestore();
    });

    it('shows clean status for untainted session', async () => {
      mockedCheckTaint.mockReturnValue({
        tainted: false,
        expired: false,
        state: null,
      } as any);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const program = createProgram();
      await program.parseAsync(['node', 'test', 'taint', 'status', 'clean-session']);
      expect(mockedCheckTaint).toHaveBeenCalledWith('/tmp/fake-project', 'clean-session');
      logSpy.mockRestore();
    });

    it('shows expired status for expired session', async () => {
      mockedCheckTaint.mockReturnValue({
        tainted: false,
        expired: true,
        state: null,
      } as any);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const program = createProgram();
      await program.parseAsync(['node', 'test', 'taint', 'status', 'expired-session']);
      expect(mockedCheckTaint).toHaveBeenCalledWith('/tmp/fake-project', 'expired-session');
      logSpy.mockRestore();
    });

    it('shows no active sessions message when none exist', async () => {
      mockedListTaintedSessions.mockReturnValue([]);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const program = createProgram();
      await program.parseAsync(['node', 'test', 'taint', 'status']);
      expect(mockedListTaintedSessions).toHaveBeenCalledWith('/tmp/fake-project');
      expect(mockedCheckTaint).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });
});
