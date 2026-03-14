// packages/core/tests/state/types.test.ts
import { describe, it, expect } from 'vitest';
import { HarnessStateSchema } from '../../src/state/types';

describe('HarnessStateSchema', () => {
  it('validates a complete state', () => {
    const result = HarnessStateSchema.safeParse({
      schemaVersion: 1,
      position: { phase: 'implementation', task: 'task-3' },
      decisions: [{ date: '2026-03-14', decision: 'Use Next.js', context: 'Framework choice' }],
      blockers: [],
      progress: { 'task-1': 'complete', 'task-2': 'in_progress' },
      lastSession: { date: '2026-03-14', summary: 'Completed template system' },
    });
    expect(result.success).toBe(true);
  });

  it('applies defaults for empty state', () => {
    // Note: lastSession is optional (deviation from spec — needed for default empty state)
    const result = HarnessStateSchema.parse({ schemaVersion: 1 });
    expect(result.position).toEqual({});
    expect(result.decisions).toEqual([]);
    expect(result.blockers).toEqual([]);
    expect(result.progress).toEqual({});
    expect(result.lastSession).toBeUndefined();
  });

  it('rejects invalid schema version', () => {
    const result = HarnessStateSchema.safeParse({ schemaVersion: 2 });
    expect(result.success).toBe(false);
  });
});
