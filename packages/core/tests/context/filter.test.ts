import { describe, it, expect } from 'vitest';
import { contextFilter, getPhaseCategories } from '../../src/context/filter';

describe('contextFilter', () => {
  it('returns implement phase categories with source first', () => {
    const result = contextFilter('implement');
    expect(result.phase).toBe('implement');
    expect(result.includedCategories[0]).toBe('source');
    expect(result.filePatterns).toContain('src/**/*.ts');
  });

  it('returns review phase categories with diff first', () => {
    const result = contextFilter('review');
    expect(result.phase).toBe('review');
    expect(result.includedCategories[0]).toBe('diff');
    expect(result.includedCategories).toContain('learnings');
  });

  it('returns debug phase with antipatterns included', () => {
    const result = contextFilter('debug');
    expect(result.includedCategories).toContain('antipatterns');
    expect(result.filePatterns).toContain('.harness/anti-patterns.md');
  });

  it('returns plan phase with specs and architecture first', () => {
    const result = contextFilter('plan');
    expect(result.includedCategories[0]).toBe('specs');
    expect(result.includedCategories[1]).toBe('architecture');
    expect(result.filePatterns).toContain('AGENTS.md');
  });

  it('limits categories when maxCategories is specified', () => {
    const result = contextFilter('implement', 2);
    expect(result.includedCategories).toHaveLength(2);
    expect(result.excludedCategories.length).toBeGreaterThan(0);
    expect(result.includedCategories).toEqual(['source', 'types']);
  });

  it('excludes lower-priority categories correctly', () => {
    const result = contextFilter('review', 3);
    expect(result.includedCategories).toEqual(['diff', 'specs', 'learnings']);
    expect(result.excludedCategories).toContain('types');
    expect(result.excludedCategories).toContain('tests');
  });
});

describe('getPhaseCategories', () => {
  it('returns categories for each phase', () => {
    for (const phase of ['implement', 'review', 'debug', 'plan'] as const) {
      const cats = getPhaseCategories(phase);
      expect(cats.length).toBeGreaterThan(0);
      expect(cats[0]).toHaveProperty('category');
      expect(cats[0]).toHaveProperty('patterns');
      expect(cats[0]).toHaveProperty('priority');
    }
  });

  it('returns a copy (not a reference)', () => {
    const cats1 = getPhaseCategories('implement');
    const cats2 = getPhaseCategories('implement');
    expect(cats1).not.toBe(cats2);
    expect(cats1).toEqual(cats2);
  });
});
