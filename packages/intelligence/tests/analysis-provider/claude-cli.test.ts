import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { EventEmitter } from 'node:events';

// Build a fake ChildProcess using plain EventEmitters for stdout/stderr
function makeFakeChild() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { end: ReturnType<typeof vi.fn> };
  };
  child.stdout = stdout;
  child.stderr = stderr;
  child.stdin = { end: vi.fn() } as unknown as typeof child.stdin;
  return child;
}

const mockSpawn = vi.fn<(...args: unknown[]) => ReturnType<typeof makeFakeChild>>();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

import { ClaudeCliAnalysisProvider } from '../../src/analysis-provider/claude-cli.js';

const testSchema = z.object({
  summary: z.string(),
  score: z.number(),
});

describe('ClaudeCliAnalysisProvider', () => {
  let provider: ClaudeCliAnalysisProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ClaudeCliAnalysisProvider();
  });

  function setupChild(stdout: string, exitCode: number, stderr = '') {
    const child = makeFakeChild();
    mockSpawn.mockReturnValueOnce(child);

    // Use setTimeout(0) to ensure the provider has attached its listeners
    setTimeout(() => {
      if (stdout) child.stdout.emit('data', Buffer.from(stdout));
      if (stderr) child.stderr.emit('data', Buffer.from(stderr));
      child.emit('exit', exitCode);
    }, 0);

    return child;
  }

  describe('successful analysis', () => {
    it('returns parsed result with token usage and latency', async () => {
      const cliOutput = JSON.stringify({
        result: JSON.stringify({ summary: 'All clear', score: 0.9 }),
        usage: { input_tokens: 200, output_tokens: 80 },
        model: 'claude-sonnet-4-20250514',
      });
      setupChild(cliOutput, 0);

      const response = await provider.analyze({
        prompt: 'Analyze this',
        responseSchema: testSchema,
      });

      expect(response.result).toEqual({ summary: 'All clear', score: 0.9 });
      expect(response.tokenUsage).toEqual({
        inputTokens: 200,
        outputTokens: 80,
        totalTokens: 280,
      });
      expect(response.model).toBe('claude-sonnet-4-20250514');
      expect(response.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('handles result as object (not string)', async () => {
      const cliOutput = JSON.stringify({
        result: { summary: 'Direct object', score: 0.75 },
        usage: { input_tokens: 100, output_tokens: 50 },
        model: 'claude-haiku-35',
      });
      setupChild(cliOutput, 0);

      const response = await provider.analyze({
        prompt: 'test',
        responseSchema: testSchema,
      });

      expect(response.result).toEqual({ summary: 'Direct object', score: 0.75 });
    });

    it('handles response without result key (uses parsed directly)', async () => {
      const cliOutput = JSON.stringify({ summary: 'Bare object', score: 0.5 });
      setupChild(cliOutput, 0);

      const response = await provider.analyze({
        prompt: 'test',
        responseSchema: testSchema,
      });

      expect(response.result).toEqual({ summary: 'Bare object', score: 0.5 });
    });

    it('handles missing usage gracefully (defaults to 0)', async () => {
      const cliOutput = JSON.stringify({
        result: { summary: 'ok', score: 1 },
      });
      setupChild(cliOutput, 0);

      const response = await provider.analyze({
        prompt: 'test',
        responseSchema: testSchema,
      });

      expect(response.tokenUsage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      });
    });

    it('falls back to default model name when none in response', async () => {
      const cliOutput = JSON.stringify({
        result: { summary: 'ok', score: 1 },
      });
      setupChild(cliOutput, 0);

      const response = await provider.analyze({
        prompt: 'test',
        responseSchema: testSchema,
      });

      expect(response.model).toBe('claude');
    });
  });

  describe('request construction', () => {
    it('passes --print, -p, --output-format json, and --json-schema', async () => {
      const cliOutput = JSON.stringify({
        result: { summary: 'ok', score: 1 },
      });
      setupChild(cliOutput, 0);

      await provider.analyze({
        prompt: 'Analyze this',
        responseSchema: testSchema,
      });

      const args = mockSpawn.mock.calls[0][1] as string[];
      expect(args).toContain('--print');
      expect(args).toContain('-p');
      expect(args).toContain('--output-format');
      expect(args).toContain('json');
      expect(args).toContain('--json-schema');
    });

    it('combines system prompt with user prompt', async () => {
      const cliOutput = JSON.stringify({
        result: { summary: 'ok', score: 1 },
      });
      setupChild(cliOutput, 0);

      await provider.analyze({
        prompt: 'Analyze this code',
        systemPrompt: 'You are an expert.',
        responseSchema: testSchema,
      });

      const args = mockSpawn.mock.calls[0][1] as string[];
      const promptIndex = args.indexOf('-p');
      const prompt = args[promptIndex + 1];
      expect(prompt).toBe('You are an expert.\n\nAnalyze this code');
    });

    it('passes --model when model is specified', async () => {
      const cliOutput = JSON.stringify({
        result: { summary: 'ok', score: 1 },
      });
      setupChild(cliOutput, 0);

      await provider.analyze({
        prompt: 'test',
        responseSchema: testSchema,
        model: 'claude-opus-4-20250514',
      });

      const args = mockSpawn.mock.calls[0][1] as string[];
      expect(args).toContain('--model');
      expect(args).toContain('claude-opus-4-20250514');
    });

    it('omits --model when no model is specified and no default', async () => {
      const cliOutput = JSON.stringify({
        result: { summary: 'ok', score: 1 },
      });
      setupChild(cliOutput, 0);

      await provider.analyze({
        prompt: 'test',
        responseSchema: testSchema,
      });

      const args = mockSpawn.mock.calls[0][1] as string[];
      expect(args).not.toContain('--model');
    });

    it('uses custom command from constructor', async () => {
      const customProvider = new ClaudeCliAnalysisProvider({
        command: '/usr/local/bin/claude',
      });
      const cliOutput = JSON.stringify({
        result: { summary: 'ok', score: 1 },
      });
      setupChild(cliOutput, 0);

      await customProvider.analyze({
        prompt: 'test',
        responseSchema: testSchema,
      });

      expect(mockSpawn.mock.calls[0][0]).toBe('/usr/local/bin/claude');
    });

    it('uses defaultModel from constructor', async () => {
      const customProvider = new ClaudeCliAnalysisProvider({
        defaultModel: 'claude-haiku-35',
      });
      const cliOutput = JSON.stringify({
        result: { summary: 'ok', score: 1 },
        model: 'claude-haiku-35',
      });
      setupChild(cliOutput, 0);

      await customProvider.analyze({
        prompt: 'test',
        responseSchema: testSchema,
      });

      const args = mockSpawn.mock.calls[0][1] as string[];
      expect(args).toContain('--model');
      expect(args).toContain('claude-haiku-35');
    });

    it('calls stdin.end() to close input', async () => {
      const cliOutput = JSON.stringify({
        result: { summary: 'ok', score: 1 },
      });
      const child = setupChild(cliOutput, 0);

      await provider.analyze({
        prompt: 'test',
        responseSchema: testSchema,
      });

      expect(child.stdin.end).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('throws when CLI exits with non-zero code', async () => {
      setupChild('', 1, 'Error: model not found');

      await expect(
        provider.analyze({ prompt: 'test', responseSchema: testSchema })
      ).rejects.toThrow('Claude CLI exited with code 1');
    });

    it('includes stderr in error message', async () => {
      setupChild('', 2, 'permission denied');

      await expect(
        provider.analyze({ prompt: 'test', responseSchema: testSchema })
      ).rejects.toThrow('permission denied');
    });

    it('throws on spawn error (binary not found)', async () => {
      const child = makeFakeChild();
      mockSpawn.mockReturnValueOnce(child);

      setTimeout(() => {
        child.emit('error', new Error('spawn claude ENOENT'));
      }, 0);

      await expect(
        provider.analyze({ prompt: 'test', responseSchema: testSchema })
      ).rejects.toThrow('Claude CLI failed to spawn');
    });

    it('throws when CLI output is invalid JSON', async () => {
      setupChild('not valid json at all', 0);

      await expect(
        provider.analyze({ prompt: 'test', responseSchema: testSchema })
      ).rejects.toThrow('Failed to parse Claude CLI output');
    });

    it('throws ZodError when response does not match schema', async () => {
      const cliOutput = JSON.stringify({
        result: { summary: 999, score: 'wrong-type' },
      });
      setupChild(cliOutput, 0);

      await expect(
        provider.analyze({ prompt: 'test', responseSchema: testSchema })
      ).rejects.toThrow();
    });
  });
});
