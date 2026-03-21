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

  return Ok({ project, version, lastSynced, lastManualEdit });
}

function parseMilestones(body: string): Result<RoadmapMilestone[]> {
  const milestones: RoadmapMilestone[] = [];
  // Split on H2 headings
  const h2Pattern = /^## (.+)$/gm;
  const h2Matches: Array<{ heading: string; startIndex: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = h2Pattern.exec(body)) !== null) {
    h2Matches.push({ heading: match[1]!, startIndex: match.index });
  }

  for (let i = 0; i < h2Matches.length; i++) {
    const h2 = h2Matches[i]!;
    const nextStart = i + 1 < h2Matches.length ? h2Matches[i + 1]!.startIndex : body.length;
    const sectionBody = body.slice(h2.startIndex + h2.heading.length + 4, nextStart);

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
  // Split on H3 headings
  const h3Pattern = /^### Feature: (.+)$/gm;
  const h3Matches: Array<{ name: string; startIndex: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = h3Pattern.exec(sectionBody)) !== null) {
    h3Matches.push({ name: match[1]!, startIndex: match.index });
  }

  for (let i = 0; i < h3Matches.length; i++) {
    const h3 = h3Matches[i]!;
    const nextStart = i + 1 < h3Matches.length ? h3Matches[i + 1]!.startIndex : sectionBody.length;
    const featureBody = sectionBody.slice(
      h3.startIndex + `### Feature: ${h3.name}`.length,
      nextStart
    );

    const featureResult = parseFeatureFields(h3.name, featureBody);
    if (!featureResult.ok) return featureResult;
    features.push(featureResult.value);
  }

  return Ok(features);
}

function parseFeatureFields(name: string, body: string): Result<RoadmapFeature> {
  const fieldMap = new Map<string, string>();
  const fieldPattern = /^- \*\*(.+?):\*\* (.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = fieldPattern.exec(body)) !== null) {
    fieldMap.set(match[1]!, match[2]!);
  }

  const statusRaw = fieldMap.get('Status');
  if (!statusRaw || !VALID_STATUSES.has(statusRaw)) {
    return Err(
      new Error(
        `Feature "${name}" has invalid status: "${statusRaw ?? '(missing)'}". ` +
          `Valid statuses: ${[...VALID_STATUSES].join(', ')}`
      )
    );
  }
  const status = statusRaw as FeatureStatus;

  const specRaw = fieldMap.get('Spec') ?? EM_DASH;
  const spec = specRaw === EM_DASH ? null : specRaw;

  const plansRaw = fieldMap.get('Plans') ?? EM_DASH;
  const plans = plansRaw === EM_DASH ? [] : plansRaw.split(',').map((p) => p.trim());

  const blockedByRaw = fieldMap.get('Blocked by') ?? EM_DASH;
  const blockedBy = blockedByRaw === EM_DASH ? [] : blockedByRaw.split(',').map((b) => b.trim());

  const summary = fieldMap.get('Summary') ?? '';

  return Ok({ name, status, spec, plans, blockedBy, summary });
}
