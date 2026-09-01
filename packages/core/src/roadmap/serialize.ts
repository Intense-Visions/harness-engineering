import type {
  Roadmap,
  RoadmapMilestone,
  RoadmapFeature,
  AssignmentRecord,
} from '@harness-engineering/types';
// The H3 heading emitter lives in `./heading`, the single source of truth shared
// with both readers, so the emitter cannot drift from them (#1261).
import { serializeFeatureHeading } from './heading';
// The summary escape codec lives in `./summary-field`, the single source of truth
// shared with the parser, so a multi-line summary survives the line-oriented
// grammar's parse → serialize round-trip intact (#1756).
import { encodeSummaryField } from './summary-field';
// The list-field escape codec lives in `./list-field`, the single source of truth
// for the reversible comma escaping shared by the `Blockers` / `Plan` bullets
// (see that module for the grammar rationale, #1757).
import { encodeListField } from './list-field';

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

  // The directive/notes block under the title is re-emitted verbatim so a
  // parse → mutate → serialize cycle never silently drops it (#1328) — same
  // contract as the narrative `### Group:` sections below.
  if (roadmap.preamble) {
    lines.push('');
    lines.push(roadmap.preamble);
  }

  for (const milestone of roadmap.milestones) {
    lines.push(...serializeMilestoneSection(milestone));
  }

  // Assignment history section (omit if empty)
  if (roadmap.assignmentHistory && roadmap.assignmentHistory.length > 0) {
    lines.push('');
    lines.push(...serializeAssignmentHistory(roadmap.assignmentHistory));
  }

  lines.push('');
  return lines.join('\n');
}

/** One milestone: its heading, its strict feature rows, then its narrative groups. */
function serializeMilestoneSection(milestone: RoadmapMilestone): string[] {
  const lines: string[] = ['', serializeMilestoneHeading(milestone)];
  for (const feature of milestone.features) {
    lines.push('');
    lines.push(...serializeFeature(feature));
  }
  // Narrative `### Group:` sections are re-emitted verbatim AFTER the strict
  // features so a parse → mutate → serialize cycle never silently drops them.
  for (const group of milestone.groups ?? []) {
    lines.push('');
    lines.push(`### Group: ${group.name}`);
    // An empty body emits the heading alone — pushing a blank line plus an empty
    // string would leave a stray trailing blank line in the file.
    if (group.body !== '') {
      lines.push('');
      lines.push(group.body);
    }
  }
  return lines;
}

function serializeMilestoneHeading(milestone: RoadmapMilestone): string {
  return milestone.isBacklog ? '## Backlog' : `## ${milestone.name}`;
}

function orDash(value: string | null | undefined): string {
  return value ?? EM_DASH;
}

function listOrDash(items: string[]): string {
  return encodeListField(items) ?? EM_DASH;
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

/**
 * Serialize a single feature to its markdown lines: the `### name` heading, a
 * blank line, then the `- **Field:** value` bullet block. Exported so the shard
 * file format can reuse the exact same row emission (spec: reuse, do not
 * reimplement).
 */
export function serializeFeature(feature: RoadmapFeature): string[] {
  const lines = [
    serializeFeatureHeading(feature.name),
    '',
    `- **Status:** ${feature.status}`,
    `- **Spec:** ${orDash(feature.spec)}`,
    `- **Summary:** ${encodeSummaryField(feature.summary)}`,
    `- **Blockers:** ${listOrDash(feature.blockedBy)}`,
    `- **Plan:** ${listOrDash(feature.plans)}`,
    ...serializeExtendedLines(feature),
  ];
  return lines;
}

export function serializeAssignmentHistory(records: AssignmentRecord[]): string[] {
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
