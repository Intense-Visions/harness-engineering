/**
 * Single source of truth for "what filename is a test file".
 *
 * This list existed in two places — the discovery walk in `test-craft/index.ts`
 * and a second regex gate inside `extract/tests.ts` — and both omitted the
 * ESM/CJS-explicit extensions. The two copies are why the bug had two halves:
 * the walker skipped `*.test.mjs`, and passing one explicitly via `--files`
 * got past the walker only to be dropped by the extractor, reporting
 * `filesScanned: 1` against `testsExtracted: 0` (issue #1347).
 *
 * Adding an extension here must be enough. If you find yourself writing a
 * second list, that is the defect recurring.
 */

/** `.test` / `.spec` — the two supported test-file infixes. */
const TEST_SUFFIXES = ['.test', '.spec'] as const;

/**
 * Language extensions. `.mjs` / `.cjs` / `.mts` / `.cts` are included
 * deliberately: an ESM-first repo names its tests `*.test.mjs`, and omitting
 * them made entire suites invisible while the summary still reported a
 * confident zero.
 */
const TEST_LANG_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'] as const;

/** Every supported `<suffix><ext>` combination, e.g. `.test.mjs`. */
const TEST_FILE_EXTS: readonly string[] = TEST_SUFFIXES.flatMap((suffix) =>
  TEST_LANG_EXTS.map((ext) => `${suffix}${ext}`)
);

/** True when the file name matches a supported TS/JS test-file convention. */
export function isTsJsTestFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return TEST_FILE_EXTS.some((ext) => lower.endsWith(ext));
}
