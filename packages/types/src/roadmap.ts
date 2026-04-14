/**
 * Valid statuses for a roadmap feature.
 */
export type FeatureStatus =
  | 'backlog'
  | 'planned'
  | 'in-progress'
  | 'done'
  | 'blocked'
  | 'needs-human';

/**
 * Priority override levels for roadmap features.
 * When present, priority replaces positional ordering as the primary sort key.
 */
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';

/**
 * A feature entry in the project roadmap.
 */
export interface RoadmapFeature {
  /** Feature name (from the H3 heading, without "Feature:" prefix) */
  name: string;
  /** Current status */
  status: FeatureStatus;
  /** Relative path to the spec file, or null if none */
  spec: string | null;
  /** Relative paths to plan files */
  plans: string[];
  /** Names of blocking features (textual references) */
  blockedBy: string[];
  /** One-line summary */
  summary: string;
  /** GitHub username, email, or display name — null if unassigned */
  assignee: string | null;
  /** Optional priority override — null uses positional ordering */
  priority: Priority | null;
  /** External tracker ID (e.g., "github:owner/repo#42") — null if not synced */
  externalId: string | null;
}

/**
 * A milestone grouping in the roadmap. The special "Backlog" milestone
 * has `isBacklog: true` and appears as `## Backlog` instead of `## Milestone: <name>`.
 */
export interface RoadmapMilestone {
  /** Milestone name (e.g., "MVP Release") or "Backlog" */
  name: string;
  /** True for the special Backlog section */
  isBacklog: boolean;
  /** Features in this milestone, in document order */
  features: RoadmapFeature[];
}

/**
 * A single record in the assignment history log.
 * Reassignment produces two records: 'unassigned' for previous, 'assigned' for new.
 */
export interface AssignmentRecord {
  /** Feature name */
  feature: string;
  /** Assignee identifier (username, email, or display name) */
  assignee: string;
  /** What happened */
  action: 'assigned' | 'completed' | 'unassigned';
  /** ISO date string (YYYY-MM-DD) */
  date: string;
}

/**
 * YAML frontmatter of the roadmap file.
 */
export interface RoadmapFrontmatter {
  /** Project name */
  project: string;
  /** Schema version (currently 1) */
  version: number;
  /** ISO date when roadmap was created */
  created?: string;
  /** ISO date when roadmap was last updated */
  updated?: string;
  /** ISO timestamp of last automated sync */
  lastSynced: string;
  /** ISO timestamp of last manual edit */
  lastManualEdit: string;
}

/**
 * Parsed roadmap document.
 */
export interface Roadmap {
  /** Parsed frontmatter */
  frontmatter: RoadmapFrontmatter;
  /** Milestones in document order (including Backlog) */
  milestones: RoadmapMilestone[];
  /** Assignment history records, in document order */
  assignmentHistory: AssignmentRecord[];
}
