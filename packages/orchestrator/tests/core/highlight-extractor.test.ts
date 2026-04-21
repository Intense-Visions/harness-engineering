import { describe, it, expect } from 'vitest';
import { extractHighlights, renderPRComment } from '../../src/core/highlight-extractor';

function makeLine(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

describe('extractHighlights', () => {
  it('extracts file write events from call lines containing Write', () => {
    const jsonl = [
      makeLine({ type: 'session_start', issueId: '1', startedAt: '2026-04-21T10:00:00Z' }),
      makeLine({
        type: 'call',
        timestamp: '2026-04-21T10:05:00Z',
        content: 'Calling Write(src/utils.ts)',
      }),
      makeLine({ type: 'session_end', timestamp: '2026-04-21T10:30:00Z', outcome: 'normal' }),
    ].join('\n');

    const highlights = extractHighlights(jsonl);
    expect(highlights.some((h) => h.category === 'file_op')).toBe(true);
    expect(highlights.some((h) => h.summary.includes('src/utils.ts'))).toBe(true);
  });

  it('extracts Edit events as file operations', () => {
    const jsonl = [
      makeLine({ type: 'session_start', issueId: '1', startedAt: '2026-04-21T10:00:00Z' }),
      makeLine({
        type: 'call',
        timestamp: '2026-04-21T10:05:00Z',
        content: 'Calling Edit(src/index.ts)',
      }),
      makeLine({ type: 'session_end', timestamp: '2026-04-21T10:30:00Z', outcome: 'normal' }),
    ].join('\n');

    const highlights = extractHighlights(jsonl);
    expect(highlights.some((h) => h.category === 'file_op')).toBe(true);
  });

  it('extracts test runs from Bash calls with test commands', () => {
    const jsonl = [
      makeLine({ type: 'session_start', issueId: '1', startedAt: '2026-04-21T10:00:00Z' }),
      makeLine({
        type: 'call',
        timestamp: '2026-04-21T10:10:00Z',
        content: 'Calling Bash(npx vitest run tests/foo.test.ts)',
      }),
      makeLine({
        type: 'result',
        timestamp: '2026-04-21T10:10:05Z',
        content: '5 passed, 0 failed',
      }),
      makeLine({ type: 'session_end', timestamp: '2026-04-21T10:30:00Z', outcome: 'normal' }),
    ].join('\n');

    const highlights = extractHighlights(jsonl);
    expect(highlights.some((h) => h.category === 'test')).toBe(true);
  });

  it('extracts git operations from call lines with git commit', () => {
    const jsonl = [
      makeLine({ type: 'session_start', issueId: '1', startedAt: '2026-04-21T10:00:00Z' }),
      makeLine({
        type: 'call',
        timestamp: '2026-04-21T10:20:00Z',
        content: 'Calling Bash(git commit -m "feat: add helpers")',
      }),
      makeLine({ type: 'session_end', timestamp: '2026-04-21T10:30:00Z', outcome: 'normal' }),
    ].join('\n');

    const highlights = extractHighlights(jsonl);
    expect(highlights.some((h) => h.category === 'git')).toBe(true);
  });

  it('extracts completion event from session_end', () => {
    const jsonl = [
      makeLine({ type: 'session_start', issueId: '1', startedAt: '2026-04-21T10:00:00Z' }),
      makeLine({ type: 'session_end', timestamp: '2026-04-21T10:30:00Z', outcome: 'normal' }),
    ].join('\n');

    const highlights = extractHighlights(jsonl);
    expect(highlights.some((h) => h.category === 'completion')).toBe(true);
  });

  it('returns top 5 diverse moments', () => {
    const lines = [
      makeLine({ type: 'session_start', issueId: '1', startedAt: '2026-04-21T10:00:00Z' }),
    ];

    // Add many file ops
    for (let i = 0; i < 10; i++) {
      lines.push(
        makeLine({
          type: 'call',
          timestamp: `2026-04-21T10:0${i}:00Z`,
          content: `Calling Write(src/file${i}.ts)`,
        })
      );
    }
    lines.push(
      makeLine({
        type: 'call',
        timestamp: '2026-04-21T10:15:00Z',
        content: 'Calling Bash(npx vitest run)',
      })
    );
    lines.push(
      makeLine({
        type: 'call',
        timestamp: '2026-04-21T10:20:00Z',
        content: 'Calling Bash(git commit -m "feat: stuff")',
      })
    );
    lines.push(
      makeLine({ type: 'session_end', timestamp: '2026-04-21T10:30:00Z', outcome: 'normal' })
    );

    const highlights = extractHighlights(lines.join('\n'));
    expect(highlights.length).toBeLessThanOrEqual(5);

    // Should have diversity
    const categories = new Set(highlights.map((h) => h.category));
    expect(categories.size).toBeGreaterThanOrEqual(3);
  });

  it('returns empty array for empty JSONL', () => {
    expect(extractHighlights('')).toEqual([]);
  });
});

describe('renderPRComment', () => {
  it('renders summary table with metrics', () => {
    const comment = renderPRComment(
      {
        durationMs: 1812000,
        inputTokens: 50000,
        outputTokens: 12000,
        turnCount: 8,
        toolsCalled: ['Read', 'Write', 'Bash'],
        filesTouched: ['src/index.ts', 'src/utils.ts'],
      },
      [
        {
          timestamp: '2026-04-21T10:05:00Z',
          summary: 'Created src/utils.ts',
          category: 'file_op' as const,
        },
        {
          timestamp: '2026-04-21T10:30:00Z',
          summary: 'Agent completed successfully',
          category: 'completion' as const,
        },
      ],
      'orchestrator-1'
    );

    expect(comment).toContain('Agent Session Summary');
    expect(comment).toContain('Duration');
    expect(comment).toContain('Tokens');
    expect(comment).toContain('Key Moments');
    expect(comment).toContain('Created src/utils.ts');
  });
});
