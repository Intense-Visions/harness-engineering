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

function serializeFeature(feature: RoadmapFeature): string[] {
  const spec = feature.spec ?? EM_DASH;
  const plans = feature.plans.length > 0 ? feature.plans.join(', ') : EM_DASH;
  const blockedBy = feature.blockedBy.length > 0 ? feature.blockedBy.join(', ') : EM_DASH;

  const lines = [
    `### ${feature.name}`,
    '',
    `- **Status:** ${feature.status}`,
    `- **Spec:** ${spec}`,
    `- **Summary:** ${feature.summary}`,
    `- **Blockers:** ${blockedBy}`,
    `- **Plan:** ${plans}`,
  ];

  // Emit extended fields only when at least one is non-null
  const hasExtended =
    feature.assignee !== null || feature.priority !== null || feature.externalId !== null;
  if (hasExtended) {
    lines.push(`- **Assignee:** ${feature.assignee ?? EM_DASH}`);
    lines.push(`- **Priority:** ${feature.priority ?? EM_DASH}`);
    lines.push(`- **External-ID:** ${feature.externalId ?? EM_DASH}`);
  }

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
