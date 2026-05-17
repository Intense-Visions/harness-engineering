// packages/cli/src/commands/search.ts
//
// Hermes Phase 1 — `harness search "<query>"` CLI.
// Spec: docs/changes/hermes-phase-1-session-search/proposal.md (D6, §"`harness search` CLI shape")
import { Command } from 'commander';
import { INDEXED_FILE_KINDS, type IndexedFileKind } from '@harness-engineering/types';
import { logger } from '../output/logger';

interface SearchOptions {
  limit?: string;
  archivedOnly?: boolean;
  json?: boolean;
  reindex?: boolean;
  fileKinds?: string;
}

function parseFileKinds(raw: string | undefined): IndexedFileKind[] | undefined {
  if (!raw) return undefined;
  const set = new Set<IndexedFileKind>();
  for (const token of raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)) {
    if ((INDEXED_FILE_KINDS as readonly string[]).includes(token)) {
      set.add(token as IndexedFileKind);
    } else {
      throw new Error(
        `unknown --file-kinds value: ${token} (allowed: ${INDEXED_FILE_KINDS.join(', ')})`
      );
    }
  }
  return [...set];
}

function fmtBytes(n: number): string {
  if (n < 1) return n.toFixed(2);
  if (n < 10) return n.toFixed(1);
  return n.toFixed(0);
}

export function createSearchCommand(): Command {
  return new Command('search')
    .description('Full-text search over archived + live session content (Hermes Phase 1).')
    .argument(
      '<query>',
      'FTS5 query (bare words AND-joined; quotes/AND/OR/NOT/column: for advanced syntax)'
    )
    .option('-n, --limit <n>', 'Max results', '20')
    .option('--archived-only', 'Skip live sessions, only search archived ones')
    .option('--json', 'Emit JSON to stdout instead of pretty text')
    .option(
      '--reindex',
      'Drop and rebuild the index from .harness/archive/sessions before searching'
    )
    .option('--file-kinds <list>', `Comma-separated subset of {${INDEXED_FILE_KINDS.join(',')}}`)
    .action(async (query: string, opts: SearchOptions) => {
      const cwd = process.cwd();
      const limit = Math.max(parseInt(opts.limit ?? '20', 10) || 20, 1);

      let fileKinds: IndexedFileKind[] | undefined;
      try {
        fileKinds = parseFileKinds(opts.fileKinds);
      } catch (e) {
        logger.error(e instanceof Error ? e.message : String(e));
        process.exit(2);
        return;
      }

      const orchestrator = await import('@harness-engineering/orchestrator');

      if (opts.reindex) {
        const stats = orchestrator.reindexFromArchive(cwd);
        if (!opts.json) {
          logger.info(
            `Reindexed ${stats.sessionsIndexed} sessions (${stats.docsWritten} docs, ${fmtBytes(stats.durationMs)} ms).`
          );
        }
      }

      const idx = orchestrator.openSearchIndex(cwd);
      try {
        const result = idx.search(query, {
          limit,
          ...(opts.archivedOnly && { archivedOnly: true }),
          ...(fileKinds && { fileKinds }),
        });

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.matches.length === 0) {
          logger.info(
            `No matches for "${query}" (corpus: ${result.totalIndexed} docs, ${result.durationMs} ms).`
          );
          return;
        }

        logger.info(
          `Results for "${query}"  (${result.matches.length} match${result.matches.length === 1 ? '' : 'es'}, ${result.durationMs} ms, corpus ${result.totalIndexed} docs)\n`
        );
        result.matches.forEach((match, i) => {
          const tag = `${match.archived ? 'archived' : 'live'}, ${match.fileKind}`;
          const idxLabel = `${(i + 1).toString().padStart(2, ' ')}.`;
          console.log(`  ${idxLabel}  ${match.sessionId}   [${tag}]`);
          console.log(`       ${match.snippet}`);
        });
      } finally {
        idx.close();
      }
    });
}
