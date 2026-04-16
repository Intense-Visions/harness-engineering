import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  renderAnalysisComment,
  loadPublishedIndex,
  savePublishedIndex,
} from '../../src/core/index';
import { loadTrackerSyncConfig } from '@harness-engineering/core';
import type { AnalysisRecord } from '../../src/core/analysis-archive';

/**
 * These tests exercise the auto-publish component functions in combination,
 * simulating the flow that autoPublishAnalyses performs inside the orchestrator:
 *
 * 1. loadTrackerSyncConfig — detect whether a tracker is configured
 * 2. loadPublishedIndex — check which records have already been published
 * 3. renderAnalysisComment — render the analysis as a structured markdown comment
 * 4. savePublishedIndex — persist the updated published index after publishing
 */

function createTmpProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-pub-'));
  // Create harness.config.json with tracker config
  const config = {
    version: 1,
    roadmap: {
      tracker: {
        kind: 'github',
        repo: 'owner/repo',
        labels: ['harness'],
        statusMap: {
          backlog: 'open',
          planned: 'open',
          'in-progress': 'open',
          done: 'closed',
          blocked: 'open',
        },
      },
    },
  };
  fs.writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify(config));
  return dir;
}

function makeRecord(overrides: Partial<AnalysisRecord> = {}): AnalysisRecord {
  return {
    issueId: 'issue-1',
    identifier: 'H-1',
    spec: null,
    score: {
      overall: 0.65,
      confidence: 0.82,
      riskLevel: 'medium',
      blastRadius: { filesEstimated: 5, modules: 2, services: 1 },
      dimensions: { structural: 0.5, semantic: 0.7, historical: 0.6 },
      reasoning: ['Touches shared utility module'],
      recommendedRoute: 'human',
    },
    simulation: null,
    analyzedAt: '2026-04-15T12:00:00Z',
    externalId: 'github:owner/repo#42',
    ...overrides,
  };
}

describe('auto-publish flow', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpProject();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('loadTrackerSyncConfig', () => {
    it('returns tracker config when harness.config.json has roadmap.tracker', () => {
      const config = loadTrackerSyncConfig(tmpDir);
      expect(config).not.toBeNull();
      expect(config!.kind).toBe('github');
    });

    it('returns null when no harness.config.json exists', () => {
      fs.unlinkSync(path.join(tmpDir, 'harness.config.json'));
      expect(loadTrackerSyncConfig(tmpDir)).toBeNull();
    });

    it('returns null when config has no roadmap.tracker', () => {
      fs.writeFileSync(path.join(tmpDir, 'harness.config.json'), JSON.stringify({ version: 1 }));
      expect(loadTrackerSyncConfig(tmpDir)).toBeNull();
    });

    it('returns null when tracker kind is not github', () => {
      const config = {
        version: 1,
        roadmap: {
          tracker: { kind: 'linear', statusMap: {} },
        },
      };
      fs.writeFileSync(path.join(tmpDir, 'harness.config.json'), JSON.stringify(config));
      expect(loadTrackerSyncConfig(tmpDir)).toBeNull();
    });
  });

  describe('end-to-end auto-publish simulation', () => {
    it('publishes analysis when tracker is configured and externalId is present', () => {
      const config = loadTrackerSyncConfig(tmpDir);
      expect(config).not.toBeNull();

      const record = makeRecord();
      const publishedIndex = loadPublishedIndex(tmpDir);
      expect(publishedIndex).toEqual({});

      // Simulate what autoPublishAnalyses does
      expect(record.externalId).not.toBeNull();
      expect(publishedIndex[record.issueId]).toBeUndefined();

      const commentBody = renderAnalysisComment(record);
      expect(commentBody).toContain('## Harness Analysis: H-1');
      expect(commentBody).toContain('**Risk:** medium (82% confidence)');

      // Simulate successful publish
      publishedIndex[record.issueId] = new Date().toISOString();
      savePublishedIndex(tmpDir, publishedIndex);

      // Verify published index was persisted
      const reloaded = loadPublishedIndex(tmpDir);
      expect(reloaded['issue-1']).toBeDefined();
    });

    it('skips auto-publish when externalId is null', () => {
      const record = makeRecord({ externalId: null });
      // autoPublishAnalyses checks externalId before publishing
      expect(record.externalId).toBeNull();
      // No publish attempt would be made
    });

    it('skips auto-publish when no tracker config exists', () => {
      fs.unlinkSync(path.join(tmpDir, 'harness.config.json'));
      const config = loadTrackerSyncConfig(tmpDir);
      expect(config).toBeNull();
      // autoPublishAnalyses returns early when config is null
    });

    it('skips already-published records', () => {
      // Pre-populate published index
      const metricsDir = path.join(tmpDir, '.harness', 'metrics');
      fs.mkdirSync(metricsDir, { recursive: true });
      fs.writeFileSync(
        path.join(metricsDir, 'published-analyses.json'),
        JSON.stringify({ 'issue-1': '2026-04-15T12:00:00Z' })
      );

      const record = makeRecord();
      const publishedIndex = loadPublishedIndex(tmpDir);
      // autoPublishAnalyses checks published index before publishing
      expect(publishedIndex[record.issueId]).toBeDefined();
      // This record would be skipped
    });

    it('renders correct comment for high-risk analysis', () => {
      const record = makeRecord({
        score: {
          overall: 0.9,
          confidence: 0.95,
          riskLevel: 'high',
          blastRadius: { filesEstimated: 20, modules: 5, services: 3 },
          dimensions: { structural: 0.9, semantic: 0.8, historical: 0.85 },
          reasoning: ['Major cross-cutting change'],
          recommendedRoute: 'simulation-required',
        },
      });

      const commentBody = renderAnalysisComment(record);
      expect(commentBody).toContain('**Risk:** high (95% confidence)');
      expect(commentBody).toContain('**Route:** simulation-required');
      expect(commentBody).toContain('_harness_analysis');
    });

    it('handles multiple records - publishes new ones, skips existing', () => {
      // Set up: issue-1 already published, issue-2 is new
      savePublishedIndex(tmpDir, { 'issue-1': '2026-04-15T12:00:00Z' });

      const records = [
        makeRecord({ issueId: 'issue-1', identifier: 'H-1' }),
        makeRecord({ issueId: 'issue-2', identifier: 'H-2', externalId: 'github:owner/repo#43' }),
      ];

      const publishedIndex = loadPublishedIndex(tmpDir);

      // Simulate the auto-publish loop
      let publishedCount = 0;
      for (const record of records) {
        if (!record.externalId) continue;
        if (publishedIndex[record.issueId]) continue;

        const commentBody = renderAnalysisComment(record);
        expect(commentBody).toContain(`## Harness Analysis: ${record.identifier}`);

        // Simulate successful publish
        publishedIndex[record.issueId] = new Date().toISOString();
        publishedCount++;
      }

      expect(publishedCount).toBe(1); // Only issue-2 was published

      savePublishedIndex(tmpDir, publishedIndex);
      const reloaded = loadPublishedIndex(tmpDir);
      expect(Object.keys(reloaded)).toHaveLength(2);
    });
  });
});
