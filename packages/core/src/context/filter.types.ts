export type WorkflowPhase = 'implement' | 'review' | 'debug' | 'plan';

export interface FileCategory {
  category: string;
  patterns: string[];
  priority: number;
}

export interface ContextFilterResult {
  phase: WorkflowPhase;
  includedCategories: string[];
  excludedCategories: string[];
  filePatterns: string[];
}
