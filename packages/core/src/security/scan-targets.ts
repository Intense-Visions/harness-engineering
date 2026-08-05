/**
 * Which files a security scan is allowed to read — one definition, three callers.
 *
 * This lived as a copy-pasted glob literal in `check-security`, the CI
 * check-orchestrator, and the dashboard's security gatherer, and the three copies
 * had already drifted (the orchestrator's omitted `java`/`rb`). Every copy also
 * omitted `.mjs`/`.cjs`, so an ESM-only Node project — the whole point of `.mjs`
 * — got a scan that matched none of its source and a gate that passed because it
 * read nothing. The extension list is the security boundary, so it gets one home
 * and a test that pins it.
 *
 * Adding an extension here widens every scan at once. That is the intent: a
 * missing extension is a silent hole, never a conservative default.
 */

/**
 * Source extensions the rule engine can meaningfully scan.
 *
 * `mjs`/`cjs`/`mts`/`cts` are the ESM/CJS-explicit variants: same JavaScript and
 * TypeScript the rules already understand, different file suffix. `sh` is
 * deliberately absent — {@link SECURITY_SCAN_GLOB} covers code the AST/regex rules
 * target, and shell scanning is handled by its own command.
 */
export const SECURITY_SCAN_EXTENSIONS = [
  'ts',
  'tsx',
  'mts',
  'cts',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'go',
  'py',
  'java',
  'rb',
] as const;

/** Brace-expansion glob over {@link SECURITY_SCAN_EXTENSIONS}. */
export const SECURITY_SCAN_GLOB = `**/*.{${SECURITY_SCAN_EXTENSIONS.join(',')}}`;

/** Default ignores for a security scan when the project config sets none. */
export const SECURITY_SCAN_DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/*.test.ts',
  '**/fixtures/**',
] as const;
