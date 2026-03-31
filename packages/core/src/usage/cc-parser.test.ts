import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parseCCRecords } from './cc-parser';

function makeCCLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'assistant',
    sessionId: 'cc-sess-001',
    requestId: 'req-default-001',
    timestamp: '2026-03-31T10:00:00.000Z',
    message: {
      model: 'claude-sonnet-4-20250514',
      role: 'assistant',
      usage: {
        input_tokens: 1000,
        output_tokens: 200,
        cache_creation_input_tokens: 500,
        cache_read_input_tokens: 300,
      },
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'hello' }],
    },
    ...overrides,
  });
}

describe('parseCCRecords', () => {
  const tmpHome = path.join(__dirname, '__cc-test-home__');
  const projectDir = path.join(tmpHome, '.claude', 'projects', '-test-project');
  let originalHome: string | undefined;

  beforeEach(() => {
    originalHome = process.env.HOME;
    process.env.HOME = tmpHome;
    fs.mkdirSync(projectDir, { recursive: true });
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('parses assistant entries with usage into UsageRecords', () => {
    fs.writeFileSync(path.join(projectDir, 'session1.jsonl'), makeCCLine() + '\n');

    const records = parseCCRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      sessionId: 'cc-sess-001',
      model: 'claude-sonnet-4-20250514',
      tokens: { inputTokens: 1000, outputTokens: 200, totalTokens: 1200 },
      cacheCreationTokens: 500,
      cacheReadTokens: 300,
    });
    expect((records[0] as any)._source).toBe('claude-code');
  });

  it('skips non-assistant entries', () => {
    const lines =
      [
        JSON.stringify({
          type: 'user',
          message: { role: 'user', content: 'hi' },
          sessionId: 's1',
          timestamp: '2026-03-31T10:00:00Z',
        }),
        makeCCLine(),
      ].join('\n') + '\n';
    fs.writeFileSync(path.join(projectDir, 'session1.jsonl'), lines);

    const records = parseCCRecords();
    expect(records).toHaveLength(1);
  });

  it('skips entries without message.usage', () => {
    const noUsage = JSON.stringify({
      type: 'assistant',
      sessionId: 's1',
      timestamp: '2026-03-31T10:00:00Z',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
    });
    fs.writeFileSync(path.join(projectDir, 'session1.jsonl'), noUsage + '\n' + makeCCLine() + '\n');

    const records = parseCCRecords();
    expect(records).toHaveLength(1);
  });

  it('skips malformed JSON lines without throwing', () => {
    const content = 'not valid json\n' + makeCCLine() + '\n';
    fs.writeFileSync(path.join(projectDir, 'session1.jsonl'), content);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const records = parseCCRecords();
    expect(records).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping'));
    warnSpy.mockRestore();
  });

  it('returns empty array when .claude/projects does not exist', () => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.mkdirSync(tmpHome, { recursive: true });
    // Do not create .claude directory

    const records = parseCCRecords();
    expect(records).toEqual([]);
  });

  it('reads from multiple project directories and JSONL files', () => {
    const projectDir2 = path.join(tmpHome, '.claude', 'projects', '-other-project');
    fs.mkdirSync(projectDir2, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'a.jsonl'), makeCCLine({ sessionId: 'sess-a' }) + '\n');
    fs.writeFileSync(path.join(projectDir2, 'b.jsonl'), makeCCLine({ sessionId: 'sess-b' }) + '\n');

    const records = parseCCRecords();
    expect(records).toHaveLength(2);
    const ids = records.map((r) => r.sessionId).sort();
    expect(ids).toEqual(['sess-a', 'sess-b']);
  });

  it('deduplicates streaming chunks by requestId, keeping last entry', () => {
    // CC emits multiple assistant entries per API request (streaming chunks).
    // Each chunk carries the same requestId. The last chunk has the final output_tokens count.
    const chunk1 = JSON.stringify({
      type: 'assistant',
      sessionId: 'cc-sess-001',
      requestId: 'req-dup-001',
      timestamp: '2026-03-31T10:00:00.000Z',
      message: {
        model: 'claude-sonnet-4-20250514',
        role: 'assistant',
        usage: {
          input_tokens: 3,
          output_tokens: 36,
          cache_creation_input_tokens: 500,
          cache_read_input_tokens: 0,
        },
        stop_reason: null,
        content: [{ type: 'text', text: 'partial' }],
      },
    });
    const chunk2 = JSON.stringify({
      type: 'assistant',
      sessionId: 'cc-sess-001',
      requestId: 'req-dup-001',
      timestamp: '2026-03-31T10:00:01.000Z',
      message: {
        model: 'claude-sonnet-4-20250514',
        role: 'assistant',
        usage: {
          input_tokens: 3,
          output_tokens: 292,
          cache_creation_input_tokens: 500,
          cache_read_input_tokens: 0,
        },
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'complete response' }],
      },
    });
    const differentReq = JSON.stringify({
      type: 'assistant',
      sessionId: 'cc-sess-001',
      requestId: 'req-other-002',
      timestamp: '2026-03-31T10:01:00.000Z',
      message: {
        model: 'claude-sonnet-4-20250514',
        role: 'assistant',
        usage: { input_tokens: 100, output_tokens: 50 },
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'other' }],
      },
    });

    fs.writeFileSync(
      path.join(projectDir, 'session1.jsonl'),
      [chunk1, chunk2, differentReq].join('\n') + '\n'
    );

    const records = parseCCRecords();
    // Should have 2 records: one for req-dup-001 (last chunk) and one for req-other-002
    expect(records).toHaveLength(2);
    // The deduped record should have the final output_tokens (292, not 36)
    const dupRecord = records.find((r) => r.tokens.outputTokens === 292);
    expect(dupRecord).toBeDefined();
    expect(dupRecord!.tokens.inputTokens).toBe(3);
  });

  it('handles entries with zero or missing cache tokens', () => {
    const line = makeCCLine({
      message: {
        model: 'claude-sonnet-4-20250514',
        role: 'assistant',
        usage: { input_tokens: 50, output_tokens: 10 },
        stop_reason: 'end_turn',
        content: [],
      },
    });
    fs.writeFileSync(path.join(projectDir, 'session1.jsonl'), line + '\n');

    const records = parseCCRecords();
    expect(records).toHaveLength(1);
    expect(records[0]!.cacheCreationTokens).toBeUndefined();
    expect(records[0]!.cacheReadTokens).toBeUndefined();
  });
});
