import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/mcp/utils/sanitize-path.js', () => ({
  sanitizePath: vi.fn((p: string) => {
    if (p === '/') throw new Error('Invalid project path: cannot use filesystem root');
    return p;
  }),
}));

const mockLoad = vi.fn().mockReturnValue({ version: 1, snapshots: [] });
const mockDetect = vi.fn().mockReturnValue({
  suggestions: [
    {
      suggestedRule: {
        id: 'abc123',
        category: 'layer-violations',
        description: 'Emergent: core -> cli in src/services/',
        scope: 'src/services/',
      },
      confidence: 'high',
      occurrences: 6,
      uniqueFiles: 4,
      pattern: 'core -> cli',
      sampleViolations: [],
      rationale: 'Pattern "core -> cli" observed 6 times across 4 file(s)',
    },
  ],
  totalViolationsAnalyzed: 10,
  windowWeeks: 4,
  minOccurrences: 3,
});

class MockViolationHistoryManager {
  load() {
    return mockLoad();
  }
}

vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    ViolationHistoryManager: MockViolationHistoryManager,
    detectEmergentConstraints: mockDetect,
  };
});

import {
  detectConstraintEmergenceDefinition,
  handleDetectConstraintEmergence,
} from '../../../src/mcp/tools/constraint-emergence';

describe('detect_constraint_emergence tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoad.mockReturnValue({ version: 1, snapshots: [] });
    mockDetect.mockReturnValue({
      suggestions: [
        {
          suggestedRule: {
            id: 'abc123',
            category: 'layer-violations',
            description: 'Emergent: core -> cli in src/services/',
            scope: 'src/services/',
          },
          confidence: 'high',
          occurrences: 6,
          uniqueFiles: 4,
          pattern: 'core -> cli',
          sampleViolations: [],
          rationale: 'Pattern "core -> cli" observed 6 times across 4 file(s)',
        },
      ],
      totalViolationsAnalyzed: 10,
      windowWeeks: 4,
      minOccurrences: 3,
    });
  });

  describe('definition', () => {
    it('has correct name', () => {
      expect(detectConstraintEmergenceDefinition.name).toBe('detect_constraint_emergence');
    });

    it('requires path', () => {
      expect(detectConstraintEmergenceDefinition.inputSchema.required).toContain('path');
    });

    it('has windowWeeks parameter', () => {
      expect(detectConstraintEmergenceDefinition.inputSchema.properties).toHaveProperty(
        'windowWeeks'
      );
    });

    it('has minOccurrences parameter', () => {
      expect(detectConstraintEmergenceDefinition.inputSchema.properties).toHaveProperty(
        'minOccurrences'
      );
    });

    it('has category parameter with enum', () => {
      expect(detectConstraintEmergenceDefinition.inputSchema.properties.category).toHaveProperty(
        'enum'
      );
    });
  });

  describe('handleDetectConstraintEmergence', () => {
    it('returns suggestions from emergence detection', async () => {
      const result = await handleDetectConstraintEmergence({ path: '/tmp/project' });
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.suggestions).toHaveLength(1);
      expect(data.suggestions[0].confidence).toBe('high');
      expect(data.totalViolationsAnalyzed).toBe(10);
    });

    it('passes windowWeeks to detectEmergentConstraints', async () => {
      await handleDetectConstraintEmergence({ path: '/tmp/project', windowWeeks: 8 });
      expect(mockDetect).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ windowWeeks: 8 })
      );
    });

    it('passes minOccurrences to detectEmergentConstraints', async () => {
      await handleDetectConstraintEmergence({
        path: '/tmp/project',
        minOccurrences: 5,
      });
      expect(mockDetect).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ minOccurrences: 5 })
      );
    });

    it('passes category to detectEmergentConstraints', async () => {
      await handleDetectConstraintEmergence({
        path: '/tmp/project',
        category: 'complexity',
      });
      expect(mockDetect).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ category: 'complexity' })
      );
    });

    it('defaults windowWeeks to 4', async () => {
      await handleDetectConstraintEmergence({ path: '/tmp/project' });
      expect(mockDetect).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ windowWeeks: 4 })
      );
    });

    it('defaults minOccurrences to 3', async () => {
      await handleDetectConstraintEmergence({ path: '/tmp/project' });
      expect(mockDetect).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ minOccurrences: 3 })
      );
    });

    it('returns error for invalid path', async () => {
      const result = await handleDetectConstraintEmergence({ path: '/' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid project path');
    });

    it('returns error for invalid windowWeeks', async () => {
      const result = await handleDetectConstraintEmergence({
        path: '/tmp/project',
        windowWeeks: 0,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('windowWeeks must be a finite number >= 1');
    });

    it('returns error for non-finite windowWeeks', async () => {
      const result = await handleDetectConstraintEmergence({
        path: '/tmp/project',
        windowWeeks: Infinity,
      });
      expect(result.isError).toBe(true);
    });

    it('returns error for invalid minOccurrences', async () => {
      const result = await handleDetectConstraintEmergence({
        path: '/tmp/project',
        minOccurrences: 1,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('minOccurrences must be a finite number >= 2');
    });

    it('handles exception from detectEmergentConstraints gracefully', async () => {
      mockDetect.mockImplementationOnce(() => {
        throw new Error('Emergence detection failed');
      });

      const result = await handleDetectConstraintEmergence({ path: '/tmp/project' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Emergence detection failed');
    });
  });
});
