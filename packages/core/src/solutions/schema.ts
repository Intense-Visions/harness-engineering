import { z } from 'zod';
import type { SolutionDocFrontmatter } from '@harness-engineering/types';

export const BUG_TRACK_CATEGORIES = [
  'build-errors',
  'test-failures',
  'runtime-errors',
  'performance-issues',
  'database-issues',
  'security-issues',
  'ui-bugs',
  'integration-issues',
  'logic-errors',
] as const;

export const KNOWLEDGE_TRACK_CATEGORIES = [
  'architecture-patterns',
  'design-patterns',
  'tooling-decisions',
  'conventions',
  'dx',
  'best-practices',
] as const;

export const ALL_SOLUTION_CATEGORIES = [
  ...BUG_TRACK_CATEGORIES,
  ...KNOWLEDGE_TRACK_CATEGORIES,
] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const BugTrackSchema = z.object({
  track: z.literal('bug-track'),
  category: z.enum(BUG_TRACK_CATEGORIES),
});

const KnowledgeTrackSchema = z.object({
  track: z.literal('knowledge-track'),
  category: z.enum(KNOWLEDGE_TRACK_CATEGORIES),
});

const BaseFrontmatter = z.object({
  module: z.string().min(1),
  tags: z.array(z.string()),
  problem_type: z.string().min(1),
  last_updated: z.string().regex(ISO_DATE, 'last_updated must be ISO date YYYY-MM-DD'),
});

export const SolutionDocFrontmatterSchema = z.discriminatedUnion('track', [
  BaseFrontmatter.merge(BugTrackSchema),
  BaseFrontmatter.merge(KnowledgeTrackSchema),
]) satisfies z.ZodType<SolutionDocFrontmatter>;
