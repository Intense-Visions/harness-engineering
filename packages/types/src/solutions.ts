/**
 * Solution-doc frontmatter contract.
 * Schema lives in @harness-engineering/core (packages/core/src/solutions/schema.ts).
 * BusinessKnowledgeIngestor in packages/graph imports these types ONLY (no runtime).
 */

export type SolutionTrack = 'bug-track' | 'knowledge-track';

export type BugTrackCategory =
  | 'build-errors'
  | 'test-failures'
  | 'runtime-errors'
  | 'performance-issues'
  | 'database-issues'
  | 'security-issues'
  | 'ui-bugs'
  | 'integration-issues'
  | 'logic-errors';

export type KnowledgeTrackCategory =
  | 'architecture-patterns'
  | 'design-patterns'
  | 'tooling-decisions'
  | 'conventions'
  | 'dx'
  | 'best-practices';

export type SolutionCategory = BugTrackCategory | KnowledgeTrackCategory;

export interface SolutionDocFrontmatter {
  module: string;
  tags: string[];
  problem_type: string;
  last_updated: string; // ISO date YYYY-MM-DD
  track: SolutionTrack;
  category: SolutionCategory;
}
