import { describe, it, expect } from 'vitest';
import { resolveSection } from '../../src/outcome-eval/section-resolver.js';
import type { JudgedAgainst } from '../../src/outcome-eval/types.js';

const wrap = (heading: string, body: string) =>
  `# Title\n\nintro\n\n${heading}\n\n${body}\n\n## Next\n\nafter\n`;

describe('resolveSection', () => {
  it('matches ## Success Criteria and returns success-criteria (Criterion 5)', () => {
    const r = resolveSection(wrap('## Success Criteria', '1. does the thing'));
    expect(r).not.toBeNull();
    expect(r!.judgedAgainst).toBe<JudgedAgainst>('success-criteria');
    expect(r!.body).toContain('does the thing');
    expect(r!.body).not.toContain('Success Criteria'); // heading excluded
    expect(r!.body).not.toContain('after'); // stops at next heading
  });

  it('falls back to user-visible-behavior when Success Criteria is absent', () => {
    const r = resolveSection(wrap('## User-Visible Behavior', 'user sees X'));
    expect(r!.judgedAgainst).toBe<JudgedAgainst>('user-visible-behavior');
    expect(r!.body).toContain('user sees X');
  });

  it('falls back to overview when only Overview is present', () => {
    const r = resolveSection(wrap('## Overview', 'what it does'));
    expect(r!.judgedAgainst).toBe<JudgedAgainst>('overview');
    expect(r!.body).toContain('what it does');
  });

  it('prefers success-criteria over overview regardless of document order (Criterion 5)', () => {
    const md = '## Overview\n\nthe overview body\n\n## Success Criteria\n\nthe sc body\n';
    const r = resolveSection(md);
    expect(r!.judgedAgainst).toBe<JudgedAgainst>('success-criteria');
    expect(r!.body).toContain('the sc body');
    expect(r!.body).not.toContain('the overview body');
  });

  it('prefers user-visible-behavior over overview', () => {
    const md = '## Overview\n\nov\n\n## User-Visible Behavior\n\nuvb body\n';
    expect(resolveSection(md)!.judgedAgainst).toBe<JudgedAgainst>('user-visible-behavior');
  });

  it('is case-insensitive: ## Success criteria resolves to success-criteria (real-spec sentence case)', () => {
    expect(resolveSection('## Success criteria\n\nbody\n')!.judgedAgainst).toBe<JudgedAgainst>(
      'success-criteria'
    );
  });

  it('is case-insensitive: ## SUCCESS CRITERIA resolves to success-criteria', () => {
    expect(resolveSection('## SUCCESS CRITERIA\n\nbody\n')!.judgedAgainst).toBe<JudgedAgainst>(
      'success-criteria'
    );
  });

  it('tolerates a space instead of a hyphen in User-Visible Behavior', () => {
    expect(resolveSection('## User Visible Behavior\n\nb\n')!.judgedAgainst).toBe<JudgedAgainst>(
      'user-visible-behavior'
    );
  });

  it('returns null when no judgable section is present (Criterion 5 / no-section case)', () => {
    const md = '# Title\n\n## Technical Design\n\nstuff\n\n## Decisions\n\nmore\n';
    expect(resolveSection(md)).toBeNull();
  });

  it('does not throw on empty input; returns null', () => {
    expect(resolveSection('')).toBeNull();
  });

  it('trims surrounding blank lines from the body', () => {
    const r = resolveSection('## Overview\n\n\n  content here  \n\n\n## Next\n\nx\n');
    expect(r!.body).toBe('content here');
  });

  it('ignores headings inside fenced code blocks and resolves the real section (regression)', () => {
    // A ```markdown fenced example contains a decoy "## Success Criteria"
    // BEFORE the real one. The resolver must return the REAL body.
    const md = [
      '# Title',
      '',
      'Here is an example spec layout:',
      '',
      '```markdown',
      '## Success Criteria',
      '',
      'fenced example body — NOT the real section',
      '```',
      '',
      '## Success Criteria',
      '',
      'the real success criteria body',
      '',
      '## Next',
      '',
      'after',
      '',
    ].join('\n');
    const r = resolveSection(md);
    expect(r).not.toBeNull();
    expect(r!.judgedAgainst).toBe<JudgedAgainst>('success-criteria');
    expect(r!.body).toContain('the real success criteria body');
    expect(r!.body).not.toContain('fenced example body');
  });

  it('includes deeper sub-headings in the body but terminates at a peer heading (boundary regression)', () => {
    // Guards `h.level <= start.level`: a deeper ### sub-heading stays INSIDE the
    // body; a peer ## heading ends it. A <=→< regression would leak past ## Next.
    const md = [
      '## Success Criteria',
      '',
      'top of criteria',
      '',
      '### Detail',
      '',
      'nested detail content',
      '',
      '## Next',
      '',
      'should not appear',
      '',
    ].join('\n');
    const r = resolveSection(md);
    expect(r!.judgedAgainst).toBe<JudgedAgainst>('success-criteria');
    expect(r!.body).toContain('top of criteria');
    expect(r!.body).toContain('### Detail'); // deeper sub-heading kept
    expect(r!.body).toContain('nested detail content');
    expect(r!.body).not.toContain('should not appear'); // peer heading terminates
  });

  it('resolves the first of duplicate same-tag headings (first-match-wins)', () => {
    // Two `## Overview` with no higher-priority section: resolve the FIRST.
    const md = '## Overview\n\nfirst overview body\n\n## Overview\n\nsecond overview body\n';
    const r = resolveSection(md);
    expect(r!.judgedAgainst).toBe<JudgedAgainst>('overview');
    expect(r!.body).toContain('first overview body');
    expect(r!.body).not.toContain('second overview body');
  });
});
