import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  readGuardianAnalyses,
  summarizeGuardian,
  guardianFlags,
  guardianFileLines,
  GUARDIAN_ANALYSIS_SCHEMA,
  GUARDIAN_ANALYSIS_VERSION,
} from '../../src/guardian/index.js';
import type { GuardianAnalysis } from '../../src/guardian/index.js';

/** A valid guardian diff-coverage record fixture. */
function makeGuardian(over: Partial<GuardianAnalysis> = {}): GuardianAnalysis {
  return {
    schema: GUARDIAN_ANALYSIS_SCHEMA,
    version: GUARDIAN_ANALYSIS_VERSION,
    generatedAt: '2026-07-19T00:00:00.000Z',
    verdict: 'fail',
    severity: 'error',
    coverageDelta: -4.2,
    files: [{ file: 'src/a.ts', uncoveredLines: [10, 11, 12] }],
    summary: 'new endpoint handler is uncovered',
    ...over,
  };
}

/** Write a JSON file into `dir` and return its path. */
function writeJson(dir: string, name: string, value: unknown): void {
  writeFileSync(join(dir, name), JSON.stringify(value, null, 2), 'utf-8');
}

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'guardian-reader-'));
}

describe('readGuardianAnalyses', () => {
  it('parses and validates a well-formed guardian record', async () => {
    const dir = freshDir();
    writeJson(dir, 'issue-1.json', makeGuardian());

    const records = await readGuardianAnalyses(dir);

    expect(records).toHaveLength(1);
    expect(records[0]!.verdict).toBe('fail');
    expect(records[0]!.files[0]!.uncoveredLines).toEqual([10, 11, 12]);
  });

  it('returns [] when the analyses directory is absent (never throws)', async () => {
    const records = await readGuardianAnalyses(join(freshDir(), 'does', 'not', 'exist'));
    expect(records).toEqual([]);
  });

  it('returns [] for an empty analyses directory', async () => {
    expect(await readGuardianAnalyses(freshDir())).toEqual([]);
  });

  it('skips a non-guardian record (intelligence AnalysisRecord shape) by discriminator', async () => {
    const dir = freshDir();
    // The intelligence-pipeline AnalysisRecord shape shares the directory but
    // carries no guardian `schema` discriminator — it must be silently skipped.
    writeJson(dir, 'intel-42.json', {
      issueId: '42',
      identifier: 'PROJ-42',
      spec: null,
      score: null,
      simulation: null,
      analyzedAt: '2026-07-19T00:00:00.000Z',
      externalId: null,
    });

    expect(await readGuardianAnalyses(dir)).toEqual([]);
  });

  it('skips malformed JSON and structurally-invalid records, keeping the valid ones', async () => {
    const dir = freshDir();
    writeFileSync(join(dir, 'broken.json'), '{ not valid json', 'utf-8');
    // Right discriminator, wrong shape (coverageDelta must be a number).
    writeJson(dir, 'bad-shape.json', {
      schema: GUARDIAN_ANALYSIS_SCHEMA,
      version: GUARDIAN_ANALYSIS_VERSION,
      generatedAt: '2026-07-19T00:00:00.000Z',
      verdict: 'fail',
      severity: 'error',
      coverageDelta: 'nope',
      files: [],
    });
    writeJson(dir, 'good.json', makeGuardian({ verdict: 'pass', severity: 'info' }));

    const records = await readGuardianAnalyses(dir);

    expect(records).toHaveLength(1);
    expect(records[0]!.verdict).toBe('pass');
  });

  it('ignores non-.json files and subdirectories', async () => {
    const dir = freshDir();
    writeFileSync(join(dir, 'README.txt'), 'not json', 'utf-8');
    mkdirSync(join(dir, 'nested'));
    writeJson(dir, 'g.json', makeGuardian());

    expect(await readGuardianAnalyses(dir)).toHaveLength(1);
  });
});

describe('guardian summary projections', () => {
  it('summarizeGuardian returns null for no records (the "no signal" case)', () => {
    expect(summarizeGuardian([])).toBeNull();
  });

  it('summarizeGuardian reports FAIL and worst delta when any record flags', () => {
    const summary = summarizeGuardian([
      makeGuardian({ verdict: 'pass', severity: 'info', coverageDelta: 1 }),
      makeGuardian({ verdict: 'fail', severity: 'error', coverageDelta: -5 }),
    ]);
    expect(summary).toContain('FAIL');
    expect(summary).toContain('-5%');
  });

  it('summarizeGuardian reports PASS when nothing flags', () => {
    const summary = summarizeGuardian([
      makeGuardian({ verdict: 'pass', severity: 'info', coverageDelta: 0, files: [] }),
    ]);
    expect(summary).toContain('PASS');
  });

  it('guardianFlags is true for fail or error-severity, false otherwise', () => {
    expect(guardianFlags(makeGuardian({ verdict: 'fail', severity: 'info' }))).toBe(true);
    expect(guardianFlags(makeGuardian({ verdict: 'pass', severity: 'error' }))).toBe(true);
    expect(guardianFlags(makeGuardian({ verdict: 'pass', severity: 'warn' }))).toBe(false);
  });

  it('guardianFileLines lists only files with uncovered lines/regions', () => {
    const lines = guardianFileLines([
      makeGuardian({
        files: [
          { file: 'src/a.ts', uncoveredLines: [3, 4] },
          { file: 'src/b.ts', uncoveredLines: [], uncoveredRegions: [[8, 9]] },
          { file: 'src/covered.ts', uncoveredLines: [] },
        ],
      }),
    ]);
    expect(lines).toEqual(['src/a.ts: lines 3, 4', 'src/b.ts: 8-9']);
  });
});
