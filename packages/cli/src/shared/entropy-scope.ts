import * as path from 'path';
import type { HarnessConfig } from '../config/schema.js';

/**
 * Where an entropy scan is rooted and which docs feed its drift denominator,
 * resolved from a loaded harness config exactly the way `harness cleanup`
 * resolves them.
 *
 * Shared so the MCP `detect_entropy` tool and `harness cleanup` cannot scope
 * the same config differently (#2168). Before this the tool rooted the scan on
 * the path it was handed rather than `config.rootDir`, and with no
 * `entropy.drift.docPaths` it fell back to the analyzer's built-in globs
 * (which include every README) where the CLI uses `<docsDir>/**\/*.md` — so the
 * same repository produced two different drift denominators.
 */
export interface EntropyScope {
  /** Absolute scan root: `config.rootDir` resolved against the project root. */
  rootDir: string;
  /**
   * Drift doc globs: `entropy.drift.docPaths` when configured, else every
   * markdown file under `docsDir`. A glob, not a directory — a bare directory
   * matches nothing (#301).
   */
  docPaths: string[];
}

export function resolveEntropyScope(config: HarnessConfig, projectRoot: string): EntropyScope {
  const configuredDocPaths = (config.entropy?.drift as { docPaths?: string[] } | undefined)
    ?.docPaths;
  return {
    rootDir: path.resolve(projectRoot, config.rootDir),
    docPaths: configuredDocPaths ?? [
      path.join(path.resolve(projectRoot, config.docsDir), '**/*.md'),
    ],
  };
}
