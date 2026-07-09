import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const ROLLBACK_EVENTS_FILE = join('.harness', 'signals', 'rollback-events.jsonl');

export interface RollbackEvent {
  targetPr: number;
  trigger: 'signal' | 'eval';
  revertReady: boolean;
  action: 'proposed' | 'skipped' | 'blocked';
  prUrl?: string;
}

export interface AppendOptions {
  /** Project root (default cwd). */
  root?: string;
  /** Injected clock for deterministic tests. */
  now?: () => string;
}

/**
 * Append-only rollback_event breadcrumb (spec D5/G4). Writes one JSONL line to
 * `.harness/signals/rollback-events.jsonl`. Best-effort graph linking to the
 * target's execution_outcome happens in a separate, degrade-safe step.
 */
export async function appendRollbackEvent(
  event: RollbackEvent,
  opts: AppendOptions = {}
): Promise<void> {
  const root = opts.root ?? process.cwd();
  const ts = (opts.now ?? (() => new Date().toISOString()))();
  const file = join(root, ROLLBACK_EVENTS_FILE);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify({ ...event, ts })}\n`, 'utf-8');
}
