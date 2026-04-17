import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  getDecayTrendsDefinition,
  handleGetDecayTrends,
} from '../../../src/mcp/tools/decay-trends';

describe('get_decay_trends tool', () => {
  describe('definition', () => {
    it('has correct name', () => {
      expect(getDecayTrendsDefinition.name).toBe('get_decay_trends');
    });

    it('has offset and limit properties in schema', () => {
      const props = getDecayTrendsDefinition.inputSchema.properties;
      expect(props).toHaveProperty('offset');
      expect(props).toHaveProperty('limit');
      expect(props.offset.type).toBe('number');
      expect(props.limit.type).toBe('number');
    });
  });

  describe('pagination', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decay-trends-'));
      // Create timeline with 2 snapshots so trends have deltas
      const archDir = path.join(tmpDir, '.harness', 'arch');
      fs.mkdirSync(archDir, { recursive: true });
      const timeline = {
        version: 1,
        snapshots: [
          {
            capturedAt: '2026-01-01T00:00:00Z',
            commitHash: 'aaa',
            stabilityScore: 80,
            metrics: {
              'circular-deps': { value: 2, violationCount: 2 },
              'layer-violations': { value: 5, violationCount: 5 },
              complexity: { value: 10, violationCount: 10 },
              coupling: { value: 3, violationCount: 3 },
              'forbidden-imports': { value: 0, violationCount: 0 },
              'module-size': { value: 1, violationCount: 1 },
              'dependency-depth': { value: 4, violationCount: 4 },
            },
          },
          {
            capturedAt: '2026-02-01T00:00:00Z',
            commitHash: 'bbb',
            stabilityScore: 70,
            metrics: {
              'circular-deps': { value: 5, violationCount: 5 },
              'layer-violations': { value: 3, violationCount: 3 },
              complexity: { value: 15, violationCount: 15 },
              coupling: { value: 3, violationCount: 3 },
              'forbidden-imports': { value: 1, violationCount: 1 },
              'module-size': { value: 1, violationCount: 1 },
              'dependency-depth': { value: 6, violationCount: 6 },
            },
          },
        ],
      };
      fs.writeFileSync(path.join(archDir, 'timeline.json'), JSON.stringify(timeline));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('includes pagination metadata with defaults', async () => {
      const response = await handleGetDecayTrends({ path: tmpDir });
      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed).toHaveProperty('pagination');
      expect(parsed.pagination).toHaveProperty('offset', 0);
      expect(parsed.pagination).toHaveProperty('limit', 20);
      expect(parsed.pagination).toHaveProperty('total');
      expect(parsed.pagination).toHaveProperty('hasMore');
      expect(Array.isArray(parsed.categories)).toBe(true);
    });

    it('categories are sorted by absolute delta descending', async () => {
      const response = await handleGetDecayTrends({ path: tmpDir });
      const parsed = JSON.parse(response.content[0].text);
      const deltas = parsed.categories.map((c: { delta: number }) => Math.abs(c.delta));
      for (let i = 1; i < deltas.length; i++) {
        expect(deltas[i]).toBeLessThanOrEqual(deltas[i - 1]);
      }
    });

    it('respects offset and limit params', async () => {
      const response = await handleGetDecayTrends({
        path: tmpDir,
        offset: 2,
        limit: 1,
      });
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.pagination.offset).toBe(2);
      expect(parsed.pagination.limit).toBe(1);
      expect(parsed.categories.length).toBeLessThanOrEqual(1);
    });

    it('offset beyond entries returns empty page', async () => {
      const response = await handleGetDecayTrends({
        path: tmpDir,
        offset: 100,
        limit: 20,
      });
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.categories).toHaveLength(0);
      expect(parsed.pagination.hasMore).toBe(false);
    });

    it('category filter still works (no pagination)', async () => {
      const response = await handleGetDecayTrends({
        path: tmpDir,
        category: 'complexity',
      });
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.category).toBe('complexity');
      expect(parsed).toHaveProperty('trend');
      // Category filter returns single trend, no pagination wrapper
      expect(parsed).not.toHaveProperty('pagination');
    });
  });

  describe('no snapshots', () => {
    it('returns informational message when no snapshots exist', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decay-empty-'));
      try {
        const response = await handleGetDecayTrends({ path: tmpDir });
        expect(response.content[0].text).toContain('No architecture snapshots');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
