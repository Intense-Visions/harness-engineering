import type { GraphStore } from '../store/GraphStore.js';

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
    const specPath = String(req.metadata?.specPath ?? '');
    const featureName = String(req.metadata?.featureName ?? '');
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
    const specPath = String(firstReq.metadata?.specPath ?? '');
    const featureName = String(firstReq.metadata?.featureName ?? '');
    const requirements: RequirementCoverage[] = [];

    for (const req of reqs) {
      // Traverse outbound 'requires' edges -> code files
      const requiresEdges = store.getEdges({ from: req.id, type: 'requires' });
      const codeFiles: TracedFile[] = requiresEdges.map((edge) => {
        const targetNode = store.getNode(edge.to);
        return {
          path: targetNode?.path ?? edge.to,
          confidence: edge.confidence ?? (edge.metadata?.confidence as number) ?? 0,
          method: (edge.metadata?.method as TracedFile['method']) ?? 'convention',
        };
      });

      // Traverse outbound 'verified_by' edges -> test files
      const verifiedByEdges = store.getEdges({ from: req.id, type: 'verified_by' });
      const testFiles: TracedFile[] = verifiedByEdges.map((edge) => {
        const targetNode = store.getNode(edge.to);
        return {
          path: targetNode?.path ?? edge.to,
          confidence: edge.confidence ?? (edge.metadata?.confidence as number) ?? 0,
          method: (edge.metadata?.method as TracedFile['method']) ?? 'convention',
        };
      });

      const hasCode = codeFiles.length > 0;
      const hasTests = testFiles.length > 0;
      const status: RequirementCoverage['status'] =
        hasCode && hasTests ? 'full' : hasCode ? 'code-only' : hasTests ? 'test-only' : 'none';

      const allConfidences = [
        ...codeFiles.map((f) => f.confidence),
        ...testFiles.map((f) => f.confidence),
      ];
      const maxConfidence = allConfidences.length > 0 ? Math.max(...allConfidences) : 0;

      requirements.push({
        requirementId: req.id,
        requirementName: req.name,
        index: (req.metadata?.index as number) ?? 0,
        codeFiles,
        testFiles,
        status,
        maxConfidence,
      });
    }

    // Sort by index for stable output
    requirements.sort((a, b) => a.index - b.index);

    const total = requirements.length;
    const withCode = requirements.filter((r) => r.codeFiles.length > 0).length;
    const withTests = requirements.filter((r) => r.testFiles.length > 0).length;
    const fullyTraced = requirements.filter((r) => r.status === 'full').length;
    const untraceable = requirements.filter((r) => r.status === 'none').length;
    const coveragePercent = total > 0 ? Math.round((fullyTraced / total) * 100) : 0;

    results.push({
      specPath,
      featureName,
      requirements,
      summary: { total, withCode, withTests, fullyTraced, untraceable, coveragePercent },
    });
  }

  return results;
}
