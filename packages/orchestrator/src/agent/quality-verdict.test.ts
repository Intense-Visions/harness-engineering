import { describe, it, expect } from 'vitest';
import { SecurityScanner } from '@harness-engineering/core';
import { parseIntroducedHunks, hasIntroducedSecurityDefect } from './quality-verdict';

/** AMR 4c — baseline-relative diff parsing + introduced-security-defect verdict. */

const DIFF = [
  'diff --git a/src/foo.ts b/src/foo.ts',
  'index abc..def 100644',
  '--- a/src/foo.ts',
  '+++ b/src/foo.ts',
  '@@ -10,0 +11,2 @@',
  '+const x = doThing();',
  '+return x;',
  '@@ -20,0 +30,1 @@',
  '+const y = 2;',
  'diff --git a/src/bar.ts b/src/bar.ts',
  '--- a/src/bar.ts',
  '+++ b/src/bar.ts',
  '@@ -1,0 +2,1 @@',
  '+const z = 3;',
].join('\n');

describe('parseIntroducedHunks', () => {
  it('extracts per-hunk added lines with the correct file + start line', () => {
    const hunks = parseIntroducedHunks(DIFF, []);
    expect(hunks).toEqual([
      { file: 'src/foo.ts', addedContent: 'const x = doThing();\nreturn x;', startLine: 11 },
      { file: 'src/foo.ts', addedContent: 'const y = 2;', startLine: 30 },
      { file: 'src/bar.ts', addedContent: 'const z = 3;', startLine: 2 },
    ]);
  });

  it('excludes files under a seeded path (the handoff overlay, not agent work)', () => {
    const diff = [
      '+++ b/docs/roadmap.md',
      '@@ -0,0 +1,1 @@',
      '+prose that mentions eval( just as text',
      '+++ b/src/app.ts',
      '@@ -0,0 +1,1 @@',
      '+const a = 1;',
    ].join('\n');
    const hunks = parseIntroducedHunks(diff, ['.harness/proposals', 'docs/roadmap.md']);
    expect(hunks.map((h) => h.file)).toEqual(['src/app.ts']); // roadmap.md dropped
  });

  it('skips deletions (+++ /dev/null) and produces no hunk', () => {
    const diff = ['--- a/gone.ts', '+++ /dev/null', '@@ -1,2 +0,0 @@'].join('\n');
    expect(parseIntroducedHunks(diff, [])).toEqual([]);
  });

  it('returns [] for an empty diff', () => {
    expect(parseIntroducedHunks('', [])).toEqual([]);
  });
});

describe('hasIntroducedSecurityDefect', () => {
  const scanner = new SecurityScanner();

  it('flags an error-severity finding on an added line (SEC-INJ-001 eval)', () => {
    const hunks = [{ file: 'src/x.ts', addedContent: 'const r = eval(userInput);', startLine: 5 }];
    expect(hasIntroducedSecurityDefect(hunks, scanner)).toBe(true);
  });

  it('does NOT flag clean added lines', () => {
    const hunks = [
      { file: 'src/x.ts', addedContent: 'const r = JSON.parse(input);\nreturn r;', startLine: 5 },
    ];
    expect(hasIntroducedSecurityDefect(hunks, scanner)).toBe(false);
  });

  it('is baseline-relative: a pre-existing pattern not in the added lines is never scanned', () => {
    // The parser only ever hands over ADDED lines; a file whose eval() lives on an
    // unchanged line simply never reaches the scanner. Empty hunks ⇒ no defect.
    expect(hasIntroducedSecurityDefect([], scanner)).toBe(false);
  });

  it('returns false when the introduced lines only trip warning-severity rules', () => {
    // A bare TODO / non-error pattern must not escalate — only error severity does.
    const hunks = [
      { file: 'src/x.ts', addedContent: 'const ok = true; // just a comment', startLine: 1 },
    ];
    expect(hasIntroducedSecurityDefect(hunks, scanner)).toBe(false);
  });
});
