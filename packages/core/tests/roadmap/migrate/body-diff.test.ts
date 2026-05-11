import { describe, it, expect } from 'vitest';
import { bodyMetaMatches } from '../../../src/roadmap/migrate/body-diff';

describe('bodyMetaMatches', () => {
  it('returns true for two empty metas', () => {
    expect(bodyMetaMatches({}, {})).toBe(true);
  });

  it('returns true when same fields, same values', () => {
    expect(
      bodyMetaMatches(
        { spec: 'a.md', priority: 'P1', blocked_by: ['x', 'y'] },
        { spec: 'a.md', priority: 'P1', blocked_by: ['x', 'y'] }
      )
    ).toBe(true);
  });

  it('treats blocked_by ordering as significant by sorting before compare', () => {
    expect(bodyMetaMatches({ blocked_by: ['y', 'x'] }, { blocked_by: ['x', 'y'] })).toBe(true);
  });

  it('returns false when spec differs', () => {
    expect(bodyMetaMatches({ spec: 'a.md' }, { spec: 'b.md' })).toBe(false);
  });

  it('returns false when a field is present on one side and missing on the other', () => {
    expect(bodyMetaMatches({ spec: 'a.md' }, {})).toBe(false);
  });

  it('treats null and missing as equivalent', () => {
    expect(bodyMetaMatches({ spec: null }, {})).toBe(true);
  });
});
