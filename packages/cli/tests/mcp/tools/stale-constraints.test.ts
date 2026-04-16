import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/mcp/utils/sanitize-path.js', () => ({
  sanitizePath: vi.fn((p: string) => {
    if (p === '/') throw new Error('Invalid project path: cannot use filesystem root');
    return p;
  }),
}));

vi.mock('../../../src/mcp/utils/graph-loader.js', () => ({
  loadGraphStore: vi.fn().mockResolvedValue(null),
}));

vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    detectStaleConstraints: vi.fn().mockReturnValue({
      staleConstraints: [
        { rule: 'no-circular', category: 'circular-deps', daysSinceViolation: 45 },
      ],
      totalConstraints: 5,
      windowDays: 30,
    }),
  };
});

import {
  detectStaleConstraintsDefinition,
  handleDetectStaleConstraints,
} from '../../../src/mcp/tools/stale-constraints';
import { loadGraphStore } from '../../../src/mcp/utils/graph-loader.js';
import { detectStaleConstraints } from '@harness-engineering/core';

describe('detect_stale_constraints tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('definition', () => {
    it('has correct name', () => {
      expect(detectStaleConstraintsDefinition.name).toBe('detect_stale_constraints');
    });

    it('requires path', () => {
      expect(detectStaleConstraintsDefinition.inputSchema.required).toContain('path');
    });

    it('has windowDays parameter', () => {
      expect(detectStaleConstraintsDefinition.inputSchema.properties).toHaveProperty('windowDays');
    });

    it('has category parameter with enum', () => {
      expect(detectStaleConstraintsDefinition.inputSchema.properties.category).toHaveProperty(
        'enum'
      );
    });
  });

  describe('handleDetectStaleConstraints', () => {
    it('returns empty result when no graph is available', async () => {
      const result = await handleDetectStaleConstraints({ path: '/tmp/project' });
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.staleConstraints).toEqual([]);
      expect(data.note).toContain('No graph available');
    });

    it('returns stale constraints when graph is available', async () => {
      vi.mocked(loadGraphStore).mockResolvedValueOnce({} as never);

      const result = await handleDetectStaleConstraints({ path: '/tmp/project' });
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.staleConstraints).toHaveLength(1);
      expect(data.totalConstraints).toBe(5);
    });

    it('passes windowDays to detectStaleConstraints', async () => {
      vi.mocked(loadGraphStore).mockResolvedValueOnce({} as never);

      await handleDetectStaleConstraints({ path: '/tmp/project', windowDays: 60 });
      expect(detectStaleConstraints).toHaveBeenCalledWith(expect.anything(), 60, undefined);
    });

    it('defaults windowDays to 30', async () => {
      vi.mocked(loadGraphStore).mockResolvedValueOnce({} as never);

      await handleDetectStaleConstraints({ path: '/tmp/project' });
      expect(detectStaleConstraints).toHaveBeenCalledWith(expect.anything(), 30, undefined);
    });

    it('passes category to detectStaleConstraints', async () => {
      vi.mocked(loadGraphStore).mockResolvedValueOnce({} as never);

      await handleDetectStaleConstraints({
        path: '/tmp/project',
        category: 'circular-deps',
      });
      expect(detectStaleConstraints).toHaveBeenCalledWith(expect.anything(), 30, 'circular-deps');
    });

    it('returns error for invalid path', async () => {
      const result = await handleDetectStaleConstraints({ path: '/' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid project path');
    });

    it('returns error for invalid windowDays', async () => {
      const result = await handleDetectStaleConstraints({
        path: '/tmp/project',
        windowDays: 0,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('windowDays must be a finite number >= 1');
    });

    it('returns error for non-finite windowDays', async () => {
      const result = await handleDetectStaleConstraints({
        path: '/tmp/project',
        windowDays: Infinity,
      });
      expect(result.isError).toBe(true);
    });

    it('handles exception from detectStaleConstraints gracefully', async () => {
      vi.mocked(loadGraphStore).mockResolvedValueOnce({} as never);
      vi.mocked(detectStaleConstraints).mockImplementationOnce(() => {
        throw new Error('Constraint detection failed');
      });

      const result = await handleDetectStaleConstraints({ path: '/tmp/project' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Constraint detection failed');
    });
  });
});
