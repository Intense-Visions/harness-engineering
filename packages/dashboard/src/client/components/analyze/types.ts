export interface SELResult {
  intent: string;
  summary: string;
  affectedSystems: Array<{
    name: string;
    graphNodeId: string | null;
    confidence: number;
    transitiveDeps: string[];
    testCoverage: number;
    owner: string | null;
  }>;
  unknowns: string[];
  ambiguities: string[];
  riskSignals: string[];
}

export interface CMLResult {
  overall: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  blastRadius: {
    services: number;
    modules: number;
    filesEstimated: number;
    testFilesAffected: number;
  };
  dimensions: {
    structural: number;
    semantic: number;
    historical: number;
  };
  reasoning: string[];
  recommendedRoute: 'local' | 'human' | 'simulation-required';
}

export interface PESLResult {
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

export interface Signal {
  name: string;
  reason: string;
}

export type ActionState =
  | 'idle'
  | 'roadmap-pending'
  | 'roadmap-done'
  | 'dispatch-pending'
  | 'dispatch-done';
