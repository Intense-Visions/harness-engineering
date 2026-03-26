// packages/core/src/entropy/types/complexity.ts

export interface ComplexityThresholds {
  cyclomaticComplexity?: { error?: number; warn?: number };
  nestingDepth?: { warn?: number };
  functionLength?: { warn?: number };
  parameterCount?: { warn?: number };
  fileLength?: { info?: number };
  hotspotPercentile?: { error?: number };
}

export interface ComplexityConfig {
  enabled?: boolean;
  thresholds?: ComplexityThresholds;
}

export interface ComplexityViolation {
  file: string;
  function: string;
  line: number;
  metric:
    | 'cyclomaticComplexity'
    | 'nestingDepth'
    | 'functionLength'
    | 'parameterCount'
    | 'fileLength'
    | 'hotspotScore';
  value: number;
  threshold: number;
  tier: 1 | 2 | 3;
  severity: 'error' | 'warning' | 'info';
  message?: string;
}

export interface ComplexityReport {
  violations: ComplexityViolation[];
  stats: {
    filesAnalyzed: number;
    functionsAnalyzed: number;
    violationCount: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
}
