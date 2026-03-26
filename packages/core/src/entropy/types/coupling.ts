// packages/core/src/entropy/types/coupling.ts

export interface CouplingThresholds {
  fanOut?: { warn?: number };
  fanIn?: { info?: number };
  couplingRatio?: { warn?: number };
  transitiveDependencyDepth?: { info?: number };
}

export interface CouplingConfig {
  enabled?: boolean;
  thresholds?: CouplingThresholds;
}

export interface CouplingViolation {
  file: string;
  metric: 'fanOut' | 'fanIn' | 'couplingRatio' | 'transitiveDependencyDepth';
  value: number;
  threshold: number;
  tier: 1 | 2 | 3;
  severity: 'error' | 'warning' | 'info';
  message?: string;
}

export interface CouplingReport {
  violations: CouplingViolation[];
  stats: {
    filesAnalyzed: number;
    violationCount: number;
    warningCount: number;
    infoCount: number;
  };
}
