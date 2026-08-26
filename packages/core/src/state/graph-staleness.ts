// packages/core/src/state/graph-staleness.ts
//
// Bridges deletion-based learning staleness onto the knowledge graph.
//
// The staleness computation itself lives in `detectStaleLearnings`
// (learnings-staleness.ts) — this module reuses it and stamps the result onto the
// learning / execution_outcome nodes in a GraphStore so the flag is reachable from
// NLQ. Deletion-based only; move/rename detection is a deliberate non-goal (#1514,
// ADR 0104). Core depends on graph, never the reverse, so this stamping — which
// needs both the staleness detector and the graph store — belongs here in core.

import type { GraphStore, GraphNode, NodeType } from '@harness-engineering/graph';
import type { Result } from '../shared/result';
import { Ok } from '../shared/result';
import { detectStaleLearnings } from './learnings-staleness';
import { extractFileReferences } from './learnings-overlap';

/** Node types that can carry a deletion-based staleness marker. */
const STALENESS_TARGET_TYPES: readonly NodeType[] = ['learning', 'execution_outcome'];

export interface GraphStalenessResult {
  /** How many learning / execution_outcome nodes were inspected. */
  readonly scanned: number;
  /** How many of those nodes were flagged stale. */
  readonly flagged: number;
  /** The union of cited file references that no longer exist. */
  readonly missingReferences: readonly string[];
}

export interface FlagStaleLearningNodesOptions {
  readonly stream?: string;
  readonly session?: string;
}

/**
 * Compute deletion-based learning staleness (via {@link detectStaleLearnings}) and
 * stamp a `staleness` marker onto the matching graph nodes.
 *
 * A learning / execution_outcome node is flagged when it cites a file that
 * `detectStaleLearnings` reported as missing. Reference extraction reuses
 * {@link extractFileReferences} — the same primitive the detector uses — so node
 * flagging stays consistent with the authoritative report.
 *
 * Back-compat: nodes with no missing references are left untouched (no `staleness`
 * field is added). Re-stamping a still-stale node refreshes its marker. The real scan
 * path (`harness graph scan`) rebuilds the store each run, so a node that has become
 * fresh simply never gets re-flagged.
 */
export async function flagStaleLearningNodes(
  store: GraphStore,
  projectPath: string,
  options?: FlagStaleLearningNodesOptions
): Promise<Result<GraphStalenessResult, Error>> {
  const report = await detectStaleLearnings(projectPath, options?.stream, options?.session);
  if (!report.ok) return report;

  const missing = new Set<string>();
  for (const entry of report.value.stale) {
    for (const ref of entry.missingReferences) missing.add(ref);
  }

  const detectedAt = new Date().toISOString();
  let scanned = 0;
  let flagged = 0;

  for (const type of STALENESS_TARGET_TYPES) {
    for (const node of store.findNodes({ type })) {
      scanned++;
      if (missing.size === 0) continue;

      const refs = extractFileReferences(`${node.name}\n${node.content ?? ''}`);
      const staleRefs = [...new Set(refs.filter((ref) => missing.has(ref)))];
      if (staleRefs.length === 0) continue;

      const flaggedNode: GraphNode = {
        ...node,
        staleness: {
          isStale: true,
          reason: 'referenced-file-missing',
          missingReferences: staleRefs,
          detectedAt,
        },
      };
      store.addNode(flaggedNode);
      flagged++;
    }
  }

  return Ok({ scanned, flagged, missingReferences: [...missing] });
}
