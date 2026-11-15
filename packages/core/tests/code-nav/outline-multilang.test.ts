/**
 * Outline gaps that made craft's multi-language extraction a silent zero.
 *
 * Each describe block pins one measured gap. The fixtures are inline source
 * strings rather than files so the law is readable next to its assertion.
 *
 * Source: docs/changes/auto-wire-craft-at-review/plans/2026-11-13-multi-language-craft-extraction-plan.md
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getOutlineFromSource } from '../../src/code-nav/outline';
import { unfoldSymbol } from '../../src/code-nav/unfold';

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

/**
 * I4. Walking `mod` bodies changed the answer a SHARED MCP tool gives.
 *
 * `findSymbolInList` / `findSymbolByName` are first-match-wins over
 * `outline.symbols` in emission order, and mod contents are now spliced in
 * right after their `mod` symbol. Measured before this phase, a file with
 * `mod inner { fn process }` at L2-5 and a top-level `fn process` at L7-10
 * returned L7 from `unfoldSymbol`; it now returns L2. Same file, same query,
 * different answer — and nothing pinned it either way.
 *
 * The recursion stays: it fixes total blindness to every item in every Rust
 * module. What is pinned here is WHICH symbol wins, so the behaviour is chosen
 * rather than incidental. THE RULE IS SOURCE ORDER: `extractSymbols` walks root
 * children in order and splices a mod's contents immediately after the mod
 * symbol, and those contents lie inside the mod's own span, so the emitted list
 * is non-decreasing by line. First match therefore means EARLIEST IN THE FILE,
 * regardless of nesting depth. Both orderings are asserted below, because a
 * single arrangement cannot distinguish "source order" from "mods first".
 */
describe('shadowed symbol resolution after mod recursion (I4)', () => {
  const MOD_FIRST = [
    'mod inner {', //          1
    '    fn process() {', //   2
    '        let a = 1;', //   3
    '        let b = 2;', //   4
    '    }', //                5
    '}', //                    6
    'fn process() {', //       7
    '    let c = 3;', //       8
    '    let d = 4;', //       9
    '}', //                    10
  ].join('\n');

  const MOD_SECOND = [
    'fn process() {', //           1
    '    let c = 3;', //           2
    '    let d = 4;', //           3
    '}', //                        4
    'mod inner {', //              5
    '    fn process() {', //       6
    '        let a = 1;', //       7
    '        let b = 2;', //       8
    '    }', //                    9
    '}', //                        10
  ].join('\n');

  let tmp: string | null = null;
  afterEach(() => {
    if (tmp !== null) fs.rmSync(tmp, { recursive: true, force: true });
    tmp = null;
  });

  function writeRust(source: string): string {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'i4-'));
    const file = path.join(tmp, 'shadow.rs');
    fs.writeFileSync(file, source);
    return file;
  }

  it('emits symbols in SOURCE ORDER, mod contents included', async () => {
    const first = await getOutlineFromSource(MOD_FIRST, 'shadow.rs');
    expect(first.symbols.map((s) => s.line)).toEqual([1, 2, 7]);
    const second = await getOutlineFromSource(MOD_SECOND, 'shadow.rs');
    // The mod-nested `process` is LAST here. If the splice ever moved to the
    // end of the list, or mods were hoisted, this arrangement would disagree
    // with the one above and expose it.
    expect(second.symbols.map((s) => s.line)).toEqual([1, 5, 6]);
  });

  it('unfoldSymbol resolves a shadowed name to the EARLIEST declaration', async () => {
    const nested = await unfoldSymbol(writeRust(MOD_FIRST), 'process');
    expect(nested.startLine, 'mod-nested process is earlier in the file').toBe(2);
    expect(nested.endLine).toBe(5);
    expect(nested.fallback).toBe(false);
  });

  it('…and that is source order, not a preference for mod contents', async () => {
    const topLevel = await unfoldSymbol(writeRust(MOD_SECOND), 'process');
    // POSITIVE CONTROL for the case above: with the mod moved below, the
    // top-level declaration wins. A rule of "nested always wins" would return
    // line 6 here.
    expect(topLevel.startLine, 'top-level process is earlier in this arrangement').toBe(1);
    expect(topLevel.endLine).toBe(4);
  });

  it('still resolves an UNshadowed mod-nested symbol (the recursion is why this exists)', async () => {
    const only = await unfoldSymbol(writeRust(MOD_FIRST), 'inner');
    expect(only.fallback).toBe(false);
    expect(only.startLine).toBe(1);
  });
});
