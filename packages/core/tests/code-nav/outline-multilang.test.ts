/**
 * Outline gaps that made craft's multi-language extraction a silent zero.
 *
 * Each describe block pins one measured gap. The fixtures are inline source
 * strings rather than files so the law is readable next to its assertion.
 *
 * Source: docs/changes/auto-wire-craft-at-review/plans/2026-11-13-multi-language-craft-extraction-plan.md
 */

import { describe, it, expect } from 'vitest';
import { getOutlineFromSource } from '../../src/code-nav/outline';

describe('getOutlineFromSource', () => {
  it('parses from an in-memory string without touching disk', async () => {
    const source = [
      'def compute_total(items):',
      '    t = 0',
      '    for i in items:',
      '        t += i',
      '    return t',
    ].join('\n');
    // A path that does NOT exist: proves the source argument is what was parsed.
    const outline = await getOutlineFromSource(source, '/nonexistent/compute.py');
    expect(outline.error).toBeUndefined();
    expect(outline.language).toBe('python');
    expect(outline.symbols.map((s) => `${s.kind}:${s.name}`)).toContain('function:compute_total');
  });

  it('reports unknown for an unmapped extension rather than throwing', async () => {
    const outline = await getOutlineFromSource('whatever', 'notes.txt');
    expect(outline.language).toBe('unknown');
    expect(outline.error).toBe('[parse-failed]');
  });
});
