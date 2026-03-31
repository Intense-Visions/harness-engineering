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
          ...(e.cacheCreationTokens != null
            ? { cache_creation_tokens: e.cacheCreationTokens }
            : {}),
          ...(e.cacheReadTokens != null ? { cache_read_tokens: e.cacheReadTokens } : {}),
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

  describe('session <id>', () => {
    it('outputs JSON detail for a valid session', async () => {
      const program = createProgram();
      await program.parseAsync(['node', 'harness', 'usage', 'session', 'sess-bbb-222', '--json']);

      const output = JSON.parse(logOutput.join(''));
      expect(output.sessionId).toBe('sess-bbb-222');
      expect(output.tokens.inputTokens).toBe(500);
      expect(output.tokens.outputTokens).toBe(200);
    });

    it('returns error with suggestions for invalid session', async () => {
      const program = createProgram();
      await program.parseAsync(['node', 'harness', 'usage', 'session', 'sess-aaa', '--json']);

      const output = JSON.parse(logOutput.join(''));
      expect(output).toHaveProperty('error');
      expect(output.suggestions).toContain('sess-aaa-111');
    });

    it('returns error with empty suggestions for completely unknown id', async () => {
      const program = createProgram();
      await program.parseAsync([
        'node',
        'harness',
        'usage',
        'session',
        'nonexistent-xyz',
        '--json',
      ]);

      const output = JSON.parse(logOutput.join(''));
      expect(output.error).toContain('not found');
      expect(output.suggestions).toEqual([]);
    });

    it('includes cache tokens in detail view', async () => {
      const program = createProgram();
      await program.parseAsync(['node', 'harness', 'usage', 'session', 'sess-ccc-333', '--json']);

      const output = JSON.parse(logOutput.join(''));
      expect(output.cacheReadTokens).toBe(100);
      expect(output.cacheCreationTokens).toBe(50);
    });
  });

  describe('latest', () => {
    it('outputs JSON for the most recent session', async () => {
      const program = createProgram();
      await program.parseAsync(['node', 'harness', 'usage', 'latest', '--json']);

      const output = JSON.parse(logOutput.join(''));
      // Most recent by timestamp should be sess-bbb-222 (2026-03-31)
      expect(output.sessionId).toBe('sess-bbb-222');
    });

    it('returns error when no data exists', async () => {
      fs.unlinkSync(costsFile);
      const program = createProgram();
      await program.parseAsync(['node', 'harness', 'usage', 'latest', '--json']);

      const output = JSON.parse(logOutput.join(''));
      expect(output).toHaveProperty('error');
    });
  });

  describe('edge cases', () => {
    it('handles malformed JSONL lines without crashing', async () => {
      fs.writeFileSync(
        costsFile,
        'bad line\n' +
          makeSampleJSONL([
            {
              timestamp: '2026-03-31T10:00:00.000Z',
              session_id: 'sess-ok',
              input_tokens: 100,
              output_tokens: 50,
            },
          ])
      );

      const program = createProgram();
      await program.parseAsync(['node', 'harness', 'usage', 'sessions', '--json']);

      const output = JSON.parse(logOutput.join(''));
      expect(output).toHaveLength(1);
      expect(output[0].sessionId).toBe('sess-ok');
    });

    it('handles legacy entries without model as unknown cost', async () => {
      fs.writeFileSync(
        costsFile,
        makeSampleJSONL([
          {
            timestamp: '2026-03-31T10:00:00.000Z',
            session_id: 'sess-legacy',
            input_tokens: 1000,
            output_tokens: 500,
          },
        ])
      );

      const program = createProgram();
      await program.parseAsync(['node', 'harness', 'usage', 'session', 'sess-legacy', '--json']);

      const output = JSON.parse(logOutput.join(''));
      expect(output.costMicroUSD).toBeNull();
    });

    it('accepts --include-claude-sessions flag without error', async () => {
      const program = createProgram();
      await program.parseAsync([
        'node',
        'harness',
        'usage',
        '--include-claude-sessions',
        'daily',
        '--json',
      ]);

      // Filter out warning lines to find the JSON output
      const jsonLine = logOutput.find((line) => line.startsWith('['));
      const output = JSON.parse(jsonLine ?? '[]');
      expect(Array.isArray(output)).toBe(true);
    });
  });
});
