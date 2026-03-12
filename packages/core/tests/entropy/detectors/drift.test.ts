import { describe, it, expect } from 'vitest';
import { findPossibleMatches, levenshteinDistance, detectDocDrift } from '../../../src/entropy/detectors/drift';
import { buildSnapshot } from '../../../src/entropy/snapshot';
import { TypeScriptParser } from '../../../src/shared/parsers';
import { join } from 'path';

describe('fuzzy matching', () => {
  describe('levenshteinDistance', () => {
    it('should return 0 for identical strings', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0);
    });

    it('should calculate distance for similar strings', () => {
      expect(levenshteinDistance('getUserById', 'findUserById')).toBeLessThan(10);
    });
  });

  describe('findPossibleMatches', () => {
    const exports = ['findUserById', 'createNewUser', 'validateEmail', 'User'];

    it('should find similar names', () => {
      const matches = findPossibleMatches('getUserById', exports);
      expect(matches).toContain('findUserById');
    });

    it('should find prefix matches', () => {
      const matches = findPossibleMatches('createUser', exports);
      expect(matches).toContain('createNewUser');
    });

    it('should return empty for no matches', () => {
      const matches = findPossibleMatches('totallyDifferent', exports);
      expect(matches.length).toBe(0);
    });
  });
});

describe('detectDocDrift', () => {
  const parser = new TypeScriptParser();
  const driftFixtures = join(__dirname, '../../fixtures/entropy/drift-samples');

  it('should detect API signature drift', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: driftFixtures,
      parser,
      analyze: { drift: true },
      include: ['src/**/*.ts'],
      docPaths: ['docs/**/*.md'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const result = detectDocDrift(snapshotResult.value, {
      checkApiSignatures: true,
      checkExamples: false,
      checkStructure: false,
      docPaths: [],
      ignorePatterns: [],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.drifts.length).toBeGreaterThan(0);

      const apiDrifts = result.value.drifts.filter(d => d.type === 'api-signature');
      expect(apiDrifts.some(d => d.reference === 'getUserById')).toBe(true);
      expect(apiDrifts.some(d => d.possibleMatches?.includes('findUserById'))).toBe(true);
    }
  });
});
