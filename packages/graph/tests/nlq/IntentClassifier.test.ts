import { describe, it, expect } from 'vitest';
import { IntentClassifier } from '../../src/nlq/IntentClassifier.js';
import type { ClassificationResult } from '../../src/nlq/types.js';

const classifier = new IntentClassifier();

function expectIntent(result: ClassificationResult, intent: string): void {
  expect(result.intent).toBe(intent);
  expect(result.confidence).toBeGreaterThan(0.3);
}

describe('IntentClassifier', () => {
  describe('impact intent', () => {
    const questions = [
      'what breaks if I change auth?',
      'what is affected if I modify UserService?',
      'what happens if I remove the login handler?',
      'what is the blast radius of changing the database layer?',
      'if I delete this file, what depends on it?',
    ];

    it.each(questions)('classifies "%s" as impact', (q) => {
      expectIntent(classifier.classify(q), 'impact');
    });
  });

  describe('find intent', () => {
    const questions = [
      'where is the auth middleware?',
      'find all controllers',
      'show me every test file',
      'locate the UserService class',
      'list all files in the auth module',
    ];

    it.each(questions)('classifies "%s" as find', (q) => {
      expectIntent(classifier.classify(q), 'find');
    });
  });

  describe('relationships intent', () => {
    const questions = [
      'what calls UserService?',
      'what does AuthMiddleware depend on?',
      'what imports the database module?',
      'what connects to the API gateway?',
      'who are the callers of hashPassword?',
    ];

    it.each(questions)('classifies "%s" as relationships', (q) => {
      expectIntent(classifier.classify(q), 'relationships');
    });
  });

  describe('explain intent', () => {
    const questions = [
      'what is GraphStore?',
      'describe the auth module',
      'tell me about UserService',
      'give me an overview of the codebase',
      'how does the query engine work?',
    ];

    it.each(questions)('classifies "%s" as explain', (q) => {
      expectIntent(classifier.classify(q), 'explain');
    });
  });

  describe('anomaly intent', () => {
    const questions = [
      'what looks wrong?',
      'are there any code smells?',
      'find problems in the codebase',
      'what are the hotspots?',
      'show me suspicious files',
    ];

    it.each(questions)('classifies "%s" as anomaly', (q) => {
      expectIntent(classifier.classify(q), 'anomaly');
    });
  });

  describe('confidence scoring', () => {
    it('returns confidence between 0 and 1', () => {
      const result = classifier.classify('what breaks if I change auth?');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('returns signal scores in the result', () => {
      const result = classifier.classify('what breaks if I change auth?');
      expect(result.signals).toBeDefined();
      expect(typeof result.signals).toBe('object');
    });

    it('returns low confidence for gibberish input', () => {
      const result = classifier.classify('asdf jkl qwerty');
      expect(result.confidence).toBeLessThan(0.3);
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      const result = classifier.classify('');
      expect(result.confidence).toBeLessThan(0.3);
    });

    it('is case-insensitive', () => {
      const lower = classifier.classify('what breaks if I change auth?');
      const upper = classifier.classify('WHAT BREAKS IF I CHANGE AUTH?');
      expect(lower.intent).toBe(upper.intent);
    });

    it('handles extra whitespace', () => {
      const result = classifier.classify('  what   breaks   if   I   change   auth?  ');
      expect(result.intent).toBe('impact');
    });
  });

  describe('low confidence detection', () => {
    it('returns confidence below 0.3 for unrelated input', () => {
      const result = classifier.classify('the weather is nice today');
      expect(result.confidence).toBeLessThan(0.3);
    });

    it('returns confidence below 0.3 for single stop word', () => {
      const result = classifier.classify('the');
      expect(result.confidence).toBeLessThan(0.3);
    });

    it('still picks the best intent even when confidence is low', () => {
      const result = classifier.classify('maybe something about risk');
      // 'risk' is a keyword for both impact and anomaly; classifier should still pick one
      expect(result.intent).toBeDefined();
      expect(typeof result.confidence).toBe('number');
    });
  });

  describe('disambiguation', () => {
    it('prefers impact over explain for "what happens if I change X"', () => {
      const result = classifier.classify('what happens if I change the database?');
      expect(result.intent).toBe('impact');
    });

    it('prefers relationships over explain for "what depends on X"', () => {
      const result = classifier.classify('what depends on UserService?');
      expect(result.intent).toBe('relationships');
    });

    it('prefers anomaly over find for "find problems"', () => {
      const result = classifier.classify('find problems in the codebase');
      expect(result.intent).toBe('anomaly');
    });

    it('prefers find over explain for "where is X"', () => {
      const result = classifier.classify('where is the main entry point?');
      expect(result.intent).toBe('find');
    });

    it('prefers explain over relationships for "how does X work"', () => {
      const result = classifier.classify('how does the query engine work?');
      expect(result.intent).toBe('explain');
    });
  });
});
