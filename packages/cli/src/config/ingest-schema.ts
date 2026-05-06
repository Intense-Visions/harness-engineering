import { z } from 'zod';

/**
 * Schema for source-file ingestion controls (used by `harness scan` and `harness ingest --source code`).
 *
 * Lives in its own file (separate from {@link HarnessConfigSchema}) so that the
 * scan/ingest command path can validate the `ingest` block without dragging in
 * the rest of the config schema's transitive imports — notably `@harness-engineering/core`,
 * which the graph-ingest unit tests mock incompletely.
 *
 * The default skip-list (see `DEFAULT_SKIP_DIRS` in `@harness-engineering/graph`)
 * is comprehensive — these fields are escape hatches for projects with non-standard
 * cache or output directories.
 */
export const IngestConfigSchema = z.object({
  /** Replace the default skip-dirs set entirely. Single path segments matched as directory names (NOT globs). */
  skipDirs: z.array(z.string().min(1)).optional(),
  /** Extend the default skip-dirs set. Recommended extension point. */
  additionalSkipDirs: z.array(z.string().min(1)).optional(),
  /** Glob patterns (minimatch syntax) excluded from ingestion. Matched against the project-relative POSIX-style path. */
  excludePatterns: z.array(z.string().min(1)).optional(),
  /** When true, parse `<rootDir>/.gitignore` and treat each line as an additional exclude pattern. Default: true. */
  respectGitignore: z.boolean().optional().default(true),
});

export type IngestConfig = z.infer<typeof IngestConfigSchema>;
