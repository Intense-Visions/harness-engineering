// packages/core/src/entropy/types/size-budget.ts

export interface SizeBudgetConfig {
  enabled?: boolean;
  budgets: Record<string, { warn?: string }>;
  dependencyWeight?: { info?: string };
}

export interface SizeBudgetViolation {
  package: string;
  currentSize: number;
  budgetSize: number;
  unit: 'bytes';
  tier: 2 | 3;
  severity: 'warning' | 'info';
}

export interface SizeBudgetReport {
  violations: SizeBudgetViolation[];
  stats: {
    packagesChecked: number;
    violationCount: number;
    warningCount: number;
    infoCount: number;
  };
}
