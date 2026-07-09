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

/**
 * Best-effort link of a rollback event into the knowledge graph. Records the
 * event as a `learning` node and, when an `execution_outcome` node for the target
 * PR exists, adds a `references` edge to it. Fully degrade-safe: if the graph
 * package or store is unavailable (mirrors `outcome-eval.ts`'s `loadGraphStore`
 * fallback), it returns silently — the JSONL breadcrumb is the source of truth.
 */
export async function linkRollbackEventToGraph(
  event: RollbackEvent,
  opts: AppendOptions = {}
): Promise<void> {
  const root = opts.root ?? process.cwd();
  try {
    const { loadGraphStore } = await import('../mcp/utils/graph-loader.js');
    const store = await loadGraphStore(root);
    if (!store) return; // no graph — degrade-safe no-op

    const ts = (opts.now ?? (() => new Date().toISOString()))();
    const nodeId = `rollback_event:${event.targetPr}:${ts}`;
    store.addNode({
      id: nodeId,
      type: 'learning',
      name: `rollback ${event.action} for PR #${event.targetPr}`,
      metadata: { kind: 'rollback_event', ...event, ts },
      lastModified: ts,
    });

    // Link to the target's execution_outcome node when one is present.
    const outcomes = store.findNodes({ type: 'execution_outcome' });
    const target = outcomes.find(
      (n) => (n.metadata as { pr?: number; targetPr?: number }).pr === event.targetPr
    );
    if (target) {
      store.addEdge({ from: nodeId, to: target.id, type: 'references' });
    }

    await store.save(join(root, '.harness', 'graph'));
  } catch {
    /* graph package/store unavailable — JSONL breadcrumb is the source of truth */
  }
}
