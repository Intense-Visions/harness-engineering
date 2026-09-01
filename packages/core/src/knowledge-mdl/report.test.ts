import { describe, it, expect } from 'vitest';
import { buildMdlReport } from './report';
import { buildKnowledgeEntriesFromLearnings } from './adapter';
import {
  DEFAULT_MDL_CONFIG,
  type InclusionEvent,
  type KnowledgeEntry,
  type MdlConfig,
  type RunOutcome,
} from './types';

const config: MdlConfig = {
  ...DEFAULT_MDL_CONFIG,
  minPresentRuns: 3,
  minAbsentRuns: 3,
  minPerCell: 2,
};

const entries: KnowledgeEntry[] = [
  { id: 'hv', tokensPerInclusion: 50, text: 'high value' },
  { id: 'ww', tokensPerInclusion: 50, text: 'worthless' },
  { id: 'ins', tokensPerInclusion: 50, text: 'unknown' },
];

const inclusions: InclusionEvent[] = [
  { entryId: 'hv', runId: 'p1', tokensShipped: 50 },
  { entryId: 'hv', runId: 'p2', tokensShipped: 50 },
  { entryId: 'hv', runId: 'p3', tokensShipped: 50 },
  { entryId: 'ww', runId: 'w1', tokensShipped: 50 },
  { entryId: 'ww', runId: 'w2', tokensShipped: 50 },
  { entryId: 'ww', runId: 'w3', tokensShipped: 50 },
  { entryId: 'ins', runId: 'u1', tokensShipped: 50 },
];

const outcomes: RunOutcome[] = [
  { runId: 'p1', stratum: 'hv', cost: 100 },
  { runId: 'p2', stratum: 'hv', cost: 110 },
  { runId: 'p3', stratum: 'hv', cost: 120 },
  { runId: 'hva1', stratum: 'hv', cost: 300 },
  { runId: 'hva2', stratum: 'hv', cost: 320 },
  { runId: 'hva3', stratum: 'hv', cost: 310 },
  { runId: 'w1', stratum: 'ww', cost: 300 },
  { runId: 'w2', stratum: 'ww', cost: 300 },
  { runId: 'w3', stratum: 'ww', cost: 300 },
  { runId: 'wwa1', stratum: 'ww', cost: 300 },
  { runId: 'wwa2', stratum: 'ww', cost: 300 },
  { runId: 'wwa3', stratum: 'ww', cost: 300 },
  { runId: 'u1', stratum: 'ins', cost: 200 },
  { runId: 'ua1', stratum: 'ins', cost: 200 },
  { runId: 'ua2', stratum: 'ins', cost: 200 },
];

describe('buildMdlReport', () => {
  it('rolls per-entry verdicts into the store ledger', () => {
    const report = buildMdlReport(entries, inclusions, outcomes, config);
    expect(report.entryCount).toBe(3);
    expect(report.reportOnly).toBe(true);
    expect(report.totalDescriptionLength).toBe(350); // 3*50 + 3*50 + 1*50
    // Only sufficiently-evidenced entries contribute measured value.
    expect(report.insufficientEvidenceCount).toBe(1);
    expect(report.pruneCandidates.map((p) => p.entryId)).toEqual(['ww']);
    expect(report.netStoreMdl).toBe(report.totalMeasuredValue - report.totalDescriptionLength);
  });

  it('prune candidates are reversible tombstone plans, never deletions', () => {
    const report = buildMdlReport(entries, inclusions, outcomes, config);
    for (const p of report.pruneCandidates) {
      expect(p.reversal).toBe('restore-from-tombstone');
      expect(p.netMdl).toBeLessThan(0);
    }
  });

  it('degrades gracefully on empty inputs (zeroed ledger, never throws)', () => {
    const report = buildMdlReport([], [], [], config);
    expect(report.entryCount).toBe(0);
    expect(report.totalDescriptionLength).toBe(0);
    expect(report.totalMeasuredValue).toBe(0);
    expect(report.netStoreMdl).toBe(0);
    expect(report.pruneCandidates).toEqual([]);
    expect(report.mergeCandidates).toEqual([]);
  });

  it('scores entries with inclusion telemetry but no outcomes as all-insufficient', () => {
    const report = buildMdlReport(entries, inclusions, [], config);
    expect(report.insufficientEvidenceCount).toBe(3);
    expect(report.pruneCandidates).toEqual([]);
  });
});

describe('buildKnowledgeEntriesFromLearnings', () => {
  it('grounds ids in the content hash and reads tags from frontmatter', () => {
    const blocks = [
      '<!-- hash:abcd tags:build,cache -->\nRebuild before commit.',
      '<!-- hash:abcd tags:build,cache -->\nRebuild before commit.', // duplicate -> deduped
      '   ', // blank -> skipped
    ];
    const built = buildKnowledgeEntriesFromLearnings(blocks);
    expect(built).toHaveLength(1);
    expect(built[0]!.tags).toEqual(['build', 'cache']);
    expect(built[0]!.tokensPerInclusion).toBeGreaterThan(0);
    expect(built[0]!.id).toBeTruthy();
  });

  it('returns an empty list for no blocks', () => {
    expect(buildKnowledgeEntriesFromLearnings([])).toEqual([]);
  });
});
