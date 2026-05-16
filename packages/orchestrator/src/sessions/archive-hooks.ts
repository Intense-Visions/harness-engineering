/**
 * Hermes Phase 1 — archive hook bundle.
 *
 * `buildArchiveHooks()` returns an `ArchiveHooks` implementation that wires
 * `summarizeArchivedSession()` + `indexSessionDirectory()` together so the
 * core `archiveSession()` lifecycle invokes both after a successful move.
 *
 * Both steps are individually wrapped in try/catch — failure of either does
 * not propagate up the call stack. Spec: §"Risks" treats summary + index
 * failure as non-fatal.
 */
import type { AnalysisProvider } from '@harness-engineering/intelligence';
import type { HermesConfig } from '@harness-engineering/types';
import type { ArchiveHooks } from '@harness-engineering/core';
import { summarizeArchivedSession, isSummaryEnabled, type SummarizeContext } from './summarize.js';
import { openSearchIndex, indexSessionDirectory } from './search-index.js';

export interface BuildArchiveHooksOptions {
  /** Absolute path to the project root (contains `.harness/`). */
  projectPath: string;
  /** Optional AnalysisProvider — summarization is skipped when omitted. */
  provider?: AnalysisProvider | undefined;
  /** Optional Hermes config slice. */
  config?: HermesConfig | undefined;
  /** Optional logger; falls back to console.warn. */
  logger?: HookLogger | undefined;
}

interface HookLogger {
  warn?: (msg: string, meta?: Record<string, unknown>) => void;
}

const defaultLogger: HookLogger = {
  warn: (msg, meta) => console.warn(`[hermes] ${msg}`, meta),
};

async function runSummaryStep(
  opts: BuildArchiveHooksOptions,
  logger: HookLogger,
  sessionId: string,
  archiveDir: string
): Promise<void> {
  const enabled = isSummaryEnabled(opts.config?.summary) && opts.provider != null;
  if (!enabled || !opts.provider) return;
  const ctx: SummarizeContext = {
    archiveDir,
    provider: opts.provider,
    ...(opts.config?.summary && { config: opts.config.summary }),
    ...(logger && { logger }),
  };
  try {
    const result = await summarizeArchivedSession(ctx);
    if (!result.ok) {
      logger.warn?.('hermes summary: failed', {
        sessionId,
        error: result.error.message,
      });
    }
  } catch (e) {
    logger.warn?.('hermes summary: threw', {
      sessionId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

function runIndexStep(
  opts: BuildArchiveHooksOptions,
  logger: HookLogger,
  sessionId: string,
  archiveDir: string
): void {
  try {
    const idx = openSearchIndex(opts.projectPath);
    try {
      const result = indexSessionDirectory(idx, {
        sessionId,
        sessionDir: archiveDir,
        archived: true,
        projectPath: opts.projectPath,
        ...(opts.config?.search?.indexedFileKinds && {
          fileKinds: opts.config.search.indexedFileKinds,
        }),
        ...(opts.config?.search?.maxIndexBytesPerFile !== undefined && {
          maxBytesPerBody: opts.config.search.maxIndexBytesPerFile,
        }),
      });
      if (result.docsWritten === 0) {
        logger.warn?.('hermes index: no docs written', { sessionId, archiveDir });
      }
    } finally {
      idx.close();
    }
  } catch (e) {
    logger.warn?.('hermes index: failed', {
      sessionId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Construct the `ArchiveHooks` impl. Always returns a working hook bundle —
 * missing provider or disabled config simply skips that step.
 */
export function buildArchiveHooks(opts: BuildArchiveHooksOptions): ArchiveHooks {
  const logger = opts.logger ?? defaultLogger;
  return {
    async onArchived({ sessionId, archiveDir }) {
      await runSummaryStep(opts, logger, sessionId, archiveDir);
      runIndexStep(opts, logger, sessionId, archiveDir);
    },
  };
}
