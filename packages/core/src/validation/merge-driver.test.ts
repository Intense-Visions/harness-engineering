import { describe, it, expect } from 'vitest';
import { needsMergeOursDriverWarning } from './merge-driver';

describe('needsMergeOursDriverWarning', () => {
  it('returns true when a merge=ours line is present and the driver is unconfigured', () => {
    const gitattributes = 'docs/roadmap.md merge=ours\n';
    expect(needsMergeOursDriverWarning(gitattributes, false)).toBe(true);
  });

  it('returns false when no merge=ours line is present (driver unconfigured)', () => {
    const gitattributes = '* text=auto eol=lf\n*.png binary\n';
    expect(needsMergeOursDriverWarning(gitattributes, false)).toBe(false);
  });

  it('returns false when no merge=ours line is present (driver configured)', () => {
    const gitattributes = '* text=auto eol=lf\n';
    expect(needsMergeOursDriverWarning(gitattributes, true)).toBe(false);
  });

  it('returns false when merge=ours is present but the driver is already configured', () => {
    const gitattributes = 'docs/roadmap.md merge=ours\n';
    expect(needsMergeOursDriverWarning(gitattributes, true)).toBe(false);
  });

  it('ignores commented merge=ours lines', () => {
    const gitattributes = '# docs/roadmap.md merge=ours\n#   git config merge.ours.driver true\n';
    expect(needsMergeOursDriverWarning(gitattributes, false)).toBe(false);
  });

  it('detects an uncommented merge=ours line even when commented examples precede it', () => {
    const gitattributes =
      '# Requires: git config merge.ours.driver true\n# example merge=ours\nbenchmark-baselines.json merge=ours\n';
    expect(needsMergeOursDriverWarning(gitattributes, false)).toBe(true);
  });

  it('returns false for empty content', () => {
    expect(needsMergeOursDriverWarning('', false)).toBe(false);
  });
});
