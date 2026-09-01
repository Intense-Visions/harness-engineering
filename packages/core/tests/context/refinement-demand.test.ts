import { describe, it, expect } from 'vitest';
import {
  REFINEMENT_CONTEXT_CLASSES,
  OPERATION_CONTEXT_CLASS,
  classifyRefinement,
  aggregateDemand,
} from '../../src/context/refinement-demand';
import type { RefinementRequest } from '../../src/context/refinement-demand';

/** Build a request with the operation's default context class. */
function req(operation: RefinementRequest['operation']): RefinementRequest {
  return { operation, contextClass: classifyRefinement(operation) };
}

describe('REFINEMENT_CONTEXT_CLASSES', () => {
  it('enumerates the four progressive-domain classes in canonical order', () => {
    expect(REFINEMENT_CONTEXT_CLASSES).toEqual([
      'file-content',
      'history',
      'telemetry',
      'knowledge',
    ]);
  });
});

describe('OPERATION_CONTEXT_CLASS', () => {
  it('maps every operation to its default context class', () => {
    expect(OPERATION_CONTEXT_CLASS).toEqual({
      outline: 'file-content',
      search: 'file-content',
      unfold: 'file-content',
      'expand-diff': 'history',
      'expand-rationale': 'knowledge',
      'expand-telemetry': 'telemetry',
    });
  });
});

describe('classifyRefinement', () => {
  it('classifies the wired file-content operations', () => {
    expect(classifyRefinement('outline')).toBe('file-content');
    expect(classifyRefinement('search')).toBe('file-content');
    expect(classifyRefinement('unfold')).toBe('file-content');
  });

  it('classifies the future operations', () => {
    expect(classifyRefinement('expand-diff')).toBe('history');
    expect(classifyRefinement('expand-rationale')).toBe('knowledge');
    expect(classifyRefinement('expand-telemetry')).toBe('telemetry');
  });
});

describe('aggregateDemand', () => {
  it('returns an all-zero report over every class for an empty input', () => {
    const report = aggregateDemand([]);
    expect(report.total).toBe(0);
    expect(report.byClass.map((c) => c.contextClass)).toEqual([
      'file-content',
      'history',
      'telemetry',
      'knowledge',
    ]);
    for (const c of report.byClass) {
      expect(c.count).toBe(0);
      expect(c.frequency).toBe(0);
    }
  });

  it('counts a known mix with exact frequencies (Truth 2)', () => {
    const report = aggregateDemand([
      req('outline'),
      req('search'),
      req('unfold'),
      req('expand-rationale'),
    ]);
    expect(report.total).toBe(4);
    const byClass = new Map(report.byClass.map((c) => [c.contextClass, c]));
    expect(byClass.get('file-content')).toMatchObject({ count: 3, frequency: 0.75 });
    expect(byClass.get('knowledge')).toMatchObject({ count: 1, frequency: 0.25 });
    expect(byClass.get('history')).toMatchObject({ count: 0, frequency: 0 });
    expect(byClass.get('telemetry')).toMatchObject({ count: 0, frequency: 0 });
    // Every class enumerated exactly once.
    expect(report.byClass).toHaveLength(4);
  });

  it('ranks a seeded never-read class last, ties break by canonical order (Truth 3)', () => {
    const report = aggregateDemand([req('outline'), req('outline'), req('expand-rationale')]);
    const order = report.byClass.map((c) => c.contextClass);
    // file-content (2) first, knowledge (1) next, then the two never-read
    // classes at the bottom in canonical order: history before telemetry.
    expect(order).toEqual(['file-content', 'knowledge', 'history', 'telemetry']);
    expect(report.byClass[2]).toMatchObject({ contextClass: 'history', count: 0, frequency: 0 });
    expect(report.byClass[3]).toMatchObject({ contextClass: 'telemetry', count: 0, frequency: 0 });
  });

  it('sorts primarily by count desc', () => {
    const report = aggregateDemand([
      req('expand-diff'), // history x1
      req('expand-telemetry'), // telemetry x1
      req('expand-telemetry'), // telemetry x2
      req('expand-rationale'), // knowledge x1
      req('expand-rationale'), // knowledge x2
      req('expand-rationale'), // knowledge x3
    ]);
    expect(report.byClass.map((c) => c.contextClass)).toEqual([
      'knowledge', // 3
      'telemetry', // 2
      'history', // 1
      'file-content', // 0
    ]);
  });
});
