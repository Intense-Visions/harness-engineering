import { parse as parseYaml } from 'yaml';
import type { RoadmapFrontmatter, Result } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import type { RoadmapMeta } from './roadmap-store';

const FRONTMATTER = /^---\n([\s\S]*?)\n---\s*$/;

/**
 * Parse a frontmatter-only `_meta.md` into `RoadmapMeta`.
 *
 * Uses the `yaml` package (NOT gray-matter): gray-matter's js-yaml engine
 * coerces ISO timestamp scalars to `Date` objects, which breaks string fidelity
 * and byte-stability. The `yaml` package's default schema keeps ISO strings as
 * strings and parses the `milestones:` block sequence. This is the documented
 * fallback in the Phase 1 plan's gray-matter assumption.
 */
export function parseMeta(md: string): Result<RoadmapMeta> {
  const match = md.match(FRONTMATTER);
  if (!match) {
    return Err(new Error('_meta.md is missing or has malformed YAML frontmatter'));
  }

  let data: Record<string, unknown>;
  try {
    const parsed = parseYaml(match[1]!);
    data = (parsed ?? {}) as Record<string, unknown>;
  } catch (err) {
    return Err(new Error(`_meta.md frontmatter is not valid YAML: ${(err as Error).message}`));
  }

  const project = data.project;
  const rawVersion = data.version;
  const lastSynced = data.last_synced;
  const lastManualEdit = data.last_manual_edit;

  if (
    typeof project !== 'string' ||
    (typeof rawVersion !== 'number' && typeof rawVersion !== 'string') ||
    typeof lastSynced !== 'string' ||
    typeof lastManualEdit !== 'string'
  ) {
    return Err(
      new Error(
        '_meta.md frontmatter missing required fields: project, version, last_synced, last_manual_edit'
      )
    );
  }

  const version = typeof rawVersion === 'number' ? rawVersion : parseInt(rawVersion, 10);
  if (Number.isNaN(version)) {
    return Err(new Error('_meta.md frontmatter version must be a number'));
  }

  const frontmatter: RoadmapFrontmatter = { project, version, lastSynced, lastManualEdit };
  if (typeof data.created === 'string') frontmatter.created = data.created;
  if (typeof data.updated === 'string') frontmatter.updated = data.updated;

  const rawMilestones = data.milestones;
  if (!Array.isArray(rawMilestones) || !rawMilestones.every((m) => typeof m === 'string')) {
    return Err(new Error('_meta.md frontmatter `milestones` must be a list of strings'));
  }

  return Ok({ frontmatter, milestones: rawMilestones as string[] });
}

/**
 * Serialize `RoadmapMeta` to a byte-stable `_meta.md`. Frontmatter is hand-emitted
 * in fixed key order (project, version, created?, updated?, last_synced,
 * last_manual_edit) followed by the `milestones:` block sequence — deterministic,
 * no YAML stringifier (whose quoting/ordering is not guaranteed stable).
 */
export function serializeMeta(meta: RoadmapMeta): string {
  const { frontmatter: fm, milestones } = meta;
  const lines = ['---', `project: ${fm.project}`, `version: ${fm.version}`];
  if (fm.created) lines.push(`created: ${fm.created}`);
  if (fm.updated) lines.push(`updated: ${fm.updated}`);
  lines.push(`last_synced: ${fm.lastSynced}`);
  lines.push(`last_manual_edit: ${fm.lastManualEdit}`);
  lines.push('milestones:');
  for (const name of milestones) {
    lines.push(`  - ${name}`);
  }
  lines.push('---');
  return lines.join('\n') + '\n';
}
