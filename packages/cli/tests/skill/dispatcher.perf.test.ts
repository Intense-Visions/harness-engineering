/**
 * Performance baselines for the skill dispatcher.
 *
 * These tests establish measurable baselines for Phase A acceptance criteria:
 *   - scoreSkill() over a 400-entry mock index completes in <50ms
 *   - Full suggest() pass over a 400-entry mock index completes in <100ms
 *
 * Baselines are logged to stdout. The only thresholds asserted are coarse
 * super-linear-regression guards on the BEST of K warm samples (see bestOf):
 * a single cold wall-clock sample is a function of runner load and JIT warm-up,
 * not of the code (#2046). Taking the minimum of K runs of the same
 * deterministic operation reduces measurement noise — it is not a retry, the
 * assertion still runs once. The 100ms bounds sit ~35-80x above the local warm
 * cost (~3ms / ~1.2ms) so transient load cannot trip them, while an accidental
 * O(n^2) over the 400-entry index (~400x) still fails.
 *
 * Run: npx vitest run packages/cli/tests/skill/dispatcher.perf.test.ts
 */
import { describe, it, expect } from 'vitest';
import { scoreSkill, suggest } from '../../src/skill/dispatcher';
import type { SkillIndexEntry, SkillsIndex } from '../../src/skill/index-builder';

function makePerfEntry(i: number): SkillIndexEntry {
  return {
    tier: 3,
    type: i % 5 === 0 ? 'knowledge' : 'flexible',
    description: `Performance test skill number ${i} covering domain area ${i % 10}`,
    keywords: [`keyword-${i % 20}`, `domain-${i % 10}`, `pattern-${i % 5}`],
    stackSignals: [`signal-${i % 15}`, `signal-${i % 7}`],
    cognitiveMode: undefined,
    phases: [],
    paths: i % 3 === 0 ? [`**/*.ts`, `**/src/${i}/**`] : [],
    relatedSkills: i % 10 === 0 ? [`perf-skill-${(i + 1) % 400}`] : [],
    source: 'bundled',
    addresses: [],
    dependsOn: [],
  };
}

function makeLargeIndex(size: number): SkillsIndex {
  const skills: Record<string, SkillIndexEntry> = {};
  for (let i = 0; i < size; i++) {
    skills[`perf-skill-${i}`] = makePerfEntry(i);
  }
  return { version: 1, hash: 'perf-hash', generatedAt: new Date().toISOString(), skills };
}

/** Best (minimum) wall-clock of K runs of fn, after one warm-up run. */
function bestOf<T>(k: number, fn: () => T): { best: number; result: T } {
  let result = fn(); // warm-up (JIT) + behavioural result
  let best = Infinity;
  for (let i = 0; i < k; i++) {
    const start = performance.now();
    result = fn();
    best = Math.min(best, performance.now() - start);
  }
  return { best, result };
}

describe('Dispatcher performance baselines (400-entry index)', () => {
  const INDEX_SIZE = 400;
  const index = makeLargeIndex(INDEX_SIZE);
  const recentFiles = ['src/components/App.tsx', 'src/services/user.ts', 'src/utils/helper.ts'];
  const queryTerms = ['pattern', 'domain', 'keyword'];

  it('scoreSkill() over 400 entries records a baseline', () => {
    const { best: elapsed } = bestOf(5, () => {
      for (const [name, entry] of Object.entries(index.skills)) {
        scoreSkill(entry, queryTerms, null, recentFiles, name);
      }
    });
    console.log(
      `[perf-baseline] scoreSkill() × ${INDEX_SIZE}: ${elapsed.toFixed(2)}ms (best of 5)`
    );
    // Structural assertion: results are numeric
    expect(elapsed).toBeGreaterThan(0);
    // Super-linear regression guard on the best-of-K sample; see file header.
    expect(elapsed).toBeLessThan(100);
  });

  it('full suggest() pass over 400-entry index records a baseline', () => {
    const { best: elapsed, result } = bestOf(5, () =>
      suggest(index, 'pattern domain keyword', null, recentFiles)
    );
    console.log(
      `[perf-baseline] suggest() over ${INDEX_SIZE} skills: ${elapsed.toFixed(2)}ms (best of 5)`
    );
    // Structural assertions
    expect(Array.isArray(result.autoInjectKnowledge)).toBe(true);
    expect(Array.isArray(result.knowledgeRecommendations)).toBe(true);
    expect(result.autoInjectKnowledge.length).toBeLessThanOrEqual(3);
    expect(result.knowledgeRecommendations.length).toBeLessThanOrEqual(10);
    // Super-linear regression guard on the best-of-K sample; see file header.
    expect(elapsed).toBeLessThan(100);
  });

  it('autoInjectKnowledge cap holds with 400-entry index containing many knowledge skills', () => {
    const result = suggest(index, 'pattern domain keyword', null, recentFiles);
    expect(result.autoInjectKnowledge.length).toBeLessThanOrEqual(3);
  });

  it('knowledgeRecommendations cap holds after traversal on 400-entry index', () => {
    const result = suggest(index, 'pattern domain keyword', null, recentFiles);
    expect(result.knowledgeRecommendations.length).toBeLessThanOrEqual(10);
  });
});
