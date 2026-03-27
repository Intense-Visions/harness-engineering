import type {
  Roadmap,
  RoadmapFrontmatter,
  RoadmapMilestone,
  RoadmapFeature,
  FeatureStatus,
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

  return Ok({
    frontmatter: fmResult.value,
    milestones: milestonesResult.value,
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
  // Split on H2 headings
  const h2Pattern = /^## (.+)$/gm;
  const h2Matches: Array<{ heading: string; startIndex: number; fullMatch: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = h2Pattern.exec(body)) !== null) {
    h2Matches.push({ heading: match[1]!, startIndex: match.index, fullMatch: match[0] });
  }

  for (let i = 0; i < h2Matches.length; i++) {
    const h2 = h2Matches[i]!;
    const nextStart = i + 1 < h2Matches.length ? h2Matches[i + 1]!.startIndex : body.length;
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

  return Ok({
    name,
    status: statusRaw as FeatureStatus,
    spec: specRaw === EM_DASH ? null : specRaw,
    plans,
    blockedBy,
    summary: fieldMap.get('Summary') ?? '',
  });
}
