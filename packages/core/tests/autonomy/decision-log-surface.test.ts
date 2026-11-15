import { describe, it, expect } from 'vitest';
import * as autonomy from '../../src/autonomy/index';

describe('auto-decision public surface is append-only', () => {
  const names = Object.keys(autonomy);
  it('positive control: the write, read and render entry points are exported', () => {
    for (const n of [
      'recordAutoDecision',
      'readAutoDecisions',
      'renderAutoDecisionSummary',
      'summarizeAutoDecisions',
      'validateAutoDecisionInput',
      'AutoDecisionSchema',
    ])
      expect(names).toContain(n);
  });
  it('exports no raw appender and nothing that rewrites, truncates or deletes the log', () => {
    expect(names).not.toContain('appendAutoDecision');
    expect(
      names.filter((n) =>
        /(write|delete|remove|clear|truncate|rewrite|update|reset)\w*AutoDecision/i.test(n)
      )
    ).toEqual([]);
  });
});
