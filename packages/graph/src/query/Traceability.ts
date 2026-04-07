import type { GraphStore } from '../store/GraphStore.js';
import type { GraphEdge } from '../types.js';

// --- Types ---

export interface TracedFile {
  readonly path: string;
  readonly confidence: number;
  readonly method: 'convention' | 'annotation' | 'plan-file-map';
}

export interface RequirementCoverage {
  readonly requirementId: string;
  readonly requirementName: string;
  readonly index: number;
  readonly codeFiles: readonly TracedFile[];
  readonly testFiles: readonly TracedFile[];
  readonly status: 'full' | 'code-only' | 'test-only' | 'none';
  readonly maxConfidence: number;
}

export interface TraceabilityResult {
  readonly specPath: string;
  readonly featureName: string;
  readonly requirements: readonly RequirementCoverage[];
  readonly summary: {
    readonly total: number;
    readonly withCode: number;
    readonly withTests: number;
    readonly fullyTraced: number;
    readonly untraceable: number;
    readonly coveragePercent: number;
  };
}

export interface TraceabilityOptions {
  readonly specPath?: string;
  readonly featureName?: string;
}

// --- Helpers ---

function extractConfidence(edge: GraphEdge): number {
  return edge.confidence ?? (edge.metadata?.confidence as number) ?? 0;
}

function extractMethod(edge: GraphEdge): TracedFile['method'] {
  return (edge.metadata?.method as TracedFile['method']) ?? 'convention';
}

function edgesToTracedFiles(store: GraphStore, edges: readonly GraphEdge[]): TracedFile[] {
  return edges.map((edge) => ({
    path: store.getNode(edge.to)?.path ?? edge.to,
    confidence: extractConfidence(edge),
    method: extractMethod(edge),
  }));
}

function determineCoverageStatus(
  hasCode: boolean,
  hasTests: boolean
): RequirementCoverage['status'] {
  if (hasCode && hasTests) return 'full';
  if (hasCode) return 'code-only';
  if (hasTests) return 'test-only';
  return 'none';
}

function computeMaxConfidence(codeFiles: TracedFile[], testFiles: TracedFile[]): number {
  const allConfidences = [
    ...codeFiles.map((f) => f.confidence),
    ...testFiles.map((f) => f.confidence),
  ];
  return allConfidences.length > 0 ? Math.max(...allConfidences) : 0;
}

function buildRequirementCoverage(
  store: GraphStore,
  req: { id: string; name: string; metadata?: Record<string, unknown> | null }
): RequirementCoverage {
  const codeFiles = edgesToTracedFiles(store, store.getEdges({ from: req.id, type: 'requires' }));
  const testFiles = edgesToTracedFiles(
    store,
    store.getEdges({ from: req.id, type: 'verified_by' })
  );

  const hasCode = codeFiles.length > 0;
  const hasTests = testFiles.length > 0;

  return {
    requirementId: req.id,
    requirementName: req.name,
    index: (req.metadata?.index as number) ?? 0,
    codeFiles,
    testFiles,
    status: determineCoverageStatus(hasCode, hasTests),
    maxConfidence: computeMaxConfidence(codeFiles, testFiles),
  };
}

function computeSummary(requirements: RequirementCoverage[]): TraceabilityResult['summary'] {
  const total = requirements.length;
  const withCode = requirements.filter((r) => r.codeFiles.length > 0).length;
  const withTests = requirements.filter((r) => r.testFiles.length > 0).length;
  const fullyTraced = requirements.filter((r) => r.status === 'full').length;
  const untraceable = requirements.filter((r) => r.status === 'none').length;
  const coveragePercent = total > 0 ? Math.round((fullyTraced / total) * 100) : 0;
  return { total, withCode, withTests, fullyTraced, untraceable, coveragePercent };
}

// --- Query ---

export function queryTraceability(
  store: GraphStore,
  options?: TraceabilityOptions
): TraceabilityResult[] {
  // Step 1: Find all requirement nodes, optionally filtered
  const allRequirements = store.findNodes({ type: 'requirement' });

  const filtered = allRequirements.filter((node) => {
    if (options?.specPath && node.metadata?.specPath !== options.specPath) return false;
    if (options?.featureName && node.metadata?.featureName !== options.featureName) return false;
    return true;
  });

  if (filtered.length === 0) return [];

  // Step 2: Group requirements by (specPath, featureName)
  const groups = new Map<string, typeof filtered>();
  for (const req of filtered) {
    const meta = req.metadata as Record<string, string | undefined> | undefined;
    const specPath = meta?.specPath ?? '';
    const featureName = meta?.featureName ?? '';
    const key = `${specPath}\0${featureName}`;
    const list = groups.get(key);
    if (list) {
      list.push(req);
    } else {
      groups.set(key, [req]);
    }
  }

  // Step 3: Build TraceabilityResult for each group
  const results: TraceabilityResult[] = [];

  for (const [, reqs] of groups) {
    const firstReq = reqs[0]!;
    const firstMeta = firstReq.metadata as Record<string, string | undefined> | undefined;
    const specPath = firstMeta?.specPath ?? '';
    const featureName = firstMeta?.featureName ?? '';

    const requirements = reqs.map((req) => buildRequirementCoverage(store, req));
    requirements.sort((a, b) => a.index - b.index);

    results.push({
      specPath,
      featureName,
      requirements,
      summary: computeSummary(requirements),
    });
  }

  return results;
}
