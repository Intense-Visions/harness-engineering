/**
 * Session archive hook bundle.
 *
 * `buildArchiveHooks()` returns an `ArchiveHooks` implementation that wires
 * `summarizeArchivedSession()` + `retrospectArchivedSession()` +
 * `indexSessionDirectory()` together so the core `archiveSession()` lifecycle
 * invokes all three after a successful move. The retrospection step
 * auto-triggers at this session terminus and emits applyable proposals into
 * `.harness/proposals/` (emission only — never auto-applies).
 *
 * Every step is individually wrapped in try/catch — failure of any does not
 * propagate up the call stack. Spec: §"Risks" treats summary + retrospection +
 * index failure as non-fatal.
 */
import type { AnalysisProvider } from '@harness-engineering/intelligence';
import type { SessionsConfig } from '@harness-engineering/types';
import type { ArchiveHooks } from '@harness-engineering/core';
import { summarizeArchivedSession, isSummaryEnabled, type SummarizeContext } from './summarize.js';
import { openSearchIndex, indexSessionDirectory } from './search-index.js';
import { retrospectArchivedSession, isRetrospectionEnabled } from './retrospection.js';

export interface BuildArchiveHooksOptions {
  /** Absolute path to the project root (contains `.harness/`). */
  projectPath: string;
  /** Optional AnalysisProvider — summarization is skipped when omitted. */
  provider?: AnalysisProvider | undefined;
  /** Optional sessions config slice. */
  config?: SessionsConfig | undefined;
  /** Optional logger; falls back to console.warn. */
  logger?: HookLogger | undefined;
}

interface HookLogger {
  warn?: (msg: string, meta?: Record<string, unknown>) => void;
}

const defaultLogger: HookLogger = {
  warn: (msg, meta) => console.warn(`[sessions] ${msg}`, meta),
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
      logger.warn?.('session summary: failed', {
        sessionId,
        error: result.error.message,
      });
    }
  } catch (e) {
    logger.warn?.('session summary: threw', {
      sessionId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

async function runRetrospectionStep(
  opts: BuildArchiveHooksOptions,
  logger: HookLogger,
  sessionId: string,
  archiveDir: string
): Promise<void> {
  const cfg = opts.config?.retrospection;
  const enabled = isRetrospectionEnabled(cfg) && opts.provider != null;
  if (!enabled || !opts.provider) return;
  try {
    const result = await retrospectArchivedSession({
      archiveDir,
      sessionId,
      projectPath: opts.projectPath,
      provider: opts.provider,
      ...(cfg && { config: cfg }),
      ...(logger && { logger }),
    });
    if (!result.ok) {
      logger.warn?.('session retrospection: failed', {
        sessionId,
        error: result.error.message,
      });
    } else if (result.value.written.length === 0) {
      logger.warn?.('session retrospection: no applyable proposals emitted', {
        sessionId,
        skipped: result.value.skipped,
      });
    }
  } catch (e) {
    logger.warn?.('session retrospection: threw', {
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
        logger.warn?.('session index: no docs written', { sessionId, archiveDir });
      }
    } finally {
      idx.close();
    }
  } catch (e) {
    logger.warn?.('session index: failed', {
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
      await runRetrospectionStep(opts, logger, sessionId, archiveDir);
      runIndexStep(opts, logger, sessionId, archiveDir);
    },
  };
}
