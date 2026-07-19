import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CodeIngestorOptions } from '@harness-engineering/graph';
import { IngestConfigSchema } from '../../config/ingest-schema.js';
import { AnalysisConfigSchema } from '../../config/analysis-schema.js';

/**
 * Best-effort load of `ingest.*` settings from `<projectPath>/harness.config.json`.
 *
 * Intentionally synchronous and best-effort: if the file is missing, malformed,
 * or fails schema validation, we silently fall back to {@link CodeIngestor} defaults.
 * Surfacing a hard error from the loader would make the broad scan/ingest commands
 * fail on projects that have not yet run `harness init`, which is worse than
 * "use sensible defaults".
 */
export function loadIngestOptions(projectPath: string): CodeIngestorOptions {
  const configPath = path.join(projectPath, 'harness.config.json');
  if (!fs.existsSync(configPath)) return {};

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }

  // Pull just the `ingest` + `analysis` blocks; ignore the rest of the config
  // to avoid pulling the full HarnessConfigSchema (and its
  // `@harness-engineering/core` dependency) into the ingest hot path.
  const record = raw as Record<string, unknown>;
  return buildOptions(
    parseBlock(record.ingest, IngestConfigSchema),
    parseBlock(record.analysis, AnalysisConfigSchema)
  );
}

/** Best-effort schema parse of one config block; undefined on absence/failure. */
function parseBlock<T>(
  block: unknown,
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }
): T | undefined {
  if (block === undefined) return undefined;
  const result = schema.safeParse(block);
  return result.success ? result.data : undefined;
}

/**
 * Assemble CodeIngestor options from the parsed blocks. Project-wide
 * `analysis.exclude` globs apply on top of ingest-specific ones.
 *
 * Built incrementally so we never emit `key: undefined` entries — the
 * workspace's `exactOptionalPropertyTypes` rejects them. A mutable shape
 * is used internally; the return type re-applies the readonly markers.
 */
function buildOptions(
  ingest: import('../../config/ingest-schema.js').IngestConfig | undefined,
  analysis: import('../../config/analysis-schema.js').AnalysisConfig | undefined
): CodeIngestorOptions {
  const excludePatterns = [...(ingest?.excludePatterns ?? []), ...(analysis?.exclude ?? [])];
  const out: {
    -readonly [K in keyof CodeIngestorOptions]: CodeIngestorOptions[K];
  } = {};
  if (ingest?.skipDirs !== undefined) out.skipDirs = ingest.skipDirs;
  if (ingest?.additionalSkipDirs !== undefined) out.additionalSkipDirs = ingest.additionalSkipDirs;
  if (excludePatterns.length > 0) out.excludePatterns = excludePatterns;
  if (ingest?.respectGitignore !== undefined) out.respectGitignore = ingest.respectGitignore;
  return out;
}
