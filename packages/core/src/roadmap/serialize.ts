import type { Roadmap, RoadmapMilestone, RoadmapFeature } from '@harness-engineering/types';

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
  lines.push(`last_synced: ${roadmap.frontmatter.lastSynced}`);
  lines.push(`last_manual_edit: ${roadmap.frontmatter.lastManualEdit}`);
  lines.push('---');
  lines.push('');
  lines.push('# Project Roadmap');

  for (const milestone of roadmap.milestones) {
    lines.push('');
    lines.push(serializeMilestoneHeading(milestone));
    for (const feature of milestone.features) {
      lines.push('');
      lines.push(...serializeFeature(feature));
    }
  }

  lines.push('');
  return lines.join('\n');
}

function serializeMilestoneHeading(milestone: RoadmapMilestone): string {
  return milestone.isBacklog ? '## Backlog' : `## Milestone: ${milestone.name}`;
}

function serializeFeature(feature: RoadmapFeature): string[] {
  const spec = feature.spec ?? EM_DASH;
  const plans = feature.plans.length > 0 ? feature.plans.join(', ') : EM_DASH;
  const blockedBy = feature.blockedBy.length > 0 ? feature.blockedBy.join(', ') : EM_DASH;

  return [
    `### Feature: ${feature.name}`,
    `- **Status:** ${feature.status}`,
    `- **Spec:** ${spec}`,
    `- **Plans:** ${plans}`,
    `- **Blocked by:** ${blockedBy}`,
    `- **Summary:** ${feature.summary}`,
  ];
}
