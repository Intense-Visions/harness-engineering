import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    createStream: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    listStreams: vi.fn().mockResolvedValue({
      ok: true,
      value: [
        { name: 'main', branch: 'main', lastActiveAt: '2026-01-01T00:00:00Z' },
        { name: 'feature-x', branch: 'feat/x', lastActiveAt: '2026-01-02T00:00:00Z' },
      ],
    }),
    archiveStream: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    setActiveStream: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    loadStreamIndex: vi.fn().mockResolvedValue({
      ok: true,
      value: { activeStream: 'main' },
    }),
  };
});

const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

import { createStreamsCommand } from '../../src/commands/state/streams';
import {
  createStream,
  listStreams,
  archiveStream,
  setActiveStream,
  loadStreamIndex,
} from '@harness-engineering/core';
import { Command } from 'commander';

function makeProgram(): Command {
  const program = new Command();
  program.option('--json', 'JSON output');
  program.addCommand(createStreamsCommand());
  return program;
}

describe('state streams command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createStreamsCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createStreamsCommand();
      expect(cmd.name()).toBe('streams');
    });

    it('has list, create, archive, and activate subcommands', () => {
      const cmd = createStreamsCommand();
      const subNames = cmd.commands.map((c) => c.name());
      expect(subNames).toContain('list');
      expect(subNames).toContain('create');
      expect(subNames).toContain('archive');
      expect(subNames).toContain('activate');
    });
  });

  describe('list subcommand', () => {
    it('lists streams with active marker', async () => {
      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'streams', 'list']);

      expect(listStreams).toHaveBeenCalled();
      expect(loadStreamIndex).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('main'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('(active)'));
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('outputs JSON when --json flag set', async () => {
      const program = makeProgram();
      await program.parseAsync(['node', 'test', '--json', 'streams', 'list']);

      // JSON path uses logger.raw, not console.log
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('shows empty message when no streams', async () => {
      vi.mocked(listStreams).mockResolvedValueOnce({
        ok: true,
        value: [],
      });

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'streams', 'list']);

      expect(mockConsoleLog).toHaveBeenCalledWith('No streams found.');
    });

    it('handles listStreams error', async () => {
      vi.mocked(listStreams).mockResolvedValueOnce({
        ok: false,
        error: new Error('Failed to list'),
      } as never);

      const program = makeProgram();
      try {
        await program.parseAsync(['node', 'test', 'streams', 'list']);
      } catch {
        // process.exit mock may cause downstream access to undefined
      }

      expect(mockExit).toHaveBeenCalledWith(2);
    });

    it('handles loadStreamIndex error gracefully', async () => {
      vi.mocked(loadStreamIndex).mockResolvedValueOnce({
        ok: false,
        error: new Error('Index not found'),
      } as never);

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'streams', 'list']);

      // Should still list streams, just without active marker
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('renders stream without branch', async () => {
      vi.mocked(listStreams).mockResolvedValueOnce({
        ok: true,
        value: [{ name: 'orphan', lastActiveAt: '2026-01-01T00:00:00Z' }],
      } as never);

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'streams', 'list']);

      const calls = mockConsoleLog.mock.calls.map((c) => c[0]);
      expect(calls.some((c: string) => c.includes('orphan') && !c.includes('['))).toBe(true);
    });
  });

  describe('create subcommand', () => {
    it('creates a new stream', async () => {
      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'streams', 'create', 'my-stream']);

      expect(createStream).toHaveBeenCalledWith(expect.any(String), 'my-stream', undefined);
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('passes branch option', async () => {
      const program = makeProgram();
      await program.parseAsync([
        'node',
        'test',
        'streams',
        'create',
        'my-stream',
        '--branch',
        'feat/x',
      ]);

      expect(createStream).toHaveBeenCalledWith(expect.any(String), 'my-stream', 'feat/x');
    });

    it('handles createStream error', async () => {
      vi.mocked(createStream).mockResolvedValueOnce({
        ok: false,
        error: new Error('Duplicate stream'),
      } as never);

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'streams', 'create', 'dup']);

      expect(mockExit).toHaveBeenCalledWith(2);
    });
  });

  describe('archive subcommand', () => {
    it('archives a stream', async () => {
      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'streams', 'archive', 'old-stream']);

      expect(archiveStream).toHaveBeenCalledWith(expect.any(String), 'old-stream');
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('handles archiveStream error', async () => {
      vi.mocked(archiveStream).mockResolvedValueOnce({
        ok: false,
        error: new Error('Stream not found'),
      } as never);

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'streams', 'archive', 'missing']);

      expect(mockExit).toHaveBeenCalledWith(2);
    });
  });

  describe('activate subcommand', () => {
    it('activates a stream', async () => {
      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'streams', 'activate', 'feature-x']);

      expect(setActiveStream).toHaveBeenCalledWith(expect.any(String), 'feature-x');
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('handles setActiveStream error', async () => {
      vi.mocked(setActiveStream).mockResolvedValueOnce({
        ok: false,
        error: new Error('Cannot activate'),
      } as never);

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'streams', 'activate', 'bad']);

      expect(mockExit).toHaveBeenCalledWith(2);
    });
  });
});
