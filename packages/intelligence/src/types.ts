/**
 * Raw work item — generic input from any adapter (roadmap, JIRA, GitHub, etc.)
 */
export interface RawWorkItem {
  id: string;
  title: string;
  description: string | null;
  labels: string[];
  metadata: Record<string, unknown>;
  linkedItems: string[];
  comments: string[];
  source: 'roadmap' | 'jira' | 'github' | 'linear' | 'manual';
}

/**
 * A system identified by SEL as affected, validated against the knowledge graph.
 */
export interface AffectedSystem {
  /** Human name from LLM output */
  name: string;
  /** Graph node ID if found, null if not in graph */
  graphNodeId: string | null;
  /** Confidence of graph match (0 if not found) */
  confidence: number;
  /** Transitive dependency IDs from CascadeSimulator */
  transitiveDeps: string[];
  /** Number of test files covering this system */
  testCoverage: number;
  /** Owning team or individual, if known */
  owner: string | null;
}

/**
 * Enriched spec — output of the Spec Enrichment Layer (SEL).
 */
export interface EnrichedSpec {
  id: string;
  title: string;
  intent: string;
  summary: string;
  affectedSystems: AffectedSystem[];
  functionalRequirements: string[];
  nonFunctionalRequirements: string[];
  apiChanges: string[];
  dbChanges: string[];
  integrationPoints: string[];
  assumptions: string[];
  unknowns: string[];
  ambiguities: string[];
  riskSignals: string[];
  initialComplexityHints: {
    textualComplexity: number;
    structuralComplexity: number;
  };
}

/**
 * Blast radius estimate from CML.
 */
export interface BlastRadius {
  services: number;
  modules: number;
  filesEstimated: number;
  testFilesAffected: number;
}

/**
 * Complexity score — output of the Complexity Modeling Layer (CML).
 */
export interface ComplexityScore {
  overall: number;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  blastRadius: BlastRadius;
  dimensions: {
    structural: number;
    semantic: number;
    historical: number;
  };
  reasoning: string[];
  recommendedRoute: 'local' | 'human' | 'simulation-required';
}

/**
 * Simulation result — output of the Pre-Execution Simulation Layer (PESL).
 */
export interface SimulationResult {
  simulatedPlan: string[];
  predictedFailures: string[];
  riskHotspots: string[];
  missingSteps: string[];
  testGaps: string[];
  executionConfidence: number;
  recommendedChanges: string[];
  abort: boolean;
  tier: 'graph-only' | 'full-simulation';
}
