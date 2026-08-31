import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { EventEmitter } from 'node:events';

// Build a fake ChildProcess using plain EventEmitters for stdout/stderr, with a
// stdin that records what was written (so we can assert the stdin-fed dialect).
function makeFakeChild() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  };
  child.stdout = stdout;
  child.stderr = stderr;
  child.stdin = { write: vi.fn(), end: vi.fn() } as unknown as typeof child.stdin;
  return child;
}

const mockSpawn = vi.fn<(...args: unknown[]) => ReturnType<typeof makeFakeChild>>();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

import {
  GenericCliAnalysisProvider,
  createCliAnalysisProvider,
  buildCustomCliTemplate,
  textSalvageParser,
  jsonEnvelopeParser,
  codexCliTemplate,
  geminiCliTemplate,
} from '../../src/analysis-provider/generic-cli.js';

const testSchema = z.object({
  summary: z.string(),
  score: z.number(),
});

/** Queue a spawn that emits `stdout` on its own child AFTER listeners attach. */
function queueChild(stdout: string, exitCode = 0, stderr = ''): ReturnType<typeof makeFakeChild> {
  const child = makeFakeChild();
  mockSpawn.mockImplementationOnce(() => {
    setTimeout(() => {
      if (stdout) child.stdout.emit('data', Buffer.from(stdout));
      if (stderr) child.stderr.emit('data', Buffer.from(stderr));
      child.emit('exit', exitCode);
    }, 0);
    return child;
  });
  return child;
}

describe('GenericCliAnalysisProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('construction guards', () => {
    it('throws without a command', () => {
      expect(
        () => new GenericCliAnalysisProvider({ command: '', argTemplate: () => ({ args: [] }) })
      ).toThrow(/requires a `command`/);
    });
    it('throws without an argTemplate function', () => {
      expect(
        () =>
          new GenericCliAnalysisProvider({
            command: 'codex',
            argTemplate: undefined as never,
          })
      ).toThrow(/requires an `argTemplate`/);
    });
  });

  describe('successful analysis (text-salvage default parser)', () => {
    it('salvages an embedded JSON object from prose stdout and reports latency', async () => {
      queueChild(`Sure! Here is the result:\n${JSON.stringify({ summary: 'ok', score: 0.5 })}\n`);
      const provider = new GenericCliAnalysisProvider({
        command: 'codex',
        argTemplate: codexCliTemplate,
      });
      const res = await provider.analyze({ prompt: 'analyze', responseSchema: testSchema });
      expect(res.result).toEqual({ summary: 'ok', score: 0.5 });
      expect(res.latencyMs).toBeGreaterThanOrEqual(0);
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it('parses whole-stdout JSON', async () => {
      queueChild(JSON.stringify({ summary: 'direct', score: 0.9 }));
      const provider = new GenericCliAnalysisProvider({
        command: 'gemini',
        argTemplate: geminiCliTemplate,
      });
      const res = await provider.analyze({ prompt: 'x', responseSchema: testSchema });
      expect(res.result).toEqual({ summary: 'direct', score: 0.9 });
    });

    it('labels the model as the command when nothing else names one', async () => {
      queueChild(JSON.stringify({ summary: 'ok', score: 1 }));
      const provider = new GenericCliAnalysisProvider({
        command: 'gemini',
        argTemplate: geminiCliTemplate,
      });
      const res = await provider.analyze({ prompt: 'x', responseSchema: testSchema });
      expect(res.model).toBe('gemini');
    });

    it('uses an explicit modelLabel when provided', async () => {
      queueChild(JSON.stringify({ summary: 'ok', score: 1 }));
      const provider = new GenericCliAnalysisProvider({
        command: 'gemini',
        argTemplate: geminiCliTemplate,
        modelLabel: 'gemini-2.5-pro',
      });
      const res = await provider.analyze({ prompt: 'x', responseSchema: testSchema });
      expect(res.model).toBe('gemini-2.5-pro');
    });
  });

  describe('codex/gemini arg dialects', () => {
    it('codex: `exec`, model via -m, schema folded into positional prompt', async () => {
      queueChild(JSON.stringify({ summary: 'ok', score: 1 }));
      const provider = new GenericCliAnalysisProvider({
        command: 'codex',
        argTemplate: codexCliTemplate,
      });
      await provider.analyze({
        prompt: 'REVIEW',
        responseSchema: testSchema,
        model: 'gpt-5-codex',
      });
      const [cmd, args] = mockSpawn.mock.calls[0] as [string, string[]];
      expect(cmd).toBe('codex');
      expect(args[0]).toBe('exec');
      expect(args).toContain('-m');
      expect(args).toContain('gpt-5-codex');
      const positional = args[args.length - 1]!;
      expect(positional).toContain('REVIEW');
      expect(positional).toContain('JSON schema'); // schema instruction folded in
    });

    it('gemini: prompt via -p, model via -m', async () => {
      queueChild(JSON.stringify({ summary: 'ok', score: 1 }));
      const provider = new GenericCliAnalysisProvider({
        command: 'gemini',
        argTemplate: geminiCliTemplate,
        defaultModel: 'gemini-2.5-flash',
      });
      await provider.analyze({ prompt: 'SUMMARIZE', responseSchema: testSchema });
      const args = mockSpawn.mock.calls[0]![1] as string[];
      expect(args[0]).toBe('-p');
      expect(args[1]).toContain('SUMMARIZE');
      expect(args).toContain('-m');
      expect(args).toContain('gemini-2.5-flash');
    });

    it('omits the model flag when no model is set', async () => {
      queueChild(JSON.stringify({ summary: 'ok', score: 1 }));
      const provider = new GenericCliAnalysisProvider({
        command: 'codex',
        argTemplate: codexCliTemplate,
      });
      await provider.analyze({ prompt: 'x', responseSchema: testSchema });
      const args = mockSpawn.mock.calls[0]![1] as string[];
      expect(args).not.toContain('-m');
    });
  });

  describe('custom placeholder template', () => {
    it('substitutes {{prompt}}/{{schema}}/{{model}} in argv', async () => {
      queueChild(JSON.stringify({ summary: 'ok', score: 1 }));
      const provider = new GenericCliAnalysisProvider({
        command: 'myagent',
        argTemplate: buildCustomCliTemplate({
          args: ['run', '--model', '{{model}}', '--prompt', '{{prompt}}'],
        }),
      });
      await provider.analyze({ prompt: 'HELLO', responseSchema: testSchema, model: 'm1' });
      const args = mockSpawn.mock.calls[0]![1] as string[];
      expect(args.slice(0, 4)).toEqual(['run', '--model', 'm1', '--prompt']);
      expect(args[4]).toContain('HELLO');
    });

    it('drops a bare {{model}} token when no model is set', async () => {
      queueChild(JSON.stringify({ summary: 'ok', score: 1 }));
      const provider = new GenericCliAnalysisProvider({
        command: 'myagent',
        argTemplate: buildCustomCliTemplate({ args: ['run', '{{model}}', '{{prompt}}'] }),
      });
      await provider.analyze({ prompt: 'HELLO', responseSchema: testSchema });
      const args = mockSpawn.mock.calls[0]![1] as string[];
      expect(args[0]).toBe('run');
      expect(args[1]).toContain('HELLO'); // model token dropped, prompt shifted up
    });

    it('feeds the prompt via stdin when promptVia=stdin', async () => {
      const child = queueChild(JSON.stringify({ summary: 'ok', score: 1 }));
      const provider = new GenericCliAnalysisProvider({
        command: 'myagent',
        argTemplate: buildCustomCliTemplate({ args: ['run', '--stdin'], promptVia: 'stdin' }),
      });
      await provider.analyze({ prompt: 'PIPED', responseSchema: testSchema });
      const args = mockSpawn.mock.calls[0]![1] as string[];
      expect(args).toEqual(['run', '--stdin']);
      const written = (child.stdin.write as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(written).toContain('PIPED');
    });
  });

  describe('mechanical structured-output recovery', () => {
    it('fires ONE corrective retry when the first reply is bare prose', async () => {
      queueChild('I already answered that above, nothing structured here.');
      queueChild(JSON.stringify({ summary: 'recovered', score: 0.7 }));
      const provider = new GenericCliAnalysisProvider({
        command: 'gemini',
        argTemplate: geminiCliTemplate,
      });
      const res = await provider.analyze({ prompt: 'x', responseSchema: testSchema });
      expect(res.result).toEqual({ summary: 'recovered', score: 0.7 });
      expect(mockSpawn).toHaveBeenCalledTimes(2);
      // The retry prompt shows the model its own rejected output.
      const retryArgs = mockSpawn.mock.calls[1]![1] as string[];
      const retryPrompt = retryArgs[retryArgs.indexOf('-p') + 1]!;
      expect(retryPrompt).toContain('YOUR PREVIOUS REPLY WAS REJECTED');
    });

    it('throws after one corrective retry still fails (bounded, never loops)', async () => {
      queueChild('still prose');
      queueChild('more prose');
      const provider = new GenericCliAnalysisProvider({
        command: 'gemini',
        argTemplate: geminiCliTemplate,
      });
      await expect(provider.analyze({ prompt: 'x', responseSchema: testSchema })).rejects.toThrow(
        /after one corrective retry/
      );
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('throws when the CLI exits non-zero, including stderr', async () => {
      queueChild('', 1, 'codex: not authenticated');
      const provider = new GenericCliAnalysisProvider({
        command: 'codex',
        argTemplate: codexCliTemplate,
      });
      await expect(provider.analyze({ prompt: 'x', responseSchema: testSchema })).rejects.toThrow(
        /codex CLI exited with code 1: codex: not authenticated/
      );
    });

    it('throws on spawn error (binary not found)', async () => {
      const child = makeFakeChild();
      mockSpawn.mockImplementationOnce(() => {
        setTimeout(() => child.emit('error', new Error('spawn codex ENOENT')), 0);
        return child;
      });
      const provider = new GenericCliAnalysisProvider({
        command: 'codex',
        argTemplate: codexCliTemplate,
      });
      await expect(provider.analyze({ prompt: 'x', responseSchema: testSchema })).rejects.toThrow(
        /codex CLI failed to spawn/
      );
    });

    it('json parse mode surfaces non-JSON stdout as a real failure', async () => {
      queueChild('total garbage, not json');
      const provider = new GenericCliAnalysisProvider({
        command: 'myagent',
        argTemplate: buildCustomCliTemplate({ args: ['{{prompt}}'] }),
        outputParser: jsonEnvelopeParser,
      });
      await expect(provider.analyze({ prompt: 'x', responseSchema: testSchema })).rejects.toThrow(
        /Failed to parse myagent CLI output/
      );
    });
  });
});

describe('createCliAnalysisProvider', () => {
  it('builds a codex provider', () => {
    const p = createCliAnalysisProvider({ vendor: 'codex', command: 'codex' });
    expect(p).toBeInstanceOf(GenericCliAnalysisProvider);
  });
  it('builds a gemini provider', () => {
    const p = createCliAnalysisProvider({ vendor: 'gemini', command: 'gemini' });
    expect(p).toBeInstanceOf(GenericCliAnalysisProvider);
  });
  it('builds a custom provider from a template spec', () => {
    const p = createCliAnalysisProvider({
      vendor: 'custom',
      command: 'myagent',
      custom: { args: ['run', '{{prompt}}'], parse: 'json' },
    });
    expect(p).toBeInstanceOf(GenericCliAnalysisProvider);
  });
  it('throws when vendor=custom but no custom spec is given', () => {
    expect(() => createCliAnalysisProvider({ vendor: 'custom', command: 'myagent' })).toThrow(
      /requires a `custom` template spec/
    );
  });
});

describe('output parsers (pure)', () => {
  it('textSalvageParser prefers whole JSON, then salvages, then returns raw prose (never throws)', () => {
    expect(textSalvageParser('{"a":1}').content).toEqual({ a: 1 });
    expect(textSalvageParser('noise {"a":2} tail').content).toEqual({ a: 2 });
    expect(textSalvageParser('pure prose').content).toBe('pure prose');
  });
  it('jsonEnvelopeParser coerces structured_output and surfaces usage/model', () => {
    const r = jsonEnvelopeParser(
      JSON.stringify({
        structured_output: { a: 1 },
        usage: { input_tokens: 3, output_tokens: 4 },
        model: 'gpt-5',
      })
    );
    expect(r.content).toEqual({ a: 1 });
    expect(r.usage).toEqual({ input_tokens: 3, output_tokens: 4 });
    expect(r.model).toBe('gpt-5');
  });
  it('jsonEnvelopeParser throws on non-JSON', () => {
    expect(() => jsonEnvelopeParser('nope')).toThrow();
  });
});
