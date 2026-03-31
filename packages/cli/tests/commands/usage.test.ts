import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createUsageCommand } from '../../src/commands/usage';
import { Command } from 'commander';

function makeSampleJSONL(
  entries: Array<{
    timestamp: string;
    session_id: string;
    input_tokens: number;
    output_tokens: number;
    model?: string;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
  }>
): string {
  return (
    entries
      .map((e) =>
        JSON.stringify({
          timestamp: e.timestamp,
          session_id: e.session_id,
          token_usage: { input_tokens: e.input_tokens, output_tokens: e.output_tokens },
          ...(e.model != null ? { model: e.model } : {}),
          ...(e.cacheCreationTokens != null ? { cacheCreationTokens: e.cacheCreationTokens } : {}),
          ...(e.cacheReadTokens != null ? { cacheReadTokens: e.cacheReadTokens } : {}),
        })
      )
      .join('\n') + '\n'
  );
}

describe('harness usage', () => {
  const tmpDir = path.join(__dirname, '__usage-test-tmp__');
  const costsFile = path.join(tmpDir, '.harness', 'metrics', 'costs.jsonl');
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let logOutput: string[];
  let originalCwd: string;

  const sampleData = makeSampleJSONL([
    {
      timestamp: '2026-03-30T10:00:00.000Z',
      session_id: 'sess-aaa-111',
      input_tokens: 1000,
      output_tokens: 500,
    },
    {
      timestamp: '2026-03-30T14:00:00.000Z',
      session_id: 'sess-aaa-111',
      input_tokens: 2000,
      output_tokens: 800,
    },
    {
      timestamp: '2026-03-31T09:00:00.000Z',
      session_id: 'sess-bbb-222',
      input_tokens: 500,
      output_tokens: 200,
      model: 'claude-sonnet-4-20250514',
    },
    {
      timestamp: '2026-03-29T08:00:00.000Z',
      session_id: 'sess-ccc-333',
      input_tokens: 3000,
      output_tokens: 1500,
      cacheReadTokens: 100,
      cacheCreationTokens: 50,
    },
  ]);

  beforeEach(() => {
    originalCwd = process.cwd();
    fs.mkdirSync(path.dirname(costsFile), { recursive: true });
    fs.writeFileSync(costsFile, sampleData);
    process.chdir(tmpDir);
    logOutput = [];
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logOutput.push(args.join(' '));
    });
    // Suppress logger info (chalk-decorated) from polluting test output
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(originalCwd);
    consoleLogSpy.mockRestore();
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createProgram(): Command {
    const program = new Command();
    program.option('--json', 'JSON output');
    program.addCommand(createUsageCommand());
    return program;
  }

  describe('daily', () => {
    it('outputs JSON array when --json is passed', async () => {
      const program = createProgram();
      await program.parseAsync(['node', 'harness', 'usage', 'daily', '--json']);

      const output = JSON.parse(logOutput.join(''));
      expect(Array.isArray(output)).toBe(true);
      expect(output.length).toBeGreaterThanOrEqual(1);
      // Should have date, sessionCount, tokens, models
      expect(output[0]).toHaveProperty('date');
      expect(output[0]).toHaveProperty('sessionCount');
      expect(output[0]).toHaveProperty('tokens');
    });

    it('limits days with --days flag', async () => {
      const program = createProgram();
      await program.parseAsync(['node', 'harness', 'usage', 'daily', '--days', '1', '--json']);

      const output = JSON.parse(logOutput.join(''));
      expect(output).toHaveLength(1);
    });

    it('outputs empty array when no data exists', async () => {
      fs.unlinkSync(costsFile);
      const program = createProgram();
      await program.parseAsync(['node', 'harness', 'usage', 'daily', '--json']);

      const output = JSON.parse(logOutput.join(''));
      expect(output).toEqual([]);
    });
  });

  describe('sessions', () => {
    it('outputs JSON array of sessions when --json is passed', async () => {
      const program = createProgram();
      await program.parseAsync(['node', 'harness', 'usage', 'sessions', '--json']);

      const output = JSON.parse(logOutput.join(''));
      expect(Array.isArray(output)).toBe(true);
      // 3 distinct sessions in sample data
      expect(output).toHaveLength(3);
      expect(output[0]).toHaveProperty('sessionId');
      expect(output[0]).toHaveProperty('tokens');
      expect(output[0]).toHaveProperty('firstTimestamp');
    });

    it('limits sessions with --limit flag', async () => {
      const program = createProgram();
      await program.parseAsync(['node', 'harness', 'usage', 'sessions', '--limit', '2', '--json']);

      const output = JSON.parse(logOutput.join(''));
      expect(output).toHaveLength(2);
    });
  });
});
