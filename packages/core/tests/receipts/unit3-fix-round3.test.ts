import { describe, it, expect } from 'vitest';
import { STAMP_LIMITS, noteText } from '../../src/receipts/stamp-grammar';
import { parseProvenanceStamp } from '../../src/receipts/stamp-parser';

/**
 * Unit 3, fix round 3: the stamp parser is a best-effort reader of an unauthenticated stamp. It
 * runs in linear time on any text up to the input cap, reads whitespace as CommonMark does
 * (spaces and tabs only), fails closed on a few more constructs it knows it cannot place, and
 * still reads the stamp of an ordinary PR body. A body crafted to show one stamp and hide another
 * is not defended against (ADR 0139); the last block pins one such case as a known limit.
 */

const M = '<!-- harness:review-provenance -->';
const H = '### Review provenance';
const HDR =
  '| Review | Moment | Tier | Backend | Reviewers | Diff | Coverage | Gate | Blocking | By class | Escaped from | Override |';
const RULE = '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |';
const row = (gate: string) =>
  `| final-all | final | full | agent | 4/4 | aaaaaaa..bbbbbbb | 3/3 files | ${gate} | 0 | none | none | none |`;
const stamp = (gate: string) => [M, H, '', HDR, RULE, row(gate), '', M].join('\n');
const PASS = stamp('pass at bbbbbbb');
const FAIL = stamp('FAIL: HEAD_MISMATCH');
const body = (...parts: string[]) => parts.join('\n\n');
const CAP = STAMP_LIMITS.input;
/** Room left under the cap for a pathological prefix in front of a stamp and two line breaks. */
const ROOM = CAP - PASS.length - 10;
const inStamp = (lines: string[]) => [M, H, '', HDR, RULE, ...lines, '', M].join('\n');

/**
 * A generous bound: a linear scan of the cap takes milliseconds, the quadratic fence regex this
 * round replaced took over nine seconds on the first shape. Not a tight wall-clock threshold.
 */
const BOUND_MS = 5000;

describe('the parser runs in linear time at the input cap', () => {
  it.each<[string, string, string | undefined]>([
    // perf2: the shape that was quadratic (a backtick run, a letter, a backtick).
    ['a backtick run, a letter, a backtick', `${'`'.repeat(ROOM - 2)}x\`\n\n${PASS}`, 'read'],
    ['a tilde fence then a long tilde run', `~~~\n${'~'.repeat(ROOM - 6)}x\n\n${PASS}`, undefined],
    // perf: one long line of backticks after the stamp, before a marker.
    [
      'backticks between the stamp and a marker',
      `${PASS}\n\n${'`'.repeat(ROOM - 40)}\n\n${M}`,
      'read',
    ],
    ['a backtick run before the stamp', `${'`'.repeat(ROOM - 4)}a\n\n${PASS}`, undefined],
    [
      'many backtick-then-x lines',
      `${`${'`'.repeat(1003)}x\n`.repeat(Math.floor(ROOM / 1005))}\n${PASS}`,
      undefined,
    ],
    ['comment openers with no close', `${PASS}\n${'<!-- '.repeat(Math.floor(ROOM / 5))}`, 'read'],
    ['many fence lines', `${'```\n```\n'.repeat(Math.floor(ROOM / 8))}\n${PASS}`, 'read'],
    ['many markers', `${M}\n\n`.repeat(Math.floor(CAP / 37) - 1), undefined],
    ['many empty lines', `${'\n'.repeat(ROOM)}${PASS}`, 'read'],
    // The CommonMark-whitespace trims and the new rules.
    ['spaces then a letter', `${' '.repeat(ROOM)}x\n\n${PASS}`, 'read'],
    ['a letter, spaces, a letter', `x${' '.repeat(ROOM)}x\n\n${PASS}`, 'read'],
    ['trailing spaces', `x${' '.repeat(ROOM)}\n\n${PASS}`, 'read'],
    ['tabs then a letter', `${'\t'.repeat(ROOM)}x\n\n${PASS}`, 'read'],
    ['nested list markers then a fence', `${'- '.repeat(ROOM / 2)}\`\`\`\n\n${PASS}`, 'ambiguous'],
    ['nested quote markers', `${'> '.repeat(ROOM / 2)}x\n\n${PASS}`, 'read'],
    ['a long ordered-list number', `${'1'.repeat(ROOM)}. x\n\n${PASS}`, 'read'],
    ['a tag with many attributes and no >', `<a ${'b '.repeat(ROOM / 2 - 2)}\n\n${PASS}`, 'read'],
    ['an HTML block of many lines', `<div>\n${'x\n'.repeat(ROOM / 2 - 4)}\n${PASS}`, 'read'],
    [
      'closed and reopened comments',
      `${'--> <!-- '.repeat(Math.floor(ROOM / 9))}\n\n${PASS}`,
      'ambiguous',
    ],
    [
      'an indented fence of many lines',
      `  \`\`\`\n${'  x\n'.repeat(ROOM / 4 - 2)}  \`\`\`\n\n${PASS}`,
      'read',
    ],
    ['a comment of many lines', `<!--\n${'x\n'.repeat(ROOM / 2 - 4)}-->\n\n${PASS}`, 'read'],
    [
      'many short rows in the stamp',
      inStamp(Array<string>(Math.floor(ROOM / 4)).fill('| |')),
      'read',
    ],
    [
      'many over-wide lines in the stamp',
      inStamp(Array<string>(Math.floor(ROOM / 4002)).fill('x'.repeat(4001))),
      'read',
    ],
  ])('%s', (_name, text, status) => {
    expect(text.length).toBeLessThanOrEqual(CAP);
    const start = performance.now();
    const parsed = parseProvenanceStamp(text);
    expect(performance.now() - start).toBeLessThan(BOUND_MS);
    expect(parsed?.status).toBe(status);
  });
});

describe('whitespace is CommonMark whitespace: spaces and tabs', () => {
  it.each([
    ['NBSP', ' '],
    ['U+3000', '　'],
  ])('a fence closer followed by %s does not close the fence', (_name, ch) => {
    expect(parseProvenanceStamp(body('```\nx\n```' + ch, PASS))).toBeUndefined();
    expect(parseProvenanceStamp(body('~~~\nx\n~~~' + ch, PASS))).toBeUndefined();
  });
  it.each([
    ['spaces', '   '],
    ['a tab', '\t'],
  ])('a fence closer followed by %s closes the fence', (_name, ws) => {
    expect(parseProvenanceStamp(body('```\nx\n```' + ws, PASS))?.status).toBe('read');
  });
  it('a line of NBSP is not an empty line: the marker after it starts no stamp', () => {
    expect(parseProvenanceStamp(`text\n \n${PASS}`)).toBeUndefined();
  });
  it('a line of spaces and tabs is an empty line', () => {
    expect(parseProvenanceStamp(`text\n \t \n${PASS}`)?.status).toBe('read');
  });
});

describe('the parser reads nothing where an HTML block may hide part of the page', () => {
  it.each([
    ['a <div> block holding a fence', ['<div>\n```', '~~~\n```', PASS]],
    [
      'visible FAIL, PASS after a <div> block holding a fence',
      ['<div>\n```', FAIL, '```', PASS, '```'],
    ],
    ['a type-7 <span> alone holding a fence', ['<span>\n```', FAIL, '```', PASS]],
    ['a <p align> block holding a comment', ['<p align="center">\n<!--', '```\n-->', PASS]],
    ['a <div> block holding <pre>', ['<div>\n<pre>', '```\n</pre>', PASS]],
    ['an unclosed <rp>', ['<ruby>\n<rp>', PASS]],
    ['<noscript>', ['<noscript>', PASS]],
    ['<template>', ['<template>', PASS]],
    ['<select>', ['<SELECT name="x">', PASS]],
  ])('%s: ambiguous (html-block)', (_name, parts) => {
    expect(parseProvenanceStamp(body(...parts))).toMatchObject({
      status: 'ambiguous',
      reason: 'html-block',
      rows: [],
      finalRows: [],
    });
  });
  it('a comment closed and reopened on one line: ambiguous (comment-opener)', () => {
    expect(parseProvenanceStamp(body('<!-- a --> <!--\n```\n-->', PASS))).toMatchObject({
      status: 'ambiguous',
      reason: 'comment-opener',
    });
  });
});

describe('the parser reads nothing where a list item or quote may end a hidden block', () => {
  it.each([
    ['a list-item fence closed at column 0', ['- a', '  ```\n  x\n```', PASS, '```']],
    ['a list-item fence, no blank line', ['- a\n  ```\n```', PASS]],
    ['visible FAIL, hidden PASS via a list-item fence', ['- a\n  ```\n```', FAIL, '```', PASS]],
    ['a list-item comment ended by the list', ['- a', '  <!--', '```\n-->', PASS]],
    ['a list-item <pre> ended by the list', ['- a', '  <pre>', '```\n</pre>', PASS]],
    ['a fence in a quote', ['> ```\n> x\n```', PASS, '```']],
    ['a fence on a list item line', ['- ```\n  x', PASS]],
    ['a fence in a nested list item', ['1. > - ```', PASS]],
  ])('%s: ambiguous (container)', (_name, parts) => {
    expect(parseProvenanceStamp(body(...parts))).toMatchObject({
      status: 'ambiguous',
      reason: 'container',
      rows: [],
      finalRows: [],
    });
  });
  it('a fence-like or hiding line after the last marker leaves the stamp read', () => {
    expect(parseProvenanceStamp(body(PASS, '- ```', '<template>', '<div>\n```'))).toMatchObject({
      status: 'read',
      stamps: 1,
    });
  });
});

describe('an ordinary PR body still reads its stamp', () => {
  const TEMPLATE = [
    '<!-- Thanks for the PR! Describe the change below. -->',
    '## Summary',
    'Makes the stamp parser linear.\n<!-- keep this short -->',
    '## Changes',
    '- one\n- two\n  - nested\n* three\n1. first\n2. second',
    '## Test plan',
    '1. Run the tests:\n   ```sh\n   pnpm test\n   ```\n2. Check the output.',
    '```ts\nconst x = `template`;\n<template><div>hi</div></template>\n```',
    '~~~\n<!--\n~~~',
    '| a | b |\n| --- | --- |\n| 1 | 2 |',
    '> A quote.\n> - with a list',
    '<img width="800" alt="screenshot" src="https://example.com/a.png">',
    '<p align="center">\n  <img src="https://example.com/b.png">\n</p>',
    '<br>',
    '### Notes\n\nSee #12.',
    '---',
  ];
  it.each(TEMPLATE.map((part, i) => [i, part]))('part %i before the stamp: read', (_i, part) => {
    expect(parseProvenanceStamp(body(part, PASS))).toMatchObject({ status: 'read', stamps: 1 });
  });
  it('all of them together', () => {
    const parsed = parseProvenanceStamp(body(...TEMPLATE, PASS, 'Thanks for reviewing.'));
    expect(parsed).toMatchObject({ status: 'read', stamps: 1, reviewed: 1 });
    expect(parsed?.finalRows).toEqual([{ gate: 'pass at bbbbbbb', head: 'bbbbbbb' }]);
  });
  it('HTML in a code fence is code: <template> and <div> there are not refused', () => {
    expect(parseProvenanceStamp(body('```vue\n<template>\n  <div>\n```', PASS))?.status).toBe(
      'read'
    );
  });
});

/**
 * A known limit, not a guarantee: the parser does not render the page, so a body crafted to show
 * one thing and hide another can still be read as written. Here a fence inside the stamp hides a
 * note from the page, and the parser reads the note. Anyone who can write the body can write any
 * stamp, visibly; the stamp is shown as stated, not verified (ADR 0139).
 */
describe('known limit: a body crafted to hide part of a stamp', () => {
  it('a note the page shows as code is read', () => {
    const note = `- ${noteText({ id: 'decisions-unreadable' })}`;
    const text = inStamp([row('pass at bbbbbbb'), '```', '', note, '```']);
    expect(parseProvenanceStamp(text)).toMatchObject({ status: 'read', notes: [note] });
  });
});
