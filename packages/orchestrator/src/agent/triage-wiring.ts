// packages/orchestrator/src/agent/triage-wiring.ts
//
// Roadmap Auto-Triage — Phase 1, Task 5: the orchestrator-side wiring for the pure probe.
//
// The pure `runScopingProbe` (intelligence) is provider/graph-injected and orchestrator-free.
// THIS module does the impure adaptation: build a `ProbeInput` from an `Issue` (reusing the
// AMR `buildTaskText` pre-diff signal derivation), resolve the SEL `AnalysisProvider`, and
// implement the `GraphScope` seam over a `GraphStore` + `CascadeSimulator`.
//
// The GraphScope seam is the S3 answer: the graph package exposes no clean "resolve raw
// string → node + blast radius" function (the MCP tools only resolve `file:` nodes by exact
// path/id, or take a pre-known nodeId). Raw-string resolution therefore lives HERE, behind
// the injected boundary, so the probe stays pure and this heuristic is swappable (NLQ later).
//
// Mirrors `live-classify.ts`'s split: pure cascade in intelligence, wiring in orchestrator.

import type { Issue } from '@harness-engineering/types';
import { GraphStore, CascadeSimulator, type GraphNode } from '@harness-engineering/graph';
import {
  runScopingProbe,
  extractEntities,
  rankTriageCandidates,
  pilotScore,
  type AnalysisProvider,
  type GraphScope,
  type PrecedentLookup,
  type ProbeConfig,
  type ProbeInput,
  type RankableCandidate,
  type ResolvedEntity,
  type TriageVerdict,
} from '@harness-engineering/intelligence';

// buildTaskText is an orchestrator-local pure helper (not exported by intelligence); reuse
// it so the pre-diff signal derivation is identical to the AMR live classifier.
import { buildTaskText } from './complexity-request.js';

/**
 * Build the pure `ProbeInput` from an `Issue`. Reuses `buildTaskText` for the pre-diff
 * text-only signals (title+description length, spec/acceptance hints, prompt) and
 * `extractEntities` for the candidate entity mentions the scope lever will try to resolve.
 *
 * Pure over the Issue — unit-testable without instantiating an Orchestrator.
 */
export function buildProbeInput(issue: Issue): ProbeInput {
  const taskText = buildTaskText(issue);
  const combined = `${issue.title ?? ''}\n${issue.description ?? ''}`.trim();
  return {
    // An item lacking a stable externalId is not dispatch-eligible (proposal Assumptions);
    // we still probe it (read-only report), keyed by its identifier as a fallback.
    externalId: issue.externalId ?? issue.identifier ?? issue.id,
    taskText,
    entityCandidates: extractEntities(combined),
    labels: issue.labels ?? [],
  };
}

/** How a candidate string is looked up in the graph, in priority order. */
function findNode(store: GraphStore, candidate: string): GraphNode | null {
  const trimmed = candidate.trim();
  if (trimmed.length === 0) return null;

  // 1. Exact symbol name (BackendRouter, shapeKey).
  const byName = store.findNodes({ name: trimmed });
  if (byName.length > 0) return byName[0] ?? null;

  // 2. Exact path (packages/core/src/foo.ts).
  const byPath = store.findNodes({ path: trimmed });
  if (byPath.length > 0) return byPath[0] ?? null;

  // 3. Canonical file node id.
  const byId = store.getNode(`file:${trimmed}`);
  if (byId) return byId;

  return null;
}

/**
 * The concrete `GraphScope` seam over a loaded `GraphStore`. For each candidate it resolves
 * a node (name → path → file-id) and simulates the blast radius via `CascadeSimulator`
 * (`summary.totalAffected`). Returns `null` for unresolved candidates — the S3 contract: an
 * unresolved candidate does NOT count toward scope. Never throws out of `resolve` (the probe
 * also guards it, but we keep this defensive so one odd node can't sink the lever).
 */
export function makeGraphScope(store: GraphStore): GraphScope {
  const simulator = new CascadeSimulator(store);
  return {
    resolve(candidate: string): ResolvedEntity | null {
      try {
        const node = findNode(store, candidate);
        if (!node) return null;
        const result = simulator.simulate(node.id);
        return {
          candidate,
          nodeId: node.id,
          blastRadius: result.summary.totalAffected,
        };
      } catch {
        // A resolution failure for one candidate degrades to "unresolved" for that
        // candidate only — never throws, never fabricates a radius.
        return null;
      }
    },
  };
}

/** Injected dependencies for the wired triage over a single issue. */
export interface TriageWiringDeps {
  /** The SEL analysis provider (from `buildAnalysisProviderForLayer('sel', …)`). */
  provider?: AnalysisProvider | null;
  /** The loaded knowledge-graph store. Absent ⇒ scope degrades ⇒ everything holds. */
  graphStore?: GraphStore | null;
  /** The precedent lever (Phase 4 wires the real one; absent ⇒ cold-start unknown). */
  precedent?: PrecedentLookup;
  /** Gate seeds from `roadmap.autoTriage.thresholds`. */
  config?: Partial<ProbeConfig>;
  /** Optional model overrides threaded to the classifier tie-break. */
  models?: { fast?: string; standard?: string };
  /**
   * Signals that a model is available but its levers were DEFERRED for this run (cheap-first).
   * Threaded to the probe so a deferred (not missing) provider is worded accurately. See
   * `ProbeDeps.modelDeferred`.
   */
  modelDeferred?: boolean;
}

/**
 * Run the scoping probe over a single `Issue`: build the input, resolve the injected SEL
 * provider + graph seam, and invoke the pure probe. Returns the `TriageVerdict`. Never
 * throws — the probe itself is total; the only added surface here is graph-store adaptation,
 * which `makeGraphScope` keeps defensive.
 */
export async function triageIssue(
  issue: Issue,
  deps: TriageWiringDeps = {}
): Promise<TriageVerdict> {
  const input = buildProbeInput(issue);
  const graph = deps.graphStore ? makeGraphScope(deps.graphStore) : undefined;
  return runScopingProbe(input, {
    ...(deps.provider ? { provider: deps.provider } : {}),
    ...(graph ? { graph } : {}),
    ...(deps.precedent ? { precedent: deps.precedent } : {}),
    ...(deps.config ? { config: deps.config } : {}),
    ...(deps.models ? { models: deps.models } : {}),
    ...(deps.modelDeferred ? { modelDeferred: true } : {}),
  });
}

// Re-export the pure ranking so CLI/report consumers get one triage entry point without
// depending on @harness-engineering/intelligence directly.
export { rankTriageCandidates, pilotScore };
export type { RankableCandidate, TriageVerdict };
