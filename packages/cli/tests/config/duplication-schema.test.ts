import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { HarnessConfigSchema } from '../../src/config/schema';
import { collectStrippedKeys } from '../../src/config/stripped-keys';

const withDuplication = (duplication: unknown) => ({
  version: 1,
  entropy: { duplication },
});

/**
 * Every issue path in a zod error tree, descending into `invalid_union`'s
 * per-branch `errors` (which is where a union parks the field that actually failed).
 * zod 4 records those nested paths RELATIVE to the union, so they are re-rooted
 * onto the parent issue's path here.
 * `ignorePatterns: [42]` reports `entropy.duplication.ignorePatterns.0`, so
 * paths are also truncated at the first numeric segment.
 */
function flattenIssuePaths(
  issues: readonly z.core.$ZodIssue[],
  parent: readonly PropertyKey[] = []
): string[] {
  const out: string[] = [];
  for (const issue of issues) {
    const fullPath = [...parent, ...issue.path];
    const segments: string[] = [];
    for (const segment of fullPath) {
      if (typeof segment === 'number') break;
      segments.push(String(segment));
    }
    out.push(segments.join('.'));
    if (issue.code === 'invalid_union') {
      for (const branch of issue.errors) out.push(...flattenIssuePaths(branch, fullPath));
    }
  }
  return out;
}

describe('entropy.duplication config surface', () => {
  // THE WIRING TEST. Measured at 9c9297bdc (before this change):
  // collectStrippedKeys(...) === [{ path: 'entropy.duplication' }] and the
  // parsed entropy block held only ['excludePatterns','autoFix'] — the key
  // was silently dropped and `harness cleanup -t duplication` could never
  // see an operator's tuning. MUTATION: delete the `duplication:` member
  // from EntropyConfigSchema and this test fails on the stripped-key list.
  it('is no longer reported as an ignored unknown key', () => {
    expect(collectStrippedKeys(HarnessConfigSchema, withDuplication({ minTokens: 50 }))).toEqual(
      []
    );
  });

  it('survives parsing with its values intact', () => {
    const parsed = HarnessConfigSchema.safeParse(
      withDuplication({
        minTokens: 50,
        minInstances: 4,
        maxClasses: 25,
        ignorePatterns: ['**/x/**'],
      })
    );
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.entropy?.duplication).toEqual({
      minTokens: 50,
      minInstances: 4,
      maxClasses: 25,
      ignorePatterns: ['**/x/**'],
    });
  });

  it.each([true, false])('accepts the bare boolean form (%s)', (value) => {
    const parsed = HarnessConfigSchema.safeParse(withDuplication(value));
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.entropy?.duplication).toBe(value);
  });

  // Each row is a value a hand-edited harness.config.json really produces,
  // and each one changes the detector's behavior silently without these
  // bounds. maxClasses: 0 is the sharp one — buildCloneIndex slices the
  // ranked classes to the cap, so zero reports NO classes while counting
  // every one of them in classesTruncated: a pass over findings that were
  // found. MUTATION: drop `.int()`, `.positive()` or `.min(2)` and the
  // matching row fails.
  it.each([
    ['minTokens as a string', { minTokens: '40' }],
    ['minTokens zero', { minTokens: 0 }],
    ['minTokens negative', { minTokens: -1 }],
    ['minTokens fractional', { minTokens: 1.5 }],
    ['minInstances 1 (buildCloneIndex hard-skips groups below 2 anyway)', { minInstances: 1 }],
    ['minInstances negative', { minInstances: -3 }],
    ['maxClasses zero', { maxClasses: 0 }],
    ['maxClasses negative', { maxClasses: -5 }],
    ['maxClasses as a string', { maxClasses: '100' }],
    ['a non-string ignorePattern', { ignorePatterns: [42] }],
  ])('rejects %s', (_label, duplication) => {
    const parsed = HarnessConfigSchema.safeParse(withDuplication(duplication));
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    // The offending FIELD is named somewhere in the error tree.
    //
    // PLAN CORRECTION, measured not assumed (zod 3, dumped at execution
    // time): a value whose TYPE is wrong (`minTokens: '40'`,
    // `maxClasses: '100'`, `ignorePatterns: [42]`) fails BOTH arms of
    // `z.union([z.boolean(), DuplicationConfigSchema])`, so zod reports a
    // single `invalid_union` issue whose own path stops at
    // `entropy.duplication` and parks the field path inside the branch errors
    // (zod 3: `unionErrors[].issues[].path`; zod 4: `errors[][]`, relative). A value whose type is right but whose
    // RANGE is wrong (`maxClasses: 0`, `minInstances: 1`) reports
    // `entropy.duplication.maxClasses` at the top level, with NO
    // block-level issue beside it. The plan asserted the top-level path
    // always carried the field; for the three type rows it does not.
    // Flattening the tree is the one assertion that holds for both shapes.
    // MUTATION: drop `.int()` / `.positive()` / `.min(2)` from the field
    // under test and its row stops failing to parse at all.
    expect(flattenIssuePaths(parsed.error.issues)).toContain(
      `entropy.duplication.${Object.keys(duplication)[0]}`
    );
  });
});
