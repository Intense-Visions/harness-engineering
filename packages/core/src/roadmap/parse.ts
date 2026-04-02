import type {
  Roadmap,
  RoadmapFrontmatter,
  RoadmapMilestone,
  RoadmapFeature,
  FeatureStatus,
  Priority,
  AssignmentRecord,
  Result,
} from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';

const VALID_STATUSES: ReadonlySet<string> = new Set([
  'backlog',
  'planned',
  'in-progress',
  'done',
  'blocked',
]);

const EM_DASH = '\u2014';

const VALID_PRIORITIES: ReadonlySet<string> = new Set(['P0', 'P1', 'P2', 'P3']);

/**
 * Parse a roadmap markdown string into a structured Roadmap object.
 * Returns Result<Roadmap> — Err on invalid input.
 */
export function parseRoadmap(markdown: string): Result<Roadmap> {
  // --- Frontmatter ---
  const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    return Err(new Error('Missing or malformed YAML frontmatter'));
  }

  const fmResult = parseFrontmatter(fmMatch[1]!);
  if (!fmResult.ok) return fmResult;

  // --- Body (after frontmatter) ---
  const body = markdown.slice(fmMatch[0].length);
  const milestonesResult = parseMilestones(body);
  if (!milestonesResult.ok) return milestonesResult;

  const historyResult = parseAssignmentHistory(body);
  if (!historyResult.ok) return historyResult;

  return Ok({
    frontmatter: fmResult.value,
    milestones: milestonesResult.value,
    assignmentHistory: historyResult.value,
  });
}

function parseFrontmatter(raw: string): Result<RoadmapFrontmatter> {
  const lines = raw.split('\n');
  const map = new Map<string, string>();
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    map.set(key, val);
  }

  const project = map.get('project');
  const versionStr = map.get('version');
  const lastSynced = map.get('last_synced');
  const lastManualEdit = map.get('last_manual_edit');
  const created = map.get('created');
  const updated = map.get('updated');

  if (!project || !versionStr || !lastSynced || !lastManualEdit) {
    return Err(
      new Error(
        'Frontmatter missing required fields: project, version, last_synced, last_manual_edit'
      )
    );
  }

  const version = parseInt(versionStr, 10);
  if (isNaN(version)) {
    return Err(new Error('Frontmatter version must be a number'));
  }

  const fm: RoadmapFrontmatter = { project, version, lastSynced, lastManualEdit };
  if (created) fm.created = created;
  if (updated) fm.updated = updated;
  return Ok(fm);
}

function parseMilestones(body: string): Result<RoadmapMilestone[]> {
  const milestones: RoadmapMilestone[] = [];
  const h2Pattern = /^## (.+)$/gm;
  const h2Matches: Array<{ heading: string; startIndex: number; fullMatch: string }> = [];
  let match: RegExpExecArray | null;
  let bodyEnd = body.length;
  while ((match = h2Pattern.exec(body)) !== null) {
    if (match[1] === 'Assignment History') {
      bodyEnd = match.index;
      break;
    }
    h2Matches.push({ heading: match[1]!, startIndex: match.index, fullMatch: match[0] });
  }

  for (let i = 0; i < h2Matches.length; i++) {
    const h2 = h2Matches[i]!;
    const nextStart = i + 1 < h2Matches.length ? h2Matches[i + 1]!.startIndex : bodyEnd;
    const sectionBody = body.slice(h2.startIndex + h2.fullMatch.length, nextStart);

    const isBacklog = h2.heading === 'Backlog';
    const milestoneName = isBacklog ? 'Backlog' : h2.heading.replace(/^Milestone:\s*/, '');

    const featuresResult = parseFeatures(sectionBody);
    if (!featuresResult.ok) return featuresResult;

    milestones.push({
      name: milestoneName,
      isBacklog,
      features: featuresResult.value,
    });
  }

  return Ok(milestones);
}

function parseFeatures(sectionBody: string): Result<RoadmapFeature[]> {
  const features: RoadmapFeature[] = [];
  // Split on H3 headings — accept both "### Feature: X" and "### X"
  const h3Pattern = /^### (?:Feature: )?(.+)$/gm;
  const h3Matches: Array<{ name: string; startIndex: number; fullMatch: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = h3Pattern.exec(sectionBody)) !== null) {
    h3Matches.push({ name: match[1]!, startIndex: match.index, fullMatch: match[0] });
  }

  for (let i = 0; i < h3Matches.length; i++) {
    const h3 = h3Matches[i]!;
    const nextStart = i + 1 < h3Matches.length ? h3Matches[i + 1]!.startIndex : sectionBody.length;
    const featureBody = sectionBody.slice(h3.startIndex + h3.fullMatch.length, nextStart);

    const featureResult = parseFeatureFields(h3.name, featureBody);
    if (!featureResult.ok) return featureResult;
    features.push(featureResult.value);
  }

  return Ok(features);
}

function extractFieldMap(body: string): Map<string, string> {
  const fieldMap = new Map<string, string>();
  const fieldPattern = /^- \*\*(.+?):\*\* (.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = fieldPattern.exec(body)) !== null) {
    fieldMap.set(match[1]!, match[2]!);
  }
  return fieldMap;
}

/** Parse a comma-separated field, returning [] for empty/dash/none values. */
function parseListField(fieldMap: Map<string, string>, ...keys: string[]): string[] {
  let raw = EM_DASH;
  for (const key of keys) {
    const val = fieldMap.get(key);
    if (val !== undefined) {
      raw = val;
      break;
    }
  }
  if (raw === EM_DASH || raw === 'none') return [];
  return raw.split(',').map((s) => s.trim());
}

function parseFeatureFields(name: string, body: string): Result<RoadmapFeature> {
  const fieldMap = extractFieldMap(body);

  const statusRaw = fieldMap.get('Status');
  if (!statusRaw || !VALID_STATUSES.has(statusRaw)) {
    return Err(
      new Error(
        `Feature "${name}" has invalid status: "${statusRaw ?? '(missing)'}". ` +
          `Valid statuses: ${[...VALID_STATUSES].join(', ')}`
      )
    );
  }

  const specRaw = fieldMap.get('Spec') ?? EM_DASH;
  const plans = parseListField(fieldMap, 'Plans', 'Plan');
  const blockedBy = parseListField(fieldMap, 'Blocked by', 'Blockers');

  // New extended fields
  const assigneeRaw = fieldMap.get('Assignee') ?? EM_DASH;
  const priorityRaw = fieldMap.get('Priority') ?? EM_DASH;
  const externalIdRaw = fieldMap.get('External-ID') ?? EM_DASH;

  // Validate priority if present
  if (priorityRaw !== EM_DASH && !VALID_PRIORITIES.has(priorityRaw)) {
    return Err(
      new Error(
        `Feature "${name}" has invalid priority: "${priorityRaw}". ` +
          `Valid priorities: ${[...VALID_PRIORITIES].join(', ')}`
      )
    );
  }

  return Ok({
    name,
    status: statusRaw as FeatureStatus,
    spec: specRaw === EM_DASH ? null : specRaw,
    plans,
    blockedBy,
    summary: fieldMap.get('Summary') ?? '',
    assignee: assigneeRaw === EM_DASH ? null : assigneeRaw,
    priority: priorityRaw === EM_DASH ? null : (priorityRaw as Priority),
    externalId: externalIdRaw === EM_DASH ? null : externalIdRaw,
  });
}

function parseAssignmentHistory(body: string): Result<AssignmentRecord[]> {
  const historyMatch = body.match(/^## Assignment History\s*\n/m);
  if (!historyMatch || historyMatch.index === undefined) return Ok([]);

  const historyStart = historyMatch.index + historyMatch[0].length;
  const rawHistoryBody = body.slice(historyStart);
  // Bound to next H2 heading so future sections after history are not consumed
  const nextH2 = rawHistoryBody.search(/^## /m);
  const historyBody = nextH2 === -1 ? rawHistoryBody : rawHistoryBody.slice(0, nextH2);

  const records: AssignmentRecord[] = [];
  // Parse markdown table rows. Rows before the separator (|---|...|) are
  // skipped (header). If no separator exists the table is treated as empty —
  // this is intentional tolerance for malformed tables.
  const lines = historyBody.split('\n');
  let pastHeader = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (!pastHeader) {
      if (trimmed.match(/^\|[-\s|]+\|$/)) {
        pastHeader = true;
      }
      continue;
    }
    // Parse data row: | Feature | Assignee | Action | Date |
    const cells = trimmed
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells.length < 4) continue;

    const action = cells[2] as AssignmentRecord['action'];
    if (!['assigned', 'completed', 'unassigned'].includes(action)) continue;

    records.push({
      feature: cells[0]!,
      assignee: cells[1]!,
      action,
      date: cells[3]!,
    });
  }

  return Ok(records);
}
