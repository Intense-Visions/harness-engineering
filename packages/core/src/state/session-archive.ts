// packages/core/src/state/session-archive.ts
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { resolveSessionDir } from './session-resolver';
import { HARNESS_DIR, ARCHIVE_DIR } from './constants';

/**
 * Hook invoked after a session directory has been successfully moved into
 * `.harness/archive/sessions/`. Concrete implementations live in
 * `@harness-engineering/orchestrator` (Hermes Phase 1 — summary + index).
 * Failures inside the hook are non-fatal: the archive itself has already
 * succeeded by the time this runs.
 */
export interface ArchiveHooks {
  onArchived: (info: {
    sessionId: string;
    /** Absolute path of the new archived directory. */
    archiveDir: string;
    projectPath: string;
  }) => Promise<void> | void;
}

export interface ArchiveSessionOptions {
  hooks?: ArchiveHooks;
}

/**
 * Archives a session by moving its directory to
 * `.harness/archive/sessions/<slug>-<date>`.
 *
 * The original session directory is removed. If an archive with the same
 * date already exists, a numeric counter is appended.
 *
 * Optional `options.hooks.onArchived` is called after the move succeeds.
 * Hook failures are caught and logged; they do not propagate to the caller.
 */
export async function archiveSession(
  projectPath: string,
  sessionSlug: string,
  options: ArchiveSessionOptions = {}
): Promise<Result<void, Error>> {
  const dirResult = resolveSessionDir(projectPath, sessionSlug);
  if (!dirResult.ok) return dirResult;
  const sessionDir = dirResult.value;

  if (!fs.existsSync(sessionDir)) {
    return Err(new Error(`Session '${sessionSlug}' not found at ${sessionDir}`));
  }

  const archiveBase = path.join(projectPath, HARNESS_DIR, ARCHIVE_DIR, 'sessions');

  try {
    fs.mkdirSync(archiveBase, { recursive: true });

    const date = new Date().toISOString().split('T')[0];
    let archiveName = `${sessionSlug}-${date}`;
    let counter = 1;

    while (fs.existsSync(path.join(archiveBase, archiveName))) {
      archiveName = `${sessionSlug}-${date}-${counter}`;
      counter++;
    }

    const dest = path.join(archiveBase, archiveName);
    try {
      fs.renameSync(sessionDir, dest);
    } catch (renameErr: unknown) {
      if (
        renameErr instanceof Error &&
        'code' in renameErr &&
        (renameErr as NodeJS.ErrnoException).code === 'EXDEV'
      ) {
        // Cross-device: fall back to copy + remove
        fs.cpSync(sessionDir, dest, { recursive: true });
        fs.rmSync(sessionDir, { recursive: true });
      } else {
        throw renameErr;
      }
    }

    if (options.hooks?.onArchived) {
      try {
        await options.hooks.onArchived({
          sessionId: sessionSlug,
          archiveDir: dest,
          projectPath,
        });
      } catch (hookErr) {
        console.warn(
          `[archive-hooks] onArchived failed for ${sessionSlug}: ${
            hookErr instanceof Error ? hookErr.message : String(hookErr)
          }`
        );
      }
    }

    return Ok(undefined);
  } catch (error) {
    return Err(
      new Error(
        `Failed to archive session: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}
