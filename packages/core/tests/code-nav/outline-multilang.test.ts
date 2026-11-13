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

describe('python decorated definitions (measured gap)', () => {
  const source = [
    'class Plain:',
    '    def undecorated(self):',
    '        a = 1',
    '        b = 2',
    '        return a + b',
    '',
    'class Decorated:',
    '    @staticmethod',
    '    def decorated(x):',
    '        a = 1',
    '        b = 2',
    '        return a + b',
    '',
    '@decorator',
    'def top_level_decorated(x):',
    '    a = 1',
    '    return a',
  ].join('\n');

  it('surfaces a decorated top-level def', async () => {
    const outline = await getOutlineFromSource(source, 'deco.py');
    expect(outline.symbols.map((s) => `${s.kind}:${s.name}`)).toContain(
      'function:top_level_decorated'
    );
  });

  it('surfaces a decorated method as a child of its class', async () => {
    const outline = await getOutlineFromSource(source, 'deco.py');
    const decorated = outline.symbols.find((s) => s.name === 'Decorated');
    expect(decorated?.children?.map((c) => c.name)).toEqual(['decorated']);
  });

  // POSITIVE CONTROL. Without this, a change that deleted python support
  // entirely would leave both assertions above passing vacuously only if they
  // were written as "not undefined" — they are not, but the control is cheap
  // and makes the undecorated baseline explicit.
  it('still surfaces undecorated definitions', async () => {
    const outline = await getOutlineFromSource(source, 'deco.py');
    const plain = outline.symbols.find((s) => s.name === 'Plain');
    expect(plain?.children?.map((c) => c.name)).toEqual(['undecorated']);
  });

  it('anchors the decorated unit at its def line, not its decorator line', async () => {
    const outline = await getOutlineFromSource(source, 'deco.py');
    const top = outline.symbols.find((s) => s.name === 'top_level_decorated');
    expect(top?.line).toBe(15); // `def` is line 15; `@decorator` is line 14
  });
});

describe('rust module contents (measured gap)', () => {
  const source = [
    'pub fn real_code(n: i32) -> i32 {',
    '    let mut t = 0;',
    '    t += n;',
    '    t',
    '}',
    '',
    '#[cfg(test)]',
    'mod tests {',
    '    use super::*;',
    '',
    '    #[test]',
    '    fn adds_numbers() {',
    '        let r = real_code(1);',
    '        assert_eq!(r, 1);',
    '    }',
    '}',
  ].join('\n');

  it('surfaces items declared inside a mod', async () => {
    const outline = await getOutlineFromSource(source, 'modtests.rs');
    expect(outline.symbols.map((s) => `${s.kind}:${s.name}`)).toContain('function:adds_numbers');
  });

  it('keeps emitting the mod symbol itself (additive, not a replacement)', async () => {
    const outline = await getOutlineFromSource(source, 'modtests.rs');
    expect(outline.symbols.map((s) => `${s.kind}:${s.name}`)).toContain('variable:tests');
  });

  it('still surfaces top-level items (positive control)', async () => {
    const outline = await getOutlineFromSource(source, 'modtests.rs');
    expect(outline.symbols.map((s) => `${s.kind}:${s.name}`)).toContain('function:real_code');
  });
});
