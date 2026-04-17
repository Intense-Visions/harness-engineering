/**
 * Performance baselines for the skill dispatcher.
 *
 * These tests establish measurable baselines for Phase A acceptance criteria:
 *   - scoreSkill() over a 400-entry mock index completes in <50ms
 *   - Full suggest() pass over a 400-entry mock index completes in <100ms
 *
 * Thresholds are not asserted here — baselines are logged to stdout so they
 * can be captured during Phase A execution and referenced in Phase E regression.
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

describe('Dispatcher performance baselines (400-entry index)', () => {
  const INDEX_SIZE = 400;
  const index = makeLargeIndex(INDEX_SIZE);
  const recentFiles = ['src/components/App.tsx', 'src/services/user.ts', 'src/utils/helper.ts'];
  const queryTerms = ['pattern', 'domain', 'keyword'];

  it('scoreSkill() over 400 entries records a baseline', () => {
    const start = performance.now();
    for (const [name, entry] of Object.entries(index.skills)) {
      scoreSkill(entry, queryTerms, null, recentFiles, name);
    }
    const elapsed = performance.now() - start;
    console.log(`[perf-baseline] scoreSkill() × ${INDEX_SIZE}: ${elapsed.toFixed(2)}ms`);
    // Structural assertion: results are numeric
    expect(elapsed).toBeGreaterThan(0);
    // Order-of-magnitude regression guard. Soft threshold to avoid flaking on
    // loaded CI runners; real regressions surface as >10x budget in the log.
    expect(elapsed).toBeLessThan(500);
  });

  it('full suggest() pass over 400-entry index records a baseline', () => {
    const start = performance.now();
    const result = suggest(index, 'pattern domain keyword', null, recentFiles);
    const elapsed = performance.now() - start;
    console.log(`[perf-baseline] suggest() over ${INDEX_SIZE} skills: ${elapsed.toFixed(2)}ms`);
    // Structural assertions
    expect(Array.isArray(result.autoInjectKnowledge)).toBe(true);
    expect(Array.isArray(result.knowledgeRecommendations)).toBe(true);
    expect(result.autoInjectKnowledge.length).toBeLessThanOrEqual(3);
    expect(result.knowledgeRecommendations.length).toBeLessThanOrEqual(10);
    // Order-of-magnitude regression guard; see note above.
    expect(elapsed).toBeLessThan(1000);
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
