import { describe, it, expect } from 'vitest';
import { findPossibleMatches, levenshteinDistance } from '../../../src/entropy/detectors/drift';

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
