// packages/cli/tests/commands/search.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSearchCommand } from '../../src/commands/search';

async function runCommand(cwd: string, args: string[]): Promise<void> {
  const parent = new Command();
  parent.addCommand(createSearchCommand());
  parent.exitOverride();
  const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(cwd);
  try {
    await parent.parseAsync(['node', 'test', 'search', ...args]);
  } finally {
    cwdSpy.mockRestore();
  }
}

describe('search command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let logOutput: string[];
  let errOutput: string[];
  let tmp: string;

  beforeEach(() => {
    vi.clearAllMocks();
    logOutput = [];
    errOutput = [];
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logOutput.push(args.map(String).join(' '));
    });
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errOutput.push(args.map(String).join(' '));
    });
    tmp = mkdtempSync(join(tmpdir(), 'harness-search-cli-'));
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    rmSync(tmp, { recursive: true, force: true });
  });

  describe('createSearchCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createSearchCommand();
      expect(cmd.name()).toBe('search');
    });

    it('has description mentioning full-text search', () => {
      const cmd = createSearchCommand();
      expect(cmd.description().toLowerCase()).toContain('full-text');
    });

    it('exposes expected options', () => {
      const cmd = createSearchCommand();
      const opts = cmd.options.map((o) => o.long);
      expect(opts).toContain('--limit');
      expect(opts).toContain('--archived-only');
      expect(opts).toContain('--json');
      expect(opts).toContain('--reindex');
      expect(opts).toContain('--file-kinds');
    });
  });

  describe('execution', () => {
    it('reports "no matches" against an empty corpus in text mode', async () => {
      await runCommand(tmp, ['nothing']);
      const all = logOutput.join('\n');
      expect(all).toMatch(/No matches/i);
    });

    it('emits JSON to stdout when --json is set', async () => {
      await runCommand(tmp, ['nothing', '--json']);
      const all = logOutput.join('\n').trim();
      // The first JSON.stringify call drops a structured payload.
      const parsed = JSON.parse(all) as {
        matches: unknown[];
        totalIndexed: number;
        durationMs: number;
      };
      expect(parsed.matches).toEqual([]);
      expect(parsed.totalIndexed).toBe(0);
      expect(typeof parsed.durationMs).toBe('number');
    });

    it('honours --file-kinds with a valid value', async () => {
      await runCommand(tmp, ['nothing', '--file-kinds', 'summary,learnings', '--json']);
      const parsed = JSON.parse(logOutput.join('\n').trim()) as { matches: unknown[] };
      expect(parsed.matches).toEqual([]);
    });

    it('exits with code 2 and logs error on unknown --file-kinds', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`__exit_${code}`);
      }) as never);
      try {
        await expect(runCommand(tmp, ['nothing', '--file-kinds', 'bogus-kind'])).rejects.toThrow(
          /__exit_2/
        );
        expect(errOutput.join('\n')).toMatch(/unknown --file-kinds value/);
      } finally {
        exitSpy.mockRestore();
      }
    });

    it('--reindex runs without error against an empty archive', async () => {
      await runCommand(tmp, ['nothing', '--reindex']);
      const all = logOutput.join('\n');
      expect(all).toMatch(/Reindexed 0 sessions/);
    });
  });
});
