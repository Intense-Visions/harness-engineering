// packages/core/src/state/event-sourcing/migrate.ts
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../../shared/result';
import { Ok, Err } from '../../shared/result';
import { STATE_FILE } from '../state-shared';
import { HarnessStateSchema } from '../types';
import { eventLogPaths, loadEvents, emitEvent, type EventLogOptions } from './log';

/** Process-level memo: at most one genesis check per resolved log path per process. */
const ensured = new Set<string>();

/** True if the log already carries a genesis `state_imported` event (D6 idempotency key). */
async function hasGenesis(projectPath: string, options?: EventLogOptions): Promise<boolean> {
  const loaded = await loadEvents(projectPath, options);
  if (!loaded.ok) return false; // unreadable log → treat as not-yet-imported (import will re-run safely)
  return loaded.value.some((e) => e.type === 'state_imported');
}

/**
 * D6 genesis import. Idempotent on "a `state_imported` event is present in the log" — NOT on
 * "the legacy file exists". Crash-safe: an empty log from a crashed import still imports; an
 * already-emitted genesis is never duplicated. Emits ONE honest `state_imported` capturing the
 * legacy snapshot verbatim — no fabricated per-field events. Renames the consumed file aside.
 */
export async function importLegacyState(
  projectPath: string,
  options?: EventLogOptions
): Promise<Result<{ imported: boolean }, Error>> {
  try {
    const { dir } = await eventLogPaths(projectPath, options);
    const memoKey = dir;
    if (ensured.has(memoKey)) return Ok({ imported: false });

    if (await hasGenesis(projectPath, options)) {
      ensured.add(memoKey);
      return Ok({ imported: false });
    }

    const legacyPath = path.join(dir, STATE_FILE);
    if (!fs.existsSync(legacyPath)) {
      ensured.add(memoKey);
      return Ok({ imported: false }); // fresh project, nothing to import
    }

    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(legacyPath, 'utf-8'));
    } catch {
      // Corrupt/unparseable legacy file: do not fabricate. Leave it; reads fall back to empty.
      ensured.add(memoKey);
      return Ok({ imported: false });
    }
    const parsed = HarnessStateSchema.safeParse(raw);
    if (!parsed.success) {
      // Schema-invalid legacy file: do not fabricate. Leave it; reads fall back to empty.
      ensured.add(memoKey);
      return Ok({ imported: false });
    }

    const emit = await emitEvent(
      projectPath,
      { type: 'state_imported', payload: { legacyState: parsed.data } },
      options
    );
    if (!emit.ok) return emit;

    // Authoritative event is committed; renaming the file aside is best-effort (non-fatal).
    try {
      fs.renameSync(legacyPath, `${legacyPath}.imported`);
    } catch {
      /* event is authoritative; a re-run is a no-op via hasGenesis */
    }
    ensured.add(memoKey);
    return Ok({ imported: true });
  } catch (error) {
    return Err(
      new Error(
        `Failed to import legacy state: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

/** Test-only: clear the per-process memo so tests exercise the on-disk idempotency path. */
export function __resetGenesisMemoForTests(): void {
  ensured.clear();
}
