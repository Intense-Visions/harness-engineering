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
}
