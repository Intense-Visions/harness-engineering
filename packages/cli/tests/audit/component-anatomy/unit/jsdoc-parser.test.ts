import { describe, it, expect } from 'vitest';
import {
  extractLeadingJsDoc,
  readJsDocTag,
  readJsDocTagValue,
} from '../../../../src/audit/component-anatomy/parsers/jsdoc';

const SOURCE = `/**
 * Button component.
 *
 * @component-type Button
 * @anatomy-slot content required
 * @anatomy-slot icon-leading
 * @anatomy-state disabled exclusive
 */
export const Button = () => null;
`;

describe('extractLeadingJsDoc', () => {
  it('extracts and de-decorates the leading block comment', () => {
    const jsdoc = extractLeadingJsDoc(SOURCE);
    expect(jsdoc).toContain('@component-type Button');
    expect(jsdoc).toContain('@anatomy-slot content required');
    expect(jsdoc).not.toContain('*'); // decoration stripped
  });

  it('skips a leading "use client" directive before the block', () => {
    const jsdoc = extractLeadingJsDoc(`'use client';\n/**\n * @component-type Input\n */\n`);
    expect(jsdoc).toContain('@component-type Input');
  });

  it('returns null when the file does not open with a block comment', () => {
    expect(extractLeadingJsDoc('export const Button = () => null;')).toBeNull();
    // A line comment is not a JSDoc block.
    expect(extractLeadingJsDoc('// @component-type Button\nexport const X = 1;')).toBeNull();
  });
});

describe('readJsDocTag / readJsDocTagValue', () => {
  it('reads all values of a repeated tag in document order', () => {
    const jsdoc = extractLeadingJsDoc(SOURCE)!;
    expect(readJsDocTag(jsdoc, 'anatomy-slot')).toEqual(['content required', 'icon-leading']);
  });

  it('reads the first value of a single-value tag', () => {
    const jsdoc = extractLeadingJsDoc(SOURCE)!;
    expect(readJsDocTagValue(jsdoc, 'component-type')).toBe('Button');
  });

  it('returns [] / null for an absent tag', () => {
    const jsdoc = extractLeadingJsDoc(SOURCE)!;
    expect(readJsDocTag(jsdoc, 'anatomy-variant')).toEqual([]);
    expect(readJsDocTagValue(jsdoc, 'anatomy-variant')).toBeNull();
  });

  it('does not partial-match a longer tag name', () => {
    const jsdoc = extractLeadingJsDoc(SOURCE)!;
    // `anatomy-state` must not be matched when querying `anatomy-st`.
    expect(readJsDocTag(jsdoc, 'anatomy-st')).toEqual([]);
  });
});
