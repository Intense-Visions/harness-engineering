import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parse } from 'yaml';
import { SkillMetadataSchema } from './schema.js';
import type { SkillAddress } from './schema.js';
import { resolveAllSkillsDirs } from '../utils/paths.js';

export interface SkillIndexEntry {
  tier: number;
  description: string;
  keywords: string[];
  stackSignals: string[];
  cognitiveMode: string | undefined;
  phases: string[];
  source: 'bundled' | 'community' | 'project';
  addresses: SkillAddress[];
  dependsOn: string[];
}

export interface SkillsIndex {
  version: number;
  hash: string;
  generatedAt: string;
  skills: Record<string, SkillIndexEntry>;
}

/**
 * Compute a hash of all skill.yaml mtimes across the given directories.
 * Used for staleness detection — if the hash changes, the index needs rebuilding.
 */
export function computeSkillsDirHash(skillsDirs: string[]): string {
  const hash = crypto.createHash('sha256');
  for (const dir of skillsDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const yamlPath = path.join(dir, entry.name, 'skill.yaml');
      if (!fs.existsSync(yamlPath)) continue;
      const stat = fs.statSync(yamlPath);
      hash.update(`${yamlPath}:${stat.mtimeMs}`);
    }
  }
  return hash.digest('hex');
}

/**
 * Try to parse a single skill.yaml and return an index entry if it qualifies.
 * Returns null if the skill should not be indexed.
 */
function parseSkillEntry(
  yamlPath: string,
  source: 'project' | 'community' | 'bundled',
  tierOverrides?: Record<string, number>
): SkillIndexEntry | null {
  const raw = fs.readFileSync(yamlPath, 'utf-8');
  const parsed = parse(raw);
  const result = SkillMetadataSchema.safeParse(parsed);
  if (!result.success) return null;

  const meta = result.data;
  const effectiveTier = tierOverrides?.[meta.name] ?? meta.tier;

  if (meta.internal) return null;
  if (effectiveTier !== 3 && source !== 'community') return null;

  return {
    tier: effectiveTier ?? 3,
    description: meta.description,
    keywords: meta.keywords ?? [],
    stackSignals: meta.stack_signals ?? [],
    cognitiveMode: meta.cognitive_mode,
    phases: (meta.phases ?? []).map((p) => p.name),
    source,
    addresses: meta.addresses ?? [],
    dependsOn: meta.depends_on ?? [],
  };
}

/**
 * Scan a single skills directory and add qualifying entries to the index.
 */
function scanDirectory(
  dir: string,
  source: 'project' | 'community' | 'bundled',
  index: SkillsIndex,
  tierOverrides?: Record<string, number>
): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (index.skills[entry.name]) continue; // first-found wins
    const yamlPath = path.join(dir, entry.name, 'skill.yaml');
    if (!fs.existsSync(yamlPath)) continue;
    try {
      const parsed = parseSkillEntry(yamlPath, source, tierOverrides);
      if (parsed) index.skills[entry.name] = parsed;
    } catch {
      continue;
    }
  }
}

/**
 * Build a fresh skills index by scanning all skill directories.
 * Only indexes Tier 3 and community skills — Tier 1/2 are always-loaded slash commands.
 */
export function buildIndex(
  platform: string,
  _projectRoot: string,
  tierOverrides?: Record<string, number>
): SkillsIndex {
  const skillsDirs = resolveAllSkillsDirs(platform);
  const sourceMap: Array<'project' | 'community' | 'bundled'> = ['project', 'community', 'bundled'];
  const index: SkillsIndex = {
    version: 1,
    hash: computeSkillsDirHash(skillsDirs),
    generatedAt: new Date().toISOString(),
    skills: {},
  };

  for (let i = 0; i < skillsDirs.length; i++) {
    scanDirectory(skillsDirs[i]!, sourceMap[i] ?? 'bundled', index, tierOverrides);
  }

  return index;
}

/**
 * Load the cached skills index or rebuild it if stale.
 * Hash-based staleness: compares skill.yaml mtimes against stored hash.
 */
export function loadOrRebuildIndex(
  platform: string,
  projectRoot: string,
  tierOverrides?: Record<string, number>
): SkillsIndex {
  const indexPath = path.join(projectRoot, '.harness', 'skills-index.json');
  const skillsDirs = resolveAllSkillsDirs(platform);
  const currentHash = computeSkillsDirHash(skillsDirs);

  if (fs.existsSync(indexPath)) {
    try {
      const existing: SkillsIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      if (existing.hash === currentHash) return existing;
    } catch {
      // Corrupt index, rebuild
    }
  }

  const index = buildIndex(platform, projectRoot, tierOverrides);
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  return index;
}
