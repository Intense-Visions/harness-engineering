/**
 * Content matching engine for the Pipeline Skill Advisor.
 * Scores skills from the index against ContentSignals extracted from specs.
 */

import type { SkillIndexEntry, SkillsIndex } from './index-builder.js';
import type {
  ContentSignals,
  ContentMatchResult,
  SkillMatch,
  SkillMatchTier,
} from './content-matcher-types.js';
import { TIER_THRESHOLDS, SCORING_WEIGHTS } from './content-matcher-types.js';
import { simpleStem } from './signal-extractor.js';

// ---------------------------------------------------------------------------
// Scoring sub-functions
// ---------------------------------------------------------------------------

/**
 * Compute keyword overlap using normalized Jaccard with stemming.
 * Stems both skill keywords and spec keywords, then computes intersection/union.
 */
export function computeKeywordOverlap(skillKeywords: string[], specKeywords: string[]): number {
  if (skillKeywords.length === 0 || specKeywords.length === 0) return 0;

  const stemTokens = (keywords: string[]): Set<string> => {
    const tokens = new Set<string>();
    for (const kw of keywords) {
      const parts = kw.toLowerCase().split(/[-_\s]+/);
      for (const part of parts) {
        if (part.length > 0) {
          tokens.add(simpleStem(part));
        }
      }
    }
    return tokens;
  };

  const skillStems = stemTokens(skillKeywords);
  const specStems = stemTokens(specKeywords);

  let intersectionCount = 0;
  for (const stem of skillStems) {
    if (specStems.has(stem)) intersectionCount++;
  }

  const unionSize = new Set([...skillStems, ...specStems]).size;
  return unionSize > 0 ? intersectionCount / unionSize : 0;
}

/**
 * Compute stack signal match.
 * Binary per signal: ratio of skill signals found in project signals.
 */
export function computeStackMatch(skillSignals: string[], projectSignals: string[]): number {
  if (skillSignals.length === 0) return 0;
  const projectSet = new Set(projectSignals.map((s) => s.toLowerCase()));
  const matched = skillSignals.filter((s) => projectSet.has(s.toLowerCase())).length;
  return matched / skillSignals.length;
}

/**
 * Compute term overlap between skill description and spec text.
 * Tokenizes description, counts how many description terms appear in spec text.
 */
export function computeTermOverlap(skillDescription: string, specText: string): number {
  if (!skillDescription || !specText) return 0;

  const tokenize = (text: string): string[] =>
    text
      .toLowerCase()
      .split(/[\s\-_,.;:!?()[\]{}"'`]+/)
      .filter((t) => t.length > 3)
      .map(simpleStem);

  const descTokens = tokenize(skillDescription);
  if (descTokens.length === 0) return 0;

  const specTokenSet = new Set(tokenize(specText));
  const matched = descTokens.filter((t) => specTokenSet.has(t)).length;
  return matched / descTokens.length;
}

/**
 * Compute domain match.
 * Checks if any skill keyword stems match a feature domain category name.
 * Returns 1.0 if any match, 0 otherwise.
 */
export function computeDomainMatch(entry: SkillIndexEntry, featureDomains: string[]): number {
  if (featureDomains.length === 0 || entry.keywords.length === 0) return 0;

  const domainKeywordMap: Record<string, string[]> = {
    design: [
      'design',
      'layout',
      'responsive',
      'typography',
      'color',
      'theme',
      'ui',
      'ux',
      'component',
      'css',
    ],
    auth: [
      'auth',
      'authentication',
      'authorization',
      'oauth',
      'session',
      'token',
      'jwt',
      'login',
      'credential',
    ],
    data: ['database', 'data', 'sql', 'query', 'migration', 'schema', 'orm', 'prisma', 'drizzle'],
    security: ['security', 'vulnerability', 'xss', 'csrf', 'injection', 'owasp', 'encrypt'],
    a11y: ['accessibility', 'a11y', 'aria', 'wcag', 'contrast', 'screen-reader'],
    perf: ['performance', 'perf', 'latency', 'cache', 'optimization', 'bundle', 'lighthouse'],
    testing: ['test', 'testing', 'coverage', 'mock', 'e2e', 'tdd', 'unit-test'],
    api: ['api', 'rest', 'graphql', 'endpoint', 'route', 'middleware', 'webhook'],
    infra: ['docker', 'kubernetes', 'ci', 'cd', 'deploy', 'terraform', 'cloud', 'container'],
    mobile: ['mobile', 'ios', 'android', 'react-native', 'flutter', 'app'],
  };

  const skillKeywordsLower = entry.keywords.map((k) => k.toLowerCase());

  for (const domain of featureDomains) {
    const domainKeywords = domainKeywordMap[domain];
    if (!domainKeywords) continue;
    const hasMatch = skillKeywordsLower.some((kw) =>
      domainKeywords.some((dk) => kw.includes(dk) || dk.includes(kw))
    );
    if (hasMatch) return 1.0;
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Tier classification
// ---------------------------------------------------------------------------

/**
 * Classify a score into a tier. Returns null for scores below the exclusion threshold.
 */
export function classifyTier(score: number): SkillMatchTier | null {
  if (score >= TIER_THRESHOLDS.apply) return 'apply';
  if (score >= TIER_THRESHOLDS.reference) return 'reference';
  if (score >= TIER_THRESHOLDS.consider) return 'consider';
  return null;
}

// ---------------------------------------------------------------------------
// When inference
// ---------------------------------------------------------------------------

/**
 * Infer when during the phase this skill should be applied.
 * Uses heuristics based on skill name, keywords, and type.
 */
export function inferWhen(name: string, entry: SkillIndexEntry): string {
  const nameLower = name.toLowerCase();
  const keywordsLower = entry.keywords.map((k) => k.toLowerCase()).join(' ');

  if (/scan|audit|i18n|lint/.test(nameLower)) return 'End of phase';
  if (/test|tdd|coverage|mock|e2e|snapshot/.test(keywordsLower) || /test/.test(nameLower))
    return 'Testing';
  if (/a11y|contrast|wcag|color.accessib/.test(nameLower) || /contrast|wcag/.test(keywordsLower))
    return 'After styling';
  if (/css|tailwind|typography|font|color|palette/.test(keywordsLower)) return 'During styling';
  if (/alignment|whitespace|spacing|grid/.test(keywordsLower)) return 'Layout review';
  if (/motion|animation|transition|parallax/.test(keywordsLower)) return 'During polish';
  if (/architect|pattern|api|schema|data.model/.test(keywordsLower))
    return 'Architecture decisions';
  if (nameLower.startsWith('gof-') || nameLower.startsWith('js-')) return 'Architecture decisions';

  return 'During implementation';
}

// ---------------------------------------------------------------------------
// Composite scoring
// ---------------------------------------------------------------------------

/**
 * Score a single skill against content signals.
 * Returns a 0-1 composite score using weighted dimensions.
 */
export function scoreSkillByContent(entry: SkillIndexEntry, signals: ContentSignals): number {
  const keywordScore = computeKeywordOverlap(entry.keywords, signals.specKeywords);
  const stackScore = computeStackMatch(entry.stackSignals, signals.stackSignals);
  const textToMatch = signals.taskText ?? signals.specText;
  const descScore = computeTermOverlap(entry.description, textToMatch);
  const domainScore = computeDomainMatch(entry, signals.featureDomain);

  return (
    SCORING_WEIGHTS.keyword * keywordScore +
    SCORING_WEIGHTS.stack * stackScore +
    SCORING_WEIGHTS.termOverlap * descScore +
    SCORING_WEIGHTS.domain * domainScore
  );
}

// ---------------------------------------------------------------------------
// Match reasons and category
// ---------------------------------------------------------------------------

function buildMatchReasons(entry: SkillIndexEntry, signals: ContentSignals): string[] {
  const reasons: string[] = [];

  const matchedKeywords = entry.keywords.filter((kw) =>
    signals.specKeywords.some(
      (sk) =>
        kw.toLowerCase().includes(sk.toLowerCase()) || sk.toLowerCase().includes(kw.toLowerCase())
    )
  );
  if (matchedKeywords.length > 0) {
    reasons.push(`Keywords: ${matchedKeywords.join(', ')}`);
  }

  const projectSignalSet = new Set(signals.stackSignals.map((s) => s.toLowerCase()));
  const matchedStack = entry.stackSignals.filter((s) => projectSignalSet.has(s.toLowerCase()));
  if (matchedStack.length > 0) {
    reasons.push(`Stack: ${matchedStack.join(', ')}`);
  }

  if (signals.featureDomain.length > 0) {
    reasons.push(`Domain: ${signals.featureDomain.join(', ')}`);
  }

  return reasons;
}

function inferCategory(entry: SkillIndexEntry): string {
  const keywordsLower = entry.keywords.map((k) => k.toLowerCase()).join(' ');
  if (/design|layout|responsive|css|ui|ux|theme|color/.test(keywordsLower)) return 'design';
  if (/auth|oauth|session|token|jwt|login/.test(keywordsLower)) return 'security';
  if (/a11y|accessibility|aria|wcag/.test(keywordsLower)) return 'a11y';
  if (/perf|performance|cache|optimization|lighthouse/.test(keywordsLower)) return 'perf';
  if (/test|tdd|coverage|mock|e2e/.test(keywordsLower)) return 'testing';
  if (/database|sql|orm|migration|schema/.test(keywordsLower)) return 'data';
  if (/api|rest|graphql|endpoint/.test(keywordsLower)) return 'api';
  if (/docker|kubernetes|deploy|ci|terraform/.test(keywordsLower)) return 'infra';
  if (/react|vue|angular|svelte|next/.test(keywordsLower)) return 'framework';
  return 'patterns';
}

// ---------------------------------------------------------------------------
// Main matching engine
// ---------------------------------------------------------------------------

/**
 * Match all skills in the index against content signals.
 * Returns scored, classified, and sorted matches with related-skills expansion.
 */
export function matchContent(index: SkillsIndex, signals: ContentSignals): ContentMatchResult {
  const startTime = performance.now();

  // Phase 1: Score all skills
  const scored: Array<{ name: string; entry: SkillIndexEntry; score: number }> = [];

  for (const [name, entry] of Object.entries(index.skills)) {
    const score = scoreSkillByContent(entry, signals);
    if (score >= TIER_THRESHOLDS.consider) {
      scored.push({ name, entry, score });
    }
  }

  // Phase 2: Related-skills expansion
  const matchedNames = new Set(scored.map((s) => s.name));
  const expansions: Array<{
    name: string;
    entry: SkillIndexEntry;
    score: number;
    parentName: string;
  }> = [];

  for (const match of scored) {
    if (match.score < TIER_THRESHOLDS.reference) continue;
    for (const relatedName of match.entry.relatedSkills) {
      if (matchedNames.has(relatedName)) continue;
      const relatedEntry = index.skills[relatedName];
      if (!relatedEntry) continue;

      const boostedScore = match.score * 0.6;
      if (boostedScore >= TIER_THRESHOLDS.consider) {
        matchedNames.add(relatedName);
        expansions.push({
          name: relatedName,
          entry: relatedEntry,
          score: boostedScore,
          parentName: match.name,
        });
      }
    }
  }

  // Phase 3: Build SkillMatch results
  const matches: SkillMatch[] = [];

  for (const { name, entry, score } of scored) {
    const tier = classifyTier(score);
    if (!tier) continue;
    matches.push({
      skillName: name,
      score: Math.round(score * 100) / 100,
      tier,
      matchReasons: buildMatchReasons(entry, signals),
      category: inferCategory(entry),
      when: inferWhen(name, entry),
    });
  }

  for (const { name, entry, score, parentName } of expansions) {
    const tier = classifyTier(score);
    if (!tier) continue;
    matches.push({
      skillName: name,
      score: Math.round(score * 100) / 100,
      tier,
      matchReasons: [`Related to: ${parentName}`, ...buildMatchReasons(entry, signals)],
      category: inferCategory(entry),
      when: inferWhen(name, entry),
    });
  }

  matches.sort((a, b) => b.score - a.score);

  const scanDuration = Math.round(performance.now() - startTime);

  return {
    matches,
    signalsUsed: signals,
    scanDuration,
  };
}
