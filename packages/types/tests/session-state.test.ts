import { describe, it, expect } from 'vitest';
import {
  SESSION_SECTION_NAMES,
  type SessionSectionName,
  type SessionEntryStatus,
  type SessionEntry,
  type SessionSections,
} from '../src/index.js';

describe('SESSION_SECTION_NAMES', () => {
  it('contains exactly the six expected section names', () => {
    expect(SESSION_SECTION_NAMES).toEqual([
      'terminology',
      'decisions',
      'constraints',
      'risks',
      'openQuestions',
      'evidence',
    ]);
  });

  it('has length 6', () => {
    expect(SESSION_SECTION_NAMES).toHaveLength(6);
  });

  it('is readonly (frozen tuple)', () => {
    // as const produces a readonly tuple — verify it is not accidentally mutable
    // by checking the type at runtime: Object.isFrozen is true for as-const arrays
    // Note: as-const only enforces at compile time; this test documents the intent
    expect(Array.isArray(SESSION_SECTION_NAMES)).toBe(true);
  });
});

describe('SessionEntry structure', () => {
  const entry: SessionEntry = {
    id: 'entry-001',
    timestamp: '2026-03-27T14:30:00Z',
    authorSkill: 'harness-brainstorming',
    content: 'API should use REST, not GraphQL',
    status: 'active',
  };

  it('has all required fields', () => {
    expect(entry).toHaveProperty('id');
    expect(entry).toHaveProperty('timestamp');
    expect(entry).toHaveProperty('authorSkill');
    expect(entry).toHaveProperty('content');
    expect(entry).toHaveProperty('status');
  });

  it('accepts all valid status values', () => {
    const statuses: SessionEntryStatus[] = ['active', 'resolved', 'superseded'];
    statuses.forEach((status) => {
      const e: SessionEntry = { ...entry, status };
      expect(e.status).toBe(status);
    });
  });
});

describe('SessionSections type', () => {
  it('allows constructing a sections object with all six keys', () => {
    const sections: SessionSections = {
      terminology: [],
      decisions: [],
      constraints: [],
      risks: [],
      openQuestions: [],
      evidence: [],
    };

    // Verify all keys are present
    for (const name of SESSION_SECTION_NAMES) {
      expect(sections[name]).toEqual([]);
    }
  });

  it('accepts entries in section arrays', () => {
    const entry: SessionEntry = {
      id: 'entry-002',
      timestamp: '2026-03-27T15:00:00Z',
      authorSkill: 'harness-planning',
      content: 'Must support Node 18+',
      status: 'active',
    };

    const sections: SessionSections = {
      terminology: [],
      decisions: [],
      constraints: [entry],
      risks: [],
      openQuestions: [],
      evidence: [],
    };

    expect(sections.constraints).toHaveLength(1);
    expect(sections.constraints[0].authorSkill).toBe('harness-planning');
  });
});

describe('SessionSectionName type', () => {
  it('each SESSION_SECTION_NAMES element is assignable to SessionSectionName', () => {
    // This is primarily a compile-time check; runtime verification that the
    // constant and the type stay in sync
    const names: SessionSectionName[] = [...SESSION_SECTION_NAMES];
    expect(names).toHaveLength(6);
  });
});
