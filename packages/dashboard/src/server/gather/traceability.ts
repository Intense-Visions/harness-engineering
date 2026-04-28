import { join } from 'node:path';
import { GraphStore, queryTraceability } from '@harness-engineering/graph';
import { GRAPH_DIR } from '../../shared/constants';

/** Aggregated traceability snapshot returned by the gather function. */
export interface TraceabilitySnapshot {
  /** Overall coverage percentage (fullyTraced / total) */
  overallCoverage: number;
  totals: {
    total: number;
    withCode: number;
    withTests: number;
    fullyTraced: number;
    untraceable: number;
  };
  /** Per-spec summaries */
  specs: {
    specPath: string;
    featureName: string;
    total: number;
    withCode: number;
    withTests: number;
    fullyTraced: number;
    untraceable: number;
    coveragePercent: number;
  }[];
  /** Flat list of every requirement with its coverage status */
  requirements: {
    requirementId: string;
    requirementName: string;
    specPath: string;
    featureName: string;
    status: 'full' | 'code-only' | 'test-only' | 'none';
    codeFileCount: number;
    testFileCount: number;
  }[];
  generatedAt: string;
}

/**
 * Load the knowledge graph and compute traceability coverage.
 * Returns null when the graph or requirement nodes are unavailable.
 */
export async function gatherTraceability(
  projectPath: string
): Promise<TraceabilitySnapshot | null> {
  const store = new GraphStore();
  const loaded = await store.load(join(projectPath, GRAPH_DIR));
  if (!loaded) return null;

  const results = queryTraceability(store);
  if (results.length === 0) return null;

  // Build per-spec summaries
  const specs = results.map((r) => ({
    specPath: r.specPath,
    featureName: r.featureName,
    ...r.summary,
  }));

  // Aggregate totals
  const totals = specs.reduce(
    (acc, s) => ({
      total: acc.total + s.total,
      withCode: acc.withCode + s.withCode,
      withTests: acc.withTests + s.withTests,
      fullyTraced: acc.fullyTraced + s.fullyTraced,
      untraceable: acc.untraceable + s.untraceable,
    }),
    { total: 0, withCode: 0, withTests: 0, fullyTraced: 0, untraceable: 0 }
  );

  const overallCoverage =
    totals.total > 0 ? Math.round((totals.fullyTraced / totals.total) * 100) : 0;

  // Flatten requirements for the table view
  const requirements = results.flatMap((r) =>
    r.requirements.map((req) => ({
      requirementId: req.requirementId,
      requirementName: req.requirementName,
      specPath: r.specPath,
      featureName: r.featureName,
      status: req.status,
      codeFileCount: req.codeFiles.length,
      testFileCount: req.testFiles.length,
    }))
  );

  return {
    overallCoverage,
    totals,
    specs,
    requirements,
    generatedAt: new Date().toISOString(),
  };
}
