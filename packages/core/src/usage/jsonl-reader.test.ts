import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readCostRecords } from './jsonl-reader';

describe('readCostRecords', () => {
  const tmpDir = path.join(__dirname, '__test-tmp__');
  const costsFile = path.join(tmpDir, '.harness', 'metrics', 'costs.jsonl');

  beforeEach(() => {
    fs.mkdirSync(path.dirname(costsFile), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('normalizes snake_case hook output to camelCase UsageRecord', () => {
    const line = JSON.stringify({
      timestamp: '2026-03-31T10:00:00.000Z',
      session_id: 'sess-1',
      token_usage: { input_tokens: 100, output_tokens: 50 },
    });
    fs.writeFileSync(costsFile, line + '\n');

    const records = readCostRecords(tmpDir);
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({
      sessionId: 'sess-1',
      timestamp: '2026-03-31T10:00:00.000Z',
      tokens: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
  });

  it('includes cache tokens when present', () => {
    const line = JSON.stringify({
      timestamp: '2026-03-31T10:00:00.000Z',
      session_id: 'sess-2',
      token_usage: { input_tokens: 200, output_tokens: 100 },
      cacheCreationTokens: 50,
      cacheReadTokens: 30,
    });
    fs.writeFileSync(costsFile, line + '\n');

    const records = readCostRecords(tmpDir);
    expect(records[0].cacheCreationTokens).toBe(50);
    expect(records[0].cacheReadTokens).toBe(30);
  });

  it('skips malformed lines with warning', () => {
    const good = JSON.stringify({
      timestamp: '2026-03-31T10:00:00.000Z',
      session_id: 'sess-3',
      token_usage: { input_tokens: 10, output_tokens: 5 },
    });
    fs.writeFileSync(costsFile, 'not json\n' + good + '\n');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const records = readCostRecords(tmpDir);
    expect(records).toHaveLength(1);
    expect(records[0].sessionId).toBe('sess-3');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping malformed'));
    warnSpy.mockRestore();
  });

  it('handles legacy entries without cache/model fields', () => {
    const line = JSON.stringify({
      timestamp: '2026-03-31T10:00:00.000Z',
      session_id: 'sess-4',
      token_usage: { input_tokens: 500, output_tokens: 200 },
    });
    fs.writeFileSync(costsFile, line + '\n');

    const records = readCostRecords(tmpDir);
    expect(records[0].model).toBeUndefined();
    expect(records[0].cacheCreationTokens).toBeUndefined();
    expect(records[0].cacheReadTokens).toBeUndefined();
  });

  it('returns empty array when file does not exist', () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const records = readCostRecords(tmpDir);
    expect(records).toEqual([]);
  });

  it('handles entries with null token_usage gracefully', () => {
    const line = JSON.stringify({
      timestamp: '2026-03-31T10:00:00.000Z',
      session_id: 'sess-5',
      token_usage: null,
    });
    fs.writeFileSync(costsFile, line + '\n');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const records = readCostRecords(tmpDir);
    expect(records).toHaveLength(0);
    warnSpy.mockRestore();
  });
});
