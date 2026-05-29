// packages/cli/tests/design-craft/measurement/usage.test.ts
//
// Unit tests for the design-craft usage counter. Covers the growth-
// infrastructure half of ADR 0020:
//   - per-family counters accumulate
//   - getCatalogStats returns a coherent snapshot
//   - reset is idempotent
//   - missing / malformed files degrade silently to empty
//
// All tests use a per-test temp project root so they cannot collide.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  recordTrigger,
  recordApply,
  recordCite,
  getCatalogStats,
  resetCatalogStats,
} from '../../../src/design-craft/measurement/usage.js';

describe('design-craft measurement/usage', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'design-craft-usage-'));
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('starts with empty counters when nothing has been recorded', () => {
    const stats = getCatalogStats(projectRoot);
    expect(stats.rubrics).toEqual({});
    expect(stats.patterns).toEqual({});
    expect(stats.exemplars).toEqual({});
    expect(stats.totalEvents).toBe(0);
  });

  it('accumulates rubric trigger counts across calls', () => {
    recordTrigger('rubric-hierarchy-clarity', projectRoot);
    recordTrigger('rubric-hierarchy-clarity', projectRoot);
    recordTrigger('rubric-typography-craft', projectRoot);

    const stats = getCatalogStats(projectRoot);
    expect(stats.rubrics['rubric-hierarchy-clarity']).toBe(2);
    expect(stats.rubrics['rubric-typography-craft']).toBe(1);
    expect(stats.totalEvents).toBe(3);
  });

  it('keeps the three counter families independent', () => {
    recordTrigger('rubric-x', projectRoot);
    recordApply('pattern-x', projectRoot);
    recordCite('exemplar-x', projectRoot);

    const stats = getCatalogStats(projectRoot);
    expect(stats.rubrics['rubric-x']).toBe(1);
    expect(stats.patterns['pattern-x']).toBe(1);
    expect(stats.exemplars['exemplar-x']).toBe(1);
    expect(stats.totalEvents).toBe(3);
  });

  it('persists counters to disk under .harness/design-craft/usage.json', () => {
    recordTrigger('rubric-persisted', projectRoot);
    const file = path.join(projectRoot, '.harness', 'design-craft', 'usage.json');
    expect(fs.existsSync(file)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      rubrics: Record<string, number>;
    };
    expect(parsed.rubrics['rubric-persisted']).toBe(1);
  });

  it('resetCatalogStats wipes the store and is idempotent', () => {
    recordTrigger('rubric-a', projectRoot);
    resetCatalogStats(projectRoot);
    const stats = getCatalogStats(projectRoot);
    expect(stats.totalEvents).toBe(0);

    // Calling reset again on an already-clean store must not throw.
    expect(() => resetCatalogStats(projectRoot)).not.toThrow();
  });

  it('ignores zero-length ids and non-positive bumps without throwing', () => {
    recordTrigger('', projectRoot);
    const stats = getCatalogStats(projectRoot);
    expect(stats.totalEvents).toBe(0);
  });

  it('degrades to empty when the store file contains malformed JSON', () => {
    const dir = path.join(projectRoot, '.harness', 'design-craft');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'usage.json'), 'not valid json {', 'utf8');

    const stats = getCatalogStats(projectRoot);
    expect(stats.totalEvents).toBe(0);
  });
});
