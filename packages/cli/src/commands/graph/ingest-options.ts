import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CodeIngestorOptions } from '@harness-engineering/graph';
import { IngestConfigSchema } from '../../config/ingest-schema.js';

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

  // Pull just the `ingest` block; ignore the rest of the config to avoid
  // pulling the full HarnessConfigSchema (and its `@harness-engineering/core`
  // dependency) into the ingest hot path.
  const ingestRaw = (raw as { ingest?: unknown } | null | undefined)?.ingest;
  if (ingestRaw === undefined) return {};
  const parsed = IngestConfigSchema.safeParse(ingestRaw);
  if (!parsed.success) return {};

  // Build incrementally so we never emit `key: undefined` entries — the
  // workspace's `exactOptionalPropertyTypes` rejects them. A mutable shape
  // is used internally; the return type re-applies the readonly markers.
  const out: {
    -readonly [K in keyof CodeIngestorOptions]: CodeIngestorOptions[K];
  } = {};
  if (parsed.data.skipDirs !== undefined) out.skipDirs = parsed.data.skipDirs;
  if (parsed.data.additionalSkipDirs !== undefined)
    out.additionalSkipDirs = parsed.data.additionalSkipDirs;
  if (parsed.data.excludePatterns !== undefined) out.excludePatterns = parsed.data.excludePatterns;
  if (parsed.data.respectGitignore !== undefined)
    out.respectGitignore = parsed.data.respectGitignore;
  return out;
}
