import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  EnrichedSpec,
  ComplexityScore,
  SimulationResult,
} from '@harness-engineering/intelligence';
import { AnalysisArchive, type AnalysisRecord } from '../../src/core/analysis-archive';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'analysis-archive-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Build a minimal, valid AnalysisRecord. Overrides shallow-merge onto the base. */
function makeRecord(overrides: Partial<AnalysisRecord> = {}): AnalysisRecord {
  return {
    issueId: 'issue-1',
    identifier: 'HARNESS-1',
    spec: null,
    score: null,
    simulation: null,
    analyzedAt: '2026-08-18T00:00:00.000Z',
    externalId: null,
    ...overrides,
  };
}

describe('AnalysisArchive.save + get round-trip', () => {
  it('reads back an archived record with identical fields', async () => {
    const archive = new AnalysisArchive(dir);
    const record = makeRecord({
      issueId: 'abc',
      identifier: 'HARNESS-42',
      analyzedAt: '2026-01-02T03:04:05.000Z',
      externalId: 'github:owner/repo#42',
    });

    await archive.save(record);
    const got = await archive.get('abc');

    expect(got).not.toBeNull();
    expect(got).toEqual(record);
  });

  it('round-trips nested spec/score/simulation payloads', async () => {
    const archive = new AnalysisArchive(dir);
    const spec = { summary: 'do the thing', tasks: [1, 2, 3] } as unknown as EnrichedSpec;
    const score = { value: 7, band: 'medium' } as unknown as ComplexityScore;
    const simulation = { runs: 10, failures: 2 } as unknown as SimulationResult;
    const record = makeRecord({ issueId: 'nested', spec, score, simulation });

    await archive.save(record);
    const got = await archive.get('nested');

    expect(got?.spec).toEqual(spec);
    expect(got?.score).toEqual(score);
    expect(got?.simulation).toEqual(simulation);
  });

  it('creates the archive directory on first save when it does not yet exist', async () => {
    const nestedDir = path.join(dir, 'deeper', 'sub');
    const archive = new AnalysisArchive(nestedDir);

    await archive.save(makeRecord({ issueId: 'first' }));

    const got = await archive.get('first');
    expect(got?.issueId).toBe('first');
  });
});

describe('AnalysisArchive.save overwrite semantics', () => {
  it('keeps only the latest record for a given issue (latest wins)', async () => {
    const archive = new AnalysisArchive(dir);

    await archive.save(makeRecord({ issueId: 'dup', identifier: 'OLD' }));
    await archive.save(makeRecord({ issueId: 'dup', identifier: 'NEW' }));

    const got = await archive.get('dup');
    expect(got?.identifier).toBe('NEW');

    const all = await archive.list();
    const dupRecords = all.filter((r) => r.issueId === 'dup');
    expect(dupRecords).toHaveLength(1);
    expect(dupRecords[0]?.identifier).toBe('NEW');
  });
});

describe('AnalysisArchive.get missing entries', () => {
  it('returns null when the requested issue has no record', async () => {
    const archive = new AnalysisArchive(dir);
    await archive.save(makeRecord({ issueId: 'present' }));

    expect(await archive.get('absent')).toBeNull();
  });

  it('returns null when nothing has ever been saved', async () => {
    const archive = new AnalysisArchive(path.join(dir, 'never-created'));
    expect(await archive.get('anything')).toBeNull();
  });

  it('normalizes a stored record without an externalId field to null', async () => {
    const archive = new AnalysisArchive(dir);
    // Build a record whose externalId is absent entirely (legacy shape),
    // then persist through the public save() path.
    const legacy = makeRecord({ issueId: 'legacy' }) as Partial<AnalysisRecord>;
    delete legacy.externalId;
    await archive.save(legacy as AnalysisRecord);

    const got = await archive.get('legacy');
    expect(got).not.toBeNull();
    expect(got?.externalId).toBeNull();
  });
});

describe('AnalysisArchive.list', () => {
  it('returns an empty array when the archive directory does not exist', async () => {
    const archive = new AnalysisArchive(path.join(dir, 'no-such-dir'));
    expect(await archive.list()).toEqual([]);
  });

  it('returns an empty array when the archive is empty', async () => {
    const archive = new AnalysisArchive(dir);
    // Save then get so the dir exists but consider a fresh archive with nothing.
    expect(await archive.list()).toEqual([]);
  });

  it('returns every saved record', async () => {
    const archive = new AnalysisArchive(dir);
    await archive.save(makeRecord({ issueId: 'a', identifier: 'A' }));
    await archive.save(makeRecord({ issueId: 'b', identifier: 'B' }));
    await archive.save(makeRecord({ issueId: 'c', identifier: 'C' }));

    const all = await archive.list();
    expect(all).toHaveLength(3);
    const identifiers = all.map((r) => r.identifier).sort();
    expect(identifiers).toEqual(['A', 'B', 'C']);
  });

  it('normalizes a missing externalId to null for listed records', async () => {
    const archive = new AnalysisArchive(dir);
    const legacy = makeRecord({ issueId: 'legacy' }) as Partial<AnalysisRecord>;
    delete legacy.externalId;
    await archive.save(legacy as AnalysisRecord);

    const all = await archive.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.externalId).toBeNull();
  });
});

describe('AnalysisArchive path-safety', () => {
  it('throws on a save whose issueId escapes the archive directory', async () => {
    const archive = new AnalysisArchive(dir);
    await expect(
      archive.save(makeRecord({ issueId: '../escape' })),
    ).rejects.toThrow('Invalid issueId');
  });

  it('returns null on a get whose issueId escapes the archive directory', async () => {
    const archive = new AnalysisArchive(dir);
    expect(await archive.get('../escape')).toBeNull();
  });
});
