import { describe, it, expect } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { askGraph } from '../../src/nlq/index.js';
import type {
  Intent,
  ClassificationResult,
  ResolvedEntity,
  AskGraphResult,
} from '../../src/nlq/types.js';

describe('NLQ types', () => {
  describe('Intent type', () => {
    it('should accept all five intent values', () => {
      const intents: Intent[] = ['impact', 'find', 'relationships', 'explain', 'anomaly'];
      expect(intents).toHaveLength(5);
    });
  });

  describe('ClassificationResult shape', () => {
    it('should satisfy the interface contract', () => {
      const result: ClassificationResult = {
        intent: 'impact',
        confidence: 0.85,
        signals: { keyword: 0.9, questionWord: 0.8 },
      };
      expect(result.intent).toBe('impact');
      expect(result.confidence).toBe(0.85);
      expect(result.signals).toEqual({ keyword: 0.9, questionWord: 0.8 });
    });
  });

  describe('ResolvedEntity shape', () => {
    it('should satisfy the interface contract', () => {
      const entity: ResolvedEntity = {
        raw: 'AuthMiddleware',
        nodeId: 'node-1',
        node: { id: 'node-1', type: 'class', name: 'AuthMiddleware', metadata: {} },
        confidence: 1.0,
        method: 'exact',
      };
      expect(entity.raw).toBe('AuthMiddleware');
      expect(entity.method).toBe('exact');
    });
  });

  describe('AskGraphResult shape', () => {
    it('should satisfy the interface contract with suggestions', () => {
      const result: AskGraphResult = {
        intent: 'find',
        intentConfidence: 0.75,
        entities: [],
        summary: 'Found 3 matches.',
        data: { nodes: [] },
        suggestions: ['Try: "where is AuthMiddleware?"'],
      };
      expect(result.intent).toBe('find');
      expect(result.suggestions).toHaveLength(1);
    });

    it('should satisfy the interface contract without suggestions', () => {
      const result: AskGraphResult = {
        intent: 'impact',
        intentConfidence: 0.95,
        entities: [],
        summary: 'Changing X affects 5 files.',
        data: {},
      };
      expect(result.suggestions).toBeUndefined();
    });
  });
});

describe('askGraph', () => {
  it('should return a valid AskGraphResult stub', async () => {
    const store = new GraphStore();
    const result = await askGraph(store, 'what breaks if I change auth?');

    expect(result).toHaveProperty('intent');
    expect(result).toHaveProperty('intentConfidence');
    expect(result).toHaveProperty('entities');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('data');
    expect(typeof result.summary).toBe('string');
    expect(Array.isArray(result.entities)).toBe(true);
  });

  it('should return a real result now that the orchestrator is implemented', async () => {
    const store = new GraphStore();
    const result = await askGraph(store, 'where is the auth middleware?');

    expect(result.intentConfidence).toBeGreaterThan(0);
    expect(result.intent).toBe('find');
  });
});
