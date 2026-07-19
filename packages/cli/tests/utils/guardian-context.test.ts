import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  GUARDIAN_ANALYSIS_SCHEMA,
  GUARDIAN_ANALYSIS_VERSION,
} from '@harness-engineering/intelligence';
import { loadGuardianCoverage } from '../../src/utils/guardian-context';

function projectWithGuardian(record: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'guardian-ctx-'));
  const dir = join(root, '.harness', 'analyses');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'g.json'), JSON.stringify(record), 'utf-8');
  return root;
}

const VALID_RECORD = {
  schema: GUARDIAN_ANALYSIS_SCHEMA,
  version: GUARDIAN_ANALYSIS_VERSION,
  generatedAt: '2026-07-19T00:00:00.000Z',
  verdict: 'fail',
  severity: 'error',
  coverageDelta: -4.2,
  files: [{ file: 'src/foo.ts', uncoveredLines: [1, 2] }],
};

describe('loadGuardianCoverage', () => {
  it('renders an advisory block from a real .harness/analyses guardian record', async () => {
    const root = projectWithGuardian(VALID_RECORD);
    const block = await loadGuardianCoverage(root);
    expect(block).toBeDefined();
    expect(block).toContain('## Guardian diff-coverage (advisory)');
    expect(block).toContain('Guardian diff-coverage: FAIL');
    expect(block).toContain('- src/foo.ts: lines 1, 2');
  });

  it('returns undefined when the archive is absent (degrade-safe)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'guardian-ctx-empty-'));
    await expect(loadGuardianCoverage(root)).resolves.toBeUndefined();
  });

  it('returns undefined when the archive holds only non-guardian records', async () => {
    // An intelligence-pipeline AnalysisRecord shares the dir but is not guardian.
    const root = projectWithGuardian({
      issueId: '42',
      identifier: 'PROJ-42',
      analyzedAt: '2026-07-19T00:00:00.000Z',
      spec: null,
      score: null,
      simulation: null,
      externalId: null,
    });
    await expect(loadGuardianCoverage(root)).resolves.toBeUndefined();
  });
});
