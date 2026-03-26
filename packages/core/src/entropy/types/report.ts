// packages/core/src/entropy/types/report.ts
import type { EntropyError } from '../../shared/errors';
import type { CodebaseSnapshot } from './snapshot';
import type { DriftReport } from './drift';
import type { DeadCodeReport } from './dead-code';
import type { PatternReport } from './pattern';
import type { ComplexityReport } from './complexity';
import type { CouplingReport } from './coupling';
import type { SizeBudgetReport } from './size-budget';

export interface AnalysisError {
  analyzer: 'drift' | 'deadCode' | 'patterns' | 'complexity' | 'coupling' | 'sizeBudget';
  error: EntropyError;
}

export interface EntropyReport {
  snapshot: CodebaseSnapshot;
  drift?: DriftReport;
  deadCode?: DeadCodeReport;
  patterns?: PatternReport;
  complexity?: ComplexityReport;
  coupling?: CouplingReport;
  sizeBudget?: SizeBudgetReport;
  analysisErrors: AnalysisError[];
  summary: {
    totalIssues: number;
    errors: number;
    warnings: number;
    fixableCount: number;
    suggestionCount: number;
  };
  timestamp: string;
  duration: number;
}
