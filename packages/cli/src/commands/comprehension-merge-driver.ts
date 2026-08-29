import { Command } from 'commander';
import * as fs from 'node:fs';
import { createNodeModuleSourceReader } from '@harness-engineering/core';
import { createStaticExtractor } from '../comprehension/static-extractor';
import { runComprehensionMergeDriver } from '../git/comprehension-merge-driver';
import { logger } from '../output/logger';

/**
 * [INTERNAL — invoked by git, not for manual use] The `comprehension` merge driver
 * (ADR 0109 slice 5). Git calls `harness comprehension-merge-driver %O %A %B %P`;
 * this keeps the ours shard when it is source-fresh (preserving its semantic) and
 * otherwise recompiles the static half from the current working-tree source,
 * writing the result to `%A` (ours), which git keeps on exit 0.
 *
 * It ALWAYS exits 0 — a merge is never blocked; a fallback (non-shard path / no
 * source / parse or compile error) simply keeps ours, and any resulting
 * source-staleness is caught by `comprehend --check`. The exit-0 guarantee is made
 * structural by the outer `try/finally`, so even an unexpected throw cannot leave a
 * non-zero exit that would block the merge.
 *
 * NOTE: git resolves the driver command via `harness` on PATH. In a repo whose
 * `harness` is a published global that predates this subcommand, git falls back to
 * a normal text merge (safe conflict markers) until the CLI is published/installed.
 */
export function createComprehensionMergeDriverCommand(): Command {
  return new Command('comprehension-merge-driver')
    .description(
      '[internal, git-invoked] Merge driver for comprehension _module.md shards (keep-ours-if-fresh, else static recompile)'
    )
    .argument('<base>', 'git %O — common-ancestor temp path (unused)')
    .argument('<ours>', 'git %A — ours temp path; the resolved shard is written here')
    .argument('<theirs>', 'git %B — other-side temp path (unused)')
    .argument('<path>', 'git %P — the shard pathname being merged')
    .action(async (_base: string, ours: string, _theirs: string, shardPath: string) => {
      try {
        const cwd = process.cwd();
        const reader = createNodeModuleSourceReader(cwd);
        const result = await runComprehensionMergeDriver(shardPath, {
          readOursShard: () => {
            try {
              return fs.readFileSync(ours, 'utf8');
            } catch {
              return null;
            }
          },
          readModuleSource: (m) => reader.readModuleSource(m),
          makeExtractStatic: (m) => createStaticExtractor({ projectRoot: cwd, module: m }),
          writeOurs: (content) => fs.writeFileSync(ours, content),
        });
        if (!result.resolved && result.reason) {
          logger.warn(`comprehension-merge-driver: ${result.reason}`);
        } else if (result.resolved) {
          logger.info(`comprehension-merge-driver: kept ${result.kept} for ${shardPath}`);
        }
      } finally {
        // ALWAYS exit 0 — never block a merge (fallback keeps ours). Structural:
        // even an unexpected throw above lands here.
        process.exit(0);
      }
    });
}
