import type {
  Roadmap,
  RoadmapMilestone,
  RoadmapFeature,
  AssignmentRecord,
} from '@harness-engineering/types';

const EM_DASH = '\u2014';

/**
 * Serialize a Roadmap object to markdown string.
 * Produces output that round-trips with parseRoadmap.
 */
export function serializeRoadmap(roadmap: Roadmap): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push(`project: ${roadmap.frontmatter.project}`);
  lines.push(`version: ${roadmap.frontmatter.version}`);
  if (roadmap.frontmatter.created) {
    lines.push(`created: ${roadmap.frontmatter.created}`);
  }
  if (roadmap.frontmatter.updated) {
    lines.push(`updated: ${roadmap.frontmatter.updated}`);
  }
  lines.push(`last_synced: ${roadmap.frontmatter.lastSynced}`);
  lines.push(`last_manual_edit: ${roadmap.frontmatter.lastManualEdit}`);
  lines.push('---');
  lines.push('');
  lines.push('# Roadmap');

  for (const milestone of roadmap.milestones) {
    lines.push('');
    lines.push(serializeMilestoneHeading(milestone));
    for (const feature of milestone.features) {
      lines.push('');
      lines.push(...serializeFeature(feature));
    }
  }

  // Assignment history section (omit if empty)
  if (roadmap.assignmentHistory && roadmap.assignmentHistory.length > 0) {
    lines.push('');
    lines.push(...serializeAssignmentHistory(roadmap.assignmentHistory));
  }

  lines.push('');
  return lines.join('\n');
}

function serializeMilestoneHeading(milestone: RoadmapMilestone): string {
  return milestone.isBacklog ? '## Backlog' : `## ${milestone.name}`;
}

function orDash(value: string | null | undefined): string {
  return value ?? EM_DASH;
}

function listOrDash(items: string[]): string {
  return items.length > 0 ? items.join(', ') : EM_DASH;
}

function serializeExtendedLines(feature: RoadmapFeature): string[] {
  const hasExtended =
    feature.assignee !== null ||
    feature.priority !== null ||
    feature.externalId !== null ||
    feature.updatedAt !== null;
  if (!hasExtended) return [];
  const lines = [
    `- **Assignee:** ${orDash(feature.assignee)}`,
    `- **Priority:** ${orDash(feature.priority)}`,
    `- **External-ID:** ${orDash(feature.externalId)}`,
  ];
  if (feature.updatedAt !== null) {
    lines.push(`- **Updated-At:** ${feature.updatedAt}`);
  }
  return lines;
}

function serializeFeature(feature: RoadmapFeature): string[] {
  const lines = [
    `### ${feature.name}`,
    '',
    `- **Status:** ${feature.status}`,
    `- **Spec:** ${orDash(feature.spec)}`,
    `- **Summary:** ${feature.summary}`,
    `- **Blockers:** ${listOrDash(feature.blockedBy)}`,
    `- **Plan:** ${listOrDash(feature.plans)}`,
    ...serializeExtendedLines(feature),
  ];
  return lines;
}

function serializeAssignmentHistory(records: AssignmentRecord[]): string[] {
  const lines = [
    '## Assignment History',
    '| Feature | Assignee | Action | Date |',
    '|---------|----------|--------|------|',
  ];
  for (const record of records) {
    lines.push(`| ${record.feature} | ${record.assignee} | ${record.action} | ${record.date} |`);
  }
  return lines;
}
