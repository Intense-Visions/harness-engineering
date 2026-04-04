import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import {
  predictFailuresDefinition,
  handlePredictFailures,
} from '../../../src/mcp/tools/predict-failures.js';

function parseResult(result: { content: { text: string }[] }) {
  return JSON.parse(result.content[0].text);
}

// Helper to create timeline.json with N snapshots
function createTimeline(dir: string, count: number) {
  const archDir = path.join(dir, '.harness', 'arch');
  fs.mkdirSync(archDir, { recursive: true });

  const snapshots = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const date = new Date(now - (count - i) * 7 * 24 * 60 * 60 * 1000);
    snapshots.push({
      capturedAt: date.toISOString(),
      commitHash: `abc${i}def`,
      stabilityScore: 80 + i,
      metrics: {
        'circular-deps': { value: i, violationCount: 0 },
        'layer-violations': { value: i + 1, violationCount: 0 },
        complexity: { value: 40 + i * 3, violationCount: 0 },
        coupling: { value: 0.3 + i * 0.05, violationCount: 0 },
        'forbidden-imports': { value: 0, violationCount: 0 },
        'module-size': { value: 1 + i, violationCount: 0 },
        'dependency-depth': { value: 3 + i, violationCount: 0 },
      },
    });
  }

  fs.writeFileSync(
    path.join(archDir, 'timeline.json'),
    JSON.stringify({ version: 1, snapshots }, null, 2)
  );
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'predict-failures-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('predict_failures definition', () => {
  it('has correct name', () => {
    expect(predictFailuresDefinition.name).toBe('predict_failures');
  });

  it('requires path parameter', () => {
    expect(predictFailuresDefinition.inputSchema.required).toEqual(['path']);
  });

  it('has optional horizon, category, and includeRoadmap parameters', () => {
    const props = predictFailuresDefinition.inputSchema.properties;
    expect(props).toHaveProperty('horizon');
    expect(props).toHaveProperty('category');
    expect(props).toHaveProperty('includeRoadmap');
  });

  it('category has enum with all 7 metric categories', () => {
    const categoryProp = predictFailuresDefinition.inputSchema.properties.category;
    expect(categoryProp.enum).toHaveLength(7);
    expect(categoryProp.enum).toContain('complexity');
    expect(categoryProp.enum).toContain('coupling');
  });
});

describe('handlePredictFailures', () => {
  it('returns error for filesystem root path', async () => {
    const result = await handlePredictFailures({ path: '/' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('filesystem root');
  });

  it('returns error when fewer than 3 snapshots exist', async () => {
    createTimeline(tmpDir, 2);
    const result = await handlePredictFailures({ path: tmpDir });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('at least 3 snapshots');
  });

  it('returns error when no timeline exists', async () => {
    const result = await handlePredictFailures({ path: tmpDir });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('at least 3 snapshots');
  });

  it('returns PredictionResult JSON with 3+ snapshots', async () => {
    createTimeline(tmpDir, 5);
    const result = await handlePredictFailures({ path: tmpDir });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data).toHaveProperty('generatedAt');
    expect(data).toHaveProperty('snapshotsUsed');
    expect(data).toHaveProperty('timelineRange');
    expect(data).toHaveProperty('stabilityForecast');
    expect(data).toHaveProperty('categories');
    expect(data).toHaveProperty('warnings');
    expect(data.snapshotsUsed).toBe(5);
  });

  it('respects category filter', async () => {
    createTimeline(tmpDir, 5);
    const result = await handlePredictFailures({
      path: tmpDir,
      category: 'complexity',
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.categories).toHaveProperty('complexity');
    // Other categories should still be present but with zero forecasts
    expect(data.categories).toHaveProperty('coupling');
  });

  it('respects includeRoadmap: false', async () => {
    createTimeline(tmpDir, 5);
    const result = await handlePredictFailures({
      path: tmpDir,
      includeRoadmap: false,
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    // Should still produce predictions, just without roadmap adjustment
    expect(data.snapshotsUsed).toBe(5);
  });

  it('respects custom horizon', async () => {
    createTimeline(tmpDir, 5);
    const result = await handlePredictFailures({
      path: tmpDir,
      horizon: 24,
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.snapshotsUsed).toBe(5);
  });

  it('returns all 7 categories in result', async () => {
    createTimeline(tmpDir, 5);
    const result = await handlePredictFailures({ path: tmpDir });

    const data = parseResult(result);
    const categoryKeys = Object.keys(data.categories);
    expect(categoryKeys).toContain('circular-deps');
    expect(categoryKeys).toContain('layer-violations');
    expect(categoryKeys).toContain('complexity');
    expect(categoryKeys).toContain('coupling');
    expect(categoryKeys).toContain('forbidden-imports');
    expect(categoryKeys).toContain('module-size');
    expect(categoryKeys).toContain('dependency-depth');
  });
});
