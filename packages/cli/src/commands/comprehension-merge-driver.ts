import { Command } from 'commander';
import * as fs from 'node:fs';
import { createNodeModuleSourceReader } from '@harness-engineering/core';
import { createStaticExtractor } from '../comprehension/static-extractor';
import { runComprehensionMergeDriver } from '../git/comprehension-merge-driver';
import { logger } from '../output/logger';

/**
 * Internal command invoked BY GIT as the `comprehension` merge driver (ADR 0109
 * slice 5). Git calls `harness comprehension-merge-driver %O %A %B %P`; this
 * regenerates the conflicting shard (static-only) from the merged working-tree
 * source and writes it to `%A` (ours), which git keeps on exit 0. It ALWAYS exits
 * 0 — a merge is never blocked; a fallback (non-shard path / no source / compile
 * error) simply keeps ours, and any resulting staleness is caught by
 * `comprehend --check` and healed later.
 */
export function createComprehensionMergeDriverCommand(): Command {
  return new Command('comprehension-merge-driver')
    .description(
      'Internal git merge driver for comprehension _module.md shards (regenerate-on-conflict)'
    )
    .argument('<base>', 'git %O — common-ancestor temp path (unused)')
    .argument('<ours>', 'git %A — ours temp path; the resolved shard is written here')
    .argument('<theirs>', 'git %B — other-side temp path (unused)')
    .argument('<path>', 'git %P — the shard pathname being merged')
    .action(async (_base: string, ours: string, _theirs: string, shardPath: string) => {
      const cwd = process.cwd();
      const reader = createNodeModuleSourceReader(cwd);
      const result = await runComprehensionMergeDriver(
        { oursPath: ours, shardPath },
        {
          readModuleSource: (m) => reader.readModuleSource(m),
          makeExtractStatic: (m) => createStaticExtractor({ projectRoot: cwd, module: m }),
          writeOurs: (content) => fs.writeFileSync(ours, content),
        }
      );
      if (!result.resolved && result.reason) {
        logger.warn(`comprehension-merge-driver: ${result.reason}`);
      }
      // ALWAYS exit 0 — never block a merge (fallback keeps ours).
      process.exit(0);
    });
}
