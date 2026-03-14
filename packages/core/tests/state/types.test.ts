// packages/core/tests/state/types.test.ts
import { describe, it, expect } from 'vitest';
import {
  HarnessStateSchema,
  FailureEntrySchema,
  HandoffSchema,
  GateResultSchema,
  GateConfigSchema,
} from '../../src/state/types';

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

describe('FailureEntrySchema', () => {
  it('should parse a valid failure entry', () => {
    const entry = {
      date: '2026-03-14',
      skill: 'harness-tdd',
      type: 'dead-end',
      description: 'Attempted X, failed because Y',
    };
    const result = FailureEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  it('should reject entry missing required fields', () => {
    const result = FailureEntrySchema.safeParse({ date: '2026-03-14' });
    expect(result.success).toBe(false);
  });
});

describe('HandoffSchema', () => {
  it('should parse a valid handoff', () => {
    const handoff = {
      timestamp: '2026-03-14T10:30:00Z',
      fromSkill: 'harness-execution',
      phase: 'EXECUTE',
      summary: 'Completed tasks 1-3 of 5',
      completed: ['Task 1', 'Task 2', 'Task 3'],
      pending: ['Task 4', 'Task 5'],
      concerns: [],
      decisions: [],
      blockers: [],
      contextKeywords: ['auth', 'middleware'],
    };
    const result = HandoffSchema.safeParse(handoff);
    expect(result.success).toBe(true);
  });

  it('should allow optional fields to be omitted', () => {
    const minimal = {
      timestamp: '2026-03-14T10:30:00Z',
      fromSkill: 'harness-planning',
      phase: 'VALIDATE',
      summary: 'Planning complete',
    };
    const result = HandoffSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });
});

describe('GateResultSchema', () => {
  it('should parse a gate result with checks', () => {
    const result = GateResultSchema.safeParse({
      passed: false,
      checks: [
        { name: 'test', passed: true, command: 'npm test' },
        { name: 'lint', passed: false, command: 'npx eslint .', output: '2 errors' },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('GateConfigSchema', () => {
  it('should parse a gate config with custom checks', () => {
    const result = GateConfigSchema.safeParse({
      checks: [{ name: 'test', command: 'npm test -- --coverage' }],
      trace: true,
    });
    expect(result.success).toBe(true);
  });

  it('should parse an empty config', () => {
    const result = GateConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('HarnessStateSchema lastSession extensions', () => {
  it('should parse state with extended lastSession fields', () => {
    const state = {
      schemaVersion: 1,
      position: { phase: 'execute', task: 'Task 3' },
      decisions: [],
      blockers: [],
      progress: { 'Task 1': 'complete', 'Task 2': 'complete' },
      lastSession: {
        date: '2026-03-14',
        summary: 'Completed Tasks 1-2',
        lastSkill: 'harness-execution',
        pendingTasks: ['Task 3', 'Task 4', 'Task 5'],
      },
    };
    const result = HarnessStateSchema.safeParse(state);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lastSession?.lastSkill).toBe('harness-execution');
      expect(result.data.lastSession?.pendingTasks).toEqual(['Task 3', 'Task 4', 'Task 5']);
    }
  });

  it('should parse state with original lastSession (no new fields)', () => {
    const state = {
      schemaVersion: 1,
      position: {},
      decisions: [],
      blockers: [],
      progress: {},
      lastSession: {
        date: '2026-03-14',
        summary: 'Did some work',
      },
    };
    const result = HarnessStateSchema.safeParse(state);
    expect(result.success).toBe(true);
  });
});
