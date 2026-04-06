import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAnalyze = vi.fn();

vi.mock('@harness-engineering/core', async () => {
  const actual = await vi.importActual<typeof import('@harness-engineering/core')>(
    '@harness-engineering/core'
  );
  return {
    ...actual,
    EntropyAnalyzer: class MockEntropyAnalyzer {
      analyze = mockAnalyze;
    },
  };
});

import { gatherHealth } from '../../../src/server/gather/health';

describe('gatherHealth', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns health data when analysis succeeds', async () => {
    const mockReport = {
      summary: {
        totalIssues: 5,
        errors: 2,
        warnings: 3,
        fixableCount: 1,
        suggestionCount: 4,
      },
      analysisErrors: [],
      duration: 123,
    };

    mockAnalyze.mockResolvedValue({ ok: true, value: mockReport });

    const result = await gatherHealth('/project');

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    expect(result.totalIssues).toBe(5);
    expect(result.errors).toBe(2);
    expect(result.warnings).toBe(3);
    expect(result.fixableCount).toBe(1);
    expect(result.suggestionCount).toBe(4);
    expect(result.durationMs).toBe(123);
  });

  it('returns error when analysis fails', async () => {
    mockAnalyze.mockResolvedValue({ ok: false, error: { message: 'Config invalid' } });

    const result = await gatherHealth('/project');

    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toContain('Config invalid');
  });

  it('returns error when analyzer throws', async () => {
    mockAnalyze.mockRejectedValue(new Error('Unexpected crash'));

    const result = await gatherHealth('/project');

    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toContain('Unexpected crash');
  });

  it('includes analysis error names in result', async () => {
    const mockReport = {
      summary: {
        totalIssues: 0,
        errors: 0,
        warnings: 0,
        fixableCount: 0,
        suggestionCount: 0,
      },
      analysisErrors: [{ analyzer: 'drift', error: { message: 'drift failed' } }],
      duration: 50,
    };

    mockAnalyze.mockResolvedValue({ ok: true, value: mockReport });

    const result = await gatherHealth('/project');

    if ('error' in result) return;
    expect(result.analysisErrors).toEqual(['drift']);
  });
});
