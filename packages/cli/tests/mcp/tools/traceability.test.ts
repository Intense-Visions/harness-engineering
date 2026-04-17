import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/mcp/utils/sanitize-path.js', () => ({
  sanitizePath: vi.fn((p: string) => p),
}));

vi.mock('../../../src/mcp/utils/graph-loader.js', () => ({
  loadGraphStore: vi.fn().mockResolvedValue(null),
}));

vi.mock('@harness-engineering/graph', () => ({
  queryTraceability: vi.fn().mockReturnValue([
    {
      specPath: 'docs/specs/auth.md',
      featureName: 'auth',
      requirements: [
        {
          id: 'REQ-1',
          text: 'Login',
          codeLinks: ['src/auth.ts'],
          testLinks: ['tests/auth.test.ts'],
        },
        { id: 'REQ-2', text: 'Logout', codeLinks: ['src/auth.ts'], testLinks: [] },
      ],
      summary: { total: 2, withCode: 2, withTests: 1, fullyTraced: 1, untraceable: 0 },
    },
  ]),
}));

import {
  checkTraceabilityDefinition,
  handleCheckTraceability,
} from '../../../src/mcp/tools/traceability';
import { loadGraphStore } from '../../../src/mcp/utils/graph-loader.js';
import { queryTraceability } from '@harness-engineering/graph';

describe('check_traceability tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('definition', () => {
    it('has correct name', () => {
      expect(checkTraceabilityDefinition.name).toBe('check_traceability');
    });

    it('requires path', () => {
      expect(checkTraceabilityDefinition.inputSchema.required).toContain('path');
    });

    it('has spec and feature optional parameters', () => {
      expect(checkTraceabilityDefinition.inputSchema.properties).toHaveProperty('spec');
      expect(checkTraceabilityDefinition.inputSchema.properties).toHaveProperty('feature');
    });

    it('has mode parameter', () => {
      expect(checkTraceabilityDefinition.inputSchema.properties.mode).toHaveProperty('enum');
    });
  });

  describe('handleCheckTraceability', () => {
    it('returns error when no graph is available', async () => {
      const result = await handleCheckTraceability({ path: '/tmp/project' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No graph found');
    });

    it('returns summary mode by default', async () => {
      vi.mocked(loadGraphStore).mockResolvedValueOnce({} as never);

      const result = await handleCheckTraceability({ path: '/tmp/project' });
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.mode).toBe('summary');
      expect(data.overallCoverage).toBe(50); // 1/2 fully traced
      expect(data.totals.total).toBe(2);
      expect(data.totals.fullyTraced).toBe(1);
      expect(data.specs).toHaveLength(1);
    });

    it('returns detailed mode when requested', async () => {
      vi.mocked(loadGraphStore).mockResolvedValueOnce({} as never);

      const result = await handleCheckTraceability({ path: '/tmp/project', mode: 'detailed' });
      const data = JSON.parse(result.content[0].text);
      expect(data.mode).toBe('detailed');
      expect(data.results).toHaveLength(1);
    });

    it('returns no-requirements when no results', async () => {
      vi.mocked(loadGraphStore).mockResolvedValueOnce({} as never);
      vi.mocked(queryTraceability).mockReturnValueOnce([]);

      const result = await handleCheckTraceability({ path: '/tmp/project' });
      const data = JSON.parse(result.content[0].text);
      expect(data.status).toBe('no-requirements');
    });

    it('passes spec and feature filters to queryTraceability', async () => {
      vi.mocked(loadGraphStore).mockResolvedValueOnce({} as never);

      await handleCheckTraceability({
        path: '/tmp/project',
        spec: 'docs/specs/auth.md',
        feature: 'auth',
      });

      expect(queryTraceability).toHaveBeenCalledWith(expect.anything(), {
        specPath: 'docs/specs/auth.md',
        featureName: 'auth',
      });
    });

    it('handles multiple spec results in summary mode', async () => {
      vi.mocked(loadGraphStore).mockResolvedValueOnce({} as never);
      vi.mocked(queryTraceability).mockReturnValueOnce([
        {
          specPath: 'docs/specs/auth.md',
          featureName: 'auth',
          requirements: [],
          summary: { total: 3, withCode: 3, withTests: 2, fullyTraced: 2, untraceable: 0 },
        },
        {
          specPath: 'docs/specs/billing.md',
          featureName: 'billing',
          requirements: [],
          summary: { total: 2, withCode: 1, withTests: 1, fullyTraced: 1, untraceable: 1 },
        },
      ] as never);

      const result = await handleCheckTraceability({ path: '/tmp/project' });
      const data = JSON.parse(result.content[0].text);
      expect(data.totals.total).toBe(5);
      expect(data.totals.fullyTraced).toBe(3);
      expect(data.overallCoverage).toBe(60);
      expect(data.specs).toHaveLength(2);
    });

    it('handles 0 total requirements without division error', async () => {
      vi.mocked(loadGraphStore).mockResolvedValueOnce({} as never);
      vi.mocked(queryTraceability).mockReturnValueOnce([
        {
          specPath: 'docs/specs/empty.md',
          featureName: 'empty',
          requirements: [],
          summary: { total: 0, withCode: 0, withTests: 0, fullyTraced: 0, untraceable: 0 },
        },
      ] as never);

      const result = await handleCheckTraceability({ path: '/tmp/project' });
      const data = JSON.parse(result.content[0].text);
      expect(data.overallCoverage).toBe(0);
    });

    it('handles thrown exception', async () => {
      vi.mocked(loadGraphStore).mockRejectedValueOnce(new Error('Graph load error'));

      const result = await handleCheckTraceability({ path: '/tmp/project' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Graph load error');
    });
  });
});
