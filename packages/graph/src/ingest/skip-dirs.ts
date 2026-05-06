/**
 * Default directory names skipped during source-file walking.
 *
 * Walking into these on a populated monorepo (e.g. .turbo or .claude/worktrees)
 * inflates the walked-file count by orders of magnitude and is the root cause
 * of the recursion-depth and heap-OOM crashes reported in
 * https://github.com/Intense-Visions/harness-engineering/issues/274.
 *
 * Categories covered:
 *   - VCS / repo metadata
 *   - Package-manager caches and stores
 *   - JS/TS framework build & dev caches
 *   - Test, coverage, and reporter outputs
 *   - Python virtualenvs and bytecode caches
 *   - JVM build outputs
 *   - IDE / editor metadata
 *   - AI agent sandbox directories (Claude Code worktrees, Cursor, Codex, etc.)
 *
 * Consumers may extend or replace this set via {@link CodeIngestorOptions}
 * or the project-level `ingest.skipDirs` / `ingest.additionalSkipDirs` config.
 */
export const DEFAULT_SKIP_DIRS: ReadonlySet<string> = new Set([
  // VCS
  '.git',
  '.hg',
  '.svn',

  // Package managers
  'node_modules',
  '.pnpm-store',
  '.yarn',
  'vendor',

  // JS/TS build outputs
  'dist',
  'build',
  'out',
  '_build',
  'bin',
  'obj',
  'target',
  'deps',

  // JS/TS framework / tooling caches
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.vite',
  '.cache',
  '.parcel-cache',
  '.docusaurus',
  '.wrangler',
  '.astro',
  '.remix',
  'storybook-static',

  // Test / coverage / reporter outputs
  'coverage',
  '.nyc_output',
  '.pytest_cache',
  'playwright-report',
  'test-results',
  '.e2e',

  // Python
  '__pycache__',
  '.venv',
  'venv',
  '.tox',
  '.mypy_cache',
  '.ruff_cache',

  // JVM
  '.gradle',
  '.gradle-home',

  // IDE / editor
  '.idea',
  '.vscode',
  '.vs',

  // Harness self
  '.harness',

  // AI agent sandboxes (these often contain full repo clones — skipping them
  // prevents the walker from re-ingesting nested copies of the project)
  '.claude',
  '.cursor',
  '.codex',
  '.gemini',
  '.aider',
  '.agents',
  '.agentastic',
  '.playwright-mcp',
]);

/**
 * Build an effective skip-dirs Set from optional caller overrides.
 * - If `skipDirs` is provided, it replaces the defaults entirely.
 * - If `additionalSkipDirs` is provided, it extends the defaults (or the override).
 */
export function resolveSkipDirs(options?: {
  skipDirs?: Iterable<string>;
  additionalSkipDirs?: Iterable<string>;
}): ReadonlySet<string> {
  const base = options?.skipDirs ? new Set(options.skipDirs) : new Set(DEFAULT_SKIP_DIRS);
  if (options?.additionalSkipDirs) {
    for (const name of options.additionalSkipDirs) base.add(name);
  }
  return base;
}
