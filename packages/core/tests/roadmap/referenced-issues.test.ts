import { describe, it, expect } from 'vitest';
import { parseReferencedIssues } from '../../src/roadmap/referenced-issues';

describe('parseReferencedIssues', () => {
  const cases: Array<{ name: string; input: string; expected: number[] }> = [
    { name: 'bare hash ref', input: 'see #123', expected: [123] },
    { name: 'closing keyword immediately before ref', input: 'Closes #569', expected: [569] },
    { name: 'fixes keyword', input: 'Fixes #7', expected: [7] },
    { name: 'resolves keyword', input: 'Resolves #42', expected: [42] },
    {
      name: 'malformed keyword still yields the ref',
      input: 'Closes roadmap #569',
      expected: [569],
    },
    { name: 'owner/repo#n form', input: 'closes acme/widgets#88', expected: [88] },
    { name: 'dedupes repeats', input: '#5 and Closes #5', expected: [5] },
    { name: 'ignores bare numbers without hash', input: 'issue 123 and PR 456', expected: [] },
    {
      name: 'multiple distinct refs preserve first-seen order',
      input: '#3 then #1 then #2',
      expected: [3, 1, 2],
    },
    { name: 'empty text', input: '', expected: [] },
    {
      name: 'ignores markdown headings that look numeric',
      input: '## 12 things\n#34',
      expected: [34],
    },
  ];
  it.each(cases)('$name', ({ input, expected }) => {
    expect(parseReferencedIssues(input)).toEqual(expected);
  });
});
