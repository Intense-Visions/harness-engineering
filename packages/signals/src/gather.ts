import { join } from 'node:path';
import { GraphStore } from '@harness-engineering/graph';
import { signalRegistry } from './registry';
import { SignalTimelineStore } from './timeline-store';
import { defaultCommandRunner } from './command-runner';
import type { SignalContext, SignalProvider, SignalResult } from './types';

/**
 * Directory (relative to the project root) where the knowledge graph is
 * persisted. Inlined here so this leaf package does not depend on any
 * dashboard-internal constant (preserves the exact `.harness/graph` path).
 */
const GRAPH_DIR = '.harness/graph';

/** Result of one signal-gather pass: the five (or fewer, on partial) cards + a stamp. */
export interface SignalsResult {
  signals: SignalResult[];
  /** ISO-8601 timestamp of this gather pass. */
  generatedAt: string;
}

/**
 * Best-effort graph load for `eval-fail-rate`'s context. Returns `undefined`
 * (never throws) when the graph is absent or unloadable — mirrors `gatherGraph`.
 */
async function loadGraphStore(projectPath: string): Promise<GraphStore | undefined> {
  try {
    const store = new GraphStore();
    const loaded = await store.load(join(projectPath, GRAPH_DIR));
    return loaded ? store : undefined;
  } catch {
    return undefined;
  }
}

/** Map a rejected provider to a self-contained `error` card (truth #5). */
function toErrorResult(provider: SignalProvider, reason: unknown): SignalResult {
  const message = reason instanceof Error ? reason.message : String(reason);
  return {
    id: provider.id,
    label: provider.label,
    value: null,
    unit: '',
    trend: 'flat',
    betterDirection: 'down',
    status: 'error',
    threshold: { warn: 0, alert: 0 },
    history: [],
    detail: `Signal failed: ${message}`,
    source: 'gatherSignals',
  };
}

/**
 * Run every registered `SignalProvider` against a freshly-built `SignalContext`
 * and return their results in registry order. Uses `Promise.allSettled` so one
 * provider that throws degrades to a single `error` card without sinking the
 * other four. The graph is loaded best-effort (eval-fail-rate consumes it).
 *
 * @internal Called with project-resolved paths, not from HTTP input.
 */
export async function gatherSignals(projectPath: string): Promise<SignalsResult> {
  const graphStore = await loadGraphStore(projectPath);
  const ctx: SignalContext = {
    projectPath,
    now: new Date(),
    timeline: new SignalTimelineStore(projectPath),
    runCommand: defaultCommandRunner,
    // `exactOptionalPropertyTypes`: only set `graphStore` when actually loaded.
    ...(graphStore ? { graphStore } : {}),
  };

  const settled = await Promise.allSettled(signalRegistry.map((p) => p.compute(ctx)));

  const signals = settled.map((outcome, i) =>
    outcome.status === 'fulfilled'
      ? outcome.value
      : toErrorResult(signalRegistry[i]!, outcome.reason)
  );

  return { signals, generatedAt: new Date().toISOString() };
}
