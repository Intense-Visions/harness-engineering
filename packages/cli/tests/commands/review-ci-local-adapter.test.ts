import { describe, it, expect, vi, beforeEach } from 'vitest';

const { providerCtor, analyzeMock } = vi.hoisted(() => {
  const analyzeMock = vi.fn();
  const providerCtor = vi.fn(function (this: Record<string, unknown>, opts: unknown) {
    this._opts = opts;
    this.analyze = analyzeMock;
  });
  return { providerCtor, analyzeMock };
});

vi.mock('@harness-engineering/intelligence', () => ({
  OpenAICompatibleAnalysisProvider: providerCtor,
}));

import { createLocalInvoke } from '../../src/commands/review-ci-local-adapter';

describe('createLocalInvoke', () => {
  beforeEach(() => {
    providerCtor.mockClear();
    analyzeMock.mockReset();
    analyzeMock.mockResolvedValue({
      result: {
        assessment: 'request-changes',
        findings: [
          {
            id: 'f1',
            file: 'src/a.ts',
            lineRange: [1, 2],
            domain: 'bug',
            severity: 'critical',
            title: 'boom',
            rationale: 'because',
            evidence: ['src/a.ts:1'],
          },
        ],
      },
      tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      model: 'm',
      latencyMs: 1,
    });
  });

  it('constructs the provider with baseUrl=endpoint and defaultModel=model', async () => {
    const invoke = createLocalInvoke();
    await invoke({ endpoint: 'http://x/v1', model: 'm', instruction: 'review', diff: 'DIFF' });
    expect(providerCtor).toHaveBeenCalledTimes(1);
    const opts = providerCtor.mock.calls[0]![0] as { baseUrl: string; defaultModel: string };
    expect(opts.baseUrl).toBe('http://x/v1');
    expect(opts.defaultModel).toBe('m');
  });

  it('calls analyze with a prompt containing the instruction and diff plus a responseSchema', async () => {
    const invoke = createLocalInvoke();
    await invoke({
      endpoint: 'http://x/v1',
      model: 'm',
      instruction: 'REVIEW_INSTR',
      diff: 'THE_DIFF',
    });
    expect(analyzeMock).toHaveBeenCalledTimes(1);
    const req = analyzeMock.mock.calls[0]![0] as { prompt: string; responseSchema: unknown };
    expect(req.prompt).toContain('REVIEW_INSTR');
    expect(req.prompt).toContain('THE_DIFF');
    expect(req.responseSchema).toBeDefined();
  });

  it('returns a parseLocalVerdict-compatible JSON string ({assessment, findings})', async () => {
    const invoke = createLocalInvoke();
    const raw = await invoke({
      endpoint: 'http://x/v1',
      model: 'm',
      instruction: 'review',
      diff: 'DIFF',
    });
    expect(typeof raw).toBe('string');
    const parsed = JSON.parse(raw);
    expect(parsed).toMatchObject({ assessment: 'request-changes' });
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.findings[0]).toMatchObject({ id: 'f1', domain: 'bug', severity: 'critical' });
  });

  it('rejects a non-http(s) endpoint with a clear error (no provider construction)', async () => {
    const invoke = createLocalInvoke();
    await expect(
      invoke({ endpoint: 'ftp://x/v1', model: 'm', instruction: 'r', diff: 'd' })
    ).rejects.toThrow(/HARNESS_LOCAL_ENDPOINT.*http/);
    expect(providerCtor).not.toHaveBeenCalled();
  });

  it('permits a localhost http endpoint', async () => {
    const invoke = createLocalInvoke();
    await expect(
      invoke({ endpoint: 'http://localhost:1234/v1', model: 'm', instruction: 'r', diff: 'd' })
    ).resolves.toBeTypeOf('string');
  });

  it('propagates a provider failure as a rejection (surfaces as a runner failure, not a silent pass)', async () => {
    analyzeMock.mockReset();
    analyzeMock.mockRejectedValue(
      new Error('connection refused to https://internal/api?token=SECRET')
    );
    const invoke = createLocalInvoke();
    const err = await invoke({
      endpoint: 'http://x/v1',
      model: 'm',
      instruction: 'r',
      diff: 'd',
    }).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    // The surfaced message is sanitized: no URL/secret context, length-capped.
    expect(err.message).not.toMatch(/https?:\/\//);
    expect(err.message).not.toContain('SECRET');
    expect(err.message.length).toBeLessThanOrEqual(220);
    expect(err.message).toMatch(/local runner/i);
  });
});
