import type { SkillsIndex, SkillIndexEntry } from './index-builder.js';
import type { StackProfile } from './stack-profile.js';
import type { HealthSnapshot } from './health-snapshot.js';

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
 * Compute a 0-1 health relevance score for a skill against a health snapshot.
 *
 * Score is proportional to the overlap between the skill's declared `addresses`
 * signals and the snapshot's active signals. When addresses specify weights,
 * the weighted sum is used; otherwise each address contributes equally.
 *
 * Returns 0 when the skill has no addresses.
 */
export function computeHealthScore(entry: SkillIndexEntry, snapshot: HealthSnapshot): number {
  if (entry.addresses.length === 0) return 0;

  const activeSignals = new Set(snapshot.signals);

  const hasWeights = entry.addresses.some((a) => a.weight !== undefined);

  if (hasWeights) {
    // Weighted mode: sum matched weights / total weight
    let totalWeight = 0;
    let matchedWeight = 0;
    for (const addr of entry.addresses) {
      const w = addr.weight ?? 0.5;
      totalWeight += w;
      if (activeSignals.has(addr.signal)) {
        matchedWeight += w;
      }
    }
    return totalWeight > 0 ? matchedWeight / totalWeight : 0;
  }

  // Unweighted mode: count matched / total
  const matched = entry.addresses.filter((a) => activeSignals.has(a.signal)).length;
  return matched / entry.addresses.length;
}

/**
 * Score a single catalog skill against the current task context.
 *
 * Weights:
 *   0.35 — keyword match (skill keywords ∩ query terms)
 *   0.20 — name match (skill name segments ∩ query terms)
 *   0.10 — description match (query terms found in description)
 *   0.20 — stack signal match (project signals ∩ skill signals)
 *   0.15 — recency boost (agent recently touched matching files)
 */
export function scoreSkill(
  entry: SkillIndexEntry,
  queryTerms: string[],
  profile: StackProfile | null,
  recentFiles: string[],
  skillName: string,
  healthSnapshot?: HealthSnapshot
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

  // Name match — skill name segments matched against query terms
  let nameScore = 0;
  if (skillName.length > 0 && queryTerms.length > 0) {
    const nameSegments = skillName
      .toLowerCase()
      .split('-')
      .filter((s) => s.length > 2);
    const matchedNameSegments = queryTerms.filter((term) =>
      nameSegments.some((seg) => seg.includes(term) || term.includes(seg))
    );
    nameScore = matchedNameSegments.length / queryTerms.length;
  }

  // Description match — query terms found in description text
  let descScore = 0;
  if (queryTerms.length > 0) {
    const descLower = entry.description.toLowerCase();
    const matchedDescTerms = queryTerms.filter((term) => descLower.includes(term));
    descScore = matchedDescTerms.length / queryTerms.length;
  }

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
      const cleanSignal = signal.replace(/\*/g, '');
      return recentFiles.some((f) => f.includes(cleanSignal));
    });
    recencyBoost = hasRecentMatch ? 1.0 : 0;
  }

  let score =
    0.35 * keywordScore +
    0.2 * nameScore +
    0.1 * descScore +
    0.2 * stackScore +
    0.15 * recencyBoost;

  // Health boost: blend when a snapshot is provided
  if (healthSnapshot) {
    const healthScore = computeHealthScore(entry, healthSnapshot);
    score = 0.7 * score + 0.3 * healthScore;
  }

  return score;
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

    const score = scoreSkill(entry, queryTerms, profile, recentFiles, name);
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
