import type { SkillsIndex, SkillIndexEntry } from './index-builder.js';
import type { StackProfile } from './stack-profile.js';

export interface DispatcherConfig {
  alwaysSuggest?: string[];
  neverSuggest?: string[];
}

export interface Suggestion {
  name: string;
  description: string;
  score: number;
}

const TIER_1_SKILLS = new Set([
  'harness-brainstorming',
  'harness-planning',
  'harness-execution',
  'harness-autopilot',
  'harness-tdd',
  'harness-debugging',
  'harness-refactoring',
]);

/**
 * Check whether a skill name belongs to the Tier 1 workflow set.
 * The dispatcher only fires for Tier 1 skills.
 */
export function isTier1Skill(skillName: string): boolean {
  return TIER_1_SKILLS.has(skillName);
}

/**
 * Score a single catalog skill against the current task context.
 *
 * Weights:
 *   0.5 — keyword match (skill keywords ∩ query terms)
 *   0.3 — stack signal match (project signals ∩ skill signals)
 *   0.2 — recency boost (agent recently touched matching files)
 */
export function scoreSkill(
  entry: SkillIndexEntry,
  queryTerms: string[],
  profile: StackProfile | null,
  recentFiles: string[]
): number {
  // Keyword match
  const matchedKeywords = entry.keywords.filter((kw) =>
    queryTerms.some(
      (term) =>
        kw.toLowerCase().includes(term.toLowerCase()) ||
        term.toLowerCase().includes(kw.toLowerCase())
    )
  );
  const keywordScore = queryTerms.length > 0 ? matchedKeywords.length / queryTerms.length : 0;

  // Stack signal match
  let stackScore = 0;
  if (profile && entry.stackSignals.length > 0) {
    const matchedSignals = entry.stackSignals.filter((signal) => {
      // Check direct signal match
      if (profile.signals[signal]) return true;
      // Check if any detected domain appears in the signal or keywords
      return profile.detectedDomains.some((domain) =>
        entry.keywords.some((kw) => kw.toLowerCase() === domain.toLowerCase())
      );
    });
    stackScore = matchedSignals.length / entry.stackSignals.length;
  }

  // Recency boost
  let recencyBoost = 0;
  if (recentFiles.length > 0) {
    const hasRecentMatch = entry.stackSignals.some((signal) => {
      const cleanSignal = signal.replace(/\*/g, '').replace(/\*\*/g, '');
      return recentFiles.some((f) => f.includes(cleanSignal));
    });
    recencyBoost = hasRecentMatch ? 1.0 : 0;
  }

  return 0.5 * keywordScore + 0.3 * stackScore + 0.2 * recencyBoost;
}

/**
 * Suggest relevant catalog skills for the current task.
 *
 * Returns up to 3 suggestions above the confidence threshold (0.4).
 * Respects alwaysSuggest (forced inclusion) and neverSuggest (forced exclusion).
 */
export function suggest(
  index: SkillsIndex,
  taskDescription: string,
  profile: StackProfile | null,
  recentFiles: string[],
  config?: DispatcherConfig
): Suggestion[] {
  const queryTerms = taskDescription
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  const scored: Suggestion[] = [];

  for (const [name, entry] of Object.entries(index.skills)) {
    if (config?.neverSuggest?.includes(name)) continue;

    const score = scoreSkill(entry, queryTerms, profile, recentFiles);
    const isForced = config?.alwaysSuggest?.includes(name);

    if (score >= 0.4 || isForced) {
      scored.push({
        name,
        description: entry.description,
        score: isForced ? Math.max(score, 1.0) : score,
      });
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, 3);
}

/**
 * Format suggestions as a markdown notice block for injection into skill context.
 * Returns empty string if no suggestions.
 */
export function formatSuggestions(suggestions: Suggestion[]): string {
  if (suggestions.length === 0) return '';
  const lines = suggestions.map((s) => `- **${s.name}** — ${s.description}`);
  return [
    '',
    '---',
    '## Suggested Domain Skills',
    'Based on your task and project stack, these catalog skills may be relevant:',
    ...lines,
    '',
    'To load a skill: call search_skills("<skill-name>") for full details.',
    '---',
  ].join('\n');
}
