export type SkillCategory =
  | 'health'
  | 'security'
  | 'performance'
  | 'architecture'
  | 'code-quality'
  | 'workflow';

export interface SkillEntry {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  slashCommand: string;
  contextSources?: string[];
  /**
   * Load-bearing gear (curation Tier-0) — the ~12 skills that carry the core
   * workflow, mirroring the `catalog_tier: 0` field in each skill's skill.yaml.
   * Surfaced first in the command palette and badged on the card.
   */
  loadBearing?: boolean;
}
