import type { WorkflowPhase, FileCategory, ContextFilterResult } from './filter.types';

const PHASE_PRIORITIES: Record<WorkflowPhase, FileCategory[]> = {
  implement: [
    { category: 'source', patterns: ['src/**/*.ts', 'src/**/*.tsx'], priority: 1 },
    {
      category: 'types',
      patterns: ['src/**/types.ts', 'src/**/interfaces.ts', '**/*.d.ts'],
      priority: 2,
    },
    { category: 'tests', patterns: ['tests/**/*.test.ts', '**/*.spec.ts'], priority: 3 },
    { category: 'specs', patterns: ['docs/specs/**/*.md'], priority: 4 },
    { category: 'config', patterns: ['package.json', 'tsconfig.json'], priority: 5 },
  ],
  review: [
    { category: 'diff', patterns: [], priority: 1 }, // Diff is provided, not globbed
    { category: 'specs', patterns: ['docs/specs/**/*.md', 'docs/plans/**/*.md'], priority: 2 },
    { category: 'learnings', patterns: ['.harness/review-learnings.md'], priority: 3 },
    { category: 'types', patterns: ['src/**/types.ts', 'src/**/interfaces.ts'], priority: 4 },
    { category: 'tests', patterns: ['tests/**/*.test.ts'], priority: 5 },
  ],
  debug: [
    { category: 'source', patterns: ['src/**/*.ts'], priority: 1 },
    { category: 'tests', patterns: ['tests/**/*.test.ts'], priority: 2 },
    { category: 'antipatterns', patterns: ['.harness/anti-patterns.md'], priority: 3 },
    { category: 'config', patterns: ['package.json', 'tsconfig.json', '.env*'], priority: 4 },
    { category: 'types', patterns: ['src/**/types.ts'], priority: 5 },
  ],
  plan: [
    { category: 'specs', patterns: ['docs/specs/**/*.md', 'docs/plans/**/*.md'], priority: 1 },
    { category: 'architecture', patterns: ['AGENTS.md', 'docs/standard/**/*.md'], priority: 2 },
    { category: 'handoffs', patterns: ['.harness/handoff.md'], priority: 3 },
    { category: 'types', patterns: ['src/**/types.ts', 'src/**/interfaces.ts'], priority: 4 },
    { category: 'config', patterns: ['harness.config.json', 'package.json'], priority: 5 },
  ],
};

export function contextFilter(
  phase: WorkflowPhase,
  maxCategories?: number,
  graphFilePaths?: string[]
): ContextFilterResult {
  const categories = PHASE_PRIORITIES[phase];
  const limit = maxCategories ?? categories.length;

  const included = categories.slice(0, limit);
  const excluded = categories.slice(limit);

  return {
    phase,
    includedCategories: included.map((c) => c.category),
    excludedCategories: excluded.map((c) => c.category),
    filePatterns: graphFilePaths ?? included.flatMap((c) => c.patterns),
  };
}

export function getPhaseCategories(phase: WorkflowPhase): FileCategory[] {
  return [...PHASE_PRIORITIES[phase]];
}
